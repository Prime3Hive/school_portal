// ============================================
// USER MANAGEMENT MODULE - ENTERPRISE v3.0
// Comprehensive administrative hub for managing all system users
// Features: RBAC, Audit Logs, Bulk Invitations, Pagination
// Last Updated: 2026-02-24
// ============================================

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Current academic year sourced from schoolConfig (or fallback). */
const UM_ACADEMIC_YEAR = window.CURRENT_ACADEMIC_YEAR || (window.schoolConfig?.getCurrentAcademicYear?.()) || '2025-2026';

/**
 * Writes a row to the `audit_logs` Supabase table.
 * Non-blocking — failures are logged to console only.
 */
async function writeAuditLog(action, target, details = '') {
  try {
    if (!window.supabaseReady) return;
    const session = (typeof authManager !== 'undefined') && authManager.getSession();
    const performedBy = session ? `${session.fullName || session.userId} (${session.role})` : 'system';
    const performerId = session?.supabaseId || null;
    await supabaseClient.from('audit_logs').insert({
      action,
      target,
      details,
      performed_by: performedBy,
      performer_id: performerId,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[AuditLog] Failed to write log:', err);
  }
}

/**
 * Renders a ready-to-send email template in a modal.
 * Admin copies the full text and manually emails the recipient.
 *
 * @param {string} recipientName  - Full name of the new user
 * @param {string} recipientEmail - Email address (shown for reference)
 * @param {string} role           - Role label e.g. 'Staff', 'Student', 'Teacher'
 * @param {string} loginId        - School/login ID (username)
 * @param {string} password       - Temporary password
 */
function showEmailTemplate(recipientName, recipientEmail, role, loginId, password) {
  const school = window.schoolConfig?.name || 'TBD Academy';
  const portal = `${window.location.origin}/login.html`;
  const subject = `Your ${school} Portal Access — ${role} Account`;
  // Pre-escape for safe use inside onclick single-quoted string
  const subjectSafe = subject.replace(/'/g, '\u2019');

  const emailBody =
    `Dear ${recipientName},

Welcome to ${school}! Your ${role.toLowerCase()} portal account has been created.

Please use the credentials below to log in:

  Portal URL : ${portal}
  Login ID   : ${loginId}
  Password   : ${password}

Important:
• You will be prompted to change your password immediately after your first login.
• Keep your credentials confidential and do not share them.

If you have any trouble accessing the portal, please contact the school admin.

Best regards,
${school} Administration`;

  const html = `
    <div style="display:flex;flex-direction:column;gap:var(--space-4)">
      <div style="display:flex;gap:var(--space-3);align-items:center;padding:var(--space-3) var(--space-4);
                  background:rgba(19,127,236,0.08);border-radius:var(--radius-md);border-left:3px solid var(--color-primary)">
        <div>
          <div style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px">To</div>
          <div style="font-weight:600;color:var(--text-primary)">${recipientName}</div>
          <div style="font-size:0.85rem;color:var(--text-secondary)">${recipientEmail}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px">Subject</div>
          <div style="font-size:0.85rem;font-weight:500">${subject}</div>
        </div>
      </div>

      <textarea id="email-template-body" rows="14" readonly
        style="width:100%;font-family:monospace;font-size:0.85rem;padding:var(--space-4);
               background:var(--bg-tertiary);border:1px solid var(--border-primary);
               border-radius:var(--radius-md);color:var(--text-primary);resize:vertical;line-height:1.6">${emailBody}</textarea>

      <div style="display:flex;gap:var(--space-3)">
        <button class="btn btn-primary" style="flex:1" onclick="
          navigator.clipboard.writeText(document.getElementById('email-template-body').value);
          showToast('Email template copied to clipboard!', 'success');
        ">📋 Copy Email</button>
        <button class="btn" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border-primary)"

          onclick="navigator.clipboard.writeText(document.getElementById('email-subject-hidden').value);showToast('Subject line copied!', 'info');"

          >📌 Copy Subject</button>



      <input type="hidden" id="email-subject-hidden" value="${subjectSafe}">
      </div>

      <p style="font-size:0.8rem;color:var(--text-secondary);text-align:center;margin:0">
        Copy the email above and send it to the recipient manually via your email client.
      </p>
    </div>
    `;
  showModal(`📧 Email Template — ${role} Access`, html);
}

/**
 * Enhanced credential modal shown after account creation.
 * Includes: credential card, copy button, email template with copy, and mailto link.
 */
function showCredentialModal(recipientName, recipientEmail, role, loginId, password, emailSent, emailMessage) {
  const school = window.schoolConfig?.name || 'TBD Academy';
  const portal = `${window.location.origin}/login.html`;

  const emailStatus = emailSent
    ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#dcfce7;border:1px solid #86efac;border-radius:10px;margin-bottom:16px;">
         <span style="font-size:1.1rem;">✅</span>
         <span style="color:#166534;font-size:0.85rem;">Invitation email sent to <strong>${recipientEmail}</strong></span>
       </div>`
    : `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fef9c3;border:1px solid #fde047;border-radius:10px;margin-bottom:16px;">
         <span style="font-size:1.1rem;">⚠️</span>
         <span style="color:#854d0e;font-size:0.85rem;">${emailMessage || 'Email could not be sent.'}  Please share credentials manually.</span>
       </div>`;

  const emailBody = `Dear ${recipientName},\n\nWelcome to ${school}! Your ${role.toLowerCase()} portal account has been created.\n\nPlease use the credentials below to log in:\n\n  Portal URL : ${portal}\n  Login ID   : ${loginId}\n  Password   : ${password}\n\nImportant:\n- You will be prompted to change your password on first login.\n- Keep your credentials confidential.\n\nBest regards,\n${school} Administration`;

  const subject = `Your ${school} Portal Access - ${role} Account`;
  const mailtoHref = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;

  // Escape for safe embedding in onclick attributes
  const credText = `Login ID: ${loginId}\nPassword: ${password}\nPortal: ${portal}`;
  const credTextEsc = credText.replace(/'/g, "\\'").replace(/\n/g, "\\n");
  const emailBodyEsc = emailBody.replace(/'/g, "\\'").replace(/\n/g, "\\n");

  const html = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      ${emailStatus}

      <!-- Credential Card -->
      <div style="background:linear-gradient(135deg,#f0f4ff 0%,#e8ecff 100%);border:1px solid #c7d2fe;border-radius:12px;padding:20px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <span style="font-size:1.3rem;">🔑</span>
          <span style="font-weight:700;color:#3730a3;font-size:0.95rem;">Account Credentials</span>
        </div>
        <div style="display:grid;grid-template-columns:100px 1fr;gap:8px 12px;font-size:0.88rem;">
          <span style="color:#6366f1;font-weight:600;">Name</span>
          <span style="color:#1e293b;font-weight:600;">${recipientName}</span>
          <span style="color:#6366f1;font-weight:600;">Login ID</span>
          <code style="background:var(--bg-secondary);padding:2px 10px;border-radius:6px;font-family:'Courier New',monospace;font-weight:700;border:1px solid var(--border-primary);color:var(--text-primary);">${loginId}</code>
          <span style="color:#6366f1;font-weight:600;">Password</span>
          <code style="background:var(--bg-secondary);padding:2px 10px;border-radius:6px;font-family:'Courier New',monospace;font-weight:700;border:1px solid var(--border-primary);color:var(--text-primary);">${password}</code>
          <span style="color:#6366f1;font-weight:600;">Role</span>
          <span style="color:#1e293b;">${role}</span>
          <span style="color:#6366f1;font-weight:600;">Portal</span>
          <a href="${portal}" style="color:#4f46e5;text-decoration:underline;font-size:0.82rem;">${portal}</a>
        </div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #c7d2fe;">
          <span style="font-size:0.78rem;color:#6366f1;">🔒 User must change password on first login &middot; Account is active immediately</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button class="btn btn-primary" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;"
          onclick="navigator.clipboard.writeText('${credTextEsc}');showToast('Credentials copied!','success');">
          📋 Copy Credentials
        </button>
        <a href="${mailtoHref}" class="btn" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;
          background:var(--bg-tertiary);border:1px solid var(--border-primary);text-decoration:none;color:var(--text-primary);border-radius:var(--radius-md);">
          ✉️ Open Email Client
        </a>
      </div>

      <!-- Email Template (collapsible) -->
      <details style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <summary style="padding:10px 14px;cursor:pointer;font-size:0.85rem;font-weight:600;color:#475569;background:#f8fafc;user-select:none;">
          📧 View Email Template
        </summary>
        <div style="padding:12px 14px;background:white;">
          <textarea id="cred-email-body" rows="10" readonly
            style="width:100%;font-family:monospace;font-size:0.82rem;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;
                   border-radius:8px;color:#334155;resize:vertical;line-height:1.6;box-sizing:border-box;">${emailBody}</textarea>
          <button class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:0.85rem;"
            onclick="navigator.clipboard.writeText(document.getElementById('cred-email-body').value);showToast('Email template copied!','success');">
            📋 Copy Email Template
          </button>
        </div>
      </details>

      <button class="btn btn-ghost" style="width:100%;" onclick="closeModal()">Done</button>
    </div>
  `;

  showModal(`✅ Account Created — ${role}`, html);
}

// ── Module ───────────────────────────────────────────────────────────────────

const userManagementModule = {
  currentTab: 'overview',
  currentFilter: 'all',
  searchQuery: '',
  currentPage: 1,
  itemsPerPage: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  auditLogs: [],

  // Built-in system roles (always present)
  _systemRoles: [
    { id: 'admin', name: 'Administrator', permissions: ['all'] },
    { id: 'teacher', name: 'Teacher', permissions: ['view_students', 'edit_grades', 'view_classes'] },
    { id: 'staff', name: 'Staff', permissions: ['view_students', 'view_classes'] },
    { id: 'student', name: 'Student', permissions: ['view_own_data'] }
  ],

  // In-memory store for custom roles added this session
  _customRoles: [],

  // Computed property: system roles + custom roles (Supabase-seeded on first access)
  _customRolesLoaded: false,
  get roles() {
    if (!this._customRolesLoaded && this._customRoles.length === 0) {
      this._customRolesLoaded = true;
      // Load from Supabase asynchronously
      if (window.supabaseReady && window.supabaseClient) {
        window.supabaseClient.from('custom_roles').select('*').then(({ data }) => {
          if (data && data.length > 0) {
            this._customRoles = data.map(r => ({
              id: r.role_id, name: r.role_name, permissions: r.permissions || [], system: false
            }));
          }
        }).catch(() => {});
      }
    }
    const customIds = new Set(this._customRoles.map(r => r.id));
    return [
      ...this._systemRoles.filter(r => !customIds.has(r.id)),
      ...this._customRoles
    ];
  },

  // Setter so submitCreateRole() can do: this.roles.push(...) — we intercept and store to _customRoles
  // (Note: push won't trigger the setter so we use _customRoles directly in submitCreateRole)

  _users: [],
  _invitations: [],
  _loading: false,
  _initId: 0,        // incremented on every init() call — stale calls self-cancel
  _container: null,  // stored container ref so switchTab() always targets the right node

  // ── Helper: wraps a promise with a timeout; resolves with fallback value on timeout ──
  _withTimeout(promise, ms, fallback) {
    const timer = new Promise(resolve => setTimeout(() => resolve(fallback), ms));
    return Promise.race([promise, timer]);
  },

  async init(container) {
    if (!container) return;

    // ── Init-guard: stamp this call with a unique ID. ──────────────────────────
    // If the user navigates away and back before this async function finishes,
    // _initId will have been incremented and stale continuations will bail out.
    const myId = ++this._initId;
    this._container = container; // store so switchTab() always writes to the right node

    const isStale = () => this._initId !== myId;

    console.log('[UM] init start #' + myId + ', currentTab:', this.currentTab);

    // Show loading state
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:400px;"><div class="spinner"></div></div>';

    // Reset state for clean re-entry
    this._users = [];
    this._invitations = [];

    // Load auth users + invitations from Supabase.
    // Wrapped with a 10-second timeout so a stalled network call never
    // leaves the spinner on screen forever — falls back to cached data.
    try {
      this._loading = true;
      console.log('[UM] #' + myId + ' fetching users + invitations...');
      const TIMEOUT_MS = 10_000;
      const [users, invitations] = await Promise.all([
        this._withTimeout(authManager.getUsers(), TIMEOUT_MS, authManager.getAllUsers() || []),
        this._withTimeout(authManager.getInvitations(), TIMEOUT_MS, [])
      ]);

      // Bail out if a newer init() call has taken over
      if (isStale()) { console.log('[UM] #' + myId + ' is stale after fetch — aborting'); return; }

      this._users = users || [];
      this._invitations = invitations || [];
      console.log('[UM] #' + myId + ' fetched', this._users.length, 'users,', this._invitations.length, 'invitations');
    } catch (e) {
      console.error('[UM] Failed to load user management data:', e);
      if (isStale()) return;
      this._users = authManager.getAllUsers() || [];
      this._invitations = [];
    }

    // Merge students + staff from Supabase directory tables so list tabs
    // show ALL records, not just those with portal auth accounts.
    try {
      console.log('[UM] #' + myId + ' merging directory data...');
      await this._mergeDirectoryData();
      if (isStale()) { console.log('[UM] #' + myId + ' is stale after merge — aborting'); return; }
      console.log('[UM] #' + myId + ' merge complete, total users:', this._users.length);
    } catch (e) {
      console.error('[UM] _mergeDirectoryData failed:', e);
      if (isStale()) return;
    }

    this._loading = false;

    try {
      console.log('[UM] #' + myId + ' rendering tab:', this.currentTab);
      container.innerHTML = this.render();
      if (this.currentTab === 'overview') {
        setTimeout(() => {
          if (!isStale()) {
            try { this.initializeCharts(); } catch (e) { console.error('[UM] chart init failed:', e); }
          }
        }, 150);
      }
      console.log('[UM] #' + myId + ' init complete');
    } catch (e) {
      console.error('[UM] render failed:', e);
      if (!isStale()) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error rendering module</h3><p>' + e.message + '</p></div>';
      }
    }

    // Listen for data changes to auto-refresh
    this._onDataChange = (e) => {
      if (['students', 'staff', 'invitations'].includes(e.detail.collection)) {
        this._mergeDirectoryData().then(() => {
          if (!isStale()) this._container.innerHTML = this.render();
        });
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  /**
   * Merges records from the `students` and `staff` Supabase tables into
   * this._users so that list tabs display them even without auth accounts.
   * Awaits Supabase refresh to guarantee data is loaded before reading.
   * Deduplicates by email then by id.
   */
  async _mergeDirectoryData() {
    // Wait for DataManager's shared boot promise — instant if already loaded
    await dataManager.waitForReady();
    const studentsDir = dataManager.getAll('students');
    const staffDir = dataManager.getAll('staff');

    const seenEmails = new Set(this._users.map(u => (u.email || '').toLowerCase()).filter(Boolean));
    const seenIds = new Set(this._users.map(u => u.id).filter(Boolean));

    // ── Students ──
    for (const s of (studentsDir || [])) {
      const email = (s.email || '').toLowerCase();
      if (email && seenEmails.has(email)) continue;
      if (s.id && seenIds.has(s.id)) continue;
      const uid = s.id || ('stu-' + (s.roll_no || s.rollNo || s.name?.replace(/\s+/g, '-').toLowerCase() || crypto.randomUUID()));
      this._users.push({
        id: uid,
        fullName: s.name || 'Unknown Student',
        email: s.email || '',
        role: 'student',
        status: s.status || 'active',
        grade: s.grade,
        section: s.section,
        department: `Grade ${s.grade || '?'}${s.section ? ' - Sec ' + s.section : ''} `,
        createdAt: s.admission_date || s.created_at || new Date().toISOString(),
        phone: s.phone || '',
        _source: 'directory'
      });
      if (email) seenEmails.add(email);
      seenIds.add(uid);
    }

    // ── Staff ──
    for (const s of (staffDir || [])) {
      const email = (s.email || '').toLowerCase();
      if (email && seenEmails.has(email)) continue;
      if (s.id && seenIds.has(s.id)) continue;
      const uid = s.id || ('stf-' + (s.email?.split('@')[0] || s.name?.replace(/\s+/g, '-').toLowerCase() || crypto.randomUUID()));
      const role = s.type === 'teaching' ? 'teacher' : 'staff';
      this._users.push({
        id: uid,
        fullName: s.name || 'Unknown Staff',
        email: s.email || '',
        role: role,
        status: s.status || 'active',
        department: s.role || s.position || '',
        createdAt: s.hire_date || s.created_at || new Date().toISOString(),
        phone: s.phone || '',
        _source: 'directory'
      });
      if (email) seenEmails.add(email);
      seenIds.add(uid);
    }
  },


  render() {
    const session = authManager.getSession();

    // Only admins can access
    if (!authManager.hasPermission('all')) {
      return `
        <div class="card">
          <h2>Access Denied</h2>
          <p>You do not have permission to access this module.</p>
        </div>
      `;
    }

    return `
      <div class="module-container">
        ${this.renderHeader()}
        ${this.renderStats()}
        ${this.renderTabs()}
        <div class="um-tab-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
  },

  renderHeader() {
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-6);padding-bottom:var(--space-6);border-bottom:1px solid var(--border-primary);">
        <div>
          <h1 style="font-size:1.75rem;font-weight:800;color:var(--text-primary);margin:0 0 6px 0;letter-spacing:-0.02em;">User Management</h1>
          <p style="margin:0;color:var(--text-secondary);font-size:0.9rem;">Administrative hub for managing all system users and permissions</p>
        </div>
        <div style="display:flex;gap:var(--space-3);align-items:center;">
      ${this.currentTab === 'users' ? `
            <button onclick="userManagementModule.showBulkInviteModal()"
              style="display:inline-flex;align-items:center;gap:8px;padding:9px 18px;
                background:var(--bg-secondary);color:var(--text-secondary);border:1px solid var(--border-primary);border-radius:var(--radius-lg);
                font-size:0.875rem;font-weight:600;cursor:pointer;transition:all 0.15s;"
              onmouseover="this.style.borderColor='var(--color-primary)'"
              onmouseout="this.style.borderColor='var(--border-primary)'"
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              Bulk Invite
            </button>
          ` : ''}
      <button onclick="userManagementModule.showInviteModal()"
        style="display:inline-flex;align-items:center;gap:8px;padding:9px 20px;
              background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;
              border-radius:var(--radius-lg);font-size:0.875rem;font-weight:600;cursor:pointer;
              box-shadow:0 2px 8px rgba(102,126,234,0.4);transition:all 0.15s;"
        onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(102,126,234,0.5)'"
        onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 2px 8px rgba(102,126,234,0.4)'">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
        Send Invite
      </button>
        </div>
      </div>
    `;
  },

  renderStats() {
    const users = this._users;   // already includes merged directory data
    const invitations = this._invitations;
    const now = new Date().toISOString();
    const pendingInvites = invitations.filter(inv => inv.status === 'pending' && inv.expires_at > now);

    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'active').length;
    const suspendedUsers = users.filter(u => u.status === 'inactive' || u.status === 'suspended').length;

    return `
      <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--space-5);margin-bottom:var(--space-8);">
      ${this.createModernStatCard('Total Users', totalUsers, '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', '#667eea', '#764ba2')}
        ${this.createModernStatCard('Active Users', activeUsers, '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="20 6 9 17 4 12"/></svg>', '#43e97b', '#38f9d7')}
        ${this.createModernStatCard('Pending Invitations', pendingInvites.length, '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>', '#fa709a', '#fee140')}
        ${this.createModernStatCard('Suspended Users', suspendedUsers, '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>', '#f093fb', '#f5576c', "userManagementModule.switchTab('suspended')")}
      </div>
    `;
  },

  createModernStatCard(label, value, icon, color1, color2, onclick) {
    return `
    <div class="stat-card-modern" style="background:linear-gradient(135deg,${color1} 0%,${color2} 100%);color:white;padding:var(--space-6);border-radius:var(--radius-lg);box-shadow:0 4px 12px rgba(0,0,0,0.1);transition:transform 0.2s;${onclick ? 'cursor:pointer;' : ''}" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'" ${onclick ? `onclick="${onclick}"` : ''}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-3);">
        <div style="opacity:0.85;">${icon}</div>
        <div style="font-size:2.25rem;font-weight:800;line-height:1;">${value}</div>
      </div>
      <div style="font-size:0.875rem;opacity:0.9;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
      ${onclick ? '<div style="font-size:0.7rem;opacity:0.65;margin-top:3px;">Click to manage →</div>' : ''}
    </div>
    `;
  },

  renderTabs() {
    const tabs = [
      { id: 'overview', label: 'Dashboard', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
      { id: 'users', label: 'All Users', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
      { id: 'students', label: 'Students', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>' },
      { id: 'invitations', label: 'Invitations', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' },
      { id: 'roles', label: 'Roles & Permissions', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
      { id: 'suspended', label: 'Suspended', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
      { id: 'audit', label: 'Audit Trail', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' }
    ];

    return `
      <div class="um-tabs tabs" style="display:flex;gap:4px;margin-bottom:var(--space-6);border-bottom:2px solid var(--border-primary);overflow-x:auto;padding-bottom:0;">
      ${tabs.map(tab => `
          <button class="tab ${this.currentTab === tab.id ? 'active' : ''}"
            style="
              display:inline-flex;align-items:center;gap:7px;
              padding:10px 18px;
              border:none;
              background:${this.currentTab === tab.id ? 'var(--color-primary)' : 'transparent'};
              color:${this.currentTab === tab.id ? 'white' : 'var(--text-secondary)'};
              border-radius:var(--radius-md) var(--radius-md) 0 0;
              cursor:pointer;
              font-size:0.85rem;
              font-weight:${this.currentTab === tab.id ? '600' : '500'};
              transition:all 0.2s;
              white-space:nowrap;
            "
            onclick="userManagementModule.switchTab('${tab.id}')">
            ${tab.svg}
            ${tab.label}
          </button>
        `).join('')}
      </div>
    `;
  },

  switchTab(tab) {
    this.currentTab = tab;
    // Re-render in-place — never re-fetch data. init() already loaded _users/_invitations.
    // Update tabs highlight + tab content only; no Supabase round-trip.
    const tabsEl = this._container?.querySelector('.um-tabs');
    if (tabsEl) tabsEl.outerHTML = this.renderTabs();
    const contentEl = this._container?.querySelector('.um-tab-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderTabContent();
      if (tab === 'overview') {
        setTimeout(() => { try { this.initializeCharts(); } catch(e) {} }, 150);
      }
    }
    // Full re-render fallback if elements not found (first load)
    if (!tabsEl || !contentEl) {
      const container = this._container;
      if (container) container.innerHTML = this.render();
      if (tab === 'overview') setTimeout(() => { try { this.initializeCharts(); } catch(e) {} }, 150);
    }
  },

  // Lightweight re-render for search/filter/pagination changes — no data fetch
  _rerenderTab() {
    const contentEl = this._container?.querySelector('.um-tab-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderTabContent();
    } else {
      const container = this._container;
      if (container) container.innerHTML = this.render();
    }
  },

  renderTabContent() {
    switch (this.currentTab) {
      case 'overview':
        return this.renderOverviewTab();
      case 'users':
        return this.renderUsersTab();
      case 'students':
        return this.renderStudentsTab();
      case 'invitations':
        return this.renderInvitationsTab();
      case 'roles':
        return this.renderRolesTab();
      case 'suspended':
        return this.renderSuspendedTab();
      case 'audit':
        return this.renderAuditTab();
      default:
        return '';
    }
  },

  // ============================================
  // OVERVIEW TAB
  // ============================================
  renderOverviewTab() {
    const users = this._users;
    const studentsFromDirectory = dataManager.getAll('students') || [];
    const recentUsers = [...users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

    const roleConfig = {
      admin: { color: '#7c3aed', bg: '#f5f3ff', label: 'Admin' },
      teacher: { color: '#0891b2', bg: '#ecfeff', label: 'Teacher' },
      staff: { color: '#0d9488', bg: '#f0fdfa', label: 'Staff' },
      student: { color: '#ea580c', bg: '#fff7ed', label: 'Student' }
    };

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6);margin-bottom:var(--space-6);">
        <!-- Role Distribution -->
        <div class="card" style="border:1px solid var(--border-primary);border-radius:var(--radius-xl);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
            <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--text-primary);">Users by Role</h3>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-3);">
            ${['admin', 'teacher', 'staff', 'student'].map(role => {
      const cfg = roleConfig[role];
      const count = users.filter(u => u.role === role).length;
      const total = users.length || 1;
      const pct = Math.round((count / total) * 100);
      return `
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                    <span style="font-size:0.85rem;font-weight:600;color:#475569;">${cfg.label}</span>
                    <span style="font-size:0.85rem;font-weight:700;color:${cfg.color};">${count}</span>
                  </div>
                  <div style="height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${cfg.color};border-radius:4px;transition:width 0.4s ease;"></div>
                  </div>
                </div>
              `;
    }).join('')}
          </div>
          <canvas id="userRoleChart" style="display:none;"></canvas>
        </div>

        <!-- Status Overview -->
        <div class="card" style="border:1px solid #e2e8f0;border-radius:var(--radius-xl);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
        <h3 style="margin:0;font-size:1rem;font-weight:700;color:#1e293b;">Account Status</h3>
      </div>
      <canvas id="userStatusChart" style="max-height:200px;margin-bottom:var(--space-4);"></canvas>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        ${[{ label: 'Active', color: '#16a34a', bg: '#f0fdf4', status: 'active' }, { label: 'Inactive', color: '#6b7280', bg: '#f9fafb', status: 'inactive' }, { label: 'Suspended', color: '#dc2626', bg: '#fef2f2', status: 'suspended' }, { label: 'Pending', color: '#d97706', bg: '#fffbeb', status: 'pending' }].map(s => {
      const cnt = users.filter(u => u.status === s.status).length;
      return `
                <div style="padding:var(--space-3);background:${s.bg};border-radius:var(--radius-lg);border:1px solid ${s.color}22;">
                  <div style="font-size:1.4rem;font-weight:800;color:${s.color};">${cnt}</div>
                  <div style="font-size:0.75rem;color:#64748b;font-weight:500;">${s.label}</div>
                </div>
              `;
    }).join('')}
      </div>
        </div>
      </div>

      <!-- Recent Users -->
      <div class="card" style="border:1px solid #e2e8f0;border-radius:var(--radius-xl);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:700;color:#1e293b;">Recently Added Users</h3>
          <p style="margin:0;font-size:0.8rem;color:#64748b;">Latest accounts in the system</p>
        </div>
        <button onclick="userManagementModule.switchTab('users')"
          style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:var(--bg-secondary);color:var(--text-secondary);border:1px solid var(--border-primary);border-radius:var(--radius-md);
              font-size:0.8rem;font-weight:600;cursor:pointer;"
          onmouseover="this.style.borderColor='#667eea';this.style.color='#667eea'"
          onmouseout="this.style.borderColor='var(--border-primary)';this.style.color='var(--text-secondary)'">
          View All
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </div>
      <div style="display:grid;gap:var(--space-3);">
        ${recentUsers.length === 0 ? `
            <div style="text-align:center;padding:var(--space-8);color:#94a3b8;">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto var(--space-3);display:block;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <p style="margin:0;">No users yet. Start by sending an invitation.</p>
            </div>
          ` : recentUsers.map(u => {
      const cfg = roleConfig[u.role] || { color: '#64748b', bg: '#f8fafc', label: u.role };
      return `
              <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4);
                background:white;border:1px solid #e2e8f0;border-radius:var(--radius-lg);transition:box-shadow 0.2s;"
                onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.06)'"
                onmouseout="this.style.boxShadow='none'">
                <div style="flex-shrink:0;width:42px;height:42px;border-radius:50%;
                  background:${cfg.bg};color:${cfg.color};border:2px solid ${cfg.color}33;
                  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;">
                  ${(u.fullName || u.id).charAt(0).toUpperCase()}
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;font-size:0.9rem;color:#1e293b;">${u.fullName || 'N/A'}</div>
                  <div style="font-size:0.78rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.email}</div>
                </div>
                <div style="display:flex;align-items:center;gap:var(--space-3);">
                  <span style="background:${cfg.bg};color:${cfg.color};padding:3px 10px;
                    border-radius:20px;font-size:0.72rem;font-weight:700;border:1px solid ${cfg.color}33;">${cfg.label}</span>
                  <span style="font-size:0.75rem;color:#94a3b8;">${new Date(u.createdAt).toLocaleDateString()}</span>
                </div>
                <button onclick="userManagementModule.viewUserDetails('${u.id}')"
                  style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                    border-radius:6px;border:1px solid #e2e8f0;background:white;color:#475569;cursor:pointer;flex-shrink:0;"
                  onmouseover="this.style.borderColor='${cfg.color}';this.style.color='${cfg.color}'"
                  onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            `;
    }).join('')}
      </div>
    </div>
  `;
  },

  getRoleBadgeColor(role) {
    const colors = {
      'admin': 'danger',
      'teacher': 'primary',
      'staff': 'info',
      'student': 'success'
    };
    return colors[role] || 'secondary';
  },

  async initializeCharts() {
    if (typeof Chart === 'undefined') {
      if (!window.loadLib) return;
      try {
        await window.loadLib('chartjs');
      } catch { return; }
      if (typeof Chart === 'undefined') return;
    }

    const users = this._users;

    // Get students from student directory module for accurate count
    const studentsFromDirectory = dataManager.getAll('students') || [];

    // User Role Distribution Chart
    const roleCtx = document.getElementById('userRoleChart');
    if (roleCtx) {
      // Destroy existing chart instance if it exists
      const existingRoleChart = Chart.getChart(roleCtx);
      if (existingRoleChart) {
        existingRoleChart.destroy();
      }

      const roleCounts = {
        'Admin': users.filter(u => u.role === 'admin').length,
        'Teachers': users.filter(u => u.role === 'teacher').length,
        'Staff': users.filter(u => u.role === 'staff').length,
        'Students': studentsFromDirectory.length
      };

      new Chart(roleCtx, {
        type: 'doughnut',
        data: {
          labels: Object.keys(roleCounts),
          datasets: [{
            data: Object.values(roleCounts),
            backgroundColor: [
              '#ef4444',
              '#3b82f6',
              '#8b5cf6',
              '#10b981'
            ],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 15,
                font: { size: 12 }
              }
            }
          }
        }
      });
    }

    // User Status Chart - combine staff and students
    const statusCtx = document.getElementById('userStatusChart');
    if (statusCtx) {
      // Destroy existing chart instance if it exists
      const existingStatusChart = Chart.getChart(statusCtx);
      if (existingStatusChart) {
        existingStatusChart.destroy();
      }

      const activeStaff = users.filter(u => u.status === 'active').length;
      const inactiveStaff = users.filter(u => u.status === 'inactive').length;
      const activeStudents = studentsFromDirectory.filter(s => s.status === 'active').length;
      const inactiveStudents = studentsFromDirectory.filter(s => s.status === 'inactive').length;

      const statusCounts = {
        'Active': activeStaff + activeStudents,
        'Inactive': inactiveStaff + inactiveStudents
      };

      new Chart(statusCtx, {
        type: 'pie',
        data: {
          labels: Object.keys(statusCounts),
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: [
              '#10b981',
              '#6b7280'
            ],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 15,
                font: { size: 12 }
              }
            }
          }
        }
      });
    }
  },

  // ============================================
  // ALL USERS TAB - COMPREHENSIVE USER LISTING
  // ============================================
  renderUsersTab() {
    const allUsers = this._users;

    // Apply filters and search
    let filteredUsers = allUsers.filter(u => {
      const matchesSearch = !this.searchQuery ||
        u.fullName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        u.id.toLowerCase().includes(this.searchQuery.toLowerCase());

      const matchesFilter = this.currentFilter === 'all' || u.role === this.currentFilter || u.status === this.currentFilter;

      return matchesSearch && matchesFilter;
    });

    // Apply sorting
    filteredUsers.sort((a, b) => {
      let aVal = a[this.sortBy];
      let bVal = b[this.sortBy];

      if (this.sortBy === 'createdAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (this.sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Pagination
    const totalPages = Math.ceil(filteredUsers.length / this.itemsPerPage);
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + this.itemsPerPage);

    return `
      <div class="card" style="border:1px solid #e2e8f0;border-radius:var(--radius-xl);">
        <!-- Header + Filters -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);flex-wrap:wrap;gap:var(--space-4);">
          <div>
            <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:700;color:#1e293b;">All Users</h3>
            <p style="margin:0;font-size:0.8rem;color:#64748b;">Showing ${startIndex + 1}–${Math.min(startIndex + this.itemsPerPage, filteredUsers.length)} of ${filteredUsers.length}</p>
          </div>
          <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;align-items:center;">
            <div style="position:relative;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"
                style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" placeholder="Search by name, email, ID..."
                style="padding:8px 12px 8px 34px;border:1px solid var(--border-primary);border-radius:var(--radius-lg);
                  font-size:0.85rem;width:240px;outline:none;color:var(--text-primary);background:var(--bg-secondary);"
                value="${this.searchQuery}"
                oninput="userManagementModule.searchQuery = this.value; userManagementModule.currentPage = 1; userManagementModule._rerenderTab()"
                onfocus="this.style.borderColor='#667eea'" onblur="this.style.borderColor='#e2e8f0'">
            </div>
            <select style="padding:8px 12px;border:1px solid var(--border-primary);border-radius:var(--radius-lg);font-size:0.85rem;color:var(--text-secondary);background:var(--bg-secondary);outline:none;cursor:pointer;"
              onchange="userManagementModule.currentFilter = this.value; userManagementModule.currentPage = 1; userManagementModule._rerenderTab()">
              <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>All Roles</option>
              <option value="admin" ${this.currentFilter === 'admin' ? 'selected' : ''}>Administrators</option>
              <option value="teacher" ${this.currentFilter === 'teacher' ? 'selected' : ''}>Teachers</option>
              <option value="staff" ${this.currentFilter === 'staff' ? 'selected' : ''}>Staff</option>
              <option value="active" ${this.currentFilter === 'active' ? 'selected' : ''}>Active Only</option>
              <option value="inactive" ${this.currentFilter === 'inactive' ? 'selected' : ''}>Inactive Only</option>
            </select>
            <select style="padding:8px 12px;border:1px solid var(--border-primary);border-radius:var(--radius-lg);font-size:0.85rem;color:var(--text-secondary);background:var(--bg-secondary);outline:none;cursor:pointer;"
              onchange="userManagementModule.itemsPerPage = parseInt(this.value); userManagementModule.currentPage = 1; userManagementModule._rerenderTab()">
              <option value="10" ${this.itemsPerPage === 10 ? 'selected' : ''}>10 / page</option>
              <option value="25" ${this.itemsPerPage === 25 ? 'selected' : ''}>25 / page</option>
              <option value="50" ${this.itemsPerPage === 50 ? 'selected' : ''}>50 / page</option>
            </select>
          </div>
        </div>

        <!-- User Cards -->
        <div style="display:grid;gap:var(--space-3);">
          ${paginatedUsers.length === 0 ? `
            <div style="text-align:center;padding:var(--space-10);color:#94a3b8;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
                style="margin:0 auto var(--space-3);display:block;opacity:0.4;">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <p style="margin:0 0 4px;font-weight:600;font-size:0.9rem;color:#64748b;">No users found</p>
              <p style="margin:0;font-size:0.8rem;">Try adjusting your search or filters</p>
            </div>
          ` : paginatedUsers.map(user => this.renderUserRow(user)).join('')}
        </div>

        <!--Pagination -->
    ${totalPages > 1 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--space-6);
            padding-top:var(--space-4);border-top:1px solid #f1f5f9;">
            <button onclick="userManagementModule.currentPage--; userManagementModule._rerenderTab()"
              ${this.currentPage === 1 ? 'disabled' : ''}
              style="display:inline-flex;align-items:center;gap:6px;padding:7px 16px;
                background:var(--bg-secondary);color:${this.currentPage === 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)'};
                border:1px solid ${this.currentPage === 1 ? 'var(--bg-tertiary)' : 'var(--border-primary)'};
                border-radius:var(--radius-md);font-size:0.8rem;font-weight:600;cursor:${this.currentPage === 1 ? 'not-allowed' : 'pointer'};">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Previous
            </button>
            <div style="display:flex;gap:4px;">
              ${Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
      let pageNum;
      if (totalPages <= 5) pageNum = i + 1;
      else if (this.currentPage <= 3) pageNum = i + 1;
      else if (this.currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
      else pageNum = this.currentPage - 2 + i;
      const isActive = this.currentPage === pageNum;
      return `<button onclick="userManagementModule.currentPage = ${pageNum}; userManagementModule._rerenderTab()"
                  style="width:34px;height:34px;border-radius:8px;border:1px solid ${isActive ? '#667eea' : '#e2e8f0'};
                    background:${isActive ? 'linear-gradient(135deg,#667eea,#764ba2)' : 'var(--bg-secondary)'};
                    color:${isActive ? 'white' : '#475569'};font-weight:${isActive ? '700' : '500'};
                    font-size:0.85rem;cursor:pointer;">${pageNum}</button>`;
    }).join('')}
            </div>
            <button onclick="userManagementModule.currentPage++; userManagementModule._rerenderTab()"
              ${this.currentPage === totalPages ? 'disabled' : ''}
              style="display:inline-flex;align-items:center;gap:6px;padding:7px 16px;
                background:var(--bg-secondary);color:${this.currentPage === totalPages ? 'var(--text-tertiary)' : 'var(--text-secondary)'};
                border:1px solid ${this.currentPage === totalPages ? 'var(--bg-tertiary)' : 'var(--border-primary)'};
                border-radius:var(--radius-md);font-size:0.8rem;font-weight:600;cursor:${this.currentPage === totalPages ? 'not-allowed' : 'pointer'};">
              Next
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        ` : ''
      }
      </div>
    `;
  },

  renderUserRow(user) {
    const roleConfig = {
      admin: { color: '#7c3aed', bg: '#f5f3ff', label: 'Administrator' },
      teacher: { color: '#0891b2', bg: '#ecfeff', label: 'Teacher' },
      staff: { color: '#0d9488', bg: '#f0fdfa', label: 'Staff' },
      student: { color: '#ea580c', bg: '#fff7ed', label: 'Student' }
    };
    const statusConfig = {
      active: { color: '#16a34a', bg: '#f0fdf4', label: 'Active' },
      inactive: { color: '#6b7280', bg: '#f9fafb', label: 'Inactive' },
      suspended: { color: '#dc2626', bg: '#fef2f2', label: 'Suspended' },
      pending: { color: '#d97706', bg: '#fffbeb', label: 'Pending' }
    };
    const cfg = roleConfig[user.role] || { color: '#64748b', bg: '#f8fafc', label: user.role };
    const sts = statusConfig[user.status] || statusConfig.inactive;

    return `
      <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4);background:var(--bg-primary);border:1px solid var(--border-primary);border-radius:var(--radius-xl);transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.07)'" onmouseout="this.style.boxShadow='none'">

        <!-- Avatar -->
        <div style="flex-shrink:0;width:46px;height:46px;border-radius:50%;
          background:${cfg.bg};color:${cfg.color};border:2px solid ${cfg.color}33;
          display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;">
          ${(user.fullName || user.id).charAt(0).toUpperCase()}
        </div>

        <!-- Name + ID -->
        <div style="flex:1.5;min-width:0;">
          <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);">${user.fullName || 'N/A'}</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);font-family:monospace;">${user.id}</div>
        </div>

        <!--Email -->
        <div style="flex:2;min-width:0;">
          <div style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.email}</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px;">${user.department || ''}</div>
        </div>

        <!-- Role badge -->
        <div style="flex-shrink:0;">
          <span style="display:inline-flex;align-items:center;background:${cfg.bg};color:${cfg.color};
            border:1px solid ${cfg.color}33;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;">
            ${cfg.label}
          </span>
        </div>

        <!-- Status badge -->
        <div style="flex-shrink:0;">
          <span style="display:inline-flex;align-items:center;gap:5px;background:${sts.bg};color:${sts.color};
            border:1px solid ${sts.color}22;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;">
            <span style="width:6px;height:6px;border-radius:50%;background:${sts.color};display:inline-block;"></span>
            ${sts.label}
          </span>
        </div>

        <!--Date -->
        <div style="flex-shrink:0;font-size:0.78rem;color:#94a3b8;min-width:80px;text-align:right;">
          ${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : (user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A')}
        </div>

        <!--Actions -->
    <div style="flex-shrink:0;display:flex;gap:6px;">
      <button onclick="userManagementModule.viewUserDetails('${user.id}')" title="View Profile"
        style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
              border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;cursor:pointer;"
        onmouseover="this.style.borderColor='${cfg.color}';this.style.color='${cfg.color}'"
        onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
      <button onclick="userManagementModule.editUserRole('${user.id}')" title="Edit Role"
        style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
              border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;cursor:pointer;"
        onmouseover="this.style.borderColor='${cfg.color}';this.style.color='${cfg.color}'"
        onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      </button>
      <button onclick="userManagementModule.toggleUserStatus('${user.id}')" title="${user.status === 'active' ? 'Suspend' : 'Activate'}"
        style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
              border-radius:8px;border:1px solid ${user.status === 'active' ? '#fee2e2' : '#dcfce7'};
              background:${user.status === 'active' ? '#fff5f5' : '#f0fdf4'};
              color:${user.status === 'active' ? '#dc2626' : '#16a34a'};cursor:pointer;">
        ${user.status === 'active'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'}
      </button>
      ${user.status === 'pending' ? `
            <button onclick="userManagementModule.resendInvitation('${user.email}')" title="Resend Invite"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                border-radius:8px;border:1px solid #dbeafe;background:#eff6ff;color:#2563eb;cursor:pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },

  sortTable(column) {
    if (this.sortBy === column) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortOrder = 'asc';
    }
    this.switchTab('users');
  },

  // ============================================
  // STUDENTS TAB
  // ============================================
  renderStudentsTab() {
    const users = this._users;
    const students = users.filter(u => u.role === 'student');
    const filtered = students.filter(s => !this.searchQuery ||
      (s.fullName || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
      (s.id || '').toLowerCase().includes(this.searchQuery.toLowerCase())
    );

    return `
      <div class="card" style="border:1px solid #e2e8f0;border-radius:var(--radius-xl);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);flex-wrap:wrap;gap:var(--space-4);">
          <div>
            <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:700;color:#1e293b;">Students</h3>
            <p style="margin:0;font-size:0.8rem;color:#64748b;">${filtered.length} student${filtered.length !== 1 ? 's' : ''} found</p>
          </div>
          <div style="position:relative;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"
              style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Search students..."
              style="padding:8px 12px 8px 34px;border:1px solid #e2e8f0;border-radius:var(--radius-lg);
                font-size:0.85rem;width:240px;outline:none;color:#1e293b;"
              value="${this.searchQuery}"
              oninput="userManagementModule.searchQuery = this.value; userManagementModule.switchTab('students')"
              onfocus="this.style.borderColor='#ea580c'" onblur="this.style.borderColor='#e2e8f0'">
          </div>
        </div>

        <div style="display:grid;gap:var(--space-3);">
          ${filtered.length === 0 ? `
            <div style="text-align:center;padding:var(--space-10);color:#94a3b8;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
                style="margin:0 auto var(--space-3);display:block;opacity:0.4;">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
              <p style="margin:0 0 4px;font-weight:600;font-size:0.9rem;color:#64748b;">No students found</p>
              <p style="margin:0;font-size:0.8rem;">Try a different search term</p>
            </div>
          ` : filtered.map(user => this.renderStudentRow(user)).join('')}
        </div>
      </div>
    `;
  },

  renderStudentRow(user) {
    const sts = user.status === 'active'
      ? { color: '#16a34a', bg: '#f0fdf4', label: 'Active' }
      : { color: '#6b7280', bg: '#f9fafb', label: user.status || 'Inactive' };
    return `
      <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4);background:var(--bg-primary);border:1px solid var(--border-primary);border-radius:var(--radius-xl);transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.07)'" onmouseout="this.style.boxShadow='none'">
        <div style="flex-shrink:0;width:46px;height:46px;border-radius:50%;background:#fff7ed;color:#ea580c;
          border:2px solid #ea580c33;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;">
          ${(user.fullName || user.id).charAt(0).toUpperCase()}
        </div>
        <div style="flex:1.5;min-width:0;">
          <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);">${user.fullName || 'N/A'}</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);font-family:monospace;">${user.id}</div>
        </div>
        <div style="flex:2;min-width:0;">
          <div style="font-size:0.82rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.email || 'N/A'}</div>
        </div>
        <div style="flex-shrink:0;display:flex;gap:var(--space-2);">
          ${user.grade ? `<span style="background:#fff7ed;color:#ea580c;border:1px solid #ea580c33;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;">Grade ${user.grade}</span>` : ''}
          ${user.section ? `<span style="background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;">Sec ${user.section}</span>` : ''}
        </div>
        <span style="display:inline-flex;align-items:center;gap:5px;background:${sts.bg};color:${sts.color};
          border:1px solid ${sts.color}22;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;flex-shrink:0;">
          <span style="width:6px;height:6px;border-radius:50%;background:${sts.color};display:inline-block;"></span>
          ${sts.label}
        </span>
        <div style="flex-shrink:0;display:flex;gap:6px;">
          <button onclick="userManagementModule.viewUser('${user.id}')" title="View"
            style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;cursor:pointer;"
            onmouseover="this.style.borderColor='#ea580c';this.style.color='#ea580c'"
            onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button onclick="userManagementModule.editStudent('${user.id}')" title="Edit"
            style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;cursor:pointer;"
            onmouseover="this.style.borderColor='#ea580c';this.style.color='#ea580c'"
            onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onclick="userManagementModule.deleteStudent('${user.id}')" title="Delete"
            style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:1px solid #fee2e2;background:#fff5f5;color:#dc2626;cursor:pointer;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    `;
  },

  // ============================================
  // APPLICANTS TAB
  // ============================================
  renderApplicantsTab() {
    const applications = dataManager.getAll('applications') || [];
    const acceptedApplicants = applications.filter(app => app.status === 'accepted');

    return `
      <div class="card">
      <h3 class="text-xl font-semibold mb-6">Accepted Applicants Ready for Conversion</h3>

        ${acceptedApplicants.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">📝</div>
            <h3 class="empty-state-title">No Pending Conversions</h3>
            <p class="empty-state-description">All accepted applicants have been converted to students.</p>
          </div>
        ` : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Grade</th>
                  <th>DOB</th>
                  <th>Applied</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${acceptedApplicants.map(app => this.renderApplicantRow(app)).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  renderApplicantRow(app) {
    return `
      <tr>
        <td><strong>${app.studentName}</strong></td>
        <td>${app.parentEmail}</td>
        <td>${app.grade}</td>
        <td>${app.dateOfBirth}</td>
        <td>${new Date(app.submittedAt).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-success btn-sm" 
                  onclick="userManagementModule.convertToStudent('${app.id}')">
            Convert to Student
          </button>
        </td>
      </tr>
    `;
  },

  // ============================================
  // INVITATIONS TAB - ENHANCED
  // ============================================
  renderInvitationsTab() {
    const invitations = this._invitations;
    const now = new Date().toISOString();
    const pending = invitations.filter(inv => inv.status === 'pending' && inv.expires_at > now);
    const expired = invitations.filter(inv => inv.status === 'expired' || (inv.status === 'pending' && inv.expires_at <= now));
    const accepted = invitations.filter(inv => inv.status === 'accepted');

    const statCards = [
      { label: 'Total', value: invitations.length, color: '#7c3aed', bg: '#f5f3ff', icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' },
      { label: 'Pending', value: pending.length, color: '#d97706', bg: '#fffbeb', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
      { label: 'Accepted', value: accepted.length, color: '#16a34a', bg: '#f0fdf4', icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' },
      { label: 'Expired', value: expired.length, color: '#dc2626', bg: '#fef2f2', icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' },
    ];

    return `
      <div style="display:grid;gap:var(--space-6);">
        <!-- Stat pills row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-4);">
          ${statCards.map(s => `
            <div style="background:${s.bg};border:1px solid ${s.color}22;border-radius:var(--radius-xl);
              padding:var(--space-5);display:flex;align-items:center;gap:var(--space-4);">
              <div style="width:44px;height:44px;border-radius:12px;background:${s.color}18;
                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${s.color}" stroke-width="2">${s.icon}</svg>
              </div>
              <div>
                <div style="font-size:1.8rem;font-weight:800;color:${s.color};line-height:1;">${s.value}</div>
                <div style="font-size:0.78rem;color:#64748b;font-weight:600;margin-top:2px;">${s.label}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Invitations list -->
        <div class="card" style="border:1px solid #e2e8f0;border-radius:var(--radius-xl);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:700;color:#1e293b;">All Invitations</h3>
          <p style="margin:0;font-size:0.8rem;color:#64748b;">${invitations.length} invitation${invitations.length !== 1 ? 's' : ''} total</p>
        </div>
      </div>
      <div style="display:grid;gap:var(--space-3);">
        ${invitations.length === 0 ? `
              <div style="text-align:center;padding:var(--space-10);color:#94a3b8;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
                  style="margin:0 auto var(--space-3);display:block;opacity:0.4;">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <p style="margin:0 0 4px;font-weight:600;font-size:0.9rem;color:#64748b;">No invitations sent yet</p>
                <p style="margin:0;font-size:0.8rem;">Use the Invite button above to get started</p>
              </div>
            ` : invitations.map(inv => this.renderInvitationRow(inv)).join('')}
      </div>
        </div>
      </div>
    `;
  },

  renderInvitationRow(invitation) {
    const now = new Date().toISOString();
    const isExpired = invitation.status === 'expired' || (invitation.status === 'pending' && invitation.expires_at <= now);
    let status = isExpired ? 'expired' : invitation.status;
    if (invitation.metadata && invitation.metadata.emailFailed) status = 'pending';

    const roleConfig = {
      admin: { color: '#7c3aed', bg: '#f5f3ff', label: 'Admin' },
      teacher: { color: '#0891b2', bg: '#ecfeff', label: 'Teacher' },
      staff: { color: '#0d9488', bg: '#f0fdfa', label: 'Staff' },
      student: { color: '#ea580c', bg: '#fff7ed', label: 'Student' }
    };
    const statusConfig = {
      pending: { color: '#d97706', bg: '#fffbeb', label: 'Pending' },
      accepted: { color: '#16a34a', bg: '#f0fdf4', label: 'Accepted' },
      expired: { color: '#dc2626', bg: '#fef2f2', label: 'Expired' },
      failed: { color: '#dc2626', bg: '#fef2f2', label: 'Failed' }
    };
    const rcfg = roleConfig[invitation.role] || { color: '#64748b', bg: '#f8fafc', label: invitation.role || 'Unknown' };
    const scfg = statusConfig[status] || statusConfig.pending;
    const name = invitation.full_name || invitation.metadata?.fullName || 'N/A';
    const dept = invitation.school_id || invitation.metadata?.department || '';
    const sentDate = new Date(invitation.created_at || invitation.createdAt || Date.now()).toLocaleDateString();
    const expiresDate = invitation.expires_at || invitation.expiresAt ? new Date(invitation.expires_at || invitation.expiresAt).toLocaleDateString() : 'N/A';

    return `
      <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4);background:var(--bg-primary);border:1px solid var(--border-primary);border-radius:var(--radius-xl);transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.07)'" onmouseout="this.style.boxShadow='none'">

        <!-- Icon avatar -->
        <div style="flex-shrink:0;width:46px;height:46px;border-radius:50%;
          background:${scfg.bg};color:${scfg.color};border:2px solid ${scfg.color}33;
          display:flex;align-items:center;justify-content:center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>

        <!-- Name + Email -->
        <div style="flex:1.5;min-width:0;">
          <div style="font-weight:700;font-size:0.9rem;color:#1e293b;">${name}</div>
          <div style="font-size:0.75rem;color:#94a3b8;">${invitation.email}</div>
        </div>
        <div style="flex:1;min-width:0;font-size:0.8rem;color:#94a3b8;">${dept}</div>

        <!-- Role badge -->
        <span style="background:${rcfg.bg};color:${rcfg.color};border:1px solid ${rcfg.color}33;
          padding:4px 12px;border-radius:20px;font-size:0.72rem;font-weight:700;flex-shrink:0;">${rcfg.label}</span>

        <!-- Status badge -->
        <span style="display:inline-flex;align-items:center;gap:5px;background:${scfg.bg};color:${scfg.color};
          border:1px solid ${scfg.color}22;padding:4px 12px;border-radius:20px;font-size:0.72rem;font-weight:700;flex-shrink:0;">
          <span style="width:6px;height:6px;border-radius:50%;background:${scfg.color};display:inline-block;"></span>
          ${scfg.label}
        </span>

        <!--Dates -->
        <div style="flex-shrink:0;text-align:right;min-width:90px;">
          <div style="font-size:0.75rem;color:#64748b;">Sent ${sentDate}</div>
          <div style="font-size:0.72rem;color:#94a3b8;">Exp ${expiresDate}</div>
        </div>

        <!--Actions -->
    <div style="flex-shrink:0;display:flex;gap:6px;">
      ${status === 'pending' ? `
            <button onclick="userManagementModule.copyInvitationLink('${invitation.token}')" title="Copy Link"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;cursor:pointer;"
              onmouseover="this.style.borderColor='#7c3aed';this.style.color='#7c3aed'"
              onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button onclick="userManagementModule.viewInvitationDetails('${invitation.token}')" title="View Details"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;cursor:pointer;"
              onmouseover="this.style.borderColor='#7c3aed';this.style.color='#7c3aed'"
              onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button onclick="userManagementModule.resendInvitationEmail('${invitation.token}')" title="Resend Email"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                border-radius:8px;border:1px solid #dbeafe;background:#eff6ff;color:#2563eb;cursor:pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            </button>
          ` : ''}
      ${status === 'expired' || status === 'failed' ? `
            <button onclick="userManagementModule.resendInvitation('${invitation.token}')" title="Resend"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                border-radius:8px;border:1px solid #dbeafe;background:#eff6ff;color:#2563eb;cursor:pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            </button>
          ` : ''}
      <button onclick="userManagementModule.deleteInvitation('${invitation.token}')" title="Delete"
        style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
              border-radius:8px;border:1px solid #fee2e2;background:#fff5f5;color:#dc2626;cursor:pointer;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
      </button>
        </div>
      </div>
    `;
  },

  // ============================================
  // ACTIONS - STAFF
  // ============================================
  showInviteStaffModal() {
    const content = `
      <form id="invite-staff-form" onsubmit="userManagementModule.submitStaffInvitation(event)">
        <div class="form-group">
          <label class="form-label">Email *</label>
          <input type="email" class="form-input" name="email" required>
        </div>

        <div class="form-group">
          <label class="form-label">Role *</label>
          <select class="form-select" name="role" required>
            <option value="">Select Role</option>
            <option value="teacher">Teacher</option>
            <option value="staff">Non-Teaching Staff</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" class="form-input" name="fullName" required>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-success">Send Invitation</button>
        </div>
      </form>
    `;

    showModal('Invite Staff Member', content);
  },

  async submitStaffInvitation(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    const session = authManager.getSession();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Validating...'; }

    try {
      // Validate email format and uniqueness
      if (typeof validationManager !== 'undefined') {
        const validation = await validationManager.validateUserInput({
          email: data.email
        }, { checkUniqueness: true, excludeTable: 'staff' });

        if (!validation.isValid) {
          validation.errors.forEach(err => showToast(err.message, 'error'));
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Invitation'; }
          return;
        }
      }

      if (submitBtn) { submitBtn.textContent = 'Creating...'; }

      // Use unified create-invitation-v2 edge function
      const projectUrl = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
      const sbSession = window.supabaseReady ? (await supabaseClient.auth.getSession()).data.session : null;
      const accessToken = sbSession?.access_token || session?.accessToken;
      const anonKey = typeof SUPABASE_ANON !== 'undefined' ? SUPABASE_ANON : '';

      if (!projectUrl || !accessToken) {
        throw new Error('Not authenticated or Supabase not configured');
      }

      const response = await fetch(`${projectUrl}/functions/v1/create-invitation-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': anonKey
        },
        body: JSON.stringify({
          email: data.email,
          role: data.role,
          fullName: data.fullName,
          department: data.department || null
        })
      });

      const result = await response.json();

      if (!result.success) {
        showToast(result.error || 'Failed to create staff account', 'danger');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Invitation'; }
        return;
      }

      const defaultUserId = result.userId;
      const defaultPassword = result.password;

      showToast('Staff account created!', 'success');
      writeAuditLog('INVITE_STAFF', data.email, `Role: ${data.role} | Name: ${data.fullName} | ID: ${defaultUserId}`);
      closeModal();

      this._invitations = await authManager.getInvitations(true);
      this._users = await authManager.getUsers(true);

      setTimeout(() => showCredentialModal(
        data.fullName,
        data.email,
        data.role.charAt(0).toUpperCase() + data.role.slice(1),
        defaultUserId,
        defaultPassword,
        result.emailSent,
        result.emailMessage
      ), 400);

      this.switchTab('invitations');
    } catch (error) {
      showToast(error.message || 'Failed to send invitation', 'danger');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Invitation'; }
    }
  },

  generateStaffId(role) {
    const users = this._users;
    const staff = users.filter(u => u.role === role);
    const year = new Date().getFullYear();
    const nextNumber = staff.length + 1;
    const prefix = role === 'teacher' ? 'TCH' : 'STF';
    return `${prefix}-${year}-${String(nextNumber).padStart(3, '0')}`;
  },

  generateDefaultPassword() {
    // Generate a random 8-character password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  },

  async removeStaff(userId) {
    if (confirm('Are you sure you want to remove this staff member?')) {
      await authManager.updateUser(userId, { status: 'inactive' });
      this._users = await authManager.getUsers(true); // force-refresh after mutation
      showToast('Staff member removed successfully', 'success');
      writeAuditLog('REMOVE_STAFF', userId, 'Status set to inactive');
      this.switchTab('staff');
    }
  },

  // ============================================
  // ACTIONS - STUDENTS
  // ============================================
  showAddStudentModal() {
    const content = `
      <form id="add-student-form" onsubmit="userManagementModule.submitAddStudent(event)">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" class="form-input" name="fullName" required>
        </div>

        <div class="form-group">
          <label class="form-label">Email *</label>
          <input type="email" class="form-input" name="email" required>
        </div>

        <div class="form-group">
          <label class="form-label">Date of Birth *</label>
          <input type="date" class="form-input" name="dateOfBirth" required>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Grade *</label>
            <select class="form-select" name="grade" required>
              ${schoolConfig.gradeOptionsHTML()}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Section *</label>
            <select class="form-select" name="section" required>
              <option value="">Select Section</option>
              ${['A', 'B', 'C', 'D'].map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-success">Add Student</button>
        </div>
      </form>
    `;

    showModal('Add New Student', content);
  },

  async submitAddStudent(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Validating...'; }

    try {
      // Validate email format and uniqueness
      if (typeof validationManager !== 'undefined') {
        const validation = await validationManager.validateUserInput({
          email: data.email
        }, { checkUniqueness: true, excludeTable: 'students' });

        if (!validation.isValid) {
          validation.errors.forEach(err => showToast(err.message, 'error'));
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Student'; }
          return;
        }
      }

      if (submitBtn) { submitBtn.textContent = 'Creating...'; }

      // Edge function generates school ID, password, and student record automatically
      const result = await authManager.createInvitation({
        email: data.email,
        role: 'student',
        fullName: data.fullName,
        grade: data.grade,
        section: data.section,
        dateOfBirth: data.dateOfBirth,
        expiryDays: 30
      });

      if (!result.success) {
        showToast(result.error || 'Failed to add student', 'danger');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Student'; }
        return;
      }

      const studentId = result.schoolId;
      const password = result.password;

      showToast(`Student added successfully! ID: ${studentId} `, 'success');
      writeAuditLog('ADD_STUDENT', data.email, `Name: ${data.fullName} | Grade: ${data.grade} -${data.section} | ID: ${studentId} `);

      // Auto-apply grade fee structure
      if (typeof feeManager !== 'undefined' && result.authId && data.grade) {
        supabaseClient.from('students').select('id').eq('auth_id', result.authId).single()
          .then(({ data: rec }) => {
            if (rec?.id) feeManager.applyFeeStructure(rec.id, data.grade)
              .then(r => { if (!r.success) console.warn('[UserMgmt] Fee structure apply:', r.error); });
          });
      }

      // Auto-enroll in grade subjects (look up actual UUID via authId)
      if (typeof subjectManager !== 'undefined' && result.authId) {
        subjectManager.autoEnrollByAuthId(result.authId, data.grade, data.section)
          .then(r => { if (!r.success && !r.existing) console.warn('[UserMgmt] Subject auto-enroll:', r.error); });
      }

      closeModal();

      this._users = await authManager.getUsers();

      setTimeout(() => showEmailTemplate(
        data.fullName,
        data.email,
        'Student',
        studentId,
        password
      ), 400);

      this.switchTab('students');
    } catch (error) {
      showToast(error.message || 'Failed to add student', 'danger');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Student'; }
    }
  },

  editStudent(userId) {
    const user = this._users.find(u => u.id === userId || u.schoolId === userId);

    const content = `
      <form id="edit-student-form" onsubmit="userManagementModule.submitEditStudent(event, '${userId}')">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Grade</label>
            <select class="form-select" name="grade">
              ${schoolConfig.gradeOptionsHTML(user.grade)}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Section</label>
            <select class="form-select" name="section">
              ${['A', 'B', 'C', 'D'].map(s => `<option value="${s}" ${user.section === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Student</button>
        </div>
      </form>
    `;

    showModal(`Edit Student - ${user.fullName}`, content);
  },

  async submitEditStudent(event, userId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);

    await authManager.updateUser(userId, {
      grade: data.grade,
      section: data.section
    });
    this._users = await authManager.getUsers();

    showToast('Student updated successfully', 'success');
    writeAuditLog('EDIT_STUDENT', userId, `Grade: ${data.grade} | Section: ${data.section} `);
    closeModal();
    this.switchTab('students');
  },

  async deleteStudent(userId) {
    if (confirm('Are you sure you want to delete this student? This action cannot be undone.')) {
      await authManager.updateUser(userId, { status: 'inactive' });
      this._users = await authManager.getUsers(true); // force-refresh after mutation
      showToast('Student deleted successfully', 'success');
      writeAuditLog('DELETE_STUDENT', userId, 'Status set to inactive');
      this.switchTab('students');
    }
  },

  // ============================================
  // SUSPENDED USERS TAB
  // ============================================

  renderSuspendedTab() {
    const suspendedUsers = this._users.filter(u => u.status === 'suspended' || u.status === 'inactive');
    const filtered = suspendedUsers.filter(u =>
      !this.searchQuery ||
      (u.fullName || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
      (u.id || '').toLowerCase().includes(this.searchQuery.toLowerCase())
    );

    const roleConfig = {
      admin:   { color: '#7c3aed', bg: '#f5f3ff', label: 'Administrator' },
      teacher: { color: '#0891b2', bg: '#ecfeff', label: 'Teacher' },
      staff:   { color: '#0d9488', bg: '#f0fdfa', label: 'Staff' },
      student: { color: '#ea580c', bg: '#fff7ed', label: 'Student' }
    };

    const userCards = filtered.length === 0
      ? `<div style="text-align:center;padding:var(--space-12);color:#94a3b8;">
           <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
             style="margin:0 auto var(--space-4);display:block;opacity:0.25;">
             <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
             <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
           </svg>
           <p style="margin:0 0 6px;font-weight:700;font-size:1rem;color:#64748b;">No suspended users</p>
           <p style="margin:0;font-size:0.85rem;">All accounts are currently active or pending.</p>
         </div>`
      : filtered.map(user => {
          const cfg = roleConfig[user.role] || { color: '#64748b', bg: '#f8fafc', label: user.role || 'User' };
          const statusLabel = user.status === 'suspended' ? 'Suspended' : 'Inactive';
          const safeName = (user.fullName || '').replace(/'/g, '&#39;');
          return `
            <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4);
              background:#fff8f8;border:1px solid #fecaca;border-radius:var(--radius-xl);
              transition:box-shadow 0.2s;"
              onmouseover="this.style.boxShadow='0 4px 16px rgba(220,38,38,0.09)'"
              onmouseout="this.style.boxShadow='none'">

              <div style="flex-shrink:0;width:46px;height:46px;border-radius:50%;
                background:${cfg.bg};color:${cfg.color};border:2px solid ${cfg.color}33;
                display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;opacity:0.75;">
                ${(user.fullName || user.id).charAt(0).toUpperCase()}
              </div>

              <div style="flex:1.5;min-width:0;">
                <div style="font-weight:700;font-size:0.9rem;color:#1e293b;">${user.fullName || 'N/A'}</div>
                <div style="font-size:0.75rem;color:#94a3b8;font-family:monospace;">${user.id}</div>
              </div>

              <div style="flex:2;min-width:0;">
                <div style="font-size:0.82rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.email || '—'}</div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px;">${user.department || ''}</div>
              </div>

              <div style="flex-shrink:0;">
                <span style="display:inline-flex;align-items:center;background:${cfg.bg};color:${cfg.color};
                  border:1px solid ${cfg.color}33;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;">
                  ${cfg.label}
                </span>
              </div>

              <div style="flex-shrink:0;">
                <span style="display:inline-flex;align-items:center;gap:5px;background:#fef2f2;color:#dc2626;
                  border:1px solid #dc262622;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;">
                  <span style="width:6px;height:6px;border-radius:50%;background:#dc2626;display:inline-block;"></span>
                  ${statusLabel}
                </span>
              </div>

              <div style="flex-shrink:0;display:flex;gap:6px;">
                <button onclick="userManagementModule.unsuspendUser('${user.id}')" title="Unsuspend / Reactivate"
                  style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;
                    border-radius:8px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;
                    font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;"
                  onmouseover="this.style.background='#dcfce7'"
                  onmouseout="this.style.background='#f0fdf4'">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                  Unsuspend
                </button>
                <button onclick="userManagementModule.permanentlyDeleteUser('${user.id}', '${safeName}')" title="Delete Permanently"
                  style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;
                    border-radius:8px;border:1px solid #fecaca;background:#fff5f5;color:#dc2626;
                    font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;"
                  onmouseover="this.style.background='#fee2e2'"
                  onmouseout="this.style.background='#fff5f5'">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Delete
                </button>
              </div>
            </div>`;
        }).join('');

    return `
      <div class="card" style="border:1px solid #e2e8f0;border-radius:var(--radius-xl);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);flex-wrap:wrap;gap:var(--space-4);">
          <div>
            <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:700;color:#1e293b;">🔒 Suspended / Inactive Users</h3>
            <p style="margin:0;font-size:0.8rem;color:#64748b;">
              ${filtered.length} user${filtered.length !== 1 ? 's' : ''} — unsuspend to restore access, or permanently delete
            </p>
          </div>
          <div style="position:relative;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"
              style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Search suspended users..."
              style="padding:8px 12px 8px 34px;border:1px solid #e2e8f0;border-radius:var(--radius-lg);
                font-size:0.85rem;width:240px;outline:none;color:#1e293b;"
              value="${this.searchQuery}"
              oninput="userManagementModule.searchQuery = this.value; userManagementModule.switchTab('suspended')"
              onfocus="this.style.borderColor='#dc2626'" onblur="this.style.borderColor='#e2e8f0'">
          </div>
        </div>
        <div style="display:grid;gap:var(--space-3);">
          ${userCards}
        </div>
      </div>
    `;
  },

  async unsuspendUser(userId) {
    const user = this._users.find(u => u.id === userId);
    if (!user) { showToast('User not found.', 'danger'); return; }
    if (!confirm(`Unsuspend ${user.fullName || userId}?\n\nTheir account will be restored to active and they will be able to log in again.`)) return;
    const result = await authManager.updateUser(userId, { status: 'active' });
    if (!result || result.success === false) { showToast((result && result.error) || 'Failed to unsuspend user.', 'danger'); return; }
    this._users = await authManager.getUsers(true);
    await this._mergeDirectoryData();
    showToast(`${user.fullName || userId} has been unsuspended and is now active.`, 'success');
    writeAuditLog('UNSUSPEND_USER', userId, `${user.fullName} reactivated by admin`);
    this.switchTab('suspended');
  },

  async permanentlyDeleteUser(userId, userName) {
    const displayName = userName || userId;
    if (!confirm(`⚠️ PERMANENTLY DELETE "${displayName}"?\n\nThis removes their login account, profile, and all associated records.\n\nThis CANNOT be undone. Press OK to confirm.`)) return;
    showToast('Deleting user…', 'info');
    const result = await authManager.deleteUser(userId);
    if (!result || result.success === false) { showToast((result && result.error) || 'Failed to delete user.', 'danger'); return; }
    this._users = await authManager.getUsers(true);
    await this._mergeDirectoryData();
    showToast(`${displayName} has been permanently deleted.`, 'success');
    writeAuditLog('PERMANENT_DELETE_USER', userId, `${displayName} permanently deleted by admin`);
    this.switchTab('suspended');
  },

  // ============================================
  // ACTIONS - APPLICANT CONVERSION
  // ============================================
  convertToStudent(applicationId) {
    const applications = dataManager.getAll('applications') || [];
    const app = applications.find(a => a.id === applicationId);

    if (!app) {
      showToast('Application not found', 'danger');
      return;
    }

    const content = `
      <form id="convert-form" onsubmit="userManagementModule.submitConversion(event, '${applicationId}')">
        <p class="mb-4">Convert <strong>${app.studentName}</strong> to student?</p>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Grade</label>
            <select class="form-select" name="grade" required>
              ${schoolConfig.gradeOptionsHTML(app.grade)}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Section</label>
            <select class="form-select" name="section" required>
              ${['A', 'B', 'C', 'D'].map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-success">Convert to Student</button>
        </div>
      </form>
    `;

    showModal('Convert Applicant to Student', content);
  },

  async submitConversion(event, applicationId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);

    const applications = dataManager.getAll('applications') || [];
    const app = applications.find(a => a.id === applicationId);

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Converting...'; }

    try {
      // Edge function generates school ID, password, and student record automatically
      const result = await authManager.createInvitation({
        email: app.parentEmail,
        role: 'student',
        fullName: app.studentName,
        grade: data.grade,
        section: data.section,
        dateOfBirth: app.dateOfBirth,
        expiryDays: 30
      });

      if (!result.success) {
        showToast(result.error || 'Failed to convert applicant', 'danger');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Convert to Student'; }
        return;
      }

      const studentId = result.schoolId;
      const password = result.password;

      // Update application status
      app.status = 'converted';
      app.studentId = studentId;
      await dataManager.update('applications', applicationId, { status: 'converted', studentId: studentId });

      this._users = await authManager.getUsers();
      this._invitations = await authManager.getInvitations();

      showToast(`Applicant converted successfully! Student ID: ${studentId} `, 'success');
      writeAuditLog('CONVERT_APPLICANT', app.studentName, `Application ID: ${applicationId} | New Student ID: ${studentId} `);
      closeModal();

      setTimeout(() => {
        const credContent = `
    <p class="mb-4">Student account created from application!</p>
          <div style="background: var(--bg-tertiary); padding: var(--space-4); border-radius: var(--radius-md);">
            <p><strong>Student ID:</strong> ${studentId}</p>
            <p><strong>Password:</strong> ${password}</p>
            <p class="text-sm text-secondary mt-2">Share these credentials with the parent</p>
          </div>
          <button class="btn btn-primary mt-3" onclick="navigator.clipboard.writeText('Student ID: ${studentId}\\nPassword: ${password}'); showToast('Copied!', 'success');">
            Copy Credentials
          </button>
  `;
        showModal('Student Credentials', credContent);
      }, 500);

      this.switchTab('applicants');
    } catch (error) {
      showToast(error.message || 'Failed to convert applicant', 'danger');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Convert to Student'; }
    }
  },

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  generateStudentId() {
    const users = this._users;
    const students = users.filter(u => u.role === 'student');
    const year = new Date().getFullYear();
    const nextNumber = students.length + 1;
    return `STU-${year}-${String(nextNumber).padStart(3, '0')}`;
  },

  viewUser(userId) {
    const user = this._users.find(u => u.id === userId || u.schoolId === userId);

    if (!user) {
      showToast('User not found', 'danger');
      return;
    }

    const content = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-secondary mb-1">User ID</p>
          <p class="font-semibold">${user.id}</p>
        </div>
        <div>
          <p class="text-sm text-secondary mb-1">Role</p>
          <p>${createBadge(user.role, 'info')}</p>
        </div>
        <div>
          <p class="text-sm text-secondary mb-1">Full Name</p>
          <p class="font-semibold">${user.fullName}</p>
        </div>
        <div>
          <p class="text-sm text-secondary mb-1">Email</p>
          <p>${user.email}</p>
        </div>
        <div>
          <p class="text-sm text-secondary mb-1">Status</p>
          <p>${createBadge(user.status, user.status === 'active' ? 'success' : 'secondary')}</p>
        </div>
        <div>
          <p class="text-sm text-secondary mb-1">Created</p>
          <p>${new Date(user.createdAt).toLocaleDateString()}</p>
        </div>
        ${user.grade ? `
          <div>
            <p class="text-sm text-secondary mb-1">Grade</p>
            <p>${user.grade}</p>
          </div>
        ` : ''
      }
        ${user.section ? `
          <div>
            <p class="text-sm text-secondary mb-1">Section</p>
            <p>${user.section}</p>
          </div>
        ` : ''
      }
      </div>
    `;

    showModal(`User Details - ${user.fullName}`, content);
  },

  async toggleUserStatus(userId) {
    const user = this._users.find(u => u.id === userId || u.schoolId === userId);
    if (!user) { showToast('User not found', 'danger'); return; }
    const newStatus = user.status === 'active' ? 'inactive' : 'active';

    if (confirm(`Are you sure you want to ${newStatus === 'active' ? 'activate' : 'deactivate'} this user ? `)) {
      await authManager.updateUser(userId, { status: newStatus });
      this._users = await authManager.getUsers();
      showToast(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`, 'success');
      writeAuditLog(
        newStatus === 'active' ? 'user_activated' : 'user_suspended',
        userId,
        `Status changed to ${newStatus} for user ${user.fullName || userId}`
      );
      const container = document.querySelector('.module-container')?.parentElement || document.getElementById('main-content');
      this.init(container);
    }
  },

  copyInvitationLink(token) {
    const inviteLink = `${window.location.origin}/verify-invitation.html?token=${token}`;
    navigator.clipboard.writeText(inviteLink);
    showToast('Invitation link copied!', 'success');
  },

  // ============================================
  // ROLES & PERMISSIONS TAB
  // ============================================
  renderRolesTab() {
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-6);">
          <div>
            <h3 class="text-xl font-semibold" style="margin:0 0 4px 0;">Role-Based Access Control</h3>
            <p style="margin:0; color:var(--text-secondary); font-size:var(--font-size-sm);">Manage what each role can access and do in the system</p>
          </div>
        </div>

        <div style="display:grid; gap:var(--space-4);">
          ${this.roles.map(role => this.renderRoleRow(role)).join('')}
        </div>
      </div>
    `;
  },

  renderRoleRow(role) {
    const userCount = this._users.filter(u => u.role === role.id).length;
    const roleConfig = {
      admin: {
        color: '#7c3aed', bg: '#f5f3ff', label: 'Administrator',
        desc: 'Full system access and control',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
      },
      teacher: {
        color: '#0891b2', bg: '#ecfeff', label: 'Teacher',
        desc: 'Manage classes, grades, and students',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
      },
      staff: {
        color: '#0d9488', bg: '#f0fdfa', label: 'Staff',
        desc: 'View and manage school operations',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
      },
      student: {
        color: '#ea580c', bg: '#fff7ed', label: 'Student',
        desc: 'Access to personal data and assignments',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'
      }
    };
    const cfg = roleConfig[role.id] || { color: '#64748b', bg: '#f8fafc', label: role.name, desc: '', icon: '' };

    const permDisplay = role.permissions.slice(0, 4).map(perm =>
      `<span style="display:inline-flex;align-items:center;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}33;
        padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;white-space:nowrap;">
        ${perm.replace(/_/g, ' ')}
      </span>`
    ).join('');
    const morePerms = role.permissions.length > 4
      ? `<span style="display:inline-flex;align-items:center;color:#64748b;font-size:0.75rem;font-weight:500;padding:3px 8px;">+${role.permissions.length - 4} more</span>`
      : '';

    return `
      <div style="display:flex;align-items:flex-start;gap:var(--space-4);padding:var(--space-5);
        background:white;border:1px solid #e2e8f0;border-radius:var(--radius-xl);
        transition:box-shadow 0.2s;" 
        onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'" 
        onmouseout="this.style.boxShadow='none'">

        <!-- Role Icon -->
        <div style="flex-shrink:0;width:48px;height:48px;border-radius:var(--radius-lg);
          background:${cfg.bg};color:${cfg.color};display:flex;align-items:center;
          justify-content:center;border:1.5px solid ${cfg.color}33;">
          ${cfg.icon}
        </div>

        <!-- Role Info -->
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:4px;">
            <span style="font-size:1rem;font-weight:700;color:#1e293b;">${cfg.label}</span>
            <span style="display:inline-flex;align-items:center;background:${cfg.color};color:white;
              padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;">
              ${userCount} ${userCount === 1 ? 'user' : 'users'}
            </span>
          </div>
          <p style="margin:0 0 var(--space-3) 0;font-size:0.85rem;color:#64748b;">${cfg.desc}</p>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center;">
            ${permDisplay}${morePerms}
          </div>
        </div>

        <!-- Actions -->
        <div style="flex-shrink:0;display:flex;gap:var(--space-2);align-items:center;">
          <button onclick="userManagementModule.viewRoleDetails('${role.id}')"
            style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:white;color:#475569;border:1px solid #e2e8f0;border-radius:var(--radius-md);
              font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.15s;"
            onmouseover="this.style.borderColor='${cfg.color}';this.style.color='${cfg.color}'"
            onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            View
          </button>
          ${role.id !== 'admin' ? `
          <button onclick="userManagementModule.editRolePermissions('${role.id}')"
            style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}55;border-radius:var(--radius-md);
              font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.15s;"
            onmouseover="this.style.opacity='0.8'"
            onmouseout="this.style.opacity='1'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>` : ''}
        </div>
      </div>
    `;
  },

  // ============================================
  // ROLES — View & Edit Methods
  // ============================================

  viewRoleDetails(roleId) {
    const role = this.roles.find(r => r.id === roleId);
    if (!role) return;

    const roleConfig = {
      admin: { color: '#7c3aed', bg: '#f5f3ff', label: 'Administrator' },
      teacher: { color: '#0891b2', bg: '#ecfeff', label: 'Teacher' },
      staff: { color: '#0d9488', bg: '#f0fdfa', label: 'Staff' },
      student: { color: '#ea580c', bg: '#fff7ed', label: 'Student' }
    };
    const cfg = roleConfig[roleId] || { color: '#64748b', bg: '#f8fafc', label: role.name };

    const userCount = this._users.filter(u => u.role === roleId).length;
    const usersInRole = this._users.filter(u => u.role === roleId);

    const content = `
      <div>
        <div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-6);
          padding:var(--space-4);background:${cfg.bg};border-radius:var(--radius-lg);border:1px solid ${cfg.color}22;">
          <div style="font-size:1.1rem;font-weight:700;color:${cfg.color};">${cfg.label}</div>
          <span style="background:${cfg.color};color:white;padding:2px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">
            ${userCount} ${userCount === 1 ? 'user' : 'users'}
          </span>
        </div>

        <div style="margin-bottom:var(--space-5);">
          <p style="font-size:0.85rem;font-weight:600;color:#475569;margin:0 0 var(--space-3) 0;text-transform:uppercase;letter-spacing:0.05em;">Permissions</p>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
            ${role.permissions.map(p => `
              <span style="display:inline-flex;align-items:center;gap:6px;background:${cfg.bg};color:${cfg.color};
                border:1px solid ${cfg.color}33;padding:5px 12px;border-radius:20px;font-size:0.8rem;font-weight:600;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                ${p.replace(/_/g, ' ')}
              </span>
            `).join('')}
          </div>
        </div>

        ${usersInRole.length > 0 ? `
          <div>
            <p style="font-size:0.85rem;font-weight:600;color:#475569;margin:0 0 var(--space-3) 0;text-transform:uppercase;letter-spacing:0.05em;">Users in this role</p>
            <div style="display:flex;flex-direction:column;gap:var(--space-2);">
              ${usersInRole.slice(0, 8).map(u => `
                <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);
                  background:#f8fafc;border-radius:var(--radius-md);border:1px solid #e2e8f0;">
                  <div style="width:34px;height:34px;border-radius:50%;background:${cfg.bg};color:${cfg.color};
                    display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;border:1.5px solid ${cfg.color}33;">
                    ${(u.fullName || u.id).charAt(0).toUpperCase()}
                  </div>
                  <div style="flex:1;">
                    <div style="font-weight:600;font-size:0.9rem;color:#1e293b;">${u.fullName || 'N/A'}</div>
                    <div style="font-size:0.78rem;color:#64748b;">${u.id}</div>
                  </div>
                  <span style="font-size:0.75rem;color:${u.status === 'active' ? '#16a34a' : '#dc2626'};
                    font-weight:600;">${u.status || 'active'}</span>
                </div>
              `).join('')}
              ${usersInRole.length > 8 ? `<p style="font-size:0.8rem;color:#64748b;text-align:center;margin:var(--space-2) 0 0;">+${usersInRole.length - 8} more users</p>` : ''}
            </div>
          </div>
        ` : `
          <div style="text-align:center;padding:var(--space-6);color:#94a3b8;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto var(--space-2);display:block;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <p style="margin:0;font-size:0.875rem;">No users assigned to this role yet.</p>
          </div>
        `}
      </div>
    `;
    showModal(`Role Details — ${cfg.label}`, content);
  },

  editRolePermissions(roleId) {
    const role = this.roles.find(r => r.id === roleId);
    if (!role) return;

    const roleConfig = {
      teacher: { color: '#0891b2', bg: '#ecfeff', label: 'Teacher' },
      staff: { color: '#0d9488', bg: '#f0fdfa', label: 'Staff' },
      student: { color: '#ea580c', bg: '#fff7ed', label: 'Student' }
    };
    const cfg = roleConfig[roleId] || { color: '#64748b', bg: '#f8fafc', label: role.name };

    const allPermissions = [
      { id: 'view_students', label: 'View Students', desc: 'Browse and search the student directory' },
      { id: 'edit_students', label: 'Edit Students', desc: 'Modify student profiles and records' },
      { id: 'delete_students', label: 'Delete Students', desc: 'Remove student records from the system' },
      { id: 'view_classes', label: 'View Classes', desc: 'Access timetables and class schedules' },
      { id: 'manage_classes', label: 'Manage Classes', desc: 'Create, edit and delete class records' },
      { id: 'edit_grades', label: 'Edit Grades', desc: 'Enter and modify student assessment grades' },
      { id: 'view_grades', label: 'View Grades', desc: 'Read-only access to grade reports' },
      { id: 'manage_fees', label: 'Manage Fees', desc: 'Record and edit fee payments' },
      { id: 'view_fees', label: 'View Fees', desc: 'View payment records and balances' },
      { id: 'manage_inventory', label: 'Manage Inventory', desc: 'Add, edit and assign inventory items' },
      { id: 'view_inventory', label: 'View Inventory', desc: 'Browse inventory and view stock levels' },
      { id: 'view_reports', label: 'View Reports', desc: 'Access analytics and summary reports' },
      { id: 'manage_staff', label: 'Manage Staff', desc: 'Invite and manage staff members' },
      { id: 'view_own_data', label: 'View Own Data', desc: 'Access personal profile and records only' },
    ];

    const current = new Set(role.permissions);

    const content = `
      <div>
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-5);
          padding:var(--space-4);background:${cfg.bg};border-radius:var(--radius-lg);border:1px solid ${cfg.color}22;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${cfg.color}" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <div>
            <div style="font-weight:700;color:${cfg.color};">Editing: ${cfg.label}</div>
            <div style="font-size:0.78rem;color:#64748b;">Toggle permissions on or off. Changes apply immediately.</div>
          </div>
        </div>

        <div id="permissions-list" style="display:flex;flex-direction:column;gap:var(--space-2);">
          ${allPermissions.map(perm => {
      const isOn = current.has(perm.id);
      return `
              <label style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-4);
                background:${isOn ? cfg.bg : '#f8fafc'};border:1.5px solid ${isOn ? cfg.color + '44' : '#e2e8f0'};
                border-radius:var(--radius-md);cursor:pointer;transition:all 0.15s;"
                id="perm-row-${perm.id}"
                onmouseover="this.style.borderColor='${cfg.color}44'"
                onmouseout="this.style.borderColor=document.getElementById('perm-${perm.id}').checked ? '${cfg.color}44' : '#e2e8f0'">
                <input type="checkbox" id="perm-${perm.id}" value="${perm.id}"
                  ${isOn ? 'checked' : ''}
                  style="display:none;"
                  onchange="
                    var row = document.getElementById('perm-row-${perm.id}');
                    var toggle = document.getElementById('toggle-${perm.id}');
                    if(this.checked){
                      row.style.background='${cfg.bg}';row.style.borderColor='${cfg.color}44';
                      toggle.style.background='${cfg.color}';toggle.style.justifyContent='flex-end';
                      toggle.querySelector('div').style.transform='translateX(0)';
                    } else {
                      row.style.background='#f8fafc';row.style.borderColor='#e2e8f0';
                      toggle.style.background='#cbd5e1';toggle.style.justifyContent='flex-start';
                      toggle.querySelector('div').style.transform='translateX(0)';
                    }
                  ">
                <!-- Toggle switch -->
                <div id="toggle-${perm.id}" onclick="document.getElementById('perm-${perm.id}').click()"
                  style="flex-shrink:0;width:40px;height:22px;border-radius:11px;display:flex;align-items:center;padding:2px;
                    cursor:pointer;transition:all 0.2s;justify-content:${isOn ? 'flex-end' : 'flex-start'};
                    background:${isOn ? cfg.color : '#cbd5e1'};">
                  <div style="width:18px;height:18px;background:white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
                </div>
                <div style="flex:1;">
                  <div style="font-size:0.875rem;font-weight:600;color:#1e293b;">${perm.label}</div>
                  <div style="font-size:0.76rem;color:#64748b;">${perm.desc}</div>
                </div>
              </label>
            `;
    }).join('')}
        </div>

        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6);justify-content:flex-end;">
          <button onclick="closeModal(this)"
            style="padding:9px 20px;background:white;color:#475569;border:1px solid #e2e8f0;
              border-radius:var(--radius-md);font-weight:600;font-size:0.875rem;cursor:pointer;">
            Cancel
          </button>
          <button onclick="userManagementModule.saveRolePermissions('${roleId}', this)"
            style="display:inline-flex;align-items:center;gap:8px;padding:9px 22px;
              background:${cfg.color};color:white;border:none;border-radius:var(--radius-md);
              font-weight:600;font-size:0.875rem;cursor:pointer;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Save Permissions
          </button>
        </div>
      </div>
    `;

    showModal(`Edit Permissions — ${cfg.label}`, content);
  },

  saveRolePermissions(roleId, btn) {
    const checkboxes = document.querySelectorAll('#permissions-list input[type="checkbox"]');
    const selected = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    const role = this.roles.find(r => r.id === roleId);
    if (!role) return;

    role.permissions = selected;

    // Visual feedback on button
    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Saved!';

    this.logAuditEvent('role_permissions_updated', roleId,
      `Permissions for ${role.name} updated: [${selected.join(', ')}]`);
    writeAuditLog('role_permissions_updated', roleId, `${role.name} permissions: [${selected.join(', ')}]`);

    closeModal(btn);
    showToast(`${role.name} permissions updated successfully`, 'success');

    // Re-render the roles tab to reflect changes
    const container = document.querySelector('.module-container')?.parentElement ||
      document.getElementById('main-content');
    this.init(container);
  },

  // ============================================
  // AUDIT TRAIL TAB
  // ============================================
  renderAuditTab() {
    // Kick off a live fetch and re-render once data arrives
    if (window.supabaseReady) {
      const container = this._container;
      // Show placeholder (spinner) immediately while fetch is in progress
      const contentEl = container?.querySelector('.tab-content');

      // Fetch live from Supabase — ensures all admins see each other's activity
      supabaseClient
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500)
        .then(({ data, error }) => {
          if (!error && data) {
            this.auditLogs = data;
          } else {
            // Fall back to cache
            this.auditLogs = dataManager.getAll('auditLogs') || [];
            this.auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          }
          // Re-render just the tab content if container still live
          const live = this._container?.querySelector('.tab-content');
          if (live) live.innerHTML = this._renderAuditTabContent();
        })
        .catch(() => {
          this.auditLogs = dataManager.getAll('auditLogs') || [];
          this.auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          const live = this._container?.querySelector('.tab-content');
          if (live) live.innerHTML = this._renderAuditTabContent();
        });
    } else {
      // Offline / localStorage mode
      this.auditLogs = dataManager.getAll('auditLogs') || [];
      this.auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Return stub with spinner — will be replaced when fetch completes
    const logs = this.auditLogs.slice(0, 100);
    const isLoading = window.supabaseReady && logs.length === 0;

    return this._renderAuditTabContent(isLoading);
  },

  /** Internal renderer — called both on initial render and after live fetch resolves. */
  _renderAuditTabContent(isLoading = false) {
    const query = (this._auditSearch || '').toLowerCase();
    const filtered = query
      ? this.auditLogs.filter(l =>
          (l.action||'').toLowerCase().includes(query) ||
          (l.performed_by||'').toLowerCase().includes(query) ||
          (l.target||'').toLowerCase().includes(query) ||
          (l.details||'').toLowerCase().includes(query))
      : this.auditLogs;
    const logs = filtered.slice(0, 500);

    return `
      <div class="card" style="border:1px solid #e2e8f0;border-radius:var(--radius-xl);overflow:hidden;">
        <!-- Header Section -->
        <div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);padding:var(--space-5);color:white;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--space-4);">
            <div style="flex:1;min-width:250px;">
              <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <h3 style="margin:0;font-size:1.25rem;font-weight:700;">Security &amp; Audit Trail</h3>
              </div>
              <p style="margin:0;font-size:0.875rem;opacity:0.9;">
                ${isLoading ? 'Loading activity logs…' : `${this.auditLogs.length} event${this.auditLogs.length !== 1 ? 's' : ''} recorded across all modules`}
              </p>
              <div style="margin-top:var(--space-3);">
                <input type="text" placeholder="Search logs…" value="${this._auditSearch||''}"
                  oninput="userManagementModule._auditSearch=this.value; const live=userManagementModule._container?.querySelector('.tab-content'); if(live) live.innerHTML=userManagementModule._renderAuditTabContent();"
                  style="width:100%;max-width:320px;padding:8px 12px;border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.15);color:white;font-size:0.85rem;outline:none;"
                  placeholder="Search by action, user, target…">
              </div>
            </div>
            <div style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap;">
              <button onclick="userManagementModule.refreshAuditLogs()"
                style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;
                  background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.3);
                  border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;cursor:pointer;
                  backdrop-filter:blur(10px);transition:all 0.2s;"
                onmouseover="this.style.background='rgba(255,255,255,0.3)';this.style.borderColor='rgba(255,255,255,0.5)'"
                onmouseout="this.style.background='rgba(255,255,255,0.2)';this.style.borderColor='rgba(255,255,255,0.3)'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Refresh
              </button>
              <button onclick="userManagementModule.exportAuditLogs()"
                style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;
                  background:white;color:#667eea;border:1px solid white;
                  border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;cursor:pointer;
                  transition:all 0.2s;"
                onmouseover="this.style.background='#f8f9ff';this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'"
                onmouseout="this.style.background='white';this.style.transform='translateY(0)';this.style.boxShadow='none'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>

        <!-- Content Section -->
        <div style="padding:var(--space-5);">
          ${isLoading ? `
            <div style="display:flex;justify-content:center;align-items:center;padding:var(--space-10);">
              <div class="spinner"></div>
            </div>
          ` : `
            ${logs.length === 0 ? `
              <div style="text-align:center;padding:var(--space-10);color:#94a3b8;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
                  style="margin:0 auto var(--space-4);display:block;opacity:0.3;">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <p style="margin:0 0 8px;font-weight:700;font-size:1.1rem;color:#64748b;">No audit logs yet</p>
                <p style="margin:0;font-size:0.875rem;">User actions will be logged here for security tracking</p>
              </div>
            ` : `
              <!-- Column Headers -->
              <div style="display:grid;grid-template-columns:auto 1.5fr 1fr 2fr 120px 140px;gap:var(--space-3);
                padding:var(--space-3) var(--space-4);background:#f8fafc;border-radius:var(--radius-md);
                margin-bottom:var(--space-3);font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;
                letter-spacing:0.5px;">
                <div>Type</div>
                <div>Action</div>
                <div>Target</div>
                <div>Details</div>
                <div style="text-align:right;">IP Address</div>
                <div style="text-align:right;">Timestamp</div>
              </div>

              <!-- Log Rows -->
              <div style="display:grid;gap:var(--space-2);max-height:600px;overflow-y:auto;">
                ${logs.map(log => this.renderAuditLogRow(log)).join('')}
              </div>

              ${filtered.length > 500 ? `
                <div style="margin-top:var(--space-5);padding:var(--space-4);background:#f8fafc;
                  border-radius:var(--radius-md);text-align:center;font-size:0.875rem;color:#64748b;">
                  <strong>Showing 500 of ${filtered.length} total events.</strong> Export to view all records.
                </div>
              ` : ''}
            `}
          `}
        </div>
      </div>
    `;
  },

  /** Live-refresh the audit log by re-opening the tab */
  refreshAuditLogs() {
    this.switchTab('audit');
  },



  renderAuditLogRow(log) {
    const action = (log.action || '').toLowerCase();
    // Dynamic color/icon based on action category
    let cfg;
    if (action.includes('delete') || action.includes('clear') || action.includes('reject') || action.includes('suspend') || action.includes('remov')) {
      cfg = { color: '#dc2626', bg: '#fef2f2', icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>' };
    } else if (action.includes('creat') || action.includes('add') || action.includes('enroll') || action.includes('approv') || action.includes('admit')) {
      cfg = { color: '#16a34a', bg: '#f0fdf4', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>' };
    } else if (action.includes('update') || action.includes('edit') || action.includes('chang') || action.includes('modif') || action.includes('save') || action.includes('grade')) {
      cfg = { color: '#d97706', bg: '#fffbeb', icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' };
    } else if (action.includes('pay') || action.includes('fee') || action.includes('verif')) {
      cfg = { color: '#0891b2', bg: '#ecfeff', icon: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>' };
    } else if (action.includes('login') || action.includes('signin') || action.includes('auth')) {
      cfg = { color: '#6366f1', bg: '#eef2ff', icon: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>' };
    } else if (action.includes('logout') || action.includes('signout')) {
      cfg = { color: '#64748b', bg: '#f8fafc', icon: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>' };
    } else if (action.includes('export') || action.includes('download') || action.includes('backup')) {
      cfg = { color: '#7c3aed', bg: '#f5f3ff', icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' };
    } else if (action.includes('invit')) {
      cfg = { color: '#0891b2', bg: '#ecfeff', icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' };
    } else {
      cfg = { color: '#64748b', bg: '#f8fafc', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' };
    }
    const actor = log.actor || log.performed_by || 'System';
    const actionLabel = (log.action || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return `
      <div style="display:grid;grid-template-columns:auto 1.5fr 1fr 2fr 120px 140px;gap:var(--space-3);
        align-items:center;padding:var(--space-3) var(--space-4);
        background:white;border:1px solid #f1f5f9;border-radius:var(--radius-lg);
        transition:all 0.2s;cursor:default;"
        onmouseover="this.style.background='#f8fafc';this.style.borderColor='#e2e8f0';this.style.boxShadow='0 2px 4px rgba(0,0,0,0.05)'"
        onmouseout="this.style.background='white';this.style.borderColor='#f1f5f9';this.style.boxShadow='none'">

        <!-- Action icon -->
        <div style="width:40px;height:40px;border-radius:var(--radius-md);
          background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}22;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${cfg.icon}</svg>
        </div>

        <!-- Action label + actor -->
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:0.875rem;color:#1e293b;margin-bottom:2px;">
            ${actionLabel}
          </div>
          <div style="font-size:0.75rem;color:#64748b;">
            by <strong style="color:#475569;">${actor}</strong>
          </div>
        </div>

        <!-- Target -->
        <div style="min-width:0;font-size:0.8rem;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${log.target || '—'}">
          ${log.target || '—'}
        </div>

        <!-- Details -->
        <div style="min-width:0;font-size:0.8rem;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${log.details || '—'}">
          ${log.details || '—'}
        </div>

        <!-- IP Address -->
        <div style="font-size:0.75rem;color:#64748b;font-family:monospace;text-align:right;
          background:#f8fafc;padding:4px 8px;border-radius:4px;">
          ${log.ipAddress || 'N/A'}
        </div>

        <!-- Timestamp -->
        <div style="font-size:0.75rem;color:#64748b;text-align:right;white-space:nowrap;">
          <div style="font-weight:600;color:#475569;margin-bottom:2px;">
            ${new Date(log.timestamp).toLocaleDateString()}
          </div>
          <div style="font-size:0.7rem;">
            ${new Date(log.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    `;
  },

  loadAuditLogs() {
    // Load from Supabase via dataManager
    this.auditLogs = dataManager.getAll('auditLogs') || [];

    // Sort by timestamp descending
    this.auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  async logAuditEvent(action, target, details) {
    const session = authManager.getSession();
    const log = {
      action: action,
      performed_by: session ? session.fullName : 'System',
      target: target,
      details: details,
      timestamp: new Date().toISOString()
    };

    this.auditLogs.unshift(log);
    await dataManager.create('auditLogs', log);
  },

  exportAuditLogs() {
    const csv = [
      ['Timestamp', 'Performed By', 'Action', 'Target', 'Details'],
      ...this.auditLogs.map(log => [
        new Date(log.timestamp).toLocaleString(),
        `"${(log.performed_by || log.actor || 'System').replace(/"/g, '""')}"`,
        log.action || '',
        `"${(log.target || '').replace(/"/g, '""')}"`,
        `"${(log.details || '').replace(/"/g, '""')}"`
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Audit logs exported successfully', 'success');
  },

  // ============================================
  // NEW MODAL FUNCTIONS
  // ============================================
  showInviteModal() {
    const content = `
      <form id="invite-user-form" onsubmit="userManagementModule.submitInvitation(event)">
        <div class="form-group">
          <label class="form-label">Role *</label>
          <select class="form-select" name="role" required onchange="userManagementModule.onInviteRoleChange(this.value)">
            <option value="">Select Role</option>
            <option value="admin">Administrator</option>
            <option value="teacher">Teacher</option>
            <option value="staff">Staff</option>
            <option value="student">Student</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" class="form-input" name="fullName" required placeholder="Full name">
        </div>

        <div class="form-group">
          <label class="form-label">Email Address *</label>
          <input type="email" class="form-input" name="email" required placeholder="user@example.com">
          <small style="color: var(--text-secondary); font-size: 0.8rem;">Invitation with login credentials will be sent to this email</small>
        </div>

        <!-- Student-specific fields (hidden by default) -->
        <div id="invite-student-fields" style="display: none;">
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label class="form-label">Grade *</label>
              <select class="form-select" name="grade">
                ${schoolConfig.gradeOptionsHTML()}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Section *</label>
              <select class="form-select" name="section">
                <option value="">Select Section</option>
                ${['A', 'B', 'C', 'D'].map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Date of Birth *</label>
            <input type="date" class="form-input" name="dateOfBirth">
            <small style="color: var(--text-secondary); font-size: 0.8rem;">Used to generate default password (DDMMYYYY)</small>
          </div>
        </div>

        <!-- Staff/Admin fields (hidden by default) -->
        <div id="invite-staff-fields" style="display: none;">
          <div class="form-group">
            <label class="form-label">Department</label>
            <input type="text" class="form-input" name="department" placeholder="e.g., Mathematics, Administration">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Invitation Expiry</label>
          <select class="form-select" name="expiryDays">
            <option value="7">7 days</option>
            <option value="14" selected>14 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        <div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
            📧 An email with login credentials and a portal link will be sent to the invitee.
            The account will be active immediately.
          </p>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="invite-submit-btn">✉️ Send Invite</button>
        </div>
      </form>
    `;

    showModal('Send Invite', content);
  },

  onInviteRoleChange(role) {
    const studentFields = document.getElementById('invite-student-fields');
    const staffFields = document.getElementById('invite-staff-fields');

    if (studentFields) {
      studentFields.style.display = role === 'student' ? 'block' : 'none';
      // Toggle required on student fields
      studentFields.querySelectorAll('select, input').forEach(el => {
        if (role === 'student') el.setAttribute('required', '');
        else el.removeAttribute('required');
      });
    }
    if (staffFields) {
      staffFields.style.display = (role === 'admin' || role === 'teacher' || role === 'staff') ? 'block' : 'none';
    }
  },

  async submitInvitation(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    const session = authManager.getSession();

    const submitBtn = document.getElementById('invite-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Validating...'; }

    try {
      // Validate email format and uniqueness
      if (typeof validationManager !== 'undefined') {
        const excludeTable = data.role === 'student' ? 'students' : 
                            (data.role === 'teacher' || data.role === 'staff') ? 'staff' : null;
        
        const validation = await validationManager.validateUserInput({
          email: data.email
        }, { checkUniqueness: true, excludeTable });

        if (!validation.isValid) {
          validation.errors.forEach(err => showToast(err.message, 'error'));
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✉️ Send Invite'; }
          return;
        }
      }

      if (submitBtn) { submitBtn.textContent = 'Creating account...'; }

      // Call unified edge function that handles everything
      const projectUrl = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
      const sbSession = window.supabaseReady ? (await supabaseClient.auth.getSession()).data.session : null;
      const accessToken = sbSession?.access_token || session?.accessToken;

      if (!projectUrl || !accessToken) {
        throw new Error('Not authenticated or Supabase not configured');
      }

      const anonKey = typeof SUPABASE_ANON !== 'undefined' ? SUPABASE_ANON : '';
      const response = await fetch(`${projectUrl}/functions/v1/create-invitation-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': anonKey
        },
        body: JSON.stringify({
          email: data.email,
          role: data.role,
          fullName: data.fullName,
          department: data.department || null,
          grade: data.grade || null,
          section: data.section || null,
          dateOfBirth: data.dateOfBirth || null,
          expiryDays: parseInt(data.expiryDays) || 14
        })
      });

      const result = await response.json();

      if (!result.success) {
        showToast(result.error || 'Failed to create invitation', 'danger');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✉️ Send Invite'; }
        return;
      }

      // Extract credentials from edge function response
      const defaultUserId = result.userId;
      const defaultPassword = result.password;
      const emailSent = result.emailSent;
      const emailMessage = result.emailMessage || '';

      // Log and refresh
      this.logAuditEvent('user_invited', data.email, `Invited as ${data.role} by ${session.fullName}`);
      writeAuditLog('user_invited', data.email, `Role: ${data.role} | Name: ${data.fullName} | invited by ${session.fullName}`);
      this._invitations = await authManager.getInvitations();
      this._users = await authManager.getUsers();

      showToast(emailSent ? 'Invitation sent successfully!' : 'Account created! Share credentials manually.', emailSent ? 'success' : 'warning');
      closeModal();

      const roleLabels = { admin: 'Administrator', teacher: 'Teacher', staff: 'Staff', student: 'Student' };
      setTimeout(() => showCredentialModal(
        data.fullName,
        data.email,
        roleLabels[data.role] || data.role,
        defaultUserId,
        defaultPassword,
        emailSent,
        emailMessage
      ), 500);

      this.switchTab('invitations');
    } catch (error) {
      console.error('Invitation error:', error);
      showToast(error.message || 'Failed to send invitation', 'danger');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✉️ Send Invite'; }
    }
  },

  // ============================================
  // EMAIL SENDING FUNCTIONALITY
  // ============================================
  async sendInvitationEmail(invitationData) {
    const emailContent = this.generateInvitationEmailHTML(invitationData);

    try {
      console.log('📧 Sending invitation email to:', invitationData.to);

      // For production: Uncomment and configure your backend email service
      /*
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getSession().token}`
        },
        body: JSON.stringify({
          to: invitationData.to,
          subject: `Invitation to Join School Portal - ${invitationData.role}`,
          html: emailContent,
          from: 'noreply@schoolportal.com'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to send email');
      }
      */

      // Development: Log email details
      this.logEmailSent(invitationData);

    } catch (error) {
      console.error('Email sending error:', error);
      showToast('Invitation created but email may not have been sent', 'warning');
    }
  },

  generateInvitationEmailHTML(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>School Portal Invitation</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🎓 School Portal Invitation</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">You've been invited to join our school portal</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello <strong>${data.fullName}</strong>,</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              ${data.invitedBy} has invited you to join the school portal as a <strong>${data.role}</strong>.
              ${data.department ? `You will be part of the <strong>${data.department}</strong> department.` : ''}
            </p>
            
            <!-- Credentials Box -->
            <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <h3 style="margin: 0 0 15px 0; color: #667eea;">Your Login Credentials</h3>
              <p style="margin: 10px 0;"><strong>Access ID:</strong> <code style="background: white; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${data.defaultUserId}</code></p>
              <p style="margin: 10px 0;"><strong>Password:</strong> <code style="background: white; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${data.defaultPassword}</code></p>
              <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
                ⚠️ <em>You will be required to change your password on first login</em>
              </p>
            </div>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Accept Invitation</a>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Or copy and paste this link into your browser:<br>
              <a href="${data.inviteLink}" style="color: #667eea; word-break: break-all;">${data.inviteLink}</a>
            </p>
            
            <!-- Expiry Notice -->
            <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin-top: 30px;">
              <p style="margin: 0; font-size: 14px; color: #856404;">
                ⏰ <strong>Important:</strong> This invitation expires in ${data.expiryDays} days.
              </p>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="margin: 0; font-size: 14px; color: #666;">
              If you did not expect this invitation, please ignore this email.
            </p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">
              © ${new Date().getFullYear()} School Portal. All rights reserved.
            </p>
          </div>
          
        </div>
      </body>
      </html>
    `;
  },

  async logEmailSent(data) {
    await dataManager.create('emailLogs', {
      timestamp: new Date().toISOString(),
      recipient: data.to,
      recipientName: data.name,
      subject: `Invitation to Join School Portal - ${data.role}`,
      status: 'sent'
    });
  },

  showBulkInviteModal() {
    const content = `
      <div class="mb-4">
        <h4 class="font-semibold mb-3">Bulk User Invitation</h4>
        <p class="mb-4" style="color: var(--text-secondary);">Upload a CSV file with user information to send multiple invitations at once.</p>
        
        <div style="background: var(--bg-tertiary); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
          <p class="mb-2"><strong>CSV Format Required:</strong></p>
          <code style="display: block; background: var(--bg-secondary); color: var(--text-primary); padding: var(--space-3); border-radius: var(--radius-sm); font-size: 0.875rem;">
            email,fullName,role,department<br>
            john@example.com,John Doe,teacher,Mathematics<br>
            jane@example.com,Jane Smith,staff,Administration
          </code>
        </div>

        <div class="form-group">
          <label class="form-label">Upload CSV File</label>
          <input type="file" class="form-input" id="bulk-invite-file" accept=".csv" onchange="userManagementModule.handleBulkInviteFile(event)">
        </div>

        <div id="bulk-preview" style="display: none; margin-top: var(--space-4);">
          <h5 class="font-semibold mb-3">Preview</h5>
          <div id="bulk-preview-content"></div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="button" class="btn btn-primary" id="bulk-invite-submit" style="display: none;" onclick="userManagementModule.submitBulkInvitations()">
            Send Invitations
          </button>
        </div>
      </div>
    `;

    showModal('Bulk Invite Users', content);
  },

  handleBulkInviteFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target.result;
      const lines = csv.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());

      this.bulkInviteData = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        return {
          email: values[0],
          fullName: values[1],
          role: values[2],
          department: values[3] || ''
        };
      });

      document.getElementById('bulk-preview').style.display = 'block';
      document.getElementById('bulk-preview-content').innerHTML = `
        <p style="color: var(--text-secondary); margin-bottom: var(--space-3);">
          Found ${this.bulkInviteData.length} users to invite
        </p>
        <div style="max-height: 200px; overflow-y: auto; background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--radius-md);">
          ${this.bulkInviteData.map(user => `
            <div style="padding: var(--space-2); border-bottom: 1px solid var(--border-primary);">
              <strong>${user.fullName}</strong> (${user.email}) - ${user.role}
            </div>
          `).join('')}
        </div>
      `;
      document.getElementById('bulk-invite-submit').style.display = 'block';
    };
    reader.readAsText(file);
  },

  async submitBulkInvitations() {
    if (!this.bulkInviteData || this.bulkInviteData.length === 0) {
      showToast('No data to process', 'danger');
      return;
    }

    const submitBtn = document.getElementById('bulk-invite-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing...'; }

    const session = authManager.getSession();
    let successCount = 0;
    let failCount = 0;

    for (const userData of this.bulkInviteData) {
      try {
        const result = await authManager.createInvitation({
          email: userData.email,
          role: userData.role,
          fullName: userData.fullName,
          department: userData.department,
          expiryDays: 14
        });

        if (result.success) {
          this.logAuditEvent('user_invited', userData.email, `Bulk invited as ${userData.role} — ID: ${result.schoolId}`);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
      }
    }

    // Refresh caches
    // Force-refresh caches after mutation so next render is always fresh
    this._invitations = await authManager.getInvitations(true);
    this._users = await authManager.getUsers(true);

    closeModal();
    showToast(`Bulk invitation complete: ${successCount} created, ${failCount} failed`, successCount > 0 ? 'success' : 'danger');
    this.switchTab('invitations');
  },

  generateUserId(role) {
    const users = this._users;
    const roleUsers = users.filter(u => u.role === role);
    const year = new Date().getFullYear();
    const nextNumber = roleUsers.length + 1;

    const prefixes = {
      'admin': 'ADM',
      'teacher': 'TCH',
      'staff': 'STF',
      'student': 'STU'
    };

    const prefix = prefixes[role] || 'USR';
    return `${prefix}-${year}-${String(nextNumber).padStart(3, '0')}`;
  },

  viewUserDetails(userId) {
    this.viewUser(userId);
  },

  editUserRole(userId) {
    const user = this._users.find(u => u.id === userId || u.schoolId === userId);

    const content = `
      <form id="edit-role-form" onsubmit="userManagementModule.submitRoleChange(event, '${userId}')">
        <div class="mb-4">
          <p><strong>User:</strong> ${user.fullName}</p>
          <p style="color: var(--text-secondary);">${user.email}</p>
        </div>

        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" name="role" required>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
            <option value="teacher" ${user.role === 'teacher' ? 'selected' : ''}>Teacher</option>
            <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Staff</option>
            <option value="student" ${user.role === 'student' ? 'selected' : ''}>Student</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Department</label>
          <input type="text" class="form-input" name="department" value="${user.department || ''}" placeholder="e.g., Mathematics">
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Role</button>
        </div>
      </form>
    `;

    showModal('Edit User Role', content);
  },

  async submitRoleChange(event, userId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    const user = this._users.find(u => u.id === userId || u.schoolId === userId);

    await authManager.updateUser(userId, {
      role: data.role,
      department: data.department
    });
    this._users = await authManager.getUsers();

    this.logAuditEvent('role_changed', user?.email || userId, `Role changed from ${user?.role} to ${data.role}`);

    showToast('User role updated successfully', 'success');
    closeModal();
    this.switchTab('users');
  },

  async resendInvitationEmail(token) {
    const invitation = this._invitations.find(inv => inv.token === token);
    if (!invitation) {
      showToast('Invitation not found', 'danger');
      return;
    }

    try {
      showToast('Resending invitation email...', 'info');

      const session = authManager.getSession();
      const { data: { session: supabaseSession } } = await supabaseClient.auth.getSession();
      const accessToken = supabaseSession?.access_token;

      if (!accessToken) {
        showToast('Please login again to resend invitation', 'danger');
        return;
      }

      const metadata = invitation.metadata || {};
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-invitation-v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON
        },
        body: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          fullName: invitation.full_name,
          department: metadata.department,
          grade: metadata.grade,
          section: metadata.section,
          dateOfBirth: metadata.dateOfBirth,
          expiryDays: 14
        })
      });

      const result = await response.json();

      if (result.success) {
        if (result.emailSent) {
          showToast('Invitation email resent successfully!', 'success');
        } else {
          showToast(`Account exists. ${result.emailMessage}`, 'warning');
        }
        this._invitations = await authManager.getInvitations();
        this.render();
      } else {
        showToast(result.error || 'Failed to resend invitation', 'danger');
      }
    } catch (error) {
      console.error('Resend invitation error:', error);
      showToast('Failed to resend invitation email', 'danger');
    }
  },

  async resendInvitation(token) {
    const invitation = this._invitations.find(inv => inv.token === token);
    if (!invitation) {
      showToast('Invitation not found', 'danger');
      return;
    }

    const confirmed = confirm(`Resend invitation to ${invitation.full_name} (${invitation.email})?\n\nThis will create a new invitation with fresh credentials.`);
    if (!confirmed) return;

    try {
      showToast('Creating new invitation...', 'info');

      const session = authManager.getSession();
      const { data: { session: supabaseSession } } = await supabaseClient.auth.getSession();
      const accessToken = supabaseSession?.access_token;

      if (!accessToken) {
        showToast('Please login again to resend invitation', 'danger');
        return;
      }

      const metadata = invitation.metadata || {};
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-invitation-v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON
        },
        body: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          fullName: invitation.full_name,
          department: metadata.department,
          grade: metadata.grade,
          section: metadata.section,
          dateOfBirth: metadata.dateOfBirth,
          expiryDays: 14
        })
      });

      const result = await response.json();

      if (result.success) {
        const emailMessage = result.emailMessage || '';

        this.logAuditEvent('invitation_resent', invitation.email, `Resent invitation as ${invitation.role}`);
        this._invitations = await authManager.getInvitations();
        this._users = await authManager.getUsers();
        this.render();

        const credentialsContent = `
          <div style="text-align: center; padding: var(--space-6);">
            <div style="font-size: 3rem; margin-bottom: var(--space-4);">✅</div>
            <h3 style="color: var(--success); margin-bottom: var(--space-4);">Invitation Resent Successfully!</h3>
            
            <div style="background: var(--bg-secondary); padding: var(--space-4); border-radius: var(--radius-lg); margin: var(--space-4) 0;">
              <h4 style="margin-bottom: var(--space-3);">New Login Credentials</h4>
              <div style="display: grid; gap: var(--space-3); text-align: left;">
                <div>
                  <strong>Login ID:</strong>
                  <div style="font-family: monospace; font-size: 1.1rem; color: var(--primary); margin-top: var(--space-1);">${result.userId}</div>
                </div>
                <div>
                  <strong>Password:</strong>
                  <div style="font-family: monospace; font-size: 1.1rem; color: var(--primary); margin-top: var(--space-1);">${result.password}</div>
                </div>
                <div>
                  <strong>Email:</strong>
                  <div style="margin-top: var(--space-1);">${invitation.email}</div>
                </div>
              </div>
            </div>

            ${result.emailSent ? `
              <div style="background: var(--success-bg); color: var(--success); padding: var(--space-3); border-radius: var(--radius-md); margin-top: var(--space-4);">
                ✉️ ${emailMessage}
              </div>
            ` : `
              <div style="background: var(--warning-bg); color: var(--warning); padding: var(--space-3); border-radius: var(--radius-md); margin-top: var(--space-4);">
                ⚠️ ${emailMessage}<br>
                <small>Please share these credentials manually with the user.</small>
              </div>
            `}

            <button class="btn btn-primary" onclick="closeModal()" style="margin-top: var(--space-4);">
              Done
            </button>
          </div>
        `;

        showModal('Invitation Resent', credentialsContent);
      } else {
        showToast(result.error || 'Failed to resend invitation', 'danger');
      }
    } catch (error) {
      console.error('Resend invitation error:', error);
      showToast('Failed to resend invitation', 'danger');
    }
  },

  async deleteInvitation(token) {
    const invitation = this._invitations.find(inv => inv.token === token);

    if (!invitation) {
      showToast('Invitation not found', 'danger');
      return;
    }

    const isAccepted = invitation.status === 'accepted';
    const confirmMessage = isAccepted
      ? `Delete invitation and user account for ${invitation.full_name} (${invitation.email})?\n\n` +
      `This will permanently remove:\n` +
      `- The invitation record\n` +
      `- The user account (${invitation.school_id})\n` +
      `- All associated data\n\n` +
      `This action cannot be undone!`
      : `Delete invitation for ${invitation.full_name} (${invitation.email})?\n\n` +
      `This will permanently remove the invitation record.`;

    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    try {
      // 1. If invitation was accepted, call delete-user edge function for complete cleanup
      if (isAccepted && invitation.school_id) {
        const { data: { session: supabaseSession } } = await supabaseClient.auth.getSession();
        const accessToken = supabaseSession?.access_token;

        if (accessToken) {
          const delRes = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': SUPABASE_ANON
            },
            body: JSON.stringify({ schoolId: invitation.school_id })
          });
          const delData = await delRes.json();
          if (!delData.success) {
            console.warn('User deletion warning:', delData.error);
          }
        }
      }

      // 2. Delete invitation record
      const { error } = await supabaseClient
        .from('invitations')
        .delete()
        .eq('token', token);

      if (error) {
        console.error('Delete invitation error:', error);
        showToast('Failed to delete invitation', 'danger');
        return;
      }

      const action = isAccepted ? 'invitation and user account deleted' : 'invitation deleted';
      this.logAuditEvent('invitation_deleted', invitation.email, `Deleted invitation for ${invitation.full_name}${isAccepted ? ' (including user account)' : ''}`);

      this._invitations = await authManager.getInvitations();
      this._users = await authManager.getUsers();
      this.render();

      showToast(`${isAccepted ? 'Invitation and user account' : 'Invitation'} deleted successfully`, 'success');
    } catch (error) {
      console.error('Delete invitation error:', error);
      showToast('Failed to delete invitation', 'danger');
    }
  },

  viewInvitationDetails(token) {
    const invitation = this._invitations.find(inv => inv.token === token);

    if (!invitation) {
      showToast('Invitation not found', 'danger');
      return;
    }

    const content = `
      <div>
        <h4 class="font-semibold mb-4">Invitation Details</h4>
        
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p class="text-sm text-secondary mb-1">Full Name</p>
            <p class="font-semibold">${invitation.full_name || invitation.metadata?.fullName || 'N/A'}</p>
          </div>
          <div>
            <p class="text-sm text-secondary mb-1">Role</p>
            <p>${createBadge(invitation.role, this.getRoleBadgeColor(invitation.role))}</p>
          </div>
          <div>
            <p class="text-sm text-secondary mb-1">Email</p>
            <p>${invitation.email || 'N/A'}</p>
          </div>
          <div>
            <p class="text-sm text-secondary mb-1">Status</p>
            <p>${createBadge(invitation.status, invitation.status === 'accepted' ? 'success' : invitation.status === 'pending' ? 'warning' : 'danger')}</p>
          </div>
        </div>

        <div style="background: var(--bg-tertiary); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
          <p class="mb-2"><strong>Login ID:</strong> <code style="background: var(--bg-secondary); color: var(--text-primary); padding: 2px 8px; border-radius: var(--radius-sm);">${invitation.school_id || 'N/A'}</code></p>
          <p class="mb-2"><strong>Default Password:</strong> <code style="background: var(--bg-secondary); color: var(--text-primary); padding: 2px 8px; border-radius: var(--radius-sm);">${invitation.default_password || 'N/A'}</code></p>
          <p class="text-sm" style="color: var(--text-secondary); margin-top: var(--space-3);">
            📅 Expires: ${new Date(invitation.expires_at).toLocaleDateString()}
          </p>
        </div>

        <button class="btn btn-primary" onclick="navigator.clipboard.writeText('Login ID: ${invitation.school_id}\\nPassword: ${invitation.default_password}\\nPortal: ${window.location.origin}/login.html'); showToast('Credentials copied!', 'success');">
          📋 Copy Credentials
        </button>
      </div>
    `;

    showModal('Invitation Details', content);
  },

  showCreateRoleModal() {
    const allPermissions = [
      { id: 'view_students', label: 'View Students' },
      { id: 'edit_students', label: 'Edit Students' },
      { id: 'view_staff', label: 'View Staff' },
      { id: 'edit_staff', label: 'Edit Staff' },
      { id: 'view_classes', label: 'View Classes' },
      { id: 'edit_classes', label: 'Edit Classes' },
      { id: 'view_grades', label: 'View Grades' },
      { id: 'edit_grades', label: 'Edit Grades' },
      { id: 'view_fees', label: 'View Fees' },
      { id: 'edit_fees', label: 'Edit Fees' },
      { id: 'view_inventory', label: 'View Inventory' },
      { id: 'edit_inventory', label: 'Edit Inventory' },
      { id: 'view_assessments', label: 'View Assessments' },
      { id: 'edit_assessments', label: 'Edit Assessments' },
      { id: 'view_own_data', label: 'View Own Data Only' },
    ];

    const html = `
      <form id="create-role-form" onsubmit="userManagementModule.submitCreateRole(event)">
        <div style="margin-bottom:var(--space-5);">
          <label style="display:block;font-size:0.85rem;font-weight:600;color:#475569;margin-bottom:6px;">Role Name <span style="color:#ef4444;">*</span></label>
          <input type="text" name="roleName" class="form-input" placeholder="e.g. Librarian, Counselor" required
            style="width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:0.9rem;"
            oninput="document.getElementById('role-id-preview').textContent = this.value.toLowerCase().replace(/\\s+/g,'_').replace(/[^a-z0-9_]/g,'')"
          >
          <p style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">Role ID: <code id="role-id-preview" style="background:#f1f5f9;padding:1px 6px;border-radius:4px;">…</code></p>
        </div>

        <div style="margin-bottom:var(--space-5);">
          <label style="display:block;font-size:0.85rem;font-weight:600;color:#475569;margin-bottom:10px;">Permissions</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${allPermissions.map(p => `
              <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;font-size:0.85rem;color:#334155;">
                <input type="checkbox" name="permissions" value="${p.id}" style="accent-color:#667eea;width:15px;height:15px;">
                ${p.label}
              </label>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" class="btn" onclick="closeModal()" style="padding:9px 20px;border:1px solid #e2e8f0;border-radius:8px;background:white;color:#475569;font-weight:600;cursor:pointer;">Cancel</button>
          <button type="submit" class="btn btn-primary" style="padding:9px 20px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Create Role</button>
        </div>
      </form>
    `;
    showModal('🔐 Create Custom Role', html);
  },

  async submitCreateRole(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const roleName = formData.get('roleName').trim();
    const roleId = roleName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const permissions = formData.getAll('permissions');

    if (!roleId) {
      showToast('Please enter a valid role name.', 'warning');
      return;
    }

    // Check for duplicates in the in-memory roles list
    const alreadyExists = [...this._systemRoles, ...this._customRoles].some(r => r.id === roleId);
    if (alreadyExists) {
      showToast(`A role with id "${roleId}" already exists.`, 'warning');
      return;
    }

    const newRole = { id: roleId, name: roleName, permissions, custom: true, createdAt: new Date().toISOString() };

    // 1. Persist to Supabase custom_roles table
    let savedToSupabase = false;
    if (window.supabaseClient) {
      try {
        const { error } = await window.supabaseClient
          .from('custom_roles')
          .insert({
            role_id: roleId,
            role_name: roleName,
            permissions: permissions,     // stored as jsonb array
            created_at: new Date().toISOString()
          });
        if (!error) {
          savedToSupabase = true;
        } else {
          console.warn('Supabase custom_roles save failed:', error.message);
        }
      } catch (e) {
        console.warn('Supabase custom_roles error:', e);
      }
    }

    // 2. Always keep in memory (and write audit log)
    this._customRoles.push(newRole);

    writeAuditLog('CREATE_ROLE', roleId, `Custom role "${roleName}" created with ${permissions.length} permission(s).${savedToSupabase ? ' Saved to Supabase.' : ' In-memory only.'}`);
    closeModal();
    showToast(`✅ Role "${roleName}" created${savedToSupabase ? ' & saved to database' : ''}!`, 'success');

    // Re-render roles tab to show the new role
    this.switchTab('roles');
  }

};

// Expose to window for app.js router
window.userManagementModule = userManagementModule;
