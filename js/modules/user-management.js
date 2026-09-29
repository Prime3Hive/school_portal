// ============================================
// USERS & ACCESS
// Who can sign in to the portal, and what they can do.
//
// Every change to a login goes through an edge function that checks the
// caller is an admin: create-account, resend-credentials, update-account
// (suspend / restore / change role) and delete-user. The browser can no
// longer write a profile's role or status itself (migration 0032).
// ============================================

// ── Credentials dialog ──────────────────────────────────────────────────────
// Shown once, right after a password is generated. Also used by the Staff page.

/** Text the dialog's copy buttons put on the clipboard. Held here rather than
 *  in onclick attributes, where a quote in a name would break out. */
let _credentialCopies = {};

function copyCredentialText(kind) {
  const text = _credentialCopies[kind] || '';
  const done = () => showToast('Copied', 'success');
  const fail = () => showToast('Could not copy. Select the text and copy it instead.', 'warning');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fail);
  else fail();
}

function showCredentialModal(recipientName, recipientEmail, role, loginId, password, emailSent, emailMessage) {
  const school = window.schoolConfig?.name || 'TBD International Academy';
  const h = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v ?? ''));
  const portal = `${window.location.origin}/login.html`;
  const roleText = String(role || '');

  const emailBody = `Dear ${recipientName},\n\nYour ${roleText.toLowerCase()} account on the ${school} portal is ready.\n\n  Portal   : ${portal}\n  Login ID : ${loginId}\n  Password : ${password}\n\nYou will be asked to choose your own password the first time you sign in. Keep these details private.\n\n${school}`;
  const subject = `Your ${school} portal login`;
  _credentialCopies = {
    credentials: `Login ID: ${loginId}\nPassword: ${password}\nPortal: ${portal}`,
    email: emailBody
  };
  const mailto = `mailto:${encodeURIComponent(recipientEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;

  const status = emailSent
    ? `<p class="ui-chip is-good" style="margin:0">Emailed to ${h(recipientEmail)}</p>`
    : `<p class="ui-chip is-warn" style="margin:0;white-space:normal">${h(emailMessage || 'The email could not be sent.')} Give these details to the person yourself.</p>`;

  showModal(`Login ready: ${h(role)}`, `
    <div style="display:flex;flex-direction:column;gap:14px">
      ${status}
      <dl class="um-cred">
        <dt>Name</dt><dd>${h(recipientName)}</dd>
        <dt>Login ID</dt><dd><code>${h(loginId)}</code></dd>
        <dt>Password</dt><dd><code>${h(password)}</code></dd>
        <dt>Portal</dt><dd>${h(portal)}</dd>
      </dl>
      <p class="ui-row-meta" style="margin:0">This password is shown only now. They must change it when they first sign in.</p>
      <div class="ui-actions">
        <button type="button" class="ui-btn ui-btn-primary" onclick="copyCredentialText('credentials')">Copy login details</button>
        <a class="ui-btn" href="${mailto}">Open in email</a>
        <button type="button" class="ui-btn" onclick="copyCredentialText('email')">Copy a ready-made email</button>
      </div>
      <button type="button" class="ui-btn" onclick="closeModal(this)">Done</button>
    </div>`);
}

// ── CSV helpers ─────────────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, BOM. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim())) rows.push(row);
  return rows.map(r => r.map(v => v.trim()));
}

/** One CSV cell. A leading = + - @ is neutralised so a spreadsheet does not run it as a formula. */
function csvCell(value) {
  let v = String(value ?? '');
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Module ───────────────────────────────────────────────────────────────────

const userManagementModule = {
  currentTab: 'overview',
  currentFilter: 'all',
  searchQuery: '',
  currentPage: 1,
  itemsPerPage: 25,
  auditLogs: [],
  _auditState: 'idle',      // idle | loading | ready | error
  _auditError: '',
  _auditSearch: '',
  _auditCategory: 'all',

  _users: [],
  _invitations: [],
  _initId: 0,        // incremented on every init() call — stale calls self-cancel
  _container: null,

  ROLE_LABELS: { admin: 'Administrators', staff: 'Office staff', teacher: 'Teachers', guardian: 'Parents', student: 'Pupils' },
  ROLE_NAME: { admin: 'Administrator', teacher: 'Teacher', staff: 'Office staff', student: 'Pupil', guardian: 'Parent' },
  /** Roles a login can be given here. Pupils get theirs from the Pupils page
   *  or through "Give a login" on their record, so their class and fees come with it. */
  ASSIGNABLE_ROLES: ['admin', 'teacher', 'staff', 'guardian'],

  _withTimeout(promise, ms, fallback) {
    const timer = new Promise(resolve => setTimeout(() => resolve(fallback), ms));
    return Promise.race([promise, timer]);
  },

  async init(container) {
    if (!container) return;
    const myId = ++this._initId;
    this._container = container;
    const isStale = () => this._initId !== myId;

    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:400px;"><div class="spinner"></div></div>';
    this._users = [];
    this._invitations = [];
    this._auditState = 'idle';

    try {
      const [users, invitations] = await Promise.all([
        this._withTimeout(authManager.getUsers(), 10_000, authManager.getAllUsers() || []),
        this._withTimeout(authManager.getInvitations(), 10_000, [])
      ]);
      if (isStale()) return;
      this._users = users || [];
      this._invitations = invitations || [];
    } catch (e) {
      console.error('[UM] Failed to load logins:', e);
      if (isStale()) return;
      this._users = authManager.getAllUsers() || [];
    }

    try {
      await this._mergeDirectoryData();
      if (isStale()) return;
    } catch (e) {
      console.error('[UM] _mergeDirectoryData failed:', e);
      if (isStale()) return;
    }

    try {
      container.innerHTML = this.render();
    } catch (e) {
      console.error('[UM] render failed:', e);
      container.innerHTML = `<div class="ui-page"><section class="ui-card"><p class="ui-empty">This page could not be drawn: ${this._esc(e.message)}</p></section></div>`;
    }

    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = (e) => {
      if (isStale()) return;
      if (['students', 'staff', 'invitations'].includes(e.detail?.collection)) {
        this._reload().then(() => { if (!isStale()) this._rerenderAll(); });
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  /**
   * Pupil and staff records with no login, merged into this._users so the
   * lists show everyone on record. A record points at its login through
   * auth_id; one that does is not listed again.
   */
  async _mergeDirectoryData() {
    await dataManager.waitForReady();
    const studentsDir = dataManager.getAll('students');
    const staffDir = dataManager.getAll('staff');

    const seenEmails = new Set(this._users.map(u => (u.email || '').toLowerCase()).filter(Boolean));
    const seenIds = new Set(this._users.map(u => u.id).filter(Boolean));
    const loginIds = new Set(this._users.filter(u => u._source !== 'directory').map(u => u.authId).filter(Boolean));
    const hasLogin = (r) => loginIds.has(r.authId || r.auth_id);

    for (const s of (studentsDir || [])) {
      const email = (s.email || '').toLowerCase();
      if (email && seenEmails.has(email)) continue;
      if (s.id && seenIds.has(s.id)) continue;
      if (hasLogin(s)) continue;
      const uid = s.id || ('stu-' + (s.roll_no || s.rollNo || s.name?.replace(/\s+/g, '-').toLowerCase() || crypto.randomUUID()));
      this._users.push({
        id: uid,
        recordId: s.id,
        _record: 'students',
        fullName: s.name || 'Unknown pupil',
        email: s.email || '',
        role: 'student',
        status: s.status || 'active',
        grade: s.grade,
        section: s.section,
        department: s.grade ? `Grade ${s.grade}${s.section ? ' ' + s.section : ''}` : '',
        createdAt: s.admission_date || s.created_at || null,
        phone: s.phone || '',
        _source: 'directory'
      });
      if (email) seenEmails.add(email);
      seenIds.add(uid);
    }

    for (const s of (staffDir || [])) {
      const email = (s.email || '').toLowerCase();
      if (email && seenEmails.has(email)) continue;
      if (s.id && seenIds.has(s.id)) continue;
      if (hasLogin(s)) continue;
      const uid = s.id || ('stf-' + (s.email?.split('@')[0] || s.name?.replace(/\s+/g, '-').toLowerCase() || crypto.randomUUID()));
      this._users.push({
        id: uid,
        recordId: s.id,
        _record: 'staff',
        fullName: s.name || 'Unknown staff member',
        email: s.email || '',
        role: isTeachingStaff(s) ? 'teacher' : 'staff',
        status: s.status || 'active',
        department: s.role || s.position || '',
        createdAt: s.hire_date || s.created_at || null,
        phone: s.phone || '',
        _source: 'directory'
      });
      if (email) seenEmails.add(email);
      seenIds.add(uid);
    }
  },

  _esc(v) {
    return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  /** A value for a '…' string inside a double-quoted onclick="…". */
  _js(v) {
    return this._esc(escapeJs(v));
  },

  _date(v, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', opts);
  },

  _find(id) {
    return this._users.find(u => u.id === id || u.schoolId === id) || null;
  },

  /** A record merged from the students or staff table has no login behind it. */
  _hasLogin(user) {
    return !!user && user._source !== 'directory';
  },

  _isOff(u) {
    return u.status === 'inactive' || u.status === 'suspended';
  },

  _isSelf(user) {
    const me = authManager.getSession();
    return !!(me && user && (user.authId === me.supabaseId || user.schoolId === me.userId));
  },

  /** Reload logins and the merged records (getUsers alone drops the records). */
  async _reload() {
    this._users = await authManager.getUsers(true) || [];
    await this._mergeDirectoryData();
  },

  /**
   * The figures at the top. Logins (profiles) are counted apart from pupil
   * and staff records that have no login.
   */
  figures(users = this._users) {
    const accounts = users.filter(u => u._source !== 'directory');
    const noLogin = users.filter(u => u._source === 'directory' && String(u.status || 'active').toLowerCase() === 'active');
    const off = (u) => this._isOff(u);
    const roles = ['admin', 'staff', 'teacher', 'guardian', 'student'];
    return {
      accounts: accounts.length,
      signedIn: accounts.filter(u => !off(u) && u.lastLogin).length,
      neverSignedIn: accounts.filter(u => !off(u) && !u.lastLogin).length,
      tempPassword: accounts.filter(u => !off(u) && u.lastLogin && u.mustChangePassword).length,
      suspended: accounts.filter(off).length,
      noLogin: noLogin.length,
      byRole: roles.map(r => ({
        role: r,
        accounts: accounts.filter(u => u.role === r).length,
        noLogin: noLogin.filter(u => u.role === r).length
      })).filter(x => x.accounts || x.noLogin)
    };
  },

  // ============================================
  // FRAME
  // ============================================
  render() {
    if (!authManager.hasPermission('all')) {
      return `<div class="ui-page"><section class="ui-card"><h2 class="ui-card-title">Not available</h2><p class="ui-empty">Only administrators can manage logins.</p></section></div>`;
    }
    return `
      <div class="ui-page um-page">
        ${this.renderHeader()}
        ${this.renderStats()}
        ${this.renderTabs()}
        <div class="um-tab-content">${this.renderTabContent()}</div>
      </div>`;
  },

  renderHeader() {
    return `
      <div class="ui-page-head">
        <div>
          <h1 class="ui-page-title">Users &amp; access</h1>
          <p class="ui-page-sub">Who can sign in to the portal, and what they can do</p>
        </div>
        <div class="ui-actions">
          <button type="button" class="ui-btn" onclick="userManagementModule.showBulkInviteModal()">Add many</button>
          <button type="button" class="ui-btn ui-btn-primary" onclick="userManagementModule.showInviteModal()">Give someone a login</button>
        </div>
      </div>`;
  },

  renderStats() {
    const f = this.figures();
    const kpi = (label, value, sub, onclick) => `
      <button type="button" class="ui-card ui-kpi" onclick="${onclick}">
        <span class="ui-kpi-label">${label}</span><span class="ui-kpi-value">${value}</span><span class="ui-kpi-sub">${sub}</span>
      </button>`;
    return `
      <div class="ui-grid-4">
        ${kpi('Logins', f.accounts, `${f.signedIn} have signed in`, "userManagementModule.switchTab('users')")}
        ${kpi('Never signed in', f.neverSignedIn, f.neverSignedIn ? 'details may not have reached them' : 'everyone has signed in', "userManagementModule.switchTab('invitations')")}
        ${kpi('Suspended', f.suspended, 'cannot sign in', "userManagementModule.switchTab('suspended')")}
        ${kpi('No login yet', f.noLogin, 'pupils and staff on record', "userManagementModule.showFiltered('nologin')")}
      </div>`;
  },

  renderTabs() {
    const tabs = [['overview', 'Overview'], ['users', 'Everyone'], ['students', 'Pupils'], ['invitations', 'Logins issued'],
      ['roles', 'Roles'], ['suspended', 'Suspended'], ['audit', 'Activity log']];
    return `
      <div role="tablist" aria-label="Users" class="sr-tabs um-tabs">
        ${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${this.currentTab === id}" class="sr-tab${this.currentTab === id ? ' is-on' : ''}" onclick="userManagementModule.switchTab('${id}')">${label}</button>`).join('')}
      </div>`;
  },

  switchTab(tab) {
    // A new tab starts with an empty search and page 1.
    if (tab !== this.currentTab) {
      this.searchQuery = '';
      this.currentPage = 1;
      this.currentFilter = 'all';
    }
    this.currentTab = tab;
    this._rerenderAll();
  },

  _rerenderAll() {
    if (this._container) this._container.innerHTML = this.render();
  },

  /** Open Everyone with one filter applied, e.g. from a figure at the top. */
  showFiltered(filter) {
    this.switchTab('users');
    this.currentFilter = filter;
    this._rerenderTab();
  },

  /**
   * Redraw the tab below the tabs, keeping the cursor where it was. The search
   * boxes live inside this area, so without this every keystroke dropped focus.
   */
  _rerenderTab() {
    const contentEl = this._container?.querySelector('.um-tab-content');
    if (!contentEl) return this._rerenderAll();
    const active = document.activeElement;
    const focusId = active && contentEl.contains(active) ? active.id : '';
    const caret = focusId && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    contentEl.innerHTML = this.renderTabContent();
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus();
        if (caret !== null && el.setSelectionRange) el.setSelectionRange(caret, caret);
      }
    }
  },

  onSearch(value) {
    this.searchQuery = value;
    this.currentPage = 1;
    this._rerenderTab();
  },

  _matchesSearch(u) {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [u.fullName, u.email, u.id, u.department].some(v => String(v || '').toLowerCase().includes(q));
  },

  /** Whether a listed person passes the Everyone tab's filter. */
  _matchesFilter(u, filter = this.currentFilter) {
    const off = this._isOff(u);
    switch (filter) {
      case 'all': return true;
      case 'nologin': return !this._hasLogin(u) && String(u.status || 'active').toLowerCase() === 'active';
      case 'suspended': return this._hasLogin(u) && off;
      case 'active': return !off;
      default: return u.role === filter;
    }
  },

  _searchBox(placeholder) {
    return `
      <label class="sd-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" id="um-search" placeholder="${placeholder}" aria-label="${placeholder}"
          value="${this._esc(this.searchQuery)}" oninput="userManagementModule.onSearch(this.value)">
      </label>`;
  },

  renderTabContent() {
    switch (this.currentTab) {
      case 'overview': return this.renderOverviewTab();
      case 'users': return this.renderUsersTab();
      case 'students': return this.renderStudentsTab();
      case 'invitations': return this.renderInvitationsTab();
      case 'roles': return this.renderRolesTab();
      case 'suspended': return this.renderSuspendedTab();
      case 'audit': return this.renderAuditTab();
      default: return '';
    }
  },

  /** The state shown on a row, from the login if there is one. */
  _state(user) {
    if (!this._hasLogin(user)) {
      return this._isOff(user) ? { label: user.role === 'student' ? 'Withdrawn' : 'Inactive', tone: '' } : { label: 'No login', tone: '' };
    }
    if (this._isOff(user)) return { label: 'Suspended', tone: 'is-warn' };
    if (!user.lastLogin) return { label: 'Never signed in', tone: 'is-warn' };
    if (user.mustChangePassword) return { label: 'Temporary password', tone: 'is-warn' };
    return { label: 'Active', tone: 'is-good' };
  },

  _avatar(name) {
    return `<span class="sd-avatar" aria-hidden="true">${this._esc(String(name || '?').trim().charAt(0).toUpperCase())}</span>`;
  },

  _list(rows, empty) {
    return rows.length ? rows.join('') : `<p class="ui-empty">${empty}</p>`;
  },

  // ============================================
  // OVERVIEW
  // ============================================
  renderOverviewTab() {
    const f = this.figures();
    const accounts = this._users.filter(u => this._hasLogin(u));
    const recent = [...accounts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6);
    const waiting = accounts.filter(u => !this._isOff(u) && !u.lastLogin)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)).slice(0, 6);
    const top = Math.max(1, ...f.byRole.map(r => r.accounts + r.noLogin));
    const row = (u, meta) => `
      <div class="ui-row">
        ${this._avatar(u.fullName)}
        <div class="ui-row-main">
          <div class="ui-row-title">${this._esc(u.fullName || 'Unnamed')}</div>
          <div class="ui-row-meta">${this._esc([this.ROLE_NAME[u.role] || u.role, u.id, meta].filter(Boolean).join(' · '))}</div>
        </div>
        <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.viewUser('${this._js(u.id)}')">View</button>
      </div>`;

    return `
      <div class="ui-grid-3" style="margin-top:16px;">
        <section class="ui-card">
          <div class="ui-card-head"><h2 class="ui-card-title">By role</h2><span class="ui-card-note">with a login / on record only</span></div>
          ${f.byRole.map(r => `
            <div class="um-role">
              <div class="um-role-top"><span>${this.ROLE_LABELS[r.role] || this._esc(r.role)}</span><strong>${r.accounts}${r.noLogin ? ` <span class="ui-row-meta">+ ${r.noLogin} no login</span>` : ''}</strong></div>
              <div class="um-bar"><span style="width:${(r.accounts / top) * 100}%"></span><i style="width:${(r.noLogin / top) * 100}%"></i></div>
            </div>`).join('') || '<p class="ui-empty">No one yet.</p>'}
        </section>

        <section class="ui-card">
          <div class="ui-card-head"><h2 class="ui-card-title">Not signed in yet</h2><button type="button" class="ui-link" onclick="userManagementModule.switchTab('invitations')">All logins issued</button></div>
          ${this._list(waiting.map(u => row(u, u.createdAt ? `issued ${this._date(u.createdAt, { day: 'numeric', month: 'short' })}` : '')), 'Everyone with a login has signed in.')}
        </section>

        <section class="ui-card">
          <div class="ui-card-head"><h2 class="ui-card-title">Newest logins</h2><button type="button" class="ui-link" onclick="userManagementModule.switchTab('users')">Everyone</button></div>
          ${this._list(recent.map(u => row(u, u.lastLogin ? 'has signed in' : 'not signed in')), 'No logins yet.')}
        </section>
      </div>`;
  },

  // ============================================
  // EVERYONE
  // ============================================
  renderUsersTab() {
    const filtered = this._users.filter(u => this._matchesSearch(u) && this._matchesFilter(u))
      // Newest first; records with no date go last rather than looking brand new.
      .sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : -Infinity) - (a.createdAt ? new Date(a.createdAt).getTime() : -Infinity));

    const pages = Math.max(1, Math.ceil(filtered.length / this.itemsPerPage));
    if (this.currentPage > pages) this.currentPage = pages;
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const page = filtered.slice(start, start + this.itemsPerPage);
    const filters = [['all', 'Everyone'], ['admin', 'Administrators'], ['teacher', 'Teachers'], ['staff', 'Office staff'],
      ['student', 'Pupils'], ['guardian', 'Parents'], ['active', 'Active only'], ['suspended', 'Suspended logins'], ['nologin', 'No login yet']];

    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="sd-filters">
          ${this._searchBox('Search by name, email or ID')}
          <select class="sd-select" aria-label="Show" onchange="userManagementModule.currentFilter = this.value; userManagementModule.currentPage = 1; userManagementModule._rerenderTab()">
            ${filters.map(([v, label]) => `<option value="${v}" ${this.currentFilter === v ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <select class="sd-select" aria-label="Per page" onchange="userManagementModule.itemsPerPage = parseInt(this.value, 10); userManagementModule.currentPage = 1; userManagementModule._rerenderTab()">
            ${[10, 25, 50].map(n => `<option value="${n}" ${this.itemsPerPage === n ? 'selected' : ''}>${n} a page</option>`).join('')}
          </select>
        </div>
        <p class="ui-row-meta" style="padding:0 14px;">${filtered.length ? `${start + 1}–${Math.min(start + this.itemsPerPage, filtered.length)} of ${filtered.length}` : ''}</p>
        ${this._list(page.map(u => this.renderUserRow(u)), 'No one matches. Try another search or filter.')}
        ${pages > 1 ? `
          <div class="ui-actions" style="justify-content:space-between;padding:12px 14px;">
            <button type="button" class="ui-btn ui-btn-sm" ${this.currentPage === 1 ? 'disabled' : ''} onclick="userManagementModule.currentPage--; userManagementModule._rerenderTab()">Previous</button>
            <span class="ui-row-meta">Page ${this.currentPage} of ${pages}</span>
            <button type="button" class="ui-btn ui-btn-sm" ${this.currentPage === pages ? 'disabled' : ''} onclick="userManagementModule.currentPage++; userManagementModule._rerenderTab()">Next</button>
          </div>` : ''}
      </section>`;
  },

  renderUserRow(user) {
    const e = (v) => this._esc(v ?? '');
    const id = this._js(user.id);
    const login = this._hasLogin(user);
    const off = this._isOff(user);
    const state = this._state(user);
    const when = login && user.lastLogin ? `last in ${this._date(user.lastLogin, { day: 'numeric', month: 'short' })}` : '';
    const self = this._isSelf(user);
    return `
      <div class="ui-row um-row">
        ${this._avatar(user.fullName)}
        <div class="ui-row-main">
          <div class="ui-row-title">${e(user.fullName || 'Unnamed')}${self ? ' <span class="ui-row-meta">(you)</span>' : ''}</div>
          <div class="ui-row-meta">${e([this.ROLE_NAME[user.role] || user.role, login ? user.id : '', user.email, user.department, when].filter(x => String(x || '').trim()).join(' · '))}</div>
        </div>
        <span class="ui-chip ${state.tone}">${state.label}</span>
        <div class="ui-actions um-actions">
          <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.viewUser('${id}')">View</button>
          ${login ? (self ? '' : `
            <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.editUserRole('${id}')">Role</button>
            ${off ? '' : `<button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.resendCredentials('${this._js(user.schoolId || user.id)}')">New password</button>`}
            <button type="button" class="ui-btn ui-btn-sm${off ? '' : ' pc-danger'}" onclick="userManagementModule.toggleUserStatus('${id}')">${off ? 'Restore' : 'Suspend'}</button>`)
          : (off ? '' : `<button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.giveLogin('${id}')">Give a login</button>`)}
        </div>
      </div>`;
  },

  // ============================================
  // PUPILS
  // ============================================
  renderStudentsTab() {
    const pupils = this._users.filter(u => u.role === 'student' && this._matchesSearch(u))
      .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="sd-filters">${this._searchBox('Search pupils')}</div>
        <p class="ui-row-meta" style="padding:0 14px;">${pupils.length} pupil${pupils.length === 1 ? '' : 's'}. New pupils are added from Students → Add student, which also sets up their fees and subjects.</p>
        ${this._list(pupils.map(u => this.renderStudentRow(u)), 'No pupils match.')}
      </section>`;
  },

  renderStudentRow(user) {
    const e = (v) => this._esc(v ?? '');
    const id = this._js(user.id);
    const record = this._studentRecordFor(user);
    const withdrawn = String(record?.status || user.status || 'active') !== 'active';
    const state = this._hasLogin(user) || !withdrawn ? this._state(user) : { label: 'Withdrawn', tone: '' };
    const grade = record?.grade ?? user.grade;
    const section = record?.section ?? user.section;
    return `
      <div class="ui-row um-row">
        ${this._avatar(user.fullName)}
        <div class="ui-row-main">
          <div class="ui-row-title">${e(user.fullName || 'Unnamed')}</div>
          <div class="ui-row-meta">${e([this._hasLogin(user) ? user.id : '', grade ? `Grade ${grade}${section ? ' ' + section : ''}` : '', user.email].filter(Boolean).join(' · '))}</div>
        </div>
        <span class="ui-chip ${state.tone}">${state.label}</span>
        <div class="ui-actions um-actions">
          <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.viewUser('${id}')">View</button>
          ${record && !withdrawn ? `
            <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.editStudent('${id}')">Change class</button>
            ${this._hasLogin(user) ? '' : `<button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.giveLogin('${id}')">Give a login</button>`}
            <button type="button" class="ui-btn ui-btn-sm pc-danger" onclick="userManagementModule.deleteStudent('${id}')">Withdraw</button>` : ''}
        </div>
      </div>`;
  },

  /**
   * The students-table row behind a listed pupil. A merged record's id is the
   * row id; a login points at its row through auth_id.
   */
  _studentRecordFor(user) {
    if (!user) return null;
    const rows = dataManager.getAll('students') || [];
    if (!this._hasLogin(user)) return rows.find(s => s.id === user.id) || null;
    return rows.find(s => user.authId && (s.authId || s.auth_id) === user.authId) || null;
  },

  editStudent(userId) {
    const user = this._find(userId);
    if (!user) { showToast('Pupil not found', 'danger'); return; }
    const record = this._studentRecordFor(user);
    if (!record) { showToast(`${user.fullName} has no student record to edit.`, 'info'); return; }

    showModal(`Change class: ${this._esc(user.fullName)}`, `
      <form id="edit-student-form" onsubmit="userManagementModule.submitEditStudent(event, '${this._js(userId)}')">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Grade</label>
            <select class="form-select" name="grade">${schoolConfig.gradeOptionsHTML(record.grade)}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Section</label>
            <select class="form-select" name="section">
              ${['A', 'B', 'C', 'D'].map(s => `<option value="${s}" ${record.section === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>`);
  },

  // Grade and section live on the students row, not on the login's profile.
  async submitEditStudent(event, userId) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const user = this._find(userId);
    const record = this._studentRecordFor(user);
    if (!record) { showToast('Not changed: this pupil has no student record to update.', 'danger'); return; }

    const saved = await dataManager.update('students', record.id, { grade: data.grade, section: data.section });
    if (!saved) { showToast('Not changed: the student record could not be saved.', 'danger'); return; }
    await this._reload();

    showToast('Pupil updated', 'success');
    writeAuditLog('EDIT_STUDENT', userId, `Grade: ${data.grade} | Section: ${data.section}`);
    closeModal();
    this.switchTab('students');
  },

  // Withdrawal marks the student record inactive and suspends the login if
  // there is one; it deletes nothing.
  async deleteStudent(userId) {
    const user = this._find(userId);
    const record = this._studentRecordFor(user);
    if (!record) { showToast('Not changed: this pupil has no student record.', 'danger'); return; }
    const login = this._hasLogin(user);
    if (!confirm(`Withdraw ${user.fullName}? Their record is kept but marked inactive${login ? ', and their login is suspended' : ''}.`)) return;

    const saved = await dataManager.update('students', record.id, { status: 'inactive' });
    if (!saved) { showToast('Not changed: the student record could not be saved.', 'danger'); return; }
    if (login && !this._isOff(user)) {
      const result = await authManager.updateAccount(user.schoolId, 'suspend');
      if (!result?.success) showToast('Record withdrawn, but the login was not suspended: ' + (result?.error || 'unknown error'), 'warning');
    }
    await this._reload();
    showToast(`${user.fullName} withdrawn`, 'success');
    writeAuditLog('WITHDRAW_STUDENT', userId, `Student record set to inactive${login ? '; login suspended' : ''}`);
    this.switchTab('students');
  },

  // ============================================
  // LOGINS ISSUED
  //
  // Every row is a login an admin created. Nothing waits to be accepted: the
  // question is "have they used it yet?", read from the profile's last_login.
  // ============================================

  /** Pair an issuance row with the account it created. */
  _accountFor(invitation) {
    return this._users.find(u => u.schoolId && u.schoolId === invitation.school_id) || null;
  },

  _issuedState(invitation) {
    const user = this._accountFor(invitation);
    if (!user) return 'deleted';
    if (this._isOff(user)) return 'suspended';
    return user.lastLogin ? 'active' : 'never';
  },

  ISSUED_STATES: {
    active: { label: 'Signed in', tone: 'is-good' },
    never: { label: 'Never signed in', tone: 'is-warn' },
    suspended: { label: 'Suspended', tone: 'is-warn' },
    deleted: { label: 'Login deleted', tone: '' }
  },

  renderInvitationsTab() {
    const q = this.searchQuery.trim().toLowerCase();
    const rows = this._invitations.filter(inv => !q ||
      [inv.full_name, inv.email, inv.school_id].some(v => String(v || '').toLowerCase().includes(q)));
    const count = (s) => this._invitations.filter(inv => this._issuedState(inv) === s).length;
    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="sd-filters">${this._searchBox('Search logins issued')}</div>
        <p class="ui-row-meta" style="padding:0 14px;">
          ${this._invitations.length} issued · ${count('active')} signed in · ${count('never')} never signed in · ${count('suspended')} suspended · ${count('deleted')} deleted
        </p>
        ${this._list(rows.map(inv => this.renderInvitationRow(inv)), this._invitations.length ? 'None match.' : 'No logins issued yet.')}
      </section>`;
  },

  renderInvitationRow(invitation) {
    const e = (v) => this._esc(v ?? '');
    const user = this._accountFor(invitation);
    const state = this.ISSUED_STATES[this._issuedState(invitation)];
    const token = this._js(invitation.token);
    const name = invitation.full_name || invitation.metadata?.fullName || 'Unnamed';
    const meta = [this.ROLE_NAME[invitation.role] || invitation.role, invitation.school_id, invitation.email,
      `issued ${this._date(invitation.created_at)}`, user?.lastLogin ? `last in ${this._date(user.lastLogin)}` : ''];
    return `
      <div class="ui-row um-row">
        ${this._avatar(name)}
        <div class="ui-row-main">
          <div class="ui-row-title">${e(name)}</div>
          <div class="ui-row-meta">${e(meta.filter(Boolean).join(' · '))}</div>
        </div>
        <span class="ui-chip ${state.tone}">${state.label}</span>
        <div class="ui-actions um-actions">
          ${user ? `
            <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.viewInvitationDetails('${token}')">View</button>
            ${this._isOff(user) ? '' : `<button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.resendCredentials('${this._js(invitation.school_id)}')">New password</button>`}
            ${this._isSelf(user) ? '' : `<button type="button" class="ui-btn ui-btn-sm pc-danger" onclick="userManagementModule.deleteInvitation('${token}')">Delete login</button>`}`
          : `<button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.deleteInvitation('${token}')">Remove entry</button>`}
        </div>
      </div>`;
  },

  // ============================================
  // SUSPENDED
  // ============================================
  renderSuspendedTab() {
    // Logins only: an inactive record without a login has nothing to restore.
    const rows = this._users.filter(u => this._hasLogin(u) && this._isOff(u) && this._matchesSearch(u));
    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="sd-filters">${this._searchBox('Search suspended logins')}</div>
        <p class="ui-row-meta" style="padding:0 14px;">A suspended login cannot sign in, and any open session loses access. Restore to let them back in.</p>
        ${this._list(rows.map(user => `
          <div class="ui-row um-row">
            ${this._avatar(user.fullName)}
            <div class="ui-row-main">
              <div class="ui-row-title">${this._esc(user.fullName || 'Unnamed')}</div>
              <div class="ui-row-meta">${this._esc([this.ROLE_NAME[user.role] || user.role, user.id, user.email].filter(Boolean).join(' · '))}</div>
            </div>
            <span class="ui-chip is-warn">Suspended</span>
            <div class="ui-actions um-actions">
              <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.unsuspendUser('${this._js(user.id)}')">Restore</button>
              <button type="button" class="ui-btn ui-btn-sm pc-danger" onclick="userManagementModule.permanentlyDeleteUser('${this._js(user.id)}')">Delete login</button>
            </div>
          </div>`), 'No suspended logins.')}
      </section>`;
  },

  async unsuspendUser(userId) {
    const user = this._find(userId);
    if (!user) { showToast('User not found.', 'danger'); return; }
    if (!confirm(`Restore ${user.fullName || userId}? They will be able to sign in again.`)) return;
    const result = await authManager.updateAccount(user.schoolId || userId, 'restore');
    if (!result?.success) { showToast('Not changed: ' + (result?.error || 'unknown error'), 'danger'); return; }
    await this._reload();
    showToast(`${user.fullName || userId} can sign in again`, 'success');
    this._rerenderAll();
  },

  async permanentlyDeleteUser(userId) {
    const user = this._find(userId);
    if (!user) { showToast('User not found.', 'danger'); return; }
    const name = user.fullName || userId;
    if (!confirm(`Delete ${name}'s login?\n\nThey will not be able to sign in. Their pupil or staff record, marks and payments are kept, and they can be given a new login later.\n\nThis cannot be undone.`)) return;
    showToast('Deleting…', 'info');
    const result = await authManager.deleteUser(user.schoolId || userId);
    await this._reload();
    this._rerenderAll();
    if (!result?.success) { showToast(result?.error || 'Not deleted.', 'danger'); return; }
    showToast(`${name}'s login was deleted`, 'success');
  },

  async toggleUserStatus(userId) {
    const user = this._find(userId);
    if (!user) { showToast('User not found', 'danger'); return; }
    if (!this._hasLogin(user)) { showToast(`${user.fullName} has no login to suspend.`, 'info'); return; }
    if (this._isSelf(user)) { showToast('You cannot suspend your own account.', 'info'); return; }
    const restore = this._isOff(user);
    if (!confirm(restore
      ? `Let ${user.fullName} sign in again?`
      : `Suspend ${user.fullName}? They cannot sign in, and any session they have open loses access.`)) return;

    const result = await authManager.updateAccount(user.schoolId || userId, restore ? 'restore' : 'suspend');
    if (!result?.success) { showToast('Not changed: ' + (result?.error || 'unknown error'), 'danger'); return; }
    await this._reload();
    showToast(restore ? `${user.fullName} can sign in again` : `${user.fullName} suspended`, 'success');
    this._rerenderAll();
  },

  // ============================================
  // ROLES
  //
  // Read-only. What each role can open is set in js/permission-manager.js and
  // enforced by the database's row rules. The old tab let permissions be
  // "edited" in page memory, said "updated", and changed nothing.
  // ============================================
  MODULE_LABELS: {
    'admin-dashboard': 'Today', 'inventory': 'Inventory', 'fees-payments': 'Fees & payments',
    'payment-checks': 'Payments to check', 'admin-profile': 'My profile', 'calendar': 'Calendar & events',
    'teacher-today': 'Today', 'teacher-scores': 'Scores', 'my-classes': 'My classes', 'academics': 'Classes & lessons',
    'family-home': 'Home', 'family-fees': 'Fees', 'family-results': 'Results', 'my-schedule': 'Timetable', 'my-tasks': 'Assignments'
  },

  ROLE_SUMMARY: {
    admin: 'Everything, including Users & access, Settings and every record.',
    staff: 'The office side: fees and payments, checking payments, inventory.',
    teacher: 'Their own classes: marks, lessons, assignments and the timetable.',
    student: 'Their own results, fees, timetable and assignments.',
    guardian: 'Their own children\'s results and fees, and paying them.'
  },

  renderRolesTab() {
    const pm = window.permissionManager?.permissions || {};
    const roles = ['admin', 'staff', 'teacher', 'student', 'guardian'];
    const logins = (r) => this._users.filter(u => this._hasLogin(u) && u.role === r && !this._isOff(u)).length;
    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head"><h2 class="ui-card-title">What each role can open</h2></div>
        <p class="ui-row-meta" style="margin:0 0 8px;">Set by the portal and enforced by the database, so it cannot be changed from here. To change what someone can do, change their role.</p>
        ${roles.map(r => {
          const modules = (pm[r]?.modules || []).filter(m => m !== 'all');
          return `
            <div class="ui-row">
              <div class="ui-row-main">
                <div class="ui-row-title">${this.ROLE_NAME[r]} <span class="ui-row-meta">· ${logins(r)} active login${logins(r) === 1 ? '' : 's'}</span></div>
                <div class="ui-row-meta">${this._esc(this.ROLE_SUMMARY[r])}</div>
                ${modules.length ? `<div class="ui-actions" style="margin-top:6px;flex-wrap:wrap;justify-content:flex-start">${modules.map(m => `<span class="ui-chip">${this._esc(this.MODULE_LABELS[m] || m)}</span>`).join('')}</div>` : ''}
              </div>
              <button type="button" class="ui-btn ui-btn-sm" onclick="userManagementModule.showFiltered('${r}')">See who</button>
            </div>`;
        }).join('')}
      </section>`;
  },

  // ============================================
  // ACTIVITY LOG
  //
  // Written by every module and by the account edge functions. The database
  // stamps who wrote each browser entry (migration 0032), so "by" is not
  // whatever the browser claimed. Everything shown is escaped: entries carry
  // text other people typed, such as lesson-plan titles and names.
  // ============================================
  AUDIT_CATEGORIES: {
    accounts: a => /account|user|role|login|credential|password|suspend|restor|invit/i.test(a),
    students: a => /student|enrol|admission|application|admit|withdraw/i.test(a),
    staff: a => /staff/i.test(a),
    academics: a => /class|schedule|assessment|grade|lesson|subject/i.test(a),
    finance: a => /pay|fee/i.test(a),
    inventory: a => /inventory/i.test(a),
  },

  async loadAuditLogs() {
    this._auditState = 'loading';
    const { data, error } = await supabaseClient
      .from('audit_logs').select('*')
      .order('timestamp', { ascending: false })
      .limit(500);
    if (error) {
      this._auditState = 'error';
      this._auditError = error.message;
      this.auditLogs = [];
    } else {
      this._auditState = 'ready';
      this.auditLogs = data || [];
    }
    if (this.currentTab === 'audit') this._rerenderTab();
  },

  refreshAuditLogs() {
    this.loadAuditLogs();
    this._rerenderTab();
  },

  _filteredAudit() {
    const q = this._auditSearch.trim().toLowerCase();
    const match = this.AUDIT_CATEGORIES[this._auditCategory];
    return this.auditLogs.filter(l =>
      (!match || match(l.action || '')) &&
      (!q || [l.action, l.performed_by, l.target, this._auditDetails(l.details)].some(v => String(v || '').toLowerCase().includes(q))));
  },

  /** Details arrive as text from the browser and as JSON from edge functions. */
  _auditDetails(details) {
    if (details == null) return '';
    let v = details;
    if (typeof v === 'string' && /^\s*\{/.test(v)) { try { v = JSON.parse(v); } catch { /* plain text */ } }
    if (v && typeof v === 'object') {
      return Object.entries(v).filter(([, x]) => x !== null && x !== '').map(([k, x]) => `${k.replace(/_/g, ' ')}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ');
    }
    return String(v);
  },

  renderAuditTab() {
    if (this._auditState === 'idle') this.loadAuditLogs();
    const e = (v) => this._esc(v ?? '');
    const logs = this._filteredAudit();
    const chips = [['all', 'All'], ['accounts', 'Logins'], ['students', 'Pupils'], ['staff', 'Staff'], ['academics', 'Academics'], ['finance', 'Finance'], ['inventory', 'Inventory']];
    const body = this._auditState === 'loading' || this._auditState === 'idle'
      ? '<div style="display:flex;justify-content:center;padding:40px"><div class="spinner"></div></div>'
      : this._auditState === 'error'
        ? `<p class="ui-empty">The activity log could not be loaded: ${e(this._auditError)}</p>`
        : this._list(logs.slice(0, 200).map(l => `
            <div class="ui-row">
              <div class="ui-row-main">
                <div class="ui-row-title">${e(String(l.action || 'unknown').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()))}${l.target ? ` <span class="ui-row-meta">· ${e(l.target)}</span>` : ''}</div>
                <div class="ui-row-meta">${e(this._auditDetails(l.details))}</div>
                <div class="ui-row-meta">by ${e(l.performed_by || l.actor || 'System')}</div>
              </div>
              <span class="ui-row-meta" style="white-space:nowrap;text-align:right">${e(this._date(l.timestamp))}<br>${e(l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')}</span>
            </div>`), 'Nothing matches.');

    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="sd-filters">
          <label class="sd-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="um-audit-search" placeholder="Search action, person, details" aria-label="Search the activity log"
              value="${e(this._auditSearch)}" oninput="userManagementModule._auditSearch = this.value; userManagementModule._rerenderTab()">
          </label>
          <button type="button" class="ui-btn" onclick="userManagementModule.refreshAuditLogs()">Refresh</button>
          <button type="button" class="ui-btn" onclick="userManagementModule.exportAuditLogs()">Export these</button>
        </div>
        <div class="ui-actions" style="padding:0 14px 8px;flex-wrap:wrap;justify-content:flex-start">
          ${chips.map(([k, label]) => `<button type="button" class="ui-btn ui-btn-sm${this._auditCategory === k ? ' ui-btn-primary' : ''}" aria-pressed="${this._auditCategory === k}"
            onclick="userManagementModule._auditCategory = '${k}'; userManagementModule._rerenderTab()">${label}</button>`).join('')}
        </div>
        ${this._auditState === 'ready' ? `<p class="ui-row-meta" style="padding:0 14px;">${logs.length} of the latest ${this.auditLogs.length} entries${logs.length > 200 ? ' (showing 200; export for all)' : ''}</p>` : ''}
        ${body}
      </section>`;
  },

  exportAuditLogs() {
    const logs = this._filteredAudit();
    downloadCsv(`activity-log-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Time', 'By', 'Action', 'Target', 'Details'],
      ...logs.map(l => [l.timestamp ? new Date(l.timestamp).toLocaleString('en-GB') : '', l.performed_by || l.actor || 'System', l.action || '', l.target || '', this._auditDetails(l.details)])
    ]);
    showToast(`${logs.length} entr${logs.length === 1 ? 'y' : 'ies'} exported`, 'success');
  },

  // ============================================
  // GIVE A LOGIN
  // ============================================

  /** Open the form for a pupil or staff record that has no login yet. The
   *  login is attached to that record rather than creating a second one. */
  giveLogin(userId) {
    const user = this._find(userId);
    if (!user || this._hasLogin(user)) { showToast('This person already has a login.', 'info'); return; }
    if (!user.recordId) { showToast('This record cannot be found. Reload the page and try again.', 'danger'); return; }
    this.showInviteModal({ recordId: user.recordId, role: user.role, fullName: user.fullName, email: user.email, department: user.department });
  },

  showInviteModal(prefill = null) {
    const p = prefill || {};
    const e = (v) => this._esc(v ?? '');
    const linked = !!p.recordId;
    const roleField = linked
      ? `<input type="hidden" name="role" value="${e(p.role)}"><input type="hidden" name="recordId" value="${e(p.recordId)}">
         <p class="ui-row-meta" style="margin:0 0 12px">A ${e(this.ROLE_NAME[p.role] || p.role)} login, attached to ${e(p.fullName)}'s existing record${p.role === 'student' ? ' (class, fees and marks stay as they are)' : ''}.</p>`
      : `<div class="form-group">
          <label class="form-label" for="invite-role">Role *</label>
          <select class="form-select" id="invite-role" name="role" required onchange="userManagementModule.onInviteRoleChange(this.value)">
            <option value="">Choose a role</option>
            ${this.ASSIGNABLE_ROLES.map(r => `<option value="${r}">${this.ROLE_NAME[r]}</option>`).join('')}
          </select>
          <small class="ui-row-meta">Pupils: add them from Students → Add student, or use "Give a login" on their record.</small>
        </div>`;

    showModal(linked ? `Give ${e(p.fullName)} a login` : 'Give someone a login', `
      <form id="invite-user-form" onsubmit="userManagementModule.submitInvitation(event)">
        ${roleField}
        <div class="form-group">
          <label class="form-label" for="invite-name">Full name *</label>
          <input type="text" class="form-input" id="invite-name" name="fullName" required value="${e(p.fullName)}" ${linked ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label" for="invite-email">Email *</label>
          <input type="email" class="form-input" id="invite-email" name="email" required value="${e(p.email)}" placeholder="name@example.com">
          <small class="ui-row-meta">The login ID and password are emailed here. For a young pupil, use a parent's address.</small>
        </div>
        <div class="form-group" id="invite-staff-fields" style="display:${!linked ? 'none' : (p.role === 'teacher' || p.role === 'staff') ? 'block' : 'none'}">
          <label class="form-label" for="invite-dept">Department</label>
          <input type="text" class="form-input" id="invite-dept" name="department" value="${e(linked ? p.department : '')}" placeholder="e.g. Mathematics, Bursary">
        </div>
        <p class="ui-row-meta">The login works straight away. The password is random, and they choose their own the first time they sign in.</p>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="invite-submit-btn">Create login</button>
        </div>
      </form>`);
  },

  onInviteRoleChange(role) {
    const staffFields = document.getElementById('invite-staff-fields');
    if (staffFields) staffFields.style.display = (role === 'teacher' || role === 'staff' || role === 'admin') ? 'block' : 'none';
  },

  async submitInvitation(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const submitBtn = document.getElementById('invite-submit-btn');
    const reset = () => { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create login'; } };
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking…'; }

    if (data.role === 'admin' && !confirm(`Make ${data.fullName} an administrator? Administrators can see and change everything, including other people's logins.`)) {
      reset();
      return;
    }

    try {
      if (typeof validationManager !== 'undefined') {
        const excludeTable = data.role === 'student' ? 'students' : (data.role === 'teacher' || data.role === 'staff') ? 'staff' : null;
        const validation = await validationManager.validateUserInput({ email: data.email }, { checkUniqueness: true, excludeTable });
        if (!validation.isValid) {
          validation.errors.forEach(err => showToast(err.message, 'error'));
          reset();
          return;
        }
      }

      if (submitBtn) submitBtn.textContent = 'Creating login…';
      const result = await authManager.createAccount({
        email: data.email,
        role: data.role,
        fullName: data.fullName,
        recordId: data.recordId || null,
        department: data.department || null
      });
      if (!result.success) {
        showToast(result.error || 'The login was not created.', 'danger');
        reset();
        return;
      }

      this._invitations = await authManager.getInvitations(true);
      await this._reload();
      closeModal();
      showToast(result.emailSent ? 'Login created and emailed.' : 'Login created. Give them the details yourself.', result.emailSent ? 'success' : 'warning');
      this.switchTab('invitations');
      showCredentialModal(data.fullName, data.email, this.ROLE_NAME[data.role] || data.role,
        result.schoolId, result.password, result.emailSent, result.emailMessage);
    } catch (error) {
      console.error('Create login error:', error);
      showToast(error.message || 'The login was not created.', 'danger');
      reset();
    }
  },

  // ============================================
  // ADD MANY
  // ============================================
  BULK_LIMIT: 200,

  showBulkInviteModal() {
    this.bulkInviteData = null;
    showModal('Add many logins', `
      <p style="margin:0 0 12px">Upload a CSV file with a header row. Columns: <code>email</code>, <code>fullName</code>,
        <code>role</code> (administrator, teacher, staff or parent) and optionally <code>department</code>.
        Pupils are added from Students → Add student.</p>
      <pre class="um-pre">email,fullName,role,department
ada@example.com,Ada Obi,teacher,Mathematics
"okafor@example.com","Okafor, John",parent,</pre>
      <div class="form-group">
        <label class="form-label" for="bulk-invite-file">CSV file</label>
        <input type="file" class="form-input" id="bulk-invite-file" accept=".csv,text/csv" onchange="userManagementModule.handleBulkInviteFile(event)">
      </div>
      <div id="bulk-preview"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" id="bulk-invite-submit" hidden onclick="userManagementModule.submitBulkInvitations()">Create logins</button>
      </div>`);
  },

  /** Rows from the file, each with its problem if it has one. */
  parseBulkRows(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { error: 'The file is empty.' };
    const header = rows[0].map(h => h.toLowerCase().replace(/[\s_]/g, ''));
    const col = (...names) => header.findIndex(h => names.includes(h));
    const iEmail = col('email', 'emailaddress'), iName = col('fullname', 'name'), iRole = col('role'), iDept = col('department', 'dept');
    if (iEmail < 0 || iName < 0 || iRole < 0) return { error: 'The first row must name the columns: email, fullName, role (and optionally department).' };
    const body = rows.slice(1);
    if (body.length > this.BULK_LIMIT) return { error: `At most ${this.BULK_LIMIT} rows at a time; this file has ${body.length}.` };

    const aliases = { administrator: 'admin', admin: 'admin', teacher: 'teacher', staff: 'staff', 'office staff': 'staff', parent: 'guardian', guardian: 'guardian' };
    const taken = new Set(this._users.filter(u => this._hasLogin(u)).map(u => String(u.email || '').toLowerCase()).filter(Boolean));
    const seen = new Set();
    return {
      rows: body.map((r, i) => {
        const email = String(r[iEmail] || '').trim().toLowerCase();
        const fullName = String(r[iName] || '').trim();
        const roleIn = String(r[iRole] || '').trim().toLowerCase();
        const role = aliases[roleIn];
        let problem = '';
        if (!fullName) problem = 'no name';
        else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problem = 'email is not valid';
        else if (roleIn === 'student' || roleIn === 'pupil') problem = 'pupils are added from Students → Add student';
        else if (!role) problem = `unknown role "${r[iRole] || ''}"`;
        else if (seen.has(email)) problem = 'email appears twice in the file';
        else if (taken.has(email)) problem = 'already has a login';
        seen.add(email);
        return { line: i + 2, email, fullName, role, department: iDept >= 0 ? String(r[iDept] || '').trim() : '', problem };
      })
    };
  },

  handleBulkInviteFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const e = (v) => this._esc(v ?? '');
      const parsed = this.parseBulkRows(ev.target.result);
      const preview = document.getElementById('bulk-preview');
      const submit = document.getElementById('bulk-invite-submit');
      if (parsed.error) {
        preview.innerHTML = `<p class="ui-chip is-warn" style="white-space:normal">${e(parsed.error)}</p>`;
        submit.hidden = true;
        return;
      }
      const good = parsed.rows.filter(r => !r.problem);
      this.bulkInviteData = good;
      preview.innerHTML = `
        <p style="margin:0 0 8px">${good.length} ready${parsed.rows.length > good.length ? `, ${parsed.rows.length - good.length} will be skipped` : ''}.</p>
        <div class="um-scroll">
          ${parsed.rows.map(r => `
            <div class="ui-row">
              <div class="ui-row-main">
                <div class="ui-row-title">${e(r.fullName || '(no name)')}</div>
                <div class="ui-row-meta">${e([`line ${r.line}`, r.email, this.ROLE_NAME[r.role] || '', r.department].filter(Boolean).join(' · '))}</div>
              </div>
              <span class="ui-chip ${r.problem ? 'is-warn' : 'is-good'}">${r.problem ? e(r.problem) : 'Ready'}</span>
            </div>`).join('')}
        </div>`;
      submit.hidden = good.length === 0;
      submit.textContent = `Create ${good.length} login${good.length === 1 ? '' : 's'}`;
    };
    reader.readAsText(file);
  },

  async submitBulkInvitations() {
    const rows = this.bulkInviteData || [];
    if (!rows.length) { showToast('Nothing to create.', 'danger'); return; }
    const admins = rows.filter(r => r.role === 'admin').length;
    if (admins && !confirm(`${admins} of these will be administrators, who can see and change everything. Continue?`)) return;

    const submitBtn = document.getElementById('bulk-invite-submit');
    if (submitBtn) submitBtn.disabled = true;
    const results = [];
    for (const [i, r] of rows.entries()) {
      if (submitBtn) submitBtn.textContent = `Creating ${i + 1} of ${rows.length}…`;
      try {
        const res = await authManager.createAccount({ email: r.email, role: r.role, fullName: r.fullName, department: r.department || null });
        results.push(res.success
          ? { ...r, ok: true, schoolId: res.schoolId, password: res.password, emailSent: res.emailSent, emailMessage: res.emailMessage }
          : { ...r, ok: false, error: res.error });
      } catch (err) {
        results.push({ ...r, ok: false, error: err.message });
      }
    }

    this._invitations = await authManager.getInvitations(true);
    await this._reload();
    closeModal();
    this.switchTab('invitations');
    this.showBulkResults(results);
  },

  /**
   * The only place the new passwords ever appear. Some emails may not have
   * gone out (a placeholder address, a mail outage), so the admin needs the
   * list — on screen and as a file — before closing it.
   */
  showBulkResults(results) {
    const e = (v) => this._esc(v ?? '');
    this._bulkResults = results;
    const ok = results.filter(r => r.ok);
    const notSent = ok.filter(r => !r.emailSent);
    showModal('Logins created', `
      <p style="margin:0 0 8px"><strong>${ok.length}</strong> created${results.length > ok.length ? `, <strong>${results.length - ok.length}</strong> failed` : ''}.
        ${notSent.length ? `<strong>${notSent.length}</strong> could not be emailed: give those people their details yourself.` : 'Every login was emailed.'}</p>
      <p class="ui-chip is-warn" style="white-space:normal;margin:0 0 8px">These passwords are shown only now. Download the list before closing if anyone needs their details by hand.</p>
      <div class="um-scroll">
        ${results.map(r => `
          <div class="ui-row">
            <div class="ui-row-main">
              <div class="ui-row-title">${e(r.fullName)}</div>
              <div class="ui-row-meta">${r.ok ? `${e(r.schoolId)} · password <code>${e(r.password)}</code> · ${r.emailSent ? 'emailed' : `not emailed: ${e(r.emailMessage || '')}`}` : `line ${r.line} · ${e(r.error || 'failed')}`}</div>
            </div>
            <span class="ui-chip ${r.ok ? (r.emailSent ? 'is-good' : 'is-warn') : 'is-warn'}">${r.ok ? (r.emailSent ? 'Emailed' : 'Give by hand') : 'Failed'}</span>
          </div>`).join('')}
      </div>
      <div class="ui-actions" style="margin-top:12px">
        <button type="button" class="ui-btn ui-btn-primary" onclick="userManagementModule.downloadBulkResults()">Download the list</button>
        <button type="button" class="ui-btn" onclick="closeModal(this)">Done</button>
      </div>`);
  },

  downloadBulkResults() {
    const rows = this._bulkResults || [];
    downloadCsv(`new-logins-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Name', 'Email', 'Role', 'Login ID', 'Password', 'Emailed', 'Problem'],
      ...rows.map(r => [r.fullName, r.email, this.ROLE_NAME[r.role] || r.role, r.schoolId || '', r.password || '', r.ok ? (r.emailSent ? 'yes' : 'no') : '', r.ok ? (r.emailSent ? '' : r.emailMessage || '') : r.error || ''])
    ]);
  },

  // ============================================
  // ONE PERSON
  // ============================================
  viewUser(userId) {
    const user = this._find(userId);
    if (!user) { showToast('User not found', 'danger'); return; }
    const e = (v) => this._esc(v ?? '');
    const login = this._hasLogin(user);
    const state = this._state(user);
    const rows = [
      ['Role', this.ROLE_NAME[user.role] || user.role],
      ['Login ID', login ? user.id : 'No login yet'],
      ['Email', user.email || '—'],
      ['Access', state.label],
      login ? ['Last signed in', user.lastLogin ? this._date(user.lastLogin) : 'Never'] : null,
      ['Added', this._date(user.createdAt) || '—'],
      user.department ? [user.role === 'student' ? 'Class' : 'Department', user.department] : null
    ].filter(Boolean);
    showModal(e(user.fullName || 'Unnamed'), `
      <dl class="um-cred">${rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>
      ${!login && !this._isOff(user) ? `<div class="ui-actions" style="margin-top:12px"><button type="button" class="ui-btn ui-btn-primary" onclick="closeModal(this); userManagementModule.giveLogin('${this._js(user.id)}')">Give a login</button></div>` : ''}`);
  },

  editUserRole(userId) {
    const user = this._find(userId);
    if (!user) { showToast('User not found', 'danger'); return; }
    if (!this._hasLogin(user)) { showToast('This person has no login yet.', 'info'); return; }
    if (this._isSelf(user)) { showToast('Another administrator must change your role.', 'info'); return; }
    if (user.role === 'student') {
      showToast('A pupil\'s login keeps its role. To give the person a different kind of access, give them a new login.', 'info');
      return;
    }
    const e = (v) => this._esc(v ?? '');
    showModal(`Role: ${e(user.fullName)}`, `
      <form id="edit-role-form" onsubmit="userManagementModule.submitRoleChange(event, '${this._js(userId)}')">
        <p class="ui-row-meta" style="margin:0 0 12px">${e([user.id, user.email].filter(Boolean).join(' · '))}. Now: <strong>${e(this.ROLE_NAME[user.role] || user.role)}</strong>.</p>
        <div class="form-group">
          <label class="form-label" for="role-select">New role</label>
          <select class="form-select" id="role-select" name="role" required>
            <option value="">Choose a role</option>
            ${this.ASSIGNABLE_ROLES.filter(r => r !== user.role).map(r => `<option value="${r}">${this.ROLE_NAME[r]}</option>`).join('')}
          </select>
          <small class="ui-row-meta">See the Roles tab for what each role can open.</small>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Change role</button>
        </div>
      </form>`);
  },

  async submitRoleChange(event, userId) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const user = this._find(userId);
    if (!this._hasLogin(user)) { showToast('This person has no login yet.', 'info'); return; }
    if (!data.role || data.role === user.role) { showToast('Choose a different role.', 'info'); return; }
    if (data.role === 'admin' && !confirm(`Make ${user.fullName} an administrator? Administrators can see and change everything, including other people's logins.`)) return;

    const result = await authManager.updateAccount(user.schoolId || userId, 'set_role', data.role);
    if (!result?.success) { showToast('Not changed: ' + (result?.error || 'unknown error'), 'danger'); return; }
    await this._reload();
    closeModal();
    showToast(`${user.fullName} is now ${this.ROLE_NAME[data.role]}`, 'success');
    this._rerenderAll();
  },

  /**
   * Issue a new password for an existing login and email it. "Resend the
   * details" and "reset their password" are the same operation.
   */
  async resendCredentials(schoolId) {
    const user = this._find(schoolId);
    const who = user ? `${user.fullName}${user.email ? ` (${user.email})` : ''}` : schoolId;
    if (!confirm(`Issue a new password for ${who}?\n\nTheir current password stops working immediately, and the new one is emailed to them.`)) return;

    showToast('Issuing a new password…', 'info');
    const result = await authManager.resendCredentials(schoolId);
    if (!result.success) {
      showToast(result.error || 'No new password was issued.', 'danger');
      return;
    }
    this._invitations = await authManager.getInvitations(true);
    await this._reload();
    this._rerenderAll();
    showCredentialModal(
      result.fullName || user?.fullName || schoolId,
      result.email || user?.email || '',
      result.roleLabel || this.ROLE_NAME[user?.role] || '',
      result.schoolId, result.password, result.emailSent, result.emailMessage);
  },

  async deleteInvitation(token) {
    const invitation = this._invitations.find(inv => inv.token === token);
    if (!invitation) { showToast('Entry not found', 'danger'); return; }
    const user = this._accountFor(invitation);

    // With a live login behind it, this deletes the login; the entry stays in
    // the list as "Login deleted" so the history of who was given access holds.
    if (user) {
      return this.permanentlyDeleteUser(user.id);
    }

    if (!confirm(`Remove the entry for ${invitation.full_name || invitation.email}? The login behind it was already deleted.`)) return;
    const { data, error } = await supabaseClient.from('invitations').delete().eq('token', token).select('token');
    if (error || !data?.length) {
      showToast('Not removed: ' + (error?.message || 'the entry could not be deleted'), 'danger');
      return;
    }
    this._invitations = await authManager.getInvitations(true);
    this._rerenderAll();
    showToast('Entry removed', 'success');
  },

  viewInvitationDetails(token) {
    const invitation = this._invitations.find(inv => inv.token === token);
    if (!invitation) { showToast('Entry not found', 'danger'); return; }
    const user = this._accountFor(invitation);
    if (user) return this.viewUser(user.id);
    const e = (v) => this._esc(v ?? '');
    showModal(e(invitation.full_name || 'Login issued'), `
      <dl class="um-cred">
        <dt>Role</dt><dd>${e(this.ROLE_NAME[invitation.role] || invitation.role)}</dd>
        <dt>Login ID</dt><dd>${e(invitation.school_id)}</dd>
        <dt>Email</dt><dd>${e(invitation.email)}</dd>
        <dt>Issued</dt><dd>${e(this._date(invitation.created_at))}</dd>
        <dt>Access</dt><dd>Login deleted</dd>
      </dl>`);
  }
};

window.userManagementModule = userManagementModule;
