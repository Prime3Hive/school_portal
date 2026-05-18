// ============================================
// ADMIN PROFILE MODULE
// Displays and allows editing of the logged-in admin's profile
// ============================================

const adminProfileModule = {
    currentSession: null,
    currentUser: null,

    async init(container) {
        this.currentSession = authManager.getSession();

        if (!container) {
            container = document.getElementById('main-content');
        }
        this._container = container;

        await dataManager.waitForReady();
        this.currentUser = await authManager.getUserById(this.currentSession.userId);

        if (!this.currentUser) {
            container.innerHTML = `<div class="card" style="text-align:center;padding:var(--space-10);"><p style="color:var(--color-danger);">Could not load profile. Please reload the page.</p></div>`;
            return;
        }
        container.innerHTML = this.render();
    },

    render() {
        const user = this.currentUser;
        const session = this.currentSession;

        const lastLogin = user.lastLogin
            ? new Date(user.lastLogin).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
            : 'First Login';

        const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const roleColors = {
            admin: 'danger', teacher: 'primary', staff: 'info', student: 'success'
        };

        return `
      <div class="module-container animate-fadeIn">
        <!-- Header -->
        <div class="module-header">
          <div>
            <h1 class="module-title">👤 My Profile</h1>
            <p class="module-subtitle">Manage your account information and security settings</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left Column: Profile Card -->
          <div class="space-y-6">
            <div class="card" style="text-align: center;">
              <div style="
                width: 100px; height: 100px;
                border-radius: 50%;
                background: var(--gradient-primary);
                display: flex; align-items: center; justify-content: center;
                font-size: 2.5rem; font-weight: 700; color: white;
                margin: 0 auto var(--space-4);
              ">
                ${user.fullName.charAt(0).toUpperCase()}
              </div>
              <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); margin-bottom: var(--space-2);">
                ${user.fullName}
              </h2>
              <div style="margin-bottom: var(--space-3);">
                ${createBadge(user.role.charAt(0).toUpperCase() + user.role.slice(1), roleColors[user.role] || 'secondary')}
              </div>
              <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">${user.email}</p>
            </div>

            <!-- Account Stats -->
            <div class="card">
              <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">Account Info</h3>
              <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">User ID</span>
                  <strong style="font-family: monospace; font-size: var(--font-size-sm);">${user.id}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">Status</span>
                  ${createBadge(user.status || 'active', user.status === 'active' ? 'success' : 'danger')}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">Member Since</span>
                  <span style="font-size: var(--font-size-sm);">${memberSince}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">Last Login</span>
                  <span style="font-size: var(--font-size-sm);">${lastLogin}</span>
                </div>
                ${user.department ? `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">Department</span>
                  <span style="font-size: var(--font-size-sm);">${user.department}</span>
                </div>` : ''}
              </div>
            </div>
          </div>

          <!-- Right Column: Edit Forms -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Profile Info Form -->
            <div class="card">
              <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
                ✏️ Edit Profile Information
              </h3>
              <form id="profileForm" onsubmit="adminProfileModule.saveProfile(event)">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="form-group">
                    <label class="form-label">Full Name</label>
                    <input type="text" id="profileFullName" class="form-input"
                      value="${user.fullName}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Email Address</label>
                    <input type="email" id="profileEmail" class="form-input"
                      value="${user.email}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Department</label>
                    <input type="text" id="profileDepartment" class="form-input"
                      value="${user.department || ''}" placeholder="e.g. Administration">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Phone Number</label>
                    <input type="tel" id="profilePhone" class="form-input"
                      value="${user.phone || ''}" placeholder="+234-xxx-xxx-xxxx">
                  </div>
                </div>
                <div style="margin-top: var(--space-6); display: flex; justify-content: flex-end;">
                  <button type="submit" class="btn btn-primary">💾 Save Changes</button>
                </div>
              </form>
            </div>

            <!-- Password Change Form -->
            <div class="card">
              <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2);">
                🔐 Change Password
              </h3>
              <p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-6);">
                For security, your current password is required to set a new one.
              </p>
              <form id="passwordForm" onsubmit="adminProfileModule.changePassword(event)">
                <div class="form-group">
                  <label class="form-label">Current Password</label>
                  <input type="password" id="currentPassword" class="form-input"
                    placeholder="Enter your current password" required>
                </div>
                <div class="form-group">
                  <label class="form-label">New Password</label>
                  <input type="password" id="newPassword" class="form-input"
                    placeholder="Minimum 8 characters" required minlength="8">
                </div>
                <div class="form-group">
                  <label class="form-label">Confirm New Password</label>
                  <input type="password" id="confirmPassword" class="form-input"
                    placeholder="Re-enter your new password" required minlength="8">
                </div>
                <div id="passwordError" style="color: var(--color-danger); font-size: var(--font-size-sm); margin-bottom: var(--space-4); display: none;"></div>
                <div style="display: flex; justify-content: flex-end;">
                  <button type="submit" class="btn btn-warning">🔑 Update Password</button>
                </div>
              </form>
            </div>

            <!-- Activity Summary -->
            <div class="card">
              <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
                📊 Account Activity
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="stat-card primary">
                  <div class="stat-label">Role</div>
                  <div class="stat-value" style="font-size: var(--font-size-xl);">${user.role.toUpperCase()}</div>
                </div>
                <div class="stat-card success">
                  <div class="stat-label">Permissions</div>
                  <div class="stat-value" style="font-size: var(--font-size-xl);">
                    ${Array.isArray(user.permissions) && user.permissions.includes('all') ? 'Full Access' : user.permissions?.length || 0}
                  </div>
                </div>
                <div class="stat-card info">
                  <div class="stat-label">Account Status</div>
                  <div class="stat-value" style="font-size: var(--font-size-xl);">${(user.status || 'active').toUpperCase()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    },

    async saveProfile(event) {
        event.preventDefault();

        const fullName = document.getElementById('profileFullName').value.trim();
        const email = document.getElementById('profileEmail').value.trim();
        const department = document.getElementById('profileDepartment').value.trim();
        const phone = document.getElementById('profilePhone').value.trim();

        if (!fullName || !email) {
            showToast('Name and email are required.', 'error');
            return;
        }

        try {
            await authManager.updateUser(this.currentSession.userId, { fullName, email, department, phone });
            this.currentUser = await authManager.getUserById(this.currentSession.userId);
            showToast('Profile updated successfully!', 'success');

            // Update header name if displayed
            const userNameEl = document.getElementById('user-name');
            if (userNameEl) userNameEl.textContent = fullName;
        } catch (err) {
            showToast('Failed to update profile: ' + err.message, 'error');
        }
    },

    async changePassword(event) {
        event.preventDefault();

        const current = document.getElementById('currentPassword').value;
        const newPass = document.getElementById('newPassword').value;
        const confirm = document.getElementById('confirmPassword').value;
        const errorEl = document.getElementById('passwordError');
        const submitBtn = event.target.querySelector('[type="submit"]');

        errorEl.style.display = 'none';

        if (newPass !== confirm) {
            errorEl.textContent = 'New passwords do not match.';
            errorEl.style.display = 'block';
            return;
        }

        if (newPass.length < 8) {
            errorEl.textContent = 'New password must be at least 8 characters.';
            errorEl.style.display = 'block';
            return;
        }

        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Updating...'; }
        try {
            const result = await authManager.changePassword(
                this.currentSession.userId,
                current,
                newPass
            );
            if (!result.success) {
                errorEl.textContent = result.error || 'Password change failed.';
                errorEl.style.display = 'block';
                return;
            }
            document.getElementById('passwordForm').reset();
            showToast('Password changed successfully!', 'success');
        } catch (err) {
            showToast('Failed to change password: ' + err.message, 'error');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🔑 Update Password'; }
        }
    }
};

// Register module globally
if (typeof window !== 'undefined') {
    window.adminProfileModule = adminProfileModule;
}
