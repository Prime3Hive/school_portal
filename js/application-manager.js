// Application Manager for TBD International Academy
// Handles application submissions, tracking, and status checking
// Integrated with Supabase and Paystack

(function () {
    'use strict';

    // Display-only fee table. The amount actually charged and recorded is read
    // from `application_fee_schedule` server-side by the submit-application
    // edge function — a price shown here is never trusted by the backend.
    const APPLICATION_FEES_FALLBACK = {
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

    // Accepted document uploads. Enforced again by Storage policy server-side.
    const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
    const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

    // Application Manager Class
    class ApplicationManager {
        constructor() {
            this.supabase = window.supabaseClient;
            this.uploadManager = window.fileUploadManager;
            this._feeSchedule = null;
        }

        // Load the authoritative fee table once, for display purposes.
        async loadFeeSchedule() {
            if (this._feeSchedule) return this._feeSchedule;
            try {
                const { data, error } = await this.supabase
                    .from('application_fee_schedule')
                    .select('grade, amount');
                if (error) throw error;
                this._feeSchedule = Object.fromEntries(
                    (data || []).map(r => [r.grade, Number(r.amount)])
                );
            } catch (err) {
                console.warn('Fee schedule unavailable, using display fallback:', err.message);
                this._feeSchedule = { ...APPLICATION_FEES_FALLBACK };
            }
            return this._feeSchedule;
        }

        // Get application fee for a grade (display only)
        getApplicationFee(grade) {
            const schedule = this._feeSchedule || APPLICATION_FEES_FALLBACK;
            return schedule[grade] ?? APPLICATION_FEES_FALLBACK[grade] ?? 5000;
        }

        // Opaque, unguessable id used for the payment reference and the upload
        // folder. The real application number is minted server-side once the
        // payment has been verified, so it cannot be predicted or enumerated.
        newSubmissionRef() {
            const uuid = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
                .replace(/-/g, '');
            return `APP-${uuid.slice(0, 24).toUpperCase()}`;
        }

        // Upload document to Supabase Storage under the submission folder
        async uploadDocument(file, submissionRef, documentType) {
            if (file.size > MAX_UPLOAD_BYTES) {
                throw new Error(`${documentType.replace(/_/g, ' ')} is larger than 5MB.`);
            }
            if (!ALLOWED_DOC_TYPES.includes(file.type)) {
                throw new Error(`${documentType.replace(/_/g, ' ')} must be a PDF, JPG or PNG file.`);
            }

            // Only the extension is taken from the user-supplied filename.
            const ext = (file.name.split('.').pop() || 'dat').replace(/[^a-z0-9]/gi, '').slice(0, 5);
            const filePath = `applications/${submissionRef}/${documentType}_${Date.now()}.${ext}`;

            const { error } = await this.supabase.storage
                .from('documents')
                .upload(filePath, file, { cacheControl: '3600', upsert: false });

            if (error) {
                console.error('Error uploading document:', error);
                throw new Error(`Could not upload ${documentType.replace(/_/g, ' ')}: ${error.message}`);
            }

            const { data: urlData } = this.supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            return urlData.publicUrl;
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
        async processPayment(email, amount, submissionRef) {
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

            const reference = submissionRef;

            // Create transaction record before opening Paystack popup.
            // NOTE: this row is advisory telemetry only. RLS forbids the browser
            // from ever setting status='success' — the submit-application edge
            // function promotes it after verifying the charge with Paystack.
            try {
                const { error: txnError } = await this.supabase
                    .from('payment_transactions')
                    .insert({
                        reference: reference,
                        transaction_type: 'application_fee',
                        amount: amount,
                        currency: 'NGN',
                        payer_email: email,
                        gateway: 'paystack',
                        status: 'pending',
                        metadata: {
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
                // Set as soon as Paystack reports a successful charge. Paystack
                // fires onClose after the iframe closes — including after a
                // successful payment — and without this guard that handler
                // would overwrite a paid transaction with 'cancelled', which
                // both corrupts reconciliation and makes the submission fail.
                let settled = false;

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
                        // Do NOT write status='success' here — RLS forbids it, and
                        // a browser callback is not proof of payment. The edge
                        // function verifies the charge against the Paystack API.
                        settled = true;
                        resolve({
                            reference: response.reference || reference,
                            status: response.status,
                            message: response.message
                        });
                    },
                    onClose: () => {
                        // Payment already succeeded — leave the record alone.
                        if (settled) return;

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
                            // The user closed the checkout window without paying.
                            // (The old code guessed "Paystack API error" whenever
                            // the popup was open for under 4s, which mislabelled
                            // anyone who simply changed their mind quickly.)
                            this.supabase
                                .from('payment_transactions')
                                .update({
                                    status: 'cancelled',
                                    failed_at: new Date().toISOString(),
                                    error_message: 'User closed the payment window'
                                })
                                .eq('reference', reference)
                                .then(() => {}).catch(() => {});

                            reject(new Error('Payment cancelled. Your application was not submitted.'));
                        }
                    }
                });

                // Mark as processing when popup opens
                try {
                    handler.openIframe();
                    popupOpened = true;

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
        async _uploadDocuments(formData, submissionRef) {
            const documentUrls = {};
            if (formData.applicationForm) {
                documentUrls.applicationFormUrl = await this.uploadDocument(
                    formData.applicationForm, submissionRef, 'application_form'
                );
            }
            if (formData.birthCertificate) {
                documentUrls.birthCertificateUrl = await this.uploadDocument(
                    formData.birthCertificate, submissionRef, 'birth_certificate'
                );
            }
            if (formData.passportPhoto) {
                documentUrls.passportPhotoUrl = await this.uploadDocument(
                    formData.passportPhoto, submissionRef, 'passport_photo'
                );
            }
            if (formData.previousReport) {
                documentUrls.previousReportUrl = await this.uploadDocument(
                    formData.previousReport, submissionRef, 'previous_report'
                );
            }
            return documentUrls;
        }

        // POST the submission to the edge function, which is the only writer of
        // the applications table. It re-derives the fee, verifies the Paystack
        // charge with the secret key, and enforces duplicate/rate limits.
        async _postSubmission(body) {
            const baseUrl = window.SUPABASE_URL;
            const anonKey = window.SUPABASE_ANON;
            if (!baseUrl || !anonKey) {
                throw new Error('The application service is unavailable. Please try again later.');
            }

            let res, result;
            try {
                res = await fetch(`${baseUrl}/functions/v1/submit-application`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': anonKey,
                        'Authorization': `Bearer ${anonKey}`
                    },
                    body: JSON.stringify(body)
                });
                result = await res.json();
            } catch (netErr) {
                console.error('submit-application network error:', netErr);
                throw new Error('NETWORK: Could not reach the application service.');
            }

            if (!res.ok || !result?.success) {
                const msg = result?.error || `Submission failed (HTTP ${res.status}).`;
                const err = new Error(msg);
                err.status = res.status;
                throw err;
            }

            return result.application;
        }

        // Submit new application via Paystack (online payment).
        // Payment is processed FIRST, then documents, then the record is created
        // by the edge function — which independently verifies the charge with
        // Paystack before it will write application_fee_paid = true.
        async submitApplication(formData, applicationFee) {
            const submissionRef = this.newSubmissionRef();
            const feeAmount = applicationFee || this.getApplicationFee(formData.grade);

            // STEP 1: Process payment first (throws if cancelled or CDN unavailable)
            const paymentResult = await this.processPayment(
                formData.parentEmail, feeAmount, submissionRef
            );

            // STEP 2: Payment succeeded — now upload documents. A failure here
            // must not lose the payment, so the reference is carried into the
            // error message and stamped on the transaction row for recovery.
            let documentUrls = {};
            try {
                documentUrls = await this._uploadDocuments(formData, submissionRef);
            } catch (uploadErr) {
                console.error('Document upload failed after payment:', uploadErr);
                this.supabase
                    .from('payment_transactions')
                    .update({ error_message: `Document upload failed after payment: ${uploadErr.message}` })
                    .eq('reference', paymentResult.reference)
                    .then(() => {}).catch(() => {});
                throw new Error(
                    'Payment received (Ref: ' + paymentResult.reference + ') but your documents could not be uploaded. ' +
                    'Please contact the school with this reference — do not pay again.'
                );
            }

            // STEP 3: Server verifies the charge and writes the record.
            try {
                return await this._postSubmission({
                    ...this._applicantPayload(formData),
                    ...documentUrls,
                    paymentMethod: 'paystack',
                    paymentReference: paymentResult.reference
                });
            } catch (err) {
                console.error('Error saving application:', err.message);
                throw new Error(
                    'Payment received (Ref: ' + paymentResult.reference + ') but the application could not be saved: ' +
                    err.message + ' Please contact the school with your payment reference — do not pay again.'
                );
            }
        }

        // Submit new application via Bank Transfer.
        // Nothing is charged here; the record is created with fee_paid = false
        // and an admin must verify the teller slip before it can be approved.
        async submitBankTransferApplication(formData) {
            const submissionRef = this.newSubmissionRef();

            // STEP 1: Upload receipt
            let receiptUrl = null;
            if (formData.bankReceipt) {
                receiptUrl = await this.uploadDocument(formData.bankReceipt, submissionRef, 'receipt');
            }

            // STEP 2: Upload application documents. Unlike the Paystack flow no
            // money has moved yet, so a failure here is a hard stop rather than
            // something to paper over.
            const documentUrls = await this._uploadDocuments(formData, submissionRef);

            // STEP 3: Server writes the record with the fee unverified.
            return this._postSubmission({
                ...this._applicantPayload(formData),
                ...documentUrls,
                receiptUrl,
                paymentMethod: 'bank-transfer',
                bankTransactionRef: formData.bankTransactionRef || null
            });
        }

        // Shape the applicant fields for the edge function. Note the absence of
        // any fee, status or paid flag — those are server-owned.
        _applicantPayload(formData) {
            return {
                studentName:    formData.studentName,
                studentDob:     formData.studentDob || null,
                studentGender:  formData.studentGender || null,
                grade:          formData.grade,
                previousSchool: formData.previousSchool || null,
                parentName:     formData.parentName,
                parentEmail:    formData.parentEmail,
                parentPhone:    formData.parentPhone,
                parentAddress:  formData.parentAddress || {}
            };
        }

        // Look up one application's status. Requires the application number AND
        // the email on file: the row itself is not readable by anonymous
        // visitors, so this goes through a SECURITY DEFINER function that
        // returns only the fields the status card renders.
        async getApplicationStatus(applicationNumber, email) {
            const { data, error } = await this.supabase.rpc('check_application_status', {
                p_app_no: applicationNumber,
                p_email:  email
            });

            if (error) {
                console.error('Error fetching application:', error);
                throw new Error('Could not check your application status. Please try again.');
            }
            return Array.isArray(data) ? (data[0] || null) : (data || null);
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
            // Admissions queries belong with the head teacher, not general support.
            const schoolEmail = (typeof AppConfig !== 'undefined' && AppConfig.email?.admissions) || 'headteacher@tbdacademy.org';
            const submittedDate = new Date(application.submitted_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            // Escape all DB-sourced text before injecting into innerHTML
            const safeAppNo    = escapeHtml(application.application_number || '');
            const safeName     = escapeHtml(application.student_name || '');
            const safeGrade    = escapeHtml(application.grade || '');
            const safeStatus   = escapeHtml(application.status || 'pending');
            const safeReason   = escapeHtml(application.rejection_reason || '');
            const safePayReject = escapeHtml(application.payment_rejection_reason || '');
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
                                    : safePayReject
                                        ? `<div><strong>Fee:</strong> ₦${(application.application_fee_amount||0).toLocaleString()} — <span style="color:hsl(0,80%,45%); font-weight:600;">Payment Not Accepted</span>
                                           <div style="margin-top:0.4rem; padding:0.6rem 0.75rem; background:hsl(0,80%,97%); border-left:3px solid hsl(0,80%,55%); border-radius:0.5rem; font-size:0.85rem; color:hsl(0,60%,30%);">
                                             <strong>Reason:</strong> ${safePayReject}<br>
                                             Please contact <a href="mailto:${safeEmail}" style="color:var(--color-primary);">${safeEmail}</a> to resolve this and re-submit your payment.
                                           </div></div>`
                                        : application.payment_method === 'bank-transfer'
                                            ? `<div><strong>Fee:</strong> ₦${(application.application_fee_amount||0).toLocaleString()} — <span style="color:hsl(45,80%,35%); font-weight:600;">Pending Verification</span></div>`
                                            : ''}
                                ${application.status === 'approved' ? `
                                    <div style="margin-top:0.75rem; padding:1rem; background:hsl(150,70%,97%); border:1.5px solid hsl(150,70%,75%); border-radius:0.75rem;">
                                        <div style="font-weight:700; color:hsl(150,70%,25%); margin-bottom:0.5rem;"><i class="fas fa-graduation-cap" style="margin-right:0.4rem;"></i>Congratulations — Approved!</div>
                                        <p style="margin:0 0 0.75rem; font-size:0.875rem; color:hsl(150,60%,20%);">The school will contact you with your student portal login details. Nothing is sent automatically — if you have not heard from us, please get in touch.</p>
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
            // Duplicate-applicant and payment-reference checks now run inside the
            // submit-application edge function. They cannot run here: anonymous
            // visitors cannot read the applications table (by design), so a
            // client-side check would either fail open or require exposing every
            // applicant's details to the public.
            //
            // The old uniqueness check against profiles/staff/students was also
            // removed — it blocked any parent who already had a child enrolled
            // from applying for a second child.

            // Refresh the authoritative price list before quoting a figure.
            await window.appManager.loadFeeSchedule();
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
                application = await window.appManager.submitBankTransferApplication(formData);
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

    // Check application status.
    // Both the application number and the email on file are required — the
    // number alone used to be enough, which combined with sequential numbering
    // meant anyone could walk the whole table and harvest applicant details.
    window.checkApplicationStatus = async function () {
        const input = document.getElementById('applicationIdInput');
        const emailInput = document.getElementById('applicationLookupEmail');
        const resultDiv = document.getElementById('statusResult');

        if (!input || !resultDiv) return;

        const applicationNumber = input.value.trim();
        const email = (emailInput?.value || '').trim();

        if (!applicationNumber) {
            showNotification('Please enter an application number.', 'error');
            return;
        }
        if (!email) {
            showNotification('Please enter the email address used on the application.', 'error');
            return;
        }

        // Show loading
        resultDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--color-primary);"></i></div>';

        try {
            const application = await window.appManager.getApplicationStatus(applicationNumber, email);

            if (!application) {
                resultDiv.innerHTML = `
                    <div class="card" style="background:hsl(0,80%,95%); border-left:4px solid hsl(0,80%,55%);">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <i class="fas fa-exclamation-circle" style="font-size:2rem; color:hsl(0,80%,55%);"></i>
                            <div>
                                <h4 style="margin:0; color:hsl(0,80%,40%);">Application Not Found</h4>
                                <p style="margin:0.5rem 0 0; color:hsl(0,60%,30%);">No application matches <strong>${escapeHtml(applicationNumber)}</strong> together with that email address. Check both entries — the email must be the one used on the application.</p>
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
              Once your application is approved, the school will contact you with your login details. Use the link below to reach the student portal.
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
              Once your application is approved and payment verified, the school will contact you with your login details for the student portal.
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

    // Escape HTML to prevent XSS when inserting user input into innerHTML.
    // The canonical implementation lives in js/html-escape.js, which loads on
    // every page. The local fallback keeps this file working standalone.
    const escapeHtml = window.escapeHtml || function (str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    if (!window.escapeHtml) window.escapeHtml = escapeHtml;

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
