// ============================================
// STAFF
// ============================================
// The school's staff list: teachers and everyone else.
//
// Adding someone with an email also gives them a portal login (the
// create-account function). That function writes the staff row itself with
// role 'teacher' or 'staff' and nothing else, so the details typed here are
// written onto the row afterwards. isTeachingStaff() reads either shape.
//
// A login belongs to Users & access: deactivating someone here marks the
// record, and removing a person who has a login is done there, so the login
// goes with the record.
// ============================================

const staffManagementModule = {
  _f: { q: '', type: 'all', status: 'active', dept: 'all', page: 1 },
  _pageSize: 25,
  DEPARTMENTS: ['Administration', 'Teaching', 'Finance', 'Library', 'IT Support', 'Kitchen & Cafeteria', 'Maintenance', 'Security', 'Transport'],
  TYPES: [['teaching', 'Teaching'], ['non-teaching', 'Non-teaching'], ['admin', 'Administrative']],

  async init(container) {
    this.container = container || document.getElementById('main-content');
    await dataManager.waitForReady();
    this.render();
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = (e) => { if (e.detail?.collection === 'staff') this.render(); };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  // ── Helpers ───────────────────────────────────────────────

  _esc(str) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(str)
      : String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  all() {
    return dataManager.getAll('staff') || [];
  },

  byId(id) {
    return this.all().find(s => s.id === id) || null;
  },

  typeOf(s) {
    if (isTeachingStaff(s)) return 'teaching';
    const t = String(s.type || '').toLowerCase();
    return t === 'admin' ? 'admin' : 'non-teaching';
  },

  typeLabel(s) {
    return (this.TYPES.find(([k]) => k === this.typeOf(s)) || [, 'Non-teaching'])[1];
  },

  isActive(s) {
    return String(s.status || 'active').toLowerCase() === 'active';
  },

  hasLogin(s) {
    return !!(s.authId || s.auth_id);
  },

  /** What they do. A row made by create-account holds the portal role here until edited. */
  jobTitle(s) {
    const r = String(s.role || s.position || '').trim();
    if (!r || r === 'staff') return '';
    return r === 'teacher' ? 'Teacher' : r;
  },

  asList(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string' && v.trim()) {
      try { const p = JSON.parse(v); if (Array.isArray(p)) return p.filter(Boolean); } catch (_) { /* plain text */ }
      return v.split(',').map(x => x.trim()).filter(Boolean);
    }
    return [];
  },

  initials(name) {
    return String(name || '?').split(/\s+/).filter(w => !/^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  },

  figures() {
    const all = this.all();
    const active = all.filter(s => this.isActive(s));
    return {
      all,
      active,
      teaching: active.filter(s => this.typeOf(s) === 'teaching').length,
      other: active.filter(s => this.typeOf(s) !== 'teaching').length,
      noLogin: active.filter(s => !this.hasLogin(s)).length,
      inactive: all.length - active.length,
      departments: [...new Set(all.map(s => s.department).filter(Boolean))].sort()
    };
  },

  filtered() {
    const f = this._f;
    const q = f.q.trim().toLowerCase();
    return this.all()
      .filter(s => f.status === 'all' || (f.status === 'active') === this.isActive(s))
      .filter(s => f.type === 'all' || this.typeOf(s) === f.type)
      .filter(s => f.dept === 'all' || s.department === f.dept)
      .filter(s => !q || [s.name, this.jobTitle(s), s.email, s.phone, s.department].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  },

  // ── Page ─────────────────────────────────────────────────

  setFilter(field, value) {
    this._f[field] = value;
    if (field !== 'page') this._f.page = 1;
    const box = document.getElementById('staff-list');
    if (box) box.innerHTML = this.listHTML();
    else this.render();
    if (field === 'q') { const i = document.getElementById('st-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  },

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'staff-management') return;
    const fig = this.figures();
    const f = this._f;
    const kpi = (label, value, sub, onclick) => `
      <button type="button" class="ui-card ui-kpi" onclick="${onclick}">
        <span class="ui-kpi-label">${label}</span><span class="ui-kpi-value">${value}</span><span class="ui-kpi-sub">${sub}</span>
      </button>`;
    const show = (type) => `staffManagementModule._f = { ...staffManagementModule._f, type: '${type}', status: 'active', dept: 'all', page: 1 }; staffManagementModule.render()`;

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Staff</h1>
            <p class="ui-page-sub">${fig.active.length} active${fig.inactive ? ` · ${fig.inactive} inactive` : ''}</p>
          </div>
          <div class="ui-actions">
            <button type="button" class="ui-btn ui-btn-primary" onclick="staffManagementModule.showAddStaffModal()">Add staff member</button>
          </div>
        </div>

        <div class="ui-grid-4">
          ${kpi('Active staff', fig.active.length, 'everyone working now', show('all'))}
          ${kpi('Teaching', fig.teaching, 'teachers', show('teaching'))}
          ${kpi('Non-teaching', fig.other, 'office, support and admin', show('non-teaching'))}
          ${kpi('No portal login', fig.noLogin, fig.noLogin ? 'add an email to give one' : 'everyone can sign in', show('all'))}
        </div>

        <div class="ui-card sd-filters">
          <label class="sd-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
            <input id="st-q" type="search" aria-label="Search staff" placeholder="Search by name, job, email or phone" value="${this._esc(f.q)}" oninput="staffManagementModule.setFilter('q', this.value)">
          </label>
          <select class="sd-select" aria-label="Type" onchange="staffManagementModule.setFilter('type', this.value)">
            <option value="all">All types</option>
            ${this.TYPES.map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          ${fig.departments.length ? `
            <select class="sd-select" aria-label="Department" onchange="staffManagementModule.setFilter('dept', this.value)">
              <option value="all">All departments</option>
              ${fig.departments.map(d => `<option ${f.dept === d ? 'selected' : ''}>${this._esc(d)}</option>`).join('')}
            </select>` : ''}
          <select class="sd-select" aria-label="Status" onchange="staffManagementModule.setFilter('status', this.value)">
            <option value="active" ${f.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${f.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="all" ${f.status === 'all' ? 'selected' : ''}>Everyone</option>
          </select>
        </div>

        <div id="staff-list">${this.listHTML()}</div>
      </div>`;
  },

  listHTML() {
    const rows = this.filtered();
    const pages = Math.max(1, Math.ceil(rows.length / this._pageSize));
    const page = Math.min(this._f.page, pages);
    const shown = rows.slice((page - 1) * this._pageSize, page * this._pageSize);
    const filtering = this._f.q || this._f.type !== 'all' || this._f.dept !== 'all';

    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head">
          <h2 class="ui-card-title">${rows.length} ${rows.length === 1 ? 'person' : 'people'}</h2>
        </div>
        ${shown.length ? `
          <table class="pc-table sr-table st-table">
            <thead><tr><th>Name</th><th>Job</th><th>Type</th><th>Phone</th><th>Portal</th></tr></thead>
            <tbody>${shown.map(s => {
              const teach = this.typeOf(s) === 'teaching' ? [...this.asList(s.subjects), ...this.asList(s.classes)] : [];
              return `<tr tabindex="0" onclick="staffManagementModule.viewStaff('${this._esc(s.id)}')" onkeydown="if(event.key==='Enter')staffManagementModule.viewStaff('${this._esc(s.id)}')">
                <td>
                  <div class="st-who">
                    <span class="sd-avatar st-avatar" aria-hidden="true">${this._esc(this.initials(s.name))}</span>
                    <span><strong>${this._esc(s.name || 'Unnamed')}</strong>${s.email ? `<span class="ui-row-meta">${this._esc(s.email)}</span>` : ''}</span>
                  </div>
                </td>
                <td>${this._esc(this.jobTitle(s) || '—')}${s.department ? `<span class="ui-row-meta">${this._esc(s.department)}</span>` : ''}${teach.length ? `<span class="ui-row-meta">${this._esc(teach.slice(0, 4).join(', '))}${teach.length > 4 ? '…' : ''}</span>` : ''}</td>
                <td>${this._esc(this.typeLabel(s))}${this.isActive(s) ? '' : ' <span class="ui-chip">Inactive</span>'}</td>
                <td>${this._esc(s.phone || '—')}</td>
                <td>${this.hasLogin(s) ? '<span class="ui-chip is-good">Can sign in</span>' : '<span class="ui-chip">No login</span>'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          ${pages > 1 ? `
            <div class="fp-pager">
              <button type="button" class="ui-btn ui-btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="staffManagementModule.setFilter('page', ${page - 1})">Previous</button>
              <span class="ui-row-meta">Page ${page} of ${pages}</span>
              <button type="button" class="ui-btn ui-btn-sm" ${page >= pages ? 'disabled' : ''} onclick="staffManagementModule.setFilter('page', ${page + 1})">Next</button>
            </div>` : ''}`
        : `<p class="ui-empty">${filtering ? 'Nobody matches.' : this._f.status === 'inactive' ? 'No inactive staff.' : 'No staff yet. Use "Add staff member".'}</p>`}
      </section>`;
  },

  // ── One person ───────────────────────────────────────────

  viewStaff(id) {
    const s = this.byId(id);
    if (!s) return;
    const teaching = this.typeOf(s) === 'teaching';
    const hire = s.hireDate || s.hire_date;
    const rows = [
      ['Job', this.jobTitle(s) || '—'],
      ['Type', this.typeLabel(s)],
      ['Department', s.department || '—'],
      ['Status', this.isActive(s) ? 'Active' : 'Inactive'],
      ['Email', s.email || '—'],
      ['Phone', s.phone || '—'],
      ['Address', typeof s.address === 'string' ? (s.address || '—') : '—'],
      ['Started', hire ? new Date(hire).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
      ...(teaching ? [['Subjects', this.asList(s.subjects).join(', ') || '—'], ['Classes', this.asList(s.classes).join(', ') || '—']] : []),
      ['Portal login', this.hasLogin(s) ? 'Yes' : 'No']
    ];
    const sid = this._esc(id);
    createModal(this._esc(s.name || 'Staff member'), `
      <dl class="sr-dl sr-dl-2">
        ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${this._esc(v)}</dd></div>`).join('')}
      </dl>
      ${this.hasLogin(s) ? '<p class="ui-card-note" style="margin-top:14px;">Their login is managed in Users &amp; access.</p>' : ''}
      <div class="ui-actions" style="justify-content:flex-end;margin-top:18px;flex-wrap:wrap;">
        <button type="button" class="ui-btn" onclick="closeModal(this); staffManagementModule.deleteStaff('${sid}')">Remove</button>
        <button type="button" class="ui-btn" onclick="closeModal(this); staffManagementModule.toggleStatus('${sid}')">${this.isActive(s) ? 'Mark inactive' : 'Mark active'}</button>
        <button type="button" class="ui-btn ui-btn-primary" onclick="closeModal(this); staffManagementModule.editStaff('${sid}')">Edit</button>
      </div>`);
  },

  formHTML(s = {}, id = '') {
    const type = s.id ? this.typeOf(s) : '';
    const depts = [...new Set([...this.DEPARTMENTS, ...this.figures().departments, s.department].filter(Boolean))];
    const lockEmail = s.id && this.hasLogin(s);
    return `
      <form id="staffForm" class="fp-form" onsubmit="staffManagementModule.${s.id ? `saveEdit(event, '${this._esc(id)}')` : 'addStaff(event)'}">
        <div class="fp-grid">
          <label class="form-group"><span class="form-label">Full name</span>
            <input type="text" id="sName" class="form-input" required value="${this._esc(s.name || '')}" placeholder="e.g. Mrs. Mnena Tyav"></label>
          <label class="form-group"><span class="form-label">Job</span>
            <input type="text" id="sRole" class="form-input" required value="${this._esc(this.jobTitle(s))}" placeholder="e.g. Class teacher, Bursar, Driver"></label>
          <label class="form-group"><span class="form-label">Type</span>
            <select id="sType" class="form-select" required>
              <option value="">Choose…</option>
              ${this.TYPES.map(([k, l]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          <label class="form-group"><span class="form-label">Department</span>
            <select id="sDept" class="form-select">
              <option value="">None</option>
              ${depts.map(d => `<option ${s.department === d ? 'selected' : ''}>${this._esc(d)}</option>`).join('')}
            </select></label>
          <label class="form-group"><span class="form-label">Email${s.id ? '' : ' (gives them a portal login)'}</span>
            <input type="email" id="sEmail" class="form-input" value="${this._esc(s.email || '')}" ${lockEmail ? 'readonly' : ''} placeholder="name@example.com"></label>
          <label class="form-group"><span class="form-label">Phone</span>
            <input type="tel" id="sPhone" class="form-input" value="${this._esc(s.phone || '')}" placeholder="0803 000 0000"></label>
        </div>
        <label class="form-group"><span class="form-label">Address</span>
          <input type="text" id="sAddress" class="form-input" value="${this._esc(typeof s.address === 'string' ? s.address : '')}"></label>
        ${lockEmail ? '<p class="ui-card-note">The email is their login, so it is changed in Users &amp; access.</p>' : ''}
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary">${s.id ? 'Save changes' : 'Add staff member'}</button>
        </div>
      </form>`;
  },

  readForm() {
    const v = (id) => document.getElementById(id)?.value.trim() || '';
    return { name: v('sName'), role: v('sRole'), type: v('sType'), department: v('sDept'), email: v('sEmail'), phone: v('sPhone'), address: v('sAddress') };
  },

  async validate(data, excludeId = null) {
    if (typeof validationManager === 'undefined' || !(data.email || data.phone)) return true;
    const check = {};
    if (data.email) check.email = data.email;
    if (data.phone) check.phone = data.phone;
    const r = await validationManager.validateUserInput(check, { checkUniqueness: true, excludeTable: 'staff', ...(excludeId ? { excludeId } : {}) });
    if (!r.isValid) r.errors.forEach(err => showToast(err.message, 'error'));
    return r.isValid;
  },

  showAddStaffModal() {
    createModal('Add a staff member', this.formHTML(), 'large');
  },

  async addStaff(event) {
    event.preventDefault();
    const data = this.readForm();
    if (!(await this.validate(data))) return;
    const btn = event.target.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    const details = { ...data, status: 'active' };

    if (!data.email) {
      await dataManager.create('staff', { ...details, subjects: [], classes: [] });
      document.querySelector('.modal-backdrop')?.remove();
      showToast(`${data.name} added. Without an email they have no portal login.`, 'success');
      this.render();
      return;
    }

    let result;
    try {
      result = await authManager.createAccount({
        email: data.email,
        role: data.type === 'teaching' ? 'teacher' : 'staff',
        fullName: data.name,
        department: data.department || ''
      });
    } catch (err) {
      result = { success: false, error: err.message };
    }
    document.querySelector('.modal-backdrop')?.remove();

    if (!result?.success) {
      await dataManager.create('staff', { ...details, subjects: [], classes: [] });
      showToast(`${data.name} added, but their portal login could not be made: ${result?.error || 'unknown error'}. Try again from Users & access.`, 'warning');
      this.render();
      return;
    }

    // create-account wrote a bare row; put the rest of what was typed on it.
    await dataManager.refresh('staff');
    const row = this.all().find(s => (s.authId || s.auth_id) === result.authId);
    if (row) await dataManager.update('staff', row.id, details);

    if (typeof writeAuditLog === 'function') writeAuditLog('STAFF_CREATED', data.email, `Name: ${data.name} | Job: ${data.role} | Portal ID: ${result.schoolId}`);
    showToast(`${data.name} added`, 'success');
    if (typeof showCredentialModal === 'function') {
      setTimeout(() => showCredentialModal(data.name, data.email, data.type === 'teaching' ? 'Teacher' : 'Staff', result.schoolId, result.password, result.emailSent, result.emailMessage), 300);
    }
    this.render();
  },

  editStaff(id) {
    const s = this.byId(id);
    if (!s) return;
    createModal(`Edit · ${this._esc(s.name || '')}`, this.formHTML(s, id), 'large');
  },

  async saveEdit(event, id) {
    event.preventDefault();
    const s = this.byId(id);
    if (!s) return;
    const data = this.readForm();
    if (this.hasLogin(s)) data.email = s.email || '';
    if (!(await this.validate(data, id))) return;
    await dataManager.update('staff', id, data);
    document.querySelector('.modal-backdrop')?.remove();
    if (typeof writeAuditLog === 'function') writeAuditLog('STAFF_UPDATED', data.email || id, `Name: ${data.name} | Job: ${data.role}`);
    showToast('Saved', 'success');
    this.render();
  },

  async toggleStatus(id) {
    const s = this.byId(id);
    if (!s) return;
    const next = this.isActive(s) ? 'inactive' : 'active';
    await dataManager.update('staff', id, { status: next });
    if (typeof writeAuditLog === 'function') writeAuditLog('STAFF_STATUS_CHANGED', s.email || s.name, `Status changed to ${next}`);
    showToast(next === 'active'
      ? `${s.name} marked active`
      : `${s.name} marked inactive${this.hasLogin(s) ? '. Their login still works until it is suspended in Users & access' : ''}`, next === 'active' ? 'success' : 'info');
    this.render();
  },

  async deleteStaff(id) {
    const s = this.byId(id);
    if (!s) return;
    if (this.hasLogin(s)) {
      createModal(`Remove ${this._esc(s.name || '')}`, `
        <p>${this._esc(s.name)} has a portal login. Removing only this record would leave the login working, so people with a login are removed in Users &amp; access, which deletes both.</p>
        <p class="ui-card-note">If they have only stopped working here, "Mark inactive" keeps their history.</p>
        <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="button" class="ui-btn ui-btn-primary" onclick="closeModal(this); window.app.loadModule('user-management')">Go to Users &amp; access</button>
        </div>`);
      return;
    }
    if (!confirm(`Remove ${s.name} from the staff list? This cannot be undone.`)) return;
    await dataManager.delete('staff', id);
    if (typeof writeAuditLog === 'function') writeAuditLog('STAFF_DELETED', s.email || s.name, `Name: ${s.name} | Job: ${this.jobTitle(s)}`);
    showToast(`${s.name} removed`, 'success');
    this.render();
  }
};

window.staffManagementModule = staffManagementModule;
