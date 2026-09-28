// ============================================
// APPLICATIONS MODULE
// Manages student application submissions from the public blog
// ============================================

const applicationsModule = {
    currentFilter: 'all',
    applications: [],
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc',
    _approving: false,   // in-flight guard for confirmApproval

    // XSS helper — delegates to global escapeHtml when available.
    // Every value rendered by this module originates from a public,
    // unauthenticated submission, so nothing may reach innerHTML unescaped.
    _esc(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(String(str ?? ''));
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // Document URLs are attacker-supplied too. Only http(s) links are allowed
    // through — a `javascript:` URL in an href runs with the admin's session.
    _safeUrl(url) {
        const raw = String(url ?? '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw, window.location.origin);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
        } catch {
            return '';
        }
    },

    // Escaped, protocol-checked URL ready for an href/src attribute.
    _escUrl(url) {
        return this._esc(this._safeUrl(url));
    },

    // parent_address is jsonb ({street, city, state}); rendering it directly
    // produced the literal text "[object Object]" in the details modal.
    _formatAddress(addr) {
        if (!addr) return '—';
        if (typeof addr === 'string') return addr || '—';
        const parts = [addr.street, addr.city, addr.state].filter(p => p && String(p).trim());
        return parts.length ? parts.join(', ') : '—';
    },

    async init(container) {
        if (container) this.container = container;

        // Stable bound handler — same reference across re-inits so removeEventListener works
        if (!this._boundDataChange) {
            this._boundDataChange = (e) => {
                if (e.detail?.collection === 'applications') {
                    this.applications = dataManager.getAll('applications') || [];
                    this.render();
                }
            };
        }
        window.removeEventListener('datamanager:change', this._boundDataChange);
        window.addEventListener('datamanager:change', this._boundDataChange);
        this._onDataChange = this._boundDataChange; // keep app.js skip-check working

        await this.loadApplications();
        this.render();
        this.attachEventListeners();
    },

    cleanup() {
        if (this._boundDataChange) {
            window.removeEventListener('datamanager:change', this._boundDataChange);
        }
    },

    async loadApplications() {
        await dataManager.waitForReady();
        // applications is a deferred collection — if not yet loaded, wait for it
        if (!dataManager._loaded['applications']) {
            await new Promise((resolve) => {
                const handler = (e) => {
                    if (e.detail?.collection === 'applications') {
                        window.removeEventListener('datamanager:change', handler);
                        resolve();
                    }
                };
                window.addEventListener('datamanager:change', handler);
                // Kick off fetch in case background load hasn't started yet
                if (!dataManager._loading['applications']) {
                    dataManager.refresh('applications');
                }
                // Safety timeout — don't block forever
                setTimeout(() => { window.removeEventListener('datamanager:change', handler); resolve(); }, 12000);
            });
        }
        this.applications = dataManager.getAll('applications') || [];
    },

    // Search is wired inline (oninput) so it keeps working after a re-render.
    attachEventListeners() {},

    STATUS: {
        pending:    { label: 'Waiting for review', tone: 'is-warn' },
        approved:   { label: 'Approved',           tone: 'is-good' },
        rejected:   { label: 'Rejected',           tone: '' },
        incomplete: { label: 'Fee not accepted',   tone: 'is-warn' }
    },

    _field(app, camel, snake) {
        return app[camel] ?? app[snake];
    },

    _submitted(app) {
        return app.submitted_date || app.submittedDate || app.created_at || app.createdAt || null;
    },

    _date(v, withTime = false) {
        if (!v) return '—';
        const d = new Date(v);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
    },

    _money(n) {
        return '₦' + Math.round(parseFloat(n) || 0).toLocaleString('en-NG');
    },

    _feePaid(app) {
        return !!(app.application_fee_paid || app.applicationFeePaid);
    },

    /** Where the application fee stands, in the school's words. */
    _feeState(app) {
        if (this._feePaid(app)) return { label: 'Fee paid', tone: 'is-good' };
        if (app.payment_rejection_reason || app.paymentRejectionReason) return { label: 'Fee not accepted', tone: 'is-warn' };
        if (this._awaitsPaymentVerification(app)) return { label: 'Fee to confirm', tone: 'is-warn' };
        return { label: 'Fee not paid', tone: '' };
    },

    render() {
        const container = this.container || document.getElementById('main-content');
        const stats = this.getStatistics();
        const filters = [['all', 'All', stats.total], ['pending', 'Waiting', stats.pending], ['approved', 'Approved', stats.approved], ['incomplete', 'Fee not accepted', stats.incomplete], ['rejected', 'Rejected', stats.rejected]];
        const kpi = (label, value, sub, filter) => `
          <button type="button" class="ui-card ui-kpi" onclick="applicationsModule.filterApplications('${filter}')">
            <span class="ui-kpi-label">${label}</span><span class="ui-kpi-value">${value}</span><span class="ui-kpi-sub">${sub}</span>
          </button>`;

        container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Applications</h1>
            <p class="ui-page-sub">Admission applications from the public website</p>
          </div>
          <div class="ui-actions">
            <!-- Deletes records (after a typed confirmation), so it stays a quiet button. -->
            <button type="button" class="ui-btn pc-danger" onclick="applicationsModule.clearAllApplications()">Clear old applications…</button>
          </div>
        </div>

        <div class="ui-grid-4">
          ${kpi('Waiting for review', stats.pending, stats.readyToApprove ? `${stats.readyToApprove} with the fee paid` : 'none with the fee paid yet', 'pending')}
          ${kpi('Fee to confirm', stats.pendingPayments, 'bank transfers to check', 'pending')}
          ${kpi('Approved', stats.approved, 'now pupils', 'approved')}
          ${kpi('Received', stats.total, `${stats.rejected} rejected`, 'all')}
        </div>

        ${stats.pendingPayments ? `
          <section class="ui-card">
            <div class="ui-card-head">
              <h2 class="ui-card-title">Application fees to confirm</h2>
              <span class="ui-card-note">Check each transfer reached the school's account</span>
            </div>
            ${this.renderPendingPayments()}
          </section>` : ''}

        <div class="ui-card sd-filters">
          <label class="sd-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
            <input id="applicationSearch" type="search" aria-label="Search applications" placeholder="Search by child, parent, email, number or class"
              value="${this._esc(this.searchQuery)}" oninput="applicationsModule.searchQuery = this.value.toLowerCase(); applicationsModule.refreshApplicationsList()">
          </label>
          <div class="app-filters" role="group" aria-label="Status">
            ${filters.map(([key, label, n]) => `<button type="button" class="ui-btn ui-btn-sm${this.currentFilter === key ? ' ui-btn-primary' : ''}" aria-pressed="${this.currentFilter === key}" onclick="applicationsModule.filterApplications('${key}')">${label} (${n})</button>`).join('')}
          </div>
        </div>

        <section class="ui-card" id="applicationsList">${this.renderApplicationsList()}</section>
      </div>`;
    },

    refreshApplicationsList() {
        const listContainer = document.getElementById('applicationsList');
        if (listContainer) listContainer.innerHTML = this.renderApplicationsList();
    },

    renderApplicationsList() {
        const q = this.searchQuery;
        const apps = this.applications
            .filter(app => this.currentFilter === 'all' || app.status === this.currentFilter)
            .filter(app => !q || [app.student_name || app.studentName, app.parent_name || app.parentName, app.parent_email || app.parentEmail,
                app.application_number || app.applicationNumber || app.id, app.grade].some(v => String(v || '').toLowerCase().includes(q)))
            .sort((a, b) => new Date(this._submitted(b) || 0) - new Date(this._submitted(a) || 0));

        if (!apps.length) {
            const loading = !dataManager._loaded?.['applications'];
            return `<p class="ui-empty">${loading ? 'Loading applications…'
                : q ? `No application matches "${this._esc(q)}".`
                : this.currentFilter === 'all' ? 'No applications yet. They appear here when parents apply on the website.'
                : 'None at the moment.'}</p>`;
        }
        return `
          <div class="ui-card-head">
            <h2 class="ui-card-title">${apps.length} application${apps.length === 1 ? '' : 's'}</h2>
            <span class="ui-card-note">Newest first</span>
          </div>
          ${apps.map(app => this.renderApplicationCard(app)).join('')}`;
    },

    renderApplicationCard(app) {
        const id = this._esc(app.id);
        const status = this.STATUS[app.status] || { label: app.status || 'Unknown', tone: '' };
        const fee = this._feeState(app);
        const docs = [app.application_form_url, app.birth_certificate_url, app.passport_photo_url, app.previous_report_url].filter(Boolean).length;
        const canApprove = app.status === 'pending' && this._feePaid(app);
        return `
          <div class="ui-row app-row" role="button" tabindex="0" onclick="applicationsModule.viewApplication('${id}')" onkeydown="if(event.key==='Enter')applicationsModule.viewApplication('${id}')">
            <span class="ui-dot ${app.status === 'pending' ? (canApprove ? 'is-urgent' : 'is-warn') : ''}" aria-hidden="true"></span>
            <div class="ui-row-main">
              <div class="ui-row-title">${this._esc(app.student_name || app.studentName || 'Unnamed')} <span class="ui-row-meta">· ${this._esc(app.grade || 'class not given')}</span></div>
              <div class="ui-row-meta">${this._esc(app.parent_name || app.parentName || 'Parent not given')}${(app.parent_phone || app.parentPhone) ? ` · ${this._esc(app.parent_phone || app.parentPhone)}` : ''} · ${this._esc(app.application_number || app.applicationNumber || '')} · ${this._date(this._submitted(app))}${docs ? ` · ${docs} document${docs === 1 ? '' : 's'}` : ''}</div>
            </div>
            <div class="app-chips">
              <span class="ui-chip ${status.tone}">${this._esc(status.label)}</span>
              ${app.status === 'pending' ? `<span class="ui-chip ${fee.tone}">${fee.label}</span>` : ''}
            </div>
            ${canApprove ? `
              <div class="ui-actions" onclick="event.stopPropagation()">
                <button type="button" class="ui-btn ui-btn-sm" onclick="applicationsModule.rejectApplication('${id}')">Reject</button>
                <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" onclick="applicationsModule.approveApplication('${id}')">Approve</button>
              </div>` : ''}
          </div>`;
    },

    filterApplications(status) {
        this.currentFilter = status;
        this.render();
    },

    viewApplication(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) return;
        const f = (camel, snake) => this._field(app, camel, snake);
        const photoUrl = f('passportPhotoUrl', 'passport_photo_url') || '';
        const formUrl = f('applicationFormUrl', 'application_form_url') || '';
        const receiptUrl = f('receiptUrl', 'receipt_url') || '';
        const otherRaw = f('otherDocuments', 'other_documents') || [];
        const others = Array.isArray(otherRaw) ? otherRaw : (typeof otherRaw === 'string' && otherRaw ? [otherRaw] : []);
        const status = this.STATUS[app.status] || { label: app.status || 'Unknown', tone: '' };
        const fee = this._feeState(app);
        const sid = this._esc(app.id);

        const doc = (url, label) => {
            const href = this._escUrl(url);
            return `<div class="ui-row app-doc"><div class="ui-row-main"><div class="ui-row-title">${this._esc(label)}</div></div>${href
                ? `<a class="ui-btn ui-btn-sm" href="${href}" data-storage-link target="_blank" rel="noopener noreferrer">Open</a>`
                : '<span class="ui-row-meta">Not uploaded</span>'}</div>`;
        };
        const dl = (rows) => `<dl class="sr-dl sr-dl-2">${rows.map(([k, v, wide]) => `<div${wide ? ' style="grid-column:1/-1"' : ''}><dt>${k}</dt><dd>${this._esc(v || '—')}</dd></div>`).join('')}</dl>`;
        const dob = f('studentDob', 'student_dob');
        const rejection = f('rejectionReason', 'rejection_reason');
        const payRejection = f('paymentRejectionReason', 'payment_rejection_reason');
        const reviewed = f('reviewedDate', 'reviewed_date');

        showModal(this._esc(app.student_name || app.studentName || 'Application'), `
          <div class="app-view">
            <div class="app-view-head">
              ${this._safeUrl(photoUrl) ? `<img data-storage-src="${this._escUrl(photoUrl)}" alt="Passport photo" class="app-photo" onerror="this.remove()">` : ''}
              <div>
                <div class="sr-chips"><span class="ui-chip ${status.tone}">${this._esc(status.label)}</span><span class="ui-chip ${fee.tone}">${fee.label}</span></div>
                <p class="ui-row-meta" style="margin-top:6px;">${this._esc(f('applicationNumber', 'application_number') || app.id)} · submitted ${this._date(this._submitted(app), true)}</p>
              </div>
            </div>

            <h3 class="app-h">Child</h3>
            ${dl([['Name', app.student_name || app.studentName], ['Class applying for', app.grade],
                  ['Date of birth', dob ? this._date(dob) : ''], ['Gender', f('studentGender', 'student_gender')],
                  ['Previous school', f('previousSchool', 'previous_school'), true]])}

            <h3 class="app-h">Parent or guardian</h3>
            ${dl([['Name', app.parent_name || app.parentName], ['Phone', app.parent_phone || app.parentPhone],
                  ['Email', app.parent_email || app.parentEmail, true], ['Address', this._formatAddress(f('parentAddress', 'parent_address')), true]])}

            <h3 class="app-h">Documents</h3>
            ${doc(formUrl, 'Application form')}
            ${doc(f('birthCertificateUrl', 'birth_certificate_url'), 'Birth certificate')}
            ${doc(f('previousReportUrl', 'previous_report_url'), 'Last school report')}
            ${others.map((d, i) => doc(typeof d === 'string' ? d : d?.url, `Other document ${i + 1}`)).join('')}

            <h3 class="app-h">Application fee</h3>
            ${dl([['Amount', this._money(f('applicationFeeAmount', 'application_fee_amount'))], ['Paid by', String(f('paymentMethod', 'payment_method') || '—').replace(/[-_]/g, ' ')],
                  ['Status', fee.label], ['Reference', f('paymentReference', 'payment_reference')]])}
            ${receiptUrl ? doc(receiptUrl, 'Payment receipt') : ''}
            ${payRejection ? `<p class="ui-card-note app-note">Fee not accepted: ${this._esc(payRejection)}</p>` : ''}

            ${(reviewed || app.notes || rejection) ? `
              <h3 class="app-h">Review</h3>
              ${dl([['Reviewed', reviewed ? this._date(reviewed, true) : ''], ['Reviewed by', f('reviewedBy', 'reviewed_by')]])}
              ${rejection ? `<p class="ui-card-note app-note">Reason for rejecting: ${this._esc(rejection)}</p>`
                : app.notes ? `<p class="ui-card-note app-note">${this._esc(app.notes)}</p>` : ''}` : ''}

            <div class="ui-actions" style="justify-content:flex-end;margin-top:18px;flex-wrap:wrap;">
              <button type="button" class="ui-btn" onclick="closeModal()">Close</button>
              ${app.status === 'pending' ? `
                <button type="button" class="ui-btn" onclick="closeModal(); applicationsModule.rejectApplication('${sid}')">Reject</button>
                <button type="button" class="ui-btn ui-btn-primary" ${this._feePaid(app) ? '' : 'disabled title="The application fee has not been confirmed"'} onclick="closeModal(); applicationsModule.approveApplication('${sid}')">Approve</button>` : ''}
            </div>
            ${app.status === 'pending' && !this._feePaid(app) ? '<p class="ui-card-note" style="text-align:right;">Approve becomes available once the application fee is confirmed.</p>' : ''}
          </div>`);
    },

    downloadForm(id) {
        const app = this.applications.find(a => a.id === id);
        const formUrl = this._safeUrl(app?.application_form_url || app?.applicationFormUrl || app?.fileData);

        if (!app || !formUrl) {
            showToast('Application form not found', 'error');
            return;
        }

        // Open form in new tab (Supabase storage URLs). _safeUrl rejects any
        // non-http(s) scheme so a stored `javascript:` URL cannot be executed.
        window.open(formUrl, '_blank', 'noopener,noreferrer');
        showToast('Opening application form...', 'success');
    },

    approveApplication(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) {
            showToast('Application not found', 'error');
            return;
        }

        if (app.status !== 'pending') {
            showToast(`This application has already been ${this._esc(app.status)}.`, 'warning');
            return;
        }

        // Fail closed: approval requires a verified fee, whatever the payment
        // method says. The previous check only blocked bank transfers, so a row
        // claiming payment_method 'paystack' (or none at all) was approved
        // without any payment ever having been confirmed.
        if (!this._feePaid(app)) {
            showToast('Cannot approve: the application fee has not been verified yet.', 'error');
            return;
        }

        showModal('Approve application', `
          <p>Approve <strong>${this._esc(app.student_name || app.studentName)}</strong> for <strong>${this._esc(app.grade || '')}</strong>?
          This enrols them, bills this term's fees (with the uniform set) and creates their portal login.</p>
          <label class="form-group" style="margin-top:14px;"><span class="form-label">Notes (optional)</span>
            <textarea id="approvalNotes" class="form-textarea" rows="3"></textarea></label>
          <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
            <button type="button" class="ui-btn" onclick="closeModal()">Cancel</button>
            <button type="button" class="ui-btn ui-btn-primary" id="confirmApprovalBtn" onclick="event.preventDefault(); applicationsModule.confirmApproval('${this._esc(id)}', this)">Approve</button>
          </div>`);
    },

    async confirmApproval(id, triggerBtn) {
        console.log('[Applications] confirmApproval called with id:', id);

        // Creating a student account is not reversible from here, so guard the
        // whole operation rather than relying on the button's disabled state:
        // a second click (or a retry after a failed status update) used to mint
        // a second auth user, a second fee structure and a second enrollment.
        if (this._approving) {
            showToast('An approval is already in progress.', 'warning');
            return;
        }

        const notes = document.getElementById('approvalNotes')?.value || '';
        const app = this.applications.find(a => a.id === id);

        if (!app) {
            console.error('[Applications] Application not found:', id);
            showToast('Application not found', 'error');
            return;
        }
        if (app.status !== 'pending') {
            showToast(`This application has already been ${this._esc(app.status)}.`, 'warning');
            return;
        }
        if (!(app.application_fee_paid || app.applicationFeePaid)) {
            showToast('Cannot approve: the application fee has not been verified yet.', 'error');
            return;
        }
        if (app.student_id) {
            showToast('A student account already exists for this application.', 'warning');
            return;
        }

        this._approving = true;

        // Disable button to prevent double clicks. The element is passed in
        // explicitly — the old code read the implicit global `event`, which is
        // browser-dependent and null once an await has run.
        const confirmBtn = triggerBtn || document.getElementById('confirmApprovalBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processing...';
        }

        try {
            // Show loading
            showToast('Creating student account...', 'info');
            console.log('[Applications] Starting account creation...');

            // Create student and guardian accounts
            const result = await this.createAccountsFromApplication(app);
            console.log('[Applications] Account creation result:', result);

            if (!result || !result.studentId) {
                throw new Error('Failed to create student account - no student ID returned');
            }

            // Auto-apply grade fee structure
            if (typeof feeManager !== 'undefined' && result.studentId && app.grade) {
                try {
                    // An approved application is a new pupil: bill the one-off uniform set too.
                    const feeResult = await feeManager.applyFeeStructure(result.studentId, app.grade, { admission: true });
                    if (!feeResult?.success) console.warn('[Applications] Fee structure apply:', feeResult?.error);
                } catch (feeErr) {
                    console.warn('[Applications] Fee structure apply threw:', feeErr);
                    showToast('Fee structure could not be applied — please set it manually.', 'warning');
                }
            }

            // Auto-enroll in grade subjects
            if (typeof subjectManager !== 'undefined') {
                try {
                    const studentName = app.student_name || app.studentName;
                    const enrollResult = await subjectManager.autoEnroll(result.studentId, studentName, app.grade, 'A');
                    if (!enrollResult?.success && !enrollResult?.existing) {
                        console.warn('[Applications] Subject auto-enroll:', enrollResult?.error);
                        showToast('Subject enrollment could not be completed — please enroll manually.', 'warning');
                    }
                } catch (enrollErr) {
                    console.warn('[Applications] Subject auto-enroll threw:', enrollErr);
                    showToast('Subject enrollment could not be completed — please enroll manually.', 'warning');
                }
            }

            // Update application status.
            // The account now exists, so link it to the application immediately.
            // If this write fails the accounts are already created — the error
            // message must tell the admin that, so nobody re-runs the approval
            // and creates a duplicate student.
            console.log('[Applications] Updating application status...');
            const reviewedAt = new Date().toISOString();
            const { data: updated, error: updateErr } = await supabaseClient
                .from('applications')
                .update({
                    status: 'approved',
                    notes: notes,
                    reviewed_date: reviewedAt,
                    reviewed_by: authManager?.getSession()?.supabaseId || null,
                    student_id: result.studentId,
                    guardian_auth_id: result.guardianAuthId
                })
                .eq('id', id)
                .eq('status', 'pending')   // lose the race rather than double-approve
                .select();

            if (updateErr) {
                throw new Error(
                    `Student account ${result.studentLoginId} was created, but the application could not be marked approved: ` +
                    `${updateErr.message}. Do NOT approve again — link it manually instead.`
                );
            }
            if (!updated || updated.length === 0) {
                throw new Error(
                    `Student account ${result.studentLoginId} was created, but the application was already reviewed by someone else ` +
                    `(or you lack permission to update it). Do NOT approve again — check the students list.`
                );
            }

            console.log('[Applications] Application updated successfully');

            await this.loadApplications();
            closeModal();
            this.render();
            if (typeof writeAuditLog === 'function') writeAuditLog('APPLICATION_APPROVED', app.student_name, `Grade: ${app.grade} | Student ID: ${result.studentLoginId}`);
            
            // Show success with account details
            showModal('Application approved', `
                <p><strong>${this._esc(app.student_name)}</strong> is now a pupil in <strong>${this._esc(app.grade)}</strong>, and this term's fees are billed.</p>
                <dl class="sr-dl sr-dl-2 app-creds">
                    <div><dt>Login ID</dt><dd>${this._esc(result.studentLoginId)}</dd></div>
                    <div><dt>Password</dt><dd>${this._esc(result.studentPassword)}</dd></div>
                </dl>
                <p class="ui-card-note">Share these with the parent now: the password is not shown again. A parent login is added in Users &amp; access.</p>
                <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
                    <button type="button" class="ui-btn ui-btn-primary" onclick="closeModal()">Done</button>
                </div>
            `);
        } catch (error) {
            const msg = error?.message || String(error);
            console.error('Error approving application:', msg);
            showToast(msg || 'Error approving application', 'error');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Approve'; }
        } finally {
            this._approving = false;
        }
    },

    // Create student and guardian accounts from approved application
    async createAccountsFromApplication(app) {
        try {
            console.log('[Applications] Starting student account creation for application:', app.id);

            // The student's own login gets an internal address: the address on
            // the application belongs to the parent, and one address can only
            // back one account. The parent gets their credentials on paper or
            // through a separate guardian account.
            const studentInternalEmail = `student-${Date.now()}-${Math.floor(Math.random() * 10000)}@tbd.internal`;

            const studentResult = await authManager.createAccount({
                email: studentInternalEmail,
                role: 'student',
                fullName: app.student_name || app.studentName,
                grade: app.grade,
                section: 'A',
                dateOfBirth: app.student_dob || app.studentDob || null
            });

            if (!studentResult.success) {
                throw new Error('Failed to create student account: ' + studentResult.error);
            }

            // Fetch the student DB record — retry a few times to handle
            // the brief propagation delay between auth user creation and
            // the student row being committed by the edge function.
            let studentRecord = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                if (attempt > 0) await new Promise(r => setTimeout(r, 250));
                const { data, error: sErr } = await supabaseClient
                    .from('students')
                    .select('id')
                    .eq('auth_id', studentResult.authId)
                    .maybeSingle();
                if (data) { studentRecord = data; break; }
                console.warn(`[Applications] Student record not found yet (attempt ${attempt + 1}):`, sErr?.message);
            }

            if (!studentRecord) {
                throw new Error('Student auth account was created but the student record could not be found. Check the students table for auth_id: ' + studentResult.authId);
            }

            console.log('[Applications] Student account created successfully. DB id:', studentRecord.id);
            return {
                studentId: studentRecord.id,
                studentLoginId: studentResult.schoolId,
                studentPassword: studentResult.password,
                guardianAuthId: null,
                guardianPassword: null
            };
        } catch (error) {
            const msg = error?.message || String(error);
            console.error('[Applications] Error creating student account:', msg);
            throw new Error(msg);
        }
    },

    generateUserId(role) {
        const year = new Date().getFullYear();
        const prefixes = {
            guardian: 'GRD',
            student: 'STU',
            teacher: 'TCH',
            staff: 'STF',
            admin: 'ADM'
        };
        const prefix = prefixes[role] || 'USR';
        const random = Math.floor(Math.random() * 900) + 100;
        return `${prefix}-${year}-${String(random).padStart(3, '0')}`;
    },

    formatDatePassword(dateOfBirth) {
        // Convert YYYY-MM-DD to DDMMYYYY
        const parts = dateOfBirth.split('-');
        return parts[2] + parts[1] + parts[0];
    },

    // Generate random password
    generatePassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    },

    rejectApplication(id) {
        const app = this.applications.find(a => a.id === id);
        showModal('Reject application', `
          <p>Reject the application for <strong>${this._esc(app?.student_name || app?.studentName || '')}</strong>? The parent sees the reason on the status page.</p>
          <label class="form-group" style="margin-top:14px;"><span class="form-label">Reason</span>
            <textarea id="rejectionNotes" class="form-textarea" rows="3" required></textarea></label>
          <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
            <button type="button" class="ui-btn" onclick="closeModal()">Cancel</button>
            <button type="button" class="ui-btn ui-btn-primary" onclick="applicationsModule.confirmRejection('${this._esc(id)}')">Reject</button>
          </div>`);
    },

    async confirmRejection(id) {
        const notes = document.getElementById('rejectionNotes')?.value?.trim() || '';

        if (!notes) {
            showToast('Please provide a reason for rejection', 'error');
            return;
        }

        try {
            // Guard on the current status so two admins reviewing at once cannot
            // overwrite each other's decision, and verify a row actually changed
            // (an RLS-blocked update returns success with zero rows).
            const { data: updated, error: updateErr } = await supabaseClient
                .from('applications')
                .update({
                    status: 'rejected',
                    rejection_reason: notes,
                    notes: notes,
                    reviewed_date: new Date().toISOString(),
                    reviewed_by: authManager?.getSession()?.supabaseId || null
                })
                .eq('id', id)
                .in('status', ['pending', 'incomplete'])
                .select();

            if (updateErr) throw new Error(updateErr.message);
            if (!updated || updated.length === 0) {
                throw new Error('No change made — the application may already be reviewed, or you lack permission.');
            }

            await this.loadApplications();
            closeModal();
            this.render();
            if (typeof writeAuditLog === 'function') writeAuditLog('APPLICATION_REJECTED', updated[0]?.student_name || id, notes);
            showToast('Application rejected', 'info');
        } catch (error) {
            console.error('Error rejecting application:', error);
            showToast(error.message || 'Error rejecting application', 'error');
        }
    },

    clearAllApplications() {
        // Approved applications are the admission record of an enrolled student
        // and are never deleted — the previous version wiped them too and only
        // nulled student_id, silently severing every student from their
        // admission history.
        const deletable = this.applications.filter(a => a.status !== 'approved' && !a.student_id);

        if (deletable.length === 0) {
            showToast('There are no clearable applications (approved records are kept).', 'info');
            return;
        }

        showModal('Clear old applications', `
          <p>Permanently delete <strong>${deletable.length}</strong> waiting, rejected and fee-not-accepted application${deletable.length === 1 ? '' : 's'}?
          The ${this.applications.length - deletable.length} approved record${this.applications.length - deletable.length === 1 ? ' is' : 's are'} kept. This cannot be undone.</p>
          <label class="form-group" style="margin-top:14px;"><span class="form-label">Type DELETE to confirm</span>
            <input type="text" id="clearAllConfirmInput" class="form-input" autocomplete="off"></label>
          <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
            <button type="button" class="ui-btn" onclick="closeModal()">Cancel</button>
            <button type="button" class="ui-btn pc-danger" onclick="applicationsModule._confirmClearAll()">Delete</button>
          </div>`);
    },

    async _confirmClearAll() {
        const typed = document.getElementById('clearAllConfirmInput')?.value?.trim();
        if (typed !== 'DELETE') {
            showToast('Type DELETE to confirm.', 'warning');
            return;
        }

        closeModal();
        try {
            showToast('Clearing applications…', 'info');
            const { data, error } = await supabaseClient
                .from('applications')
                .delete()
                .neq('status', 'approved')
                .is('student_id', null)
                .select('id');
            if (error) throw error;

            await this.loadApplications();
            this.render();
            const count = data?.length || 0;
            showToast(`${count} application${count === 1 ? '' : 's'} cleared. Approved records were kept.`, 'success');
            if (typeof writeAuditLog === 'function') {
                writeAuditLog('CLEAR_APPLICATIONS', 'Applications', `${count} non-approved application records deleted`);
            }
        } catch (err) {
            console.error('[Applications] clearAllApplications error:', err);
            showToast('Failed to clear applications: ' + err.message, 'error');
        }
    },

    getStatistics() {
        const by = (s) => this.applications.filter(app => app.status === s);
        return {
            total: this.applications.length,
            pending: by('pending').length,
            readyToApprove: by('pending').filter(app => this._feePaid(app)).length,
            approved: by('approved').length,
            rejected: by('rejected').length,
            incomplete: by('incomplete').length,
            pendingPayments: this.applications.filter(app => this._awaitsPaymentVerification(app)).length
        };
    },


    _isBankTransfer(app) {
        const pm = app.payment_method || app.paymentMethod || '';
        return pm === 'bank-transfer' || pm === 'bank_transfer';
    },

    // A deposit still waiting on an admin decision. Rejected payments must be
    // excluded: they used to match on `!application_fee_paid` alone, so once
    // rejected they sat in the verification queue and the pending counter
    // forever, with no way for anyone to clear them.
    _awaitsPaymentVerification(app) {
        return this._isBankTransfer(app)
            && !(app.application_fee_paid || app.applicationFeePaid)
            && !(app.payment_rejection_reason || app.paymentRejectionReason);
    },

    renderPendingPayments() {
        const pending = this.applications
            .filter(app => this._awaitsPaymentVerification(app))
            .sort((a, b) => new Date(this._submitted(a) || 0) - new Date(this._submitted(b) || 0));
        if (!pending.length) return '<p class="ui-empty">No fees to confirm.</p>';

        return pending.map(app => {
            const receiptUrl = app.receipt_url || app.receiptUrl;
            const id = this._esc(app.id);
            return `
              <div class="ui-row">
                <span class="ui-dot is-warn" aria-hidden="true"></span>
                <div class="ui-row-main">
                  <div class="ui-row-title">${this._money(app.application_fee_amount || app.applicationFeeAmount)} · ${this._esc(app.student_name || app.studentName || '')}</div>
                  <div class="ui-row-meta">${this._esc(app.grade || '')} · ref ${this._esc(app.payment_reference || app.paymentReference || 'none given')} · ${this._date(this._submitted(app))}</div>
                </div>
                <div class="ui-actions">
                  ${this._safeUrl(receiptUrl)
                    ? `<a class="ui-btn ui-btn-sm" href="${this._escUrl(receiptUrl)}" data-storage-link target="_blank" rel="noopener noreferrer">Receipt</a>`
                    : '<span class="ui-row-meta">No receipt</span>'}
                  <button type="button" class="ui-btn ui-btn-sm" onclick="applicationsModule.rejectPayment('${id}')">Not received</button>
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" onclick="applicationsModule.approvePayment('${id}')">Received</button>
                </div>
              </div>`;
        }).join('');
    },

    // Approve bank transfer payment for an application
    approvePayment(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) { showToast('Application not found', 'error'); return; }
        showModal('Confirm the application fee', `
          <p>Confirm <strong>${this._money(app.application_fee_amount || app.applicationFeeAmount)}</strong> reached the school's account for <strong>${this._esc(app.student_name || app.studentName || '')}</strong>?
          The application can then be approved.</p>
          <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
            <button type="button" class="ui-btn" onclick="closeModal()">Cancel</button>
            <button type="button" class="ui-btn ui-btn-primary" onclick="applicationsModule._confirmApprovePayment('${this._esc(id)}')">Yes, received</button>
          </div>`);
    },

    async _confirmApprovePayment(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) { showToast('Application not found', 'error'); closeModal(); return; }

        closeModal();
        try {
            const { data, error } = await supabaseClient
                .from('applications')
                .update({
                    application_fee_paid: true,
                    // Clear any earlier rejection so a corrected receipt leaves
                    // the application in a clean, approvable state.
                    payment_rejection_reason: null,
                    payment_verified_by: (await supabaseClient.auth.getSession())?.data?.session?.user?.id || null,
                    payment_verified_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .eq('application_fee_paid', false)   // no-op if already approved
                .select();

            if (error) {
                console.error('[Applications] Payment approval failed:', error);
                showToast('Failed to approve payment: ' + error.message, 'error');
                return;
            }
            if (!data || data.length === 0) {
                showToast('No change made — the payment may already be approved, or you lack permission.', 'warning');
                await this.loadApplications();
                this.render();
                return;
            }

            showToast('Payment approved successfully!', 'success');
            if (typeof writeAuditLog === 'function') writeAuditLog('APPLICATION_PAYMENT_APPROVED', app?.student_name || id, `₦${(app?.application_fee_amount||0).toLocaleString()}`);
            await this.loadApplications();
            this.render();
        } catch (err) {
            console.error('[Applications] approvePayment error:', err);
            showToast('Error approving payment: ' + err.message, 'error');
        }
    },

    // Reject bank transfer payment for an application
    rejectPayment(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) { showToast('Application not found', 'error'); return; }
        showModal('Fee not received', `
          <p>Mark the fee for <strong>${this._esc(app.student_name || app.studentName)}</strong> as not received? The application moves to "Fee not accepted" and the parent sees the reason.</p>
          <label class="form-group" style="margin-top:14px;"><span class="form-label">Reason</span>
            <textarea id="paymentRejectionReason" class="form-textarea" rows="3" placeholder="e.g. No transfer with this reference reached the account" required></textarea></label>
          <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
            <button type="button" class="ui-btn" onclick="closeModal()">Cancel</button>
            <button type="button" class="ui-btn ui-btn-primary" onclick="applicationsModule.confirmPaymentRejection('${this._esc(id)}')">Save</button>
          </div>`);
    },

    async confirmPaymentRejection(id) {
        const reason = document.getElementById('paymentRejectionReason')?.value?.trim();
        if (!reason) {
            showToast('Please provide a reason for rejection', 'error');
            return;
        }

        try {
            const { data, error } = await supabaseClient
                .from('applications')
                .update({
                    payment_rejection_reason: reason,
                    application_fee_paid: false,
                    // Move the application out of 'pending' so it leaves both the
                    // review queue and the payment queue, and so the applicant's
                    // status page tells them what went wrong and what to do next.
                    status: 'incomplete',
                    payment_verified_by: (await supabaseClient.auth.getSession())?.data?.session?.user?.id || null,
                    payment_verified_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select();

            if (error) {
                console.error('[Applications] Payment rejection failed:', error);
                showToast('Failed to reject payment: ' + error.message, 'error');
                return;
            }
            if (!data || data.length === 0) {
                showToast('Update blocked — you may not have permission.', 'error');
                return;
            }

            if (typeof writeAuditLog === 'function') {
                writeAuditLog('APPLICATION_PAYMENT_REJECTED', data[0]?.student_name || id, reason);
            }
            showToast('Payment rejected', 'info');
            closeModal();
            await this.loadApplications();
            this.render();
        } catch (err) {
            console.error('[Applications] confirmPaymentRejection error:', err);
            showToast('Error rejecting payment: ' + err.message, 'error');
        }
    }
};

// Register module globally
window.applicationsModule = applicationsModule;
