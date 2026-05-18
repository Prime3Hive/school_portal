// Application Manager for TBD Academy
// Handles application submissions, tracking, and status checking
// Integrated with Supabase and Paystack

(function () {
    'use strict';

    // Application fee structure by grade
    const APPLICATION_FEES = {
        'Kindergarten': 5000,
        'Nursery': 5000,
        'Pre-Primary': 5000,
        'Grade 1': 5000,
        'Grade 2': 5000,
        'Grade 3': 5000,
        'Grade 4': 5000,
        'Grade 5': 5000,
        'Grade 6': 5000,
        'JSS 1': 7500,
        'JSS 2': 7500,
        'JSS 3': 7500
    };

    // Application Manager Class
    class ApplicationManager {
        constructor() {
            this.supabase = window.supabaseClient;
            this.uploadManager = window.fileUploadManager;
        }

        // Get application fee for grade
        getApplicationFee(grade) {
            return APPLICATION_FEES[grade] || 5000;
        }

        // Generate unique application number (server-side)
        async generateApplicationNumber() {
            try {
                const { data, error } = await this.supabase.rpc('generate_application_number');
                if (error) throw error;
                return data;
            } catch (error) {
                console.error('Error generating application number:', error);
                // Fallback to client-side generation (random 7-char alphanumeric)
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                const year = new Date().getFullYear();
                let suffix = '';
                for (let i = 0; i < 7; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
                return `TBD-${year}-${suffix}`;
            }
        }

        // Upload document to Supabase Storage
        async uploadDocument(file, applicationNumber, documentType) {
            try {
                const fileName = `${applicationNumber}_${documentType}_${Date.now()}.${file.name.split('.').pop()}`;
                const filePath = `applications/${applicationNumber}/${fileName}`;

                const { data, error } = await this.supabase.storage
                    .from('documents')
                    .upload(filePath, file);

                if (error) throw error;

                // Get public URL
                const { data: urlData } = this.supabase.storage
                    .from('documents')
                    .getPublicUrl(filePath);

                return urlData.publicUrl;
            } catch (error) {
                console.error('Error uploading document:', error);
                throw error;
            }
        }

        // Lazy-load Paystack inline script
        async _loadPaystack() {
            if (typeof PaystackPop !== 'undefined') return;
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://js.paystack.co/v1/inline.js';
                s.onload = resolve;
                s.onerror = () => reject(new Error('Online payment is not available. Please check your internet connection and try again.'));
                document.body.appendChild(s);
            });
        }

        // Process Paystack payment with transaction state tracking
        async processPayment(email, amount, applicationNumber) {
            // Lazy-load Paystack on demand (not blocking page load)
            await this._loadPaystack();

            // Guard: Paystack CDN may fail to load (network error, ad blocker)
            if (typeof PaystackPop === 'undefined') {
                throw new Error('Online payment is not available. Please check your internet connection and try again.');
            }

            // Ensure env vars are fully loaded before reading the key.
            // window.envReady resolves when /api/config (prod) or .env (dev) has been fetched.
            // Without this await, a fast form submission reads the placeholder fallback key.
            if (window.envReady && typeof window.envReady.then === 'function') {
                await window.envReady;
            }

            // Validate Paystack key before opening the popup
            const paystackKey = AppConfig.paystack.publicKey;
            if (!paystackKey || paystackKey === 'pk_test_xxxxxxxxxxxx' || paystackKey.length < 20) {
                throw new Error('Payment is not configured. Please contact the school to report this issue.');
            }

            const reference = `APP_${applicationNumber}_${Date.now()}`;
            
            // Create transaction record before opening Paystack popup
            try {
                const { error: txnError } = await this.supabase
                    .from('payment_transactions')
                    .insert({
                        reference: reference,
                        transaction_type: 'application_fee',
                        amount: amount,
                        currency: 'NGN',
                        payer_email: email,
                        application_number: applicationNumber,
                        gateway: 'paystack',
                        status: 'pending',
                        metadata: {
                            application_number: applicationNumber,
                            initiated_from: 'admissions_page'
                        }
                    });
                
                if (txnError) {
                    console.warn('Failed to create transaction record:', txnError);
                    // Continue anyway - transaction tracking is not critical for payment flow
                }
            } catch (err) {
                console.warn('Transaction tracking error:', err);
            }

            return new Promise((resolve, reject) => {
                let popupOpened = false;
                let popupOpenedAt = null; // track when popup opened to detect instant-close (API error)
                
                const handler = PaystackPop.setup({
                    key: paystackKey,
                    email: email,
                    amount: amount * 100, // Convert to kobo
                    currency: 'NGN',
                    ref: reference,
                    metadata: {
                        custom_fields: [
                            {
                                display_name: 'Application Number',
                                variable_name: 'application_number',
                                value: applicationNumber
                            }
                        ]
                    },
                    callback: (response) => {
                        // NOTE: Do NOT update payment_transactions here.
                        // record_application RPC owns the status='success' transition atomically
                        // with the application INSERT. Updating here first causes a false DUPLICATE
                        // error when the RPC checks status and finds it already 'success'.
                        resolve({
                            reference: response.reference,
                            status: response.status,
                            message: response.message
                        });
                    },
                    onClose: () => {
                        if (!popupOpened) {
                            // openIframe() itself failed
                            this.supabase
                                .from('payment_transactions')
                                .update({
                                    status: 'failed',
                                    failed_at: new Date().toISOString(),
                                    error_message: 'Paystack popup failed to open'
                                })
                                .eq('reference', reference)
                                .then(() => {}).catch(() => {});
                            reject(new Error('Payment popup failed to open. Please try again.'));
                        } else {
                            // Detect Paystack API error (400): popup closes within 4s of opening
                            // meaning Paystack itself rejected the transaction before user interaction
                            const openDuration = popupOpenedAt ? (Date.now() - popupOpenedAt) : 9999;
                            const isPaystackError = openDuration < 4000;

                            this.supabase
                                .from('payment_transactions')
                                .update({
                                    status: isPaystackError ? 'failed' : 'cancelled',
                                    failed_at: new Date().toISOString(),
                                    error_message: isPaystackError ? 'Paystack API error (check public key)' : 'User cancelled payment'
                                })
                                .eq('reference', reference)
                                .then(() => {}).catch(() => {});

                            if (isPaystackError) {
                                reject(new Error('Payment could not be started. Please try again or use the bank transfer option.'));
                            } else {
                                reject(new Error('Payment cancelled. Your application was not submitted.'));
                            }
                        }
                    }
                });
                
                // Mark as processing when popup opens
                try {
                    handler.openIframe();
                    popupOpened = true;
                    popupOpenedAt = Date.now();
                    
                    // Update transaction status to processing
                    this.supabase
                        .from('payment_transactions')
                        .update({
                            status: 'processing',
                            processing_at: new Date().toISOString()
                        })
                        .eq('reference', reference)
                        .then(() => {})
                        .catch(err => console.warn('Failed to update transaction status:', err));
                } catch (err) {
                    console.error('Failed to open Paystack popup:', err);
                    reject(new Error('Failed to initialize payment. Please try again.'));
                }
            });
        }

        // Upload all application documents (shared by both flows)
        async _uploadDocuments(formData, applicationNumber) {
            const documentUrls = {};
            if (formData.applicationForm) {
                documentUrls.application_form_url = await this.uploadDocument(
                    formData.applicationForm, applicationNumber, 'application_form'
                );
            }
            if (formData.birthCertificate) {
                documentUrls.birth_certificate_url = await this.uploadDocument(
                    formData.birthCertificate, applicationNumber, 'birth_certificate'
                );
            }
            if (formData.passportPhoto) {
                documentUrls.passport_photo_url = await this.uploadDocument(
                    formData.passportPhoto, applicationNumber, 'passport_photo'
                );
            }
            if (formData.previousReport) {
                documentUrls.previous_report_url = await this.uploadDocument(
                    formData.previousReport, applicationNumber, 'previous_report'
                );
            }
            return documentUrls;
        }

        // Submit new application via Paystack (online payment)
        // Payment is processed FIRST. Documents are only uploaded after
        // payment succeeds — this prevents orphaned files if the user cancels payment.
        async submitApplication(formData, applicationFee) {
            const applicationNumber = await this.generateApplicationNumber();
            // Use passed-in fee to ensure consistency with confirm dialog
            const feeAmount = applicationFee || this.getApplicationFee(formData.grade);

            // STEP 1: Process payment first (throws if cancelled or CDN unavailable)
            const paymentResult = await this.processPayment(
                formData.parentEmail, feeAmount, applicationNumber
            );

            // STEP 2: Payment succeeded — now upload documents
            let documentUrls = {};
            let uploadFailed = false;
            try {
                documentUrls = await this._uploadDocuments(formData, applicationNumber);
            } catch (uploadErr) {
                uploadFailed = true;
                console.error('Document upload failed after payment:', uploadErr);
                // Flag the transaction record so admin can investigate
                this.supabase
                    .from('payment_transactions')
                    .update({ error_message: `Document upload failed after payment: ${uploadErr.message}` })
                    .eq('reference', paymentResult.reference)
                    .then(() => {}).catch(() => {});
                showNotification(
                    'Payment received (Ref: ' + paymentResult.reference + ') but document upload failed. Contact admin to attach documents manually.',
                    'error'
                );
            }

            // STEP 3: Atomically mark payment transaction as success + save application
            // BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK handled server-side
            const { data: rpc, error: rpcErr } = await this.supabase.rpc('record_application', {
                p_app_data: {
                    application_number:    applicationNumber,
                    student_name:          formData.studentName,
                    student_dob:           formData.studentDob || null,
                    student_gender:        formData.studentGender || null,
                    grade:                 formData.grade,
                    previous_school:       formData.previousSchool || null,
                    parent_name:           formData.parentName,
                    parent_email:          formData.parentEmail,
                    parent_phone:          formData.parentPhone,
                    parent_address:        formData.parentAddress || {},
                    ...documentUrls,
                    application_fee_amount: feeAmount,
                    application_fee_paid:  true,
                    payment_reference:     paymentResult.reference,
                    payment_date:          new Date().toISOString(),
                    payment_method:        'paystack',
                    status:                'pending',
                    submitted_date:        new Date().toISOString()
                },
                p_txn_reference: paymentResult.reference
            });

            if (rpcErr || !rpc?.success) {
                const msg = rpc?.error || rpcErr?.message || 'Application could not be saved.';
                console.error('Error saving application:', msg);
                throw new Error('Payment received (Ref: ' + paymentResult.reference + ') but application could not be saved. Please contact the school with your payment reference.');
            }

            return rpc.application;
        }

        // Submit new application via Bank Transfer
        // Documents + receipt uploaded first, then record saved with fee_paid = false
        // Admin must verify payment before application proceeds
        async submitBankTransferApplication(formData, applicationFee) {
            const applicationNumber = await this.generateApplicationNumber();
            // Use passed-in fee to ensure consistency
            const feeAmount = applicationFee || this.getApplicationFee(formData.grade);

            // STEP 1: Upload receipt
            let receiptUrl = null;
            if (formData.bankReceipt) {
                const ext = formData.bankReceipt.name.split('.').pop();
                const path = `applications/${applicationNumber}/receipt_${Date.now()}.${ext}`;
                const { data: upData, error: upErr } = await this.supabase.storage
                    .from('documents')
                    .upload(path, formData.bankReceipt, { cacheControl: '3600', upsert: false });
                if (upErr) throw new Error('Receipt upload failed: ' + upErr.message);
                const { data: urlData } = this.supabase.storage.from('documents').getPublicUrl(path);
                receiptUrl = urlData?.publicUrl || path;
            }

            // STEP 2: Upload application documents
            let documentUrls = {};
            try {
                documentUrls = await this._uploadDocuments(formData, applicationNumber);
            } catch (uploadErr) {
                console.error('Document upload failed:', uploadErr);
                showNotification(
                    'Receipt uploaded but some documents failed. Admin will follow up.',
                    'error'
                );
            }

            // STEP 3: Save application record atomically — fee NOT yet confirmed
            // BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK handled server-side
            // p_txn_reference is NULL for bank-transfer (no Paystack transaction to link)
            const { data: rpc, error: rpcErr } = await this.supabase.rpc('record_application', {
                p_app_data: {
                    application_number:    applicationNumber,
                    student_name:          formData.studentName,
                    student_dob:           formData.studentDob || null,
                    student_gender:        formData.studentGender || null,
                    grade:                 formData.grade,
                    previous_school:       formData.previousSchool || null,
                    parent_name:           formData.parentName,
                    parent_email:          formData.parentEmail,
                    parent_phone:          formData.parentPhone,
                    parent_address:        formData.parentAddress || {},
                    ...documentUrls,
                    receipt_url:           receiptUrl,
                    application_fee_amount: feeAmount,
                    application_fee_paid:  false,
                    payment_reference:     formData.bankTransactionRef || null,
                    payment_date:          new Date().toISOString(),
                    payment_method:        'bank-transfer',
                    status:                'pending',
                    submitted_date:        new Date().toISOString()
                },
                p_txn_reference: null
            });

            if (rpcErr || !rpc?.success) {
                const msg = rpc?.error || rpcErr?.message || 'Application could not be saved.';
                console.error('Error saving application:', msg);
                throw new Error('Failed to save application. Please try again or contact the school.');
            }

            return rpc.application;
        }

        // Get application by application number
        async getApplicationByNumber(applicationNumber) {
            try {
                const { data, error } = await this.supabase
                    .from('applications')
                    .select('*')
                    .eq('application_number', applicationNumber)
                    .single();

                if (error) throw error;
                return data;
            } catch (error) {
                console.error('Error fetching application:', error);
                return null;
            }
        }

        // Get application by email (for applicants to check their own)
        async getApplicationsByEmail(email) {
            try {
                const { data, error } = await this.supabase
                    .from('applications')
                    .select('*')
                    .eq('parent_email', email)
                    .order('submitted_date', { ascending: false });

                if (error) throw error;
                return data || [];
            } catch (error) {
                console.error('Error fetching applications:', error);
                return [];
            }
        }

        // Render a single application status card (HTML string)
        renderStatusCard(application) {
            const statusColors = {
                pending:    { bg: 'hsl(45,100%,95%)',  border: 'hsl(45,100%,50%)',  text: 'hsl(45,100%,30%)',  icon: 'fa-clock' },
                approved:   { bg: 'hsl(150,70%,95%)',  border: 'hsl(150,70%,45%)',  text: 'hsl(150,70%,25%)', icon: 'fa-check-circle' },
                rejected:   { bg: 'hsl(0,80%,95%)',    border: 'hsl(0,80%,55%)',    text: 'hsl(0,80%,30%)',   icon: 'fa-times-circle' },
                incomplete: { bg: 'hsl(30,100%,95%)',  border: 'hsl(30,100%,50%)',  text: 'hsl(30,100%,30%)', icon: 'fa-exclamation-triangle' }
            };
            const si = statusColors[application.status] || statusColors.pending;
            const schoolEmail = (typeof AppConfig !== 'undefined' && AppConfig.school?.email) || 'admin@tbdacademy.edu.ng';
            const submittedDate = new Date(application.submitted_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            // Escape all DB-sourced text before injecting into innerHTML
            const safeAppNo    = escapeHtml(application.application_number || '');
            const safeName     = escapeHtml(application.student_name || '');
            const safeGrade    = escapeHtml(application.grade || '');
            const safeStatus   = escapeHtml(application.status || 'pending');
            const safeReason   = escapeHtml(application.rejection_reason || '');
            const safeEmail    = escapeHtml(schoolEmail);

            return `
                <div class="card" style="background:${si.bg}; border-left:4px solid ${si.border}; margin-bottom:1rem;">
                    <div style="display:flex; align-items:start; gap:1.5rem;">
                        <i class="fas ${si.icon}" style="font-size:2.5rem; color:${si.border}; flex-shrink:0;"></i>
                        <div style="flex:1;">
                            <h3 style="margin:0 0 1rem; color:${si.text}; text-transform:capitalize;">Application ${safeStatus}</h3>
                            <div style="display:grid; gap:0.6rem;">
                                <div><strong>Application No:</strong> ${safeAppNo}</div>
                                <div><strong>Student:</strong> ${safeName}</div>
                                <div><strong>Grade:</strong> ${safeGrade}</div>
                                <div><strong>Submitted:</strong> ${submittedDate}</div>
                                ${application.application_fee_paid
                                    ? `<div><strong>Fee:</strong> ₦${(application.application_fee_amount||0).toLocaleString()} ✓ Paid</div>`
                                    : application.payment_method === 'bank-transfer'
                                        ? `<div><strong>Fee:</strong> ₦${(application.application_fee_amount||0).toLocaleString()} — <span style="color:hsl(45,80%,35%); font-weight:600;">Pending Verification</span></div>`
                                        : ''}
                                ${application.status === 'approved' ? `
                                    <div style="margin-top:0.75rem; padding:1rem; background:hsl(150,70%,97%); border:1.5px solid hsl(150,70%,75%); border-radius:0.75rem;">
                                        <div style="font-weight:700; color:hsl(150,70%,25%); margin-bottom:0.5rem;"><i class="fas fa-graduation-cap" style="margin-right:0.4rem;"></i>Congratulations — Approved!</div>
                                        <p style="margin:0 0 0.75rem; font-size:0.875rem; color:hsl(150,60%,20%);">Login credentials have been (or will be) sent to the email on file.</p>
                                        <a href="${window.location.origin}/login.html" target="_blank" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.6rem 1.1rem; background:hsl(150,65%,40%); color:white; border-radius:0.5rem; font-weight:600; font-size:0.875rem; text-decoration:none;">
                                            <i class="fas fa-sign-in-alt"></i> Student Portal Login
                                        </a>
                                    </div>
                                ` : application.status === 'rejected' ? `
                                    ${safeReason ? `<div style="margin-top:0.5rem; padding:0.75rem; background:hsl(0,80%,97%); border-left:3px solid hsl(0,80%,55%); border-radius:0.5rem; color:hsl(0,60%,30%);"><strong>Reason:</strong> ${safeReason}</div>` : ''}
                                    <div style="margin-top:0.5rem; font-size:0.85rem; color:#555;">For enquiries, contact <a href="mailto:${safeEmail}" style="color:var(--color-primary);">${safeEmail}</a></div>
                                ` : `
                                    <div style="margin-top:0.5rem; padding:0.75rem; background:white; border-radius:0.5rem; font-size:0.875rem;">
                                        <i class="fas fa-info-circle"></i> Under review — we'll email you once a decision is made.
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Make ApplicationManager globally available
    window.ApplicationManager = ApplicationManager;
    window.appManager = new ApplicationManager();

    // Handle application form submission
    window.handleApplicationSubmit = async function (event) {
        event.preventDefault();

        const form = event.target;
        const studentName = form.querySelector('#studentName').value.trim();
        const studentDob = form.querySelector('#studentDob')?.value;
        const studentGender = form.querySelector('#studentGender')?.value;
        const grade = form.querySelector('#grade').value;
        const previousSchool = form.querySelector('#previousSchool')?.value.trim();
        const parentName = form.querySelector('#parentName').value.trim();
        const parentEmail = form.querySelector('#parentEmail').value.trim();
        const parentPhone = form.querySelector('#parentPhone').value.trim();

        const parentStreet = form.querySelector('#parentStreet')?.value.trim();
        const parentCity = form.querySelector('#parentCity')?.value.trim();
        const parentState = form.querySelector('#parentState')?.value.trim();

        const applicationForm = form.querySelector('#applicationFile')?.files[0];
        const birthCertificate = form.querySelector('#birthCertificate')?.files[0];
        const passportPhoto = form.querySelector('#passportPhoto')?.files[0];
        const previousReport = form.querySelector('#previousReport')?.files[0];

        // Determine selected payment method
        const paymentMethodRadio = form.querySelector('input[name="paymentMethod"]:checked');
        const paymentMethod = paymentMethodRadio ? paymentMethodRadio.value : 'paystack';

        // Validate required inputs
        if (!studentName || !grade || !parentName || !parentEmail || !parentPhone) {
            showNotification('Please fill in all required fields.', 'error');
            return;
        }

        if (!parentStreet || !parentCity || !parentState) {
            showNotification('Please fill in the full home address (street, city, and state).', 'error');
            return;
        }

        if (!applicationForm || !birthCertificate || !passportPhoto) {
            showNotification('Please upload all required documents (Application Form, Birth Certificate, Passport Photo).', 'error');
            return;
        }

        // Basic format validation (uniqueness check happens after loading state)
        const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
        const phoneRegex = /^[0-9+\-\(\)\s]{10,20}$/;
        
        if (!emailRegex.test(parentEmail)) {
            showNotification('Invalid email format', 'error');
            return;
        }
        if (!phoneRegex.test(parentPhone)) {
            showNotification('Invalid phone number format (10-20 digits)', 'error');
            return;
        }

        // Confirm email check — field is required; also catches browser-bypassed empty value
        const confirmEmailField = form.querySelector('#confirmParentEmail');
        if (confirmEmailField) {
            const confirmParentEmail = confirmEmailField.value.trim();
            if (!confirmParentEmail || confirmParentEmail !== parentEmail) {
                showNotification('Email addresses do not match. Please re-enter and try again.', 'error');
                return;
            }
        }

        // Bank transfer specific validations
        if (paymentMethod === 'bank-transfer') {
            const bankTransactionRef = form.querySelector('#bankTransactionRef')?.value.trim();
            const bankReceipt = form.querySelector('#bankReceipt')?.files[0];
            if (!bankTransactionRef) {
                showNotification('Please enter the transaction reference / teller number.', 'error');
                return;
            }
            if (!bankReceipt) {
                showNotification('Please upload your payment receipt.', 'error');
                return;
            }
            if (bankReceipt.size > 5 * 1024 * 1024) {
                showNotification('Receipt file must be under 5MB.', 'error');
                return;
            }
            const allowedReceiptTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            if (!allowedReceiptTypes.includes(bankReceipt.type)) {
                showNotification('Receipt must be a JPG, PNG or PDF file.', 'error');
                return;
            }
        }

        // Show loading
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying details...';
        submitBtn.disabled = true;
        let _postPaymentFailure = false; // prevents re-enabling button if payment was charged

        try {
            // Check for duplicate student application
            if (window.appManager?.supabase && studentName && grade) {
                try {
                    const { data: existingApps } = await window.appManager.supabase
                        .from('applications')
                        .select('application_number, submitted_date')
                        .ilike('student_name', studentName)
                        .eq('grade', grade)
                        .limit(1);
                    if (existingApps && existingApps.length > 0) {
                        showNotification(
                            `An application for "${studentName}" applying for ${grade} already exists (Ref: ${existingApps[0].application_number}). Contact the school if this is a different student.`,
                            'error'
                        );
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                        return;
                    }
                } catch (_) { /* non-blocking — continue if check fails */ }
            }

            // Check email and phone uniqueness
            if (typeof validationManager !== 'undefined') {
                const validation = await validationManager.validateUserInput({
                    parent_email: parentEmail,
                    parent_phone: parentPhone
                }, { checkUniqueness: true, excludeTable: 'applications' });

                if (!validation.isValid) {
                    validation.errors.forEach(err => {
                        showNotification(err.message, 'error');
                    });
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            const applicationFee = window.appManager.getApplicationFee(grade);

            const formData = {
                studentName,
                studentDob,
                studentGender,
                grade,
                previousSchool,
                parentName,
                parentEmail,
                parentPhone,
                parentAddress: { street: parentStreet, city: parentCity, state: parentState },
                applicationForm,
                birthCertificate,
                passportPhoto,
                previousReport
            };

            let application;

            if (paymentMethod === 'bank-transfer') {
                // Bank transfer flow
                formData.bankReceipt = form.querySelector('#bankReceipt')?.files[0];
                formData.bankTransactionRef = form.querySelector('#bankTransactionRef')?.value.trim();

                const confirmed = await new Promise(resolve => {
                    if (typeof window.showPaymentConfirmModal === 'function') {
                        window.showPaymentConfirmModal(
                            [
                                ['Application Fee', `\u20A6${applicationFee.toLocaleString()}`],
                                ['Payment Method', 'Bank Transfer'],
                                ['Reference', formData.bankTransactionRef || '—'],
                            ],
                            'Your application will be submitted and the payment will be verified by an administrator.',
                            () => resolve(true),
                            () => resolve(false)  // handles Cancel button AND backdrop click
                        );
                    } else {
                        resolve(true);
                    }
                });
                if (!confirmed) return;

                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading documents...';
                application = await window.appManager.submitBankTransferApplication(formData, applicationFee);
            } else {
                // Paystack flow
                const confirmed = await new Promise(resolve => {
                    if (typeof window.showPaymentConfirmModal === 'function') {
                        window.showPaymentConfirmModal(
                            [
                                ['Application Fee', `\u20A6${applicationFee.toLocaleString()}`],
                                ['Payment Method', 'Paystack (Online)'],
                                ['Applicant Email', formData.parentEmail || formData.email || '—'],
                            ],
                            'You will be redirected to the Paystack payment window to complete your payment securely.',
                            () => resolve(true),
                            () => resolve(false)  // handles Cancel button AND backdrop click
                        );
                    } else {
                        resolve(true);
                    }
                });
                if (!confirmed) return;

                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing payment...';
                application = await window.appManager.submitApplication(formData, applicationFee);
            }

            // Reset form on success
            form.reset();
            document.querySelectorAll('.file-info').forEach(el => el.style.display = 'none');
            document.querySelectorAll('[id$="Preview"]').forEach(el => el.style.display = 'none');
            if (typeof window.clearApplicationDraft === 'function') window.clearApplicationDraft();
            // Reset bank transfer section visibility
            const bankSection = document.getElementById('bankTransferSection');
            if (bankSection) bankSection.style.display = 'none';

            if (paymentMethod === 'bank-transfer') {
                showBankTransferSuccess(application.application_number);
            } else {
                showApplicationSuccess(application.application_number);
            }
        } catch (error) {
            console.error('Application submission error:', error);
            const msg = error.message || 'Error submitting application. Please try again.';
            // Detect post-payment failure: payment was charged but app record was not saved
            const isPostPayment = msg.startsWith('Payment received (Ref:');
            if (isPostPayment) {
                _postPaymentFailure = true;
                // Persistent (duration=0) so user can read and copy the reference
                showNotification(msg, 'error', 0);
                submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Payment Error — Contact School';
                submitBtn.style.opacity = '0.65';
                submitBtn.style.cursor = 'not-allowed';
            } else if (msg.includes('cancelled')) {
                showNotification('Payment cancelled. Your application was not submitted.', 'info');
            } else {
                // Longer timeout for error messages that require reading (8 s)
                showNotification(msg, 'error', 8000);
            }
        } finally {
            if (!_postPaymentFailure) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                submitBtn.style.opacity = '';
                submitBtn.style.cursor = '';
            }
        }
    };

    // Check application status
    window.checkApplicationStatus = async function () {
        const input = document.getElementById('applicationIdInput');
        const resultDiv = document.getElementById('statusResult');

        if (!input || !resultDiv) return;

        const applicationNumber = input.value.trim().toUpperCase();

        if (!applicationNumber) {
            showNotification('Please enter an application number.', 'error');
            return;
        }

        // Show loading
        resultDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--color-primary);"></i></div>';

        try {
            const application = await window.appManager.getApplicationByNumber(applicationNumber);

            if (!application) {
                resultDiv.innerHTML = `
                    <div class="card" style="background:hsl(0,80%,95%); border-left:4px solid hsl(0,80%,55%);">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <i class="fas fa-exclamation-circle" style="font-size:2rem; color:hsl(0,80%,55%);"></i>
                            <div>
                                <h4 style="margin:0; color:hsl(0,80%,40%);">Application Not Found</h4>
                                <p style="margin:0.5rem 0 0; color:hsl(0,60%,30%);">No application found with number: <strong>${escapeHtml(applicationNumber)}</strong></p>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            resultDiv.innerHTML = window.appManager.renderStatusCard(application);
        } catch (error) {
            console.error('Error checking application status:', error);
            resultDiv.innerHTML = `
                <div class="card" style="background: hsl(0, 80%, 95%); border-left: 4px solid hsl(0, 80%, 55%);">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: hsl(0, 80%, 55%);"></i>
                        <div>
                            <h4 style="margin: 0; color: hsl(0, 80%, 40%);">Error</h4>
                            <p style="margin: 0.5rem 0 0; color: hsl(0, 60%, 30%);">
                                Failed to check application status. Please try again.
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }
    };

    // Show application success modal
    function showApplicationSuccess(applicationId) {
        const modal = document.createElement('div');
        modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    `;

        modal.innerHTML = `
      <div style="background: white; padding: 2rem; border-radius: 1rem; max-width: 500px; width: 90%; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); animation: slideUp 0.3s ease;">
        <div style="text-align: center;">
          <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, hsl(150, 70%, 45%), hsl(150, 70%, 35%)); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-check" style="font-size: 2.5rem; color: white;"></i>
          </div>
          <h2 style="margin: 0 0 1rem; color: hsl(220, 70%, 30%); font-family: 'Outfit', sans-serif;">
            Application Submitted Successfully!
          </h2>
          <p style="color: hsl(220, 40%, 40%); margin-bottom: 1.5rem; line-height: 1.6;">
            Your application has been received. Please save your Application ID for tracking.
          </p>
          <div style="background: hsl(220, 70%, 97%); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1rem;">
            <p style="margin: 0 0 0.5rem; color: hsl(220, 40%, 40%); font-size: 0.875rem;">Your Application ID:</p>
            <p style="margin: 0 0 0.75rem; font-size: 1.75rem; font-weight: 700; color: hsl(220, 70%, 40%); font-family: 'Courier New', monospace;">${applicationId}</p>
            <button onclick="navigator.clipboard.writeText('${applicationId}'); this.textContent='✅ Copied!'" style="font-size:0.8rem;padding:0.35rem 1rem;border:1px solid hsl(220,70%,70%);background:white;color:hsl(220,70%,40%);border-radius:0.4rem;cursor:pointer;">📋 Copy ID</button>
          </div>
          <div style="background: hsl(150, 60%, 97%); border: 1px solid hsl(150, 60%, 75%); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.25rem; text-align: left;">
            <p style="margin: 0 0 0.5rem; font-size: 0.85rem; color: hsl(150, 50%, 25%); font-weight: 600;">🎓 Student Portal Access</p>
            <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: hsl(150, 40%, 30%); line-height: 1.5;">
              Once your application is approved, you will receive your login credentials. Use the link below to access the student portal.
            </p>
            <a href="student-portal.html" target="_blank" style="display:inline-block;background:linear-gradient(135deg,hsl(150,70%,40%),hsl(150,70%,30%));color:white;padding:0.5rem 1.25rem;border-radius:0.4rem;font-size:0.85rem;font-weight:600;text-decoration:none;">🔗 student-portal.html</a>
          </div>
          <p style="color: hsl(220, 40%, 40%); font-size: 0.875rem; margin-bottom: 1.5rem;">We will review your application and contact you via email within 5-7 business days.</p>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: linear-gradient(135deg, hsl(220, 70%, 50%), hsl(220, 70%, 40%)); color: white; border: none; padding: 0.75rem 2rem; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(34, 60, 120, 0.3);">Close</button>
        </div>
      </div>
    `;

        document.body.appendChild(modal);

        // Close on background click
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // Show bank transfer success modal (pending verification)
    function showBankTransferSuccess(applicationId) {
        const modal = document.createElement('div');
        modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    `;

        modal.innerHTML = `
      <div style="background: white; padding: 2rem; border-radius: 1rem; max-width: 500px; width: 90%; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); animation: slideUp 0.3s ease;">
        <div style="text-align: center;">
          <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, hsl(45, 100%, 50%), hsl(45, 100%, 40%)); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-clock" style="font-size: 2.5rem; color: white;"></i>
          </div>
          <h2 style="margin: 0 0 1rem; color: hsl(220, 70%, 30%); font-family: 'Outfit', sans-serif;">
            Application Submitted!
          </h2>
          <p style="color: hsl(220, 40%, 40%); margin-bottom: 1rem; line-height: 1.6;">
            Your application and payment receipt have been submitted successfully.
          </p>
          <div style="background: hsl(45, 100%, 95%); padding: 1rem; border-radius: 0.75rem; margin-bottom: 1rem; border-left: 4px solid hsl(45, 100%, 50%);">
            <p style="margin: 0; font-size: 0.9rem; color: hsl(45, 80%, 25%);">
              <i class="fas fa-info-circle"></i> Your payment is <strong>pending verification</strong> by the school admin. You will be contacted once payment is confirmed.
            </p>
          </div>
          <div style="background: hsl(220, 70%, 97%); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1rem;">
            <p style="margin: 0 0 0.5rem; color: hsl(220, 40%, 40%); font-size: 0.875rem;">Your Application ID:</p>
            <p style="margin: 0 0 0.75rem; font-size: 1.75rem; font-weight: 700; color: hsl(220, 70%, 40%); font-family: 'Courier New', monospace;">${applicationId}</p>
            <button onclick="navigator.clipboard.writeText('${applicationId}'); this.textContent='✅ Copied!'" style="font-size:0.8rem;padding:0.35rem 1rem;border:1px solid hsl(220,70%,70%);background:white;color:hsl(220,70%,40%);border-radius:0.4rem;cursor:pointer;">📋 Copy ID</button>
          </div>
          <div style="background: hsl(150, 60%, 97%); border: 1px solid hsl(150, 60%, 75%); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.25rem; text-align: left;">
            <p style="margin: 0 0 0.5rem; font-size: 0.85rem; color: hsl(150, 50%, 25%); font-weight: 600;">🎓 Student Portal Access</p>
            <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: hsl(150, 40%, 30%); line-height: 1.5;">
              Once your application is approved and payment verified, you will receive login credentials to access the student portal.
            </p>
            <a href="student-portal.html" target="_blank" style="display:inline-block;background:linear-gradient(135deg,hsl(150,70%,40%),hsl(150,70%,30%));color:white;padding:0.5rem 1.25rem;border-radius:0.4rem;font-size:0.85rem;font-weight:600;text-decoration:none;">🔗 student-portal.html</a>
          </div>
          <p style="color: hsl(220, 40%, 40%); font-size: 0.875rem; margin-bottom: 1.5rem;">Save this Application ID to track your application status.</p>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: linear-gradient(135deg, hsl(220, 70%, 50%), hsl(220, 70%, 40%)); color: white; border: none; padding: 0.75rem 2rem; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(34, 60, 120, 0.3);">Close</button>
        </div>
      </div>
    `;

        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // Escape HTML to prevent XSS when inserting user input into innerHTML
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    window.escapeHtml = escapeHtml;

    // Helper function to show notifications
    // duration: milliseconds (default 5000). Pass 0 for persistent (click to dismiss).
    function showNotification(message, type = 'info', duration = 5000) {
        const colors = {
            success: 'hsl(150, 70%, 45%)',
            error: 'hsl(0, 80%, 55%)',
            info: 'hsl(200, 90%, 55%)'
        };

        const notification = document.createElement('div');
        notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: ${colors[type] || colors.info};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease;
      max-width: 340px;
      cursor: pointer;
      line-height: 1.5;
    `;
        notification.setAttribute('title', 'Click to dismiss');
        notification.textContent = message;
        if (duration === 0) {
            // Persistent: show a small "×" dismiss hint
            const hint = document.createElement('div');
            hint.textContent = '✕ Click to dismiss';
            hint.style.cssText = 'font-size:0.72rem; opacity:0.75; margin-top:0.5rem;';
            notification.appendChild(hint);
        }
        document.body.appendChild(notification);

        const dismiss = () => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        };
        notification.addEventListener('click', dismiss);

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }
    }

    // Add animations
    const style = document.createElement('style');
    style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from {
        transform: translateY(50px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
    document.head.appendChild(style);

})();
