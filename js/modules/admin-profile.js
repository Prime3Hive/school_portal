// ============================================
// MY PROFILE
// ============================================
// The signed-in person's own account: name, contact details, password.
//
// Name and contact email live on the profile (profiles). Phone and
// department are not profile columns: they live on the person's staff row,
// matched on their login. The old page sent them to updateUser, which
// dropped them, and then said "saved" whatever happened. Someone with no
// staff row (an admin account) is not offered them.
//
// The contact email is where the school writes to; signing in uses the
// login ID, so changing it does not change how they sign in.
// ============================================

const adminProfileModule = {
    currentSession: null,
    currentUser: null,

    async init(container) {
        this._container = container || document.getElementById('main-content');
        this.currentSession = authManager.getSession();
        await dataManager.waitForReady();
        this.currentUser = await authManager.getUserById(this.currentSession.userId);
        if (!this.currentUser) {
            this._container.innerHTML = `<div class="ui-page"><div class="ui-card"><p class="ui-empty">Your profile could not be loaded. Reload the page to try again.</p></div></div>`;
            return;
        }
        this._container.innerHTML = this.render();
    },

    _esc(v) {
        return typeof window.escapeHtml === 'function'
            ? window.escapeHtml(v)
            : String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /** This person's staff row, if they have one. */
    staffRow() {
        const authId = this.currentSession?.supabaseId;
        return authId ? (dataManager.getAll('staff') || []).find(s => (s.authId || s.auth_id) === authId) || null : null;
    },

    _date(v, withTime) {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
    },

    render() {
        const u = this.currentUser;
        const staff = this.staffRow();
        const e = (v) => this._esc(v ?? '');
        const role = { admin: 'Administrator', staff: 'Office staff', teacher: 'Teacher', student: 'Pupil', guardian: 'Parent' }[u.role] || u.role;
        const initials = String(u.fullName || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

        return `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">My profile</h1>
            <p class="ui-page-sub">Your details and your password</p>
          </div>
        </div>

        <div class="set-grid">
          <section class="ui-card">
            <div class="prof-head">
              <span class="sd-avatar sr-avatar" aria-hidden="true">${e(initials)}</span>
              <div>
                <div class="ui-row-title" style="font-size:1.125rem;">${e(u.fullName)}</div>
                <div class="sr-chips" style="margin-top:6px;"><span class="ui-chip is-info">${e(role)}</span>${u.status && u.status !== 'active' ? `<span class="ui-chip is-warn">${e(u.status)}</span>` : ''}</div>
              </div>
            </div>
            <dl class="sr-dl sr-dl-2" style="margin-top:16px;">
              <div><dt>Login ID</dt><dd>${e(u.id)}</dd></div>
              <div><dt>Account since</dt><dd>${this._date(u.createdAt)}</dd></div>
              <div><dt>Last signed in</dt><dd>${u.lastLogin ? this._date(u.lastLogin, true) : 'This is the first time'}</dd></div>
              ${staff?.department ? `<div><dt>Department</dt><dd>${e(staff.department)}</dd></div>` : ''}
            </dl>
          </section>

          <section class="ui-card">
            <div class="ui-card-head"><h2 class="ui-card-title">Your details</h2></div>
            <form class="fp-form" onsubmit="adminProfileModule.saveProfile(event)">
              <label class="form-group"><span class="form-label">Full name</span>
                <input type="text" id="profileFullName" class="form-input" value="${e(u.fullName)}" required></label>
              <label class="form-group"><span class="form-label">Contact email</span>
                <input type="email" id="profileEmail" class="form-input" value="${e(u.email)}" required>
                <span class="ui-row-meta">Where the school writes to you. You still sign in with your login ID.</span></label>
              ${staff ? `
                <div class="fp-grid">
                  <label class="form-group"><span class="form-label">Phone</span>
                    <input type="tel" id="profilePhone" class="form-input" value="${e(staff.phone)}" placeholder="0803 000 0000"></label>
                  <label class="form-group"><span class="form-label">Department</span>
                    <input type="text" id="profileDepartment" class="form-input" value="${e(staff.department)}"></label>
                </div>` : ''}
              <div class="ui-actions" style="justify-content:flex-end;"><button type="submit" class="ui-btn ui-btn-primary">Save</button></div>
            </form>
          </section>

          <section class="ui-card set-wide">
            <div class="ui-card-head"><h2 class="ui-card-title">Change password</h2></div>
            <form id="passwordForm" class="fp-form prof-pw" onsubmit="adminProfileModule.changePassword(event)">
              <label class="form-group"><span class="form-label">Current password</span>
                <input type="password" id="currentPassword" class="form-input" autocomplete="current-password" required></label>
              <div class="fp-grid">
                <label class="form-group"><span class="form-label">New password (8 characters or more)</span>
                  <input type="password" id="newPassword" class="form-input" autocomplete="new-password" required minlength="8"></label>
                <label class="form-group"><span class="form-label">New password again</span>
                  <input type="password" id="confirmPassword" class="form-input" autocomplete="new-password" required minlength="8"></label>
              </div>
              <p id="passwordError" class="ui-card-note set-danger" role="alert" hidden></p>
              <div class="ui-actions" style="justify-content:flex-end;"><button type="submit" class="ui-btn ui-btn-primary">Change password</button></div>
            </form>
          </section>
        </div>
      </div>`;
    },

    async saveProfile(event) {
        event.preventDefault();
        const btn = event.target.querySelector('[type="submit"]');
        const fullName = document.getElementById('profileFullName').value.trim();
        const email = document.getElementById('profileEmail').value.trim();
        const staff = this.staffRow();
        if (!fullName || !email) { showToast('Name and email are required', 'error'); return; }

        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const result = await authManager.updateUser(this.currentSession.userId, { fullName, email });
            if (!result?.success) throw new Error(result?.error || 'the profile could not be saved');
            if (staff) {
                const saved = await dataManager.update('staff', staff.id, {
                    name: fullName,
                    email,
                    phone: document.getElementById('profilePhone')?.value.trim() || '',
                    department: document.getElementById('profileDepartment')?.value.trim() || ''
                });
                if (!saved) throw new Error('your name was saved, but your phone and department were not');
            }
            this.currentUser = await authManager.getUserById(this.currentSession.userId) || this.currentUser;
            showToast('Saved', 'success');
            // The sidebar card was filled from the session at sign-in.
            const nameEl = document.getElementById('nav-user-name');
            const avatarEl = document.getElementById('nav-user-avatar');
            if (nameEl) nameEl.textContent = fullName;
            if (avatarEl && window.portalShell?.initials) avatarEl.textContent = window.portalShell.initials(fullName);
            this._container.innerHTML = this.render();
        } catch (err) {
            showToast('Not saved: ' + err.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
        }
    },

    async changePassword(event) {
        event.preventDefault();
        const current = document.getElementById('currentPassword').value;
        const newPass = document.getElementById('newPassword').value;
        const again = document.getElementById('confirmPassword').value;
        const errorEl = document.getElementById('passwordError');
        const btn = event.target.querySelector('[type="submit"]');
        const fail = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };
        errorEl.hidden = true;

        if (newPass !== again) return fail('The two new passwords are different.');
        if (newPass.length < 8) return fail('The new password needs 8 characters or more.');
        if (newPass === current) return fail('The new password is the same as the current one.');

        if (btn) { btn.disabled = true; btn.textContent = 'Changing…'; }
        try {
            const result = await authManager.changePassword(this.currentSession.userId, current, newPass);
            if (!result.success) return fail(result.error || 'The password could not be changed.');
            document.getElementById('passwordForm').reset();
            showToast('Password changed', 'success');
        } catch (err) {
            fail('The password could not be changed: ' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Change password'; }
        }
    }
};

if (typeof window !== 'undefined') {
    window.adminProfileModule = adminProfileModule;
}
