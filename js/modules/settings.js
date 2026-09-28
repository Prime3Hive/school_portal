// ============================================
// SETTINGS MODULE
// School portal configuration and preferences
// ============================================

const settingsModule = {
  SETTINGS_TABLE: 'school_settings',
  SETTINGS_KEY: 'tbd_academy_settings',

  async init(container) {
    if (!container) {
      container = document.getElementById('main-content');
    }
    // Load from localStorage immediately for speed, then sync from Supabase
    this.settings = this.loadLocalSettings();
    this._applyToSchoolConfig(this.settings);
    container.innerHTML = this.render();
    this.applyTheme(this.settings.theme);

    // Try to pull the latest from Supabase and refresh if different
    const remote = await this.loadFromSupabase();
    if (remote) {
      this.settings = remote;
      this._applyToSchoolConfig(remote);
      container.innerHTML = this.render();
      this.applyTheme(this.settings.theme);
    }
  },

  // Apply saved settings to schoolConfig in-memory and update visible DOM elements
  _applyToSchoolConfig(s) {
    if (!s) return;
    if (window.schoolConfig) {
      if (s.schoolName)    window.schoolConfig.name     = s.schoolName;
      if (s.schoolAddress) window.schoolConfig.location  = s.schoolAddress;
      if (s.schoolEmail)   window.schoolConfig.email     = s.schoolEmail;
      if (s.schoolPhone)   window.schoolConfig.phone     = s.schoolPhone;
      if (s.currency)      window.schoolConfig.currency  = s.currency;
    }
    // Update sidebar DOM in real-time
    const nameEl = document.getElementById('sidebar-school-name');
    const locEl  = document.getElementById('sidebar-school-location');
    if (nameEl && s.schoolName)    nameEl.textContent = s.schoolName;
    if (locEl  && s.schoolAddress) locEl.textContent  = s.schoolAddress;
    // Update page <title>
    if (s.schoolName) document.title = s.schoolName + ' - School Management Portal';
  },

  getDefaults() {
    return {
      schoolName: 'TBD International Academy',
      schoolAddress: 'Behind Civil Service Commission, Kertyo, Makurdi',
      schoolEmail: 'support@tbdacademy.org',
      schoolPhone: '0707 171 1692',
      // The portal is designed light-first; dark is there for anyone who picks it.
      theme: 'light',
      currency: 'NGN',
      // The school's account, as printed on both published fee sheets.
      // No sort code appears on either, so none is invented here.
      bankName: 'Keystone Bank',
      bankAccountNo: '1013525760',
      bankAccountName: 'TBD International Academy',
      bankSortCode: ''
    };
  },

  loadLocalSettings() {
    const defaults = this.getDefaults();
    const saved = JSON.parse(localStorage.getItem(this.SETTINGS_KEY) || '{}');
    return this.upgradeLegacyBrand({ ...defaults, ...saved });
  },

  /**
   * Replace saved values that still match a superseded default, so the settings
   * form shows the current brand instead of the pre-rebrand one. Values an admin
   * actually changed are left alone. See LEGACY_SCHOOL_VALUES in js/config.js.
   */
  upgradeLegacyBrand(settings) {
    const upgrade = window.upgradeLegacySchoolValue;
    if (!upgrade) return settings;
    return {
      ...settings,
      schoolName: upgrade('schoolName', settings.schoolName),
      schoolAddress: upgrade('schoolAddress', settings.schoolAddress),
      schoolPhone: upgrade('schoolPhone', settings.schoolPhone),
      bankName: upgrade('bankName', settings.bankName),
      bankAccountNo: upgrade('bankAccountNo', settings.bankAccountNo),
      bankAccountName: upgrade('bankAccountName', settings.bankAccountName),
      bankSortCode: upgrade('bankSortCode', settings.bankSortCode)
    };
  },

  async loadFromSupabase() {
    try {
      if (!window.supabaseClient) return null;
      const { data, error } = await window.supabaseClient
        .from(this.SETTINGS_TABLE)
        .select('*')
        .maybeSingle();
      if (error || !data) return null;
      // Parse JSON value fields
      const remote = typeof data.settings_json === 'string'
        ? JSON.parse(data.settings_json)
        : (data.settings_json || {});
      const merged = this.upgradeLegacyBrand({ ...this.getDefaults(), ...remote });
      // Also save locally so offline access is fast
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    } catch (e) {
      return null;
    }
  },

  async saveToSupabase(settingsObj) {
    if (!window.supabaseClient) return { ok: false, error: 'No Supabase client' };
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out after 10s')), 10000)
    );
    try {
      const saveOp = window.supabaseClient
        .from(this.SETTINGS_TABLE)
        .update({ settings_json: settingsObj, updated_at: new Date().toISOString() })
        .eq('id', 1);
      const { error } = await Promise.race([saveOp, timeout]);
      if (error) {
        console.error('[Settings] Supabase save failed:', error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) {
      console.error('[Settings] saveToSupabase exception:', e.message);
      return { ok: false, error: e.message };
    }
  },

  async saveSettings(updates) {
    const current = this.loadLocalSettings();
    const merged = { ...current, ...updates };
    // Always save locally first (instant)
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(merged));
    this.settings = merged;
    // Then save to Supabase
    const result = await this.saveToSupabase(merged);
    // Anything already on screen that prints these values — the deposit block
    // on a payment form, a parent's fee modal — redraws instead of holding the
    // account the admin has just replaced.
    document.dispatchEvent(new CustomEvent('school-settings-changed', { detail: merged }));
    return { settings: merged, ok: result.ok, error: result.error };
  },


  _esc(v) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(v)
      : String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /**
   * The term and session every page uses. They come from the date
   * (school-config), not from a saved setting: an old "current term" field
   * here was saved but read by nothing, so changing it did nothing.
   */
  _termCard() {
    const term = schoolConfig.getCurrentTerm()?.name || '';
    const year = schoolConfig.getCurrentAcademicYear();
    const months = (schoolConfig.academicYear?.terms || []).map(t => `${t.name}: ${t.months[0]}–${t.months[t.months.length - 1]}`).join(' · ');
    return `
      <section class="ui-card">
        <div class="ui-card-head"><h2 class="ui-card-title">Term and session</h2></div>
        <div class="fp-owes">
          <div><span class="ui-row-meta">This term</span><strong>${this._esc(term)}</strong></div>
          <div><span class="ui-row-meta">Session</span><strong>${this._esc(year)}</strong></div>
        </div>
        <p class="ui-card-note" style="margin-top:12px;">Set by the date, the same on every page, bill and report card. ${this._esc(months)}.
        December counts with the Second Term, and July–August with the next session's First Term, so bills raised in the holidays land on the coming term.</p>
      </section>`;
  },

  render() {
    const s = this.settings;
    const e = (v) => this._esc(v ?? '');
    const field = (id, label, value, type = 'text', extra = '') => `
      <label class="form-group"><span class="form-label">${label}</span>
        <input type="${type}" id="${id}" class="form-input" value="${e(value)}" ${extra}></label>`;

    return `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Settings</h1>
            <p class="ui-page-sub">School details, the bank account parents pay into, and backups</p>
          </div>
        </div>

        <div class="set-grid">
          <section class="ui-card">
            <div class="ui-card-head"><h2 class="ui-card-title">School</h2></div>
            <form class="fp-form" onsubmit="settingsModule.saveSchoolInfo(event)">
              ${field('settingSchoolName', 'Name', s.schoolName, 'text', 'required')}
              ${field('settingSchoolAddress', 'Address', s.schoolAddress)}
              <div class="fp-grid">
                ${field('settingSchoolEmail', 'Email', s.schoolEmail, 'email')}
                ${field('settingSchoolPhone', 'Phone', s.schoolPhone, 'tel')}
              </div>
              <div class="ui-actions" style="justify-content:flex-end;"><button type="submit" class="ui-btn ui-btn-primary">Save</button></div>
            </form>
          </section>

          <section class="ui-card">
            <div class="ui-card-head"><h2 class="ui-card-title">Bank account for fees</h2></div>
            <p class="ui-card-note" style="margin-bottom:12px;">Shown to parents paying by transfer, and on payment forms and receipts.</p>
            <form class="fp-form" onsubmit="settingsModule.saveBankDetails(event)">
              <div class="fp-grid">
                ${field('settingBankName', 'Bank', s.bankName)}
                ${field('settingBankAccountNo', 'Account number', s.bankAccountNo, 'text', 'maxlength="20" inputmode="numeric"')}
                ${field('settingBankAccountName', 'Account name', s.bankAccountName)}
                ${field('settingBankSortCode', 'Sort code (if any)', s.bankSortCode, 'text', 'maxlength="20"')}
              </div>
              <div class="ui-actions" style="justify-content:flex-end;"><button type="submit" class="ui-btn ui-btn-primary">Save</button></div>
            </form>
          </section>

          ${this._termCard()}

          <section class="ui-card">
            <div class="ui-card-head"><h2 class="ui-card-title">Appearance</h2></div>
            <div class="app-filters" role="group" aria-label="Theme">
              <button type="button" class="ui-btn${s.theme !== 'dark' ? ' ui-btn-primary' : ''}" aria-pressed="${s.theme !== 'dark'}" onclick="settingsModule.setTheme('light')">Light</button>
              <button type="button" class="ui-btn${s.theme === 'dark' ? ' ui-btn-primary' : ''}" aria-pressed="${s.theme === 'dark'}" onclick="settingsModule.setTheme('dark')">Dark</button>
            </div>
          </section>

          <section class="ui-card set-wide">
            <div class="ui-card-head"><h2 class="ui-card-title">Backup and data</h2></div>
            <div class="ui-row">
              <div class="ui-row-main">
                <div class="ui-row-title">Download a backup</div>
                <div class="ui-row-meta">Every record (pupils, staff, fees, payments, results, inventory, applications, logs) as one ZIP file.</div>
              </div>
              <button type="button" class="ui-btn" id="export-backup-btn" onclick="settingsModule.exportAllData()">Download backup</button>
            </div>
            <div class="ui-row">
              <div class="ui-row-main">
                <div class="ui-row-title set-danger">Delete all records</div>
                <div class="ui-row-meta">Removes pupils, staff, fees, payments, results, inventory and applications. Settings, the fee structure and subjects stay. Logins stay and are removed in Users &amp; access. Download a backup first.</div>
              </div>
              <button type="button" class="ui-btn pc-danger" onclick="settingsModule.confirmClearAll()">Delete all records…</button>
            </div>
          </section>
        </div>
      </div>
    `;
  },

  async saveSchoolInfo(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const updates = {
        schoolName:    document.getElementById('settingSchoolName').value.trim(),
        schoolAddress: document.getElementById('settingSchoolAddress').value.trim(),
        schoolEmail:   document.getElementById('settingSchoolEmail').value.trim(),
        schoolPhone:   document.getElementById('settingSchoolPhone').value.trim()
      };
      const { ok, error } = await this.saveSettings(updates);
      this._applyToSchoolConfig(this.settings);
      showToast(ok ? 'School details saved' : 'Save failed: ' + (error || 'could not reach the database'), ok ? 'success' : 'error');
    } catch (e) {
      console.error('[Settings] saveSchoolInfo error:', e);
      showToast('Unexpected error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  },


  async saveBankDetails(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const updates = {
        bankName:        (document.getElementById('settingBankName')?.value || '').trim(),
        bankAccountNo:   (document.getElementById('settingBankAccountNo')?.value || '').trim(),
        bankAccountName: (document.getElementById('settingBankAccountName')?.value || '').trim(),
        bankSortCode:    (document.getElementById('settingBankSortCode')?.value || '').trim()
      };
      const { ok, error } = await this.saveSettings(updates);
      if (ok) {
        showToast('Bank details saved', 'success');
      } else {
        showToast('Save failed: ' + (error || 'Could not reach database'), 'error');
      }
    } catch (e) {
      console.error('[Settings] saveBankDetails error:', e);
      showToast('Unexpected error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  },

  setTheme(theme) {
    this.saveSettings({ theme });
    this.applyTheme(theme);
    showToast(`${theme === 'dark' ? 'Dark' : 'Light'} theme on`, 'success');
    // Re-render to update button states
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = this.render();
    }
  },

  applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  },

  async exportAllData() {
    const btn = document.getElementById('export-backup-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }

    try {
      // Dynamically load JSZip from CDN if not already present
      if (!window.JSZip) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      const zip = new window.JSZip();
      const dateStr = new Date().toISOString().split('T')[0];
      const folder = zip.folder(`tbd_academy_backup_${dateStr}`);

      // Tables to export
      const tables = [
        { name: 'students',              key: 'students' },
        { name: 'staff',                 key: 'staff' },
        { name: 'fees_payments',         key: 'payments' },
        { name: 'fee_items',             key: 'feeItems' },
        { name: 'applications',          key: 'applications' },
        { name: 'attendance_records',    key: 'attendance' },
        { name: 'assessments',           key: 'assessments' },
        { name: 'grades',                key: 'grades' },
        { name: 'student_subjects',      key: 'studentSubjects' },
        { name: 'student_assignments',   key: 'assignments' },
        { name: 'student_schedules',     key: 'studentSchedules' },
        { name: 'school_schedules',      key: 'schoolSchedules' },
        { name: 'inventory',             key: 'inventory' },
        { name: 'inventory_requests',    key: 'inventoryRequests' },
        { name: 'inventory_assignments', key: 'inventoryAssignments' },
        { name: 'lesson_plans',          key: 'lessonPlans' },
        { name: 'teacher_assessments',   key: 'teacherAssessments' },
        { name: 'audit_logs',            key: 'auditLogs' },
        { name: 'email_logs',            key: 'emailLogs' },
        { name: 'invitations',           key: 'invitations' },
        { name: 'subject_catalog',       key: 'subjectCatalog' },
      ];

      // Fetch each table directly from Supabase for freshest data
      for (const t of tables) {
        try {
          let rows = [];
          if (window.supabaseClient) {
            // One select returns at most 1000 rows; page through the lot.
            const { data, error } = await dataManager._fetchAllPages(t.name, 'id');
            if (error) throw new Error(error.message);
            rows = data || [];
          } else {
            rows = dataManager.getAll(t.key) || [];
          }
          folder.file(`${t.name}.json`, JSON.stringify(rows, null, 2));
        } catch (e) {
          folder.file(`${t.name}.json`, JSON.stringify({ error: e.message }, null, 2));
        }
      }

      // Include school settings
      if (window.supabaseClient) {
        const { data: settings } = await window.supabaseClient.from('school_settings').select('*');
        folder.file('school_settings.json', JSON.stringify(settings || [], null, 2));
      }

      // Include fee structure
      if (window.feeStructure) {
        folder.file('fee_structure.json', JSON.stringify({
          academicYear: feeStructure.academicYear,
          feeItems: feeStructure.feeItems
        }, null, 2));
      }

      // Manifest
      folder.file('manifest.json', JSON.stringify({
        exportedAt: new Date().toISOString(),
        exportedBy: authManager?.getSession()?.fullName || 'Admin',
        portal: window.schoolConfig?.name || 'TBD International Academy',
        tables: tables.map(t => t.name)
      }, null, 2));

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tbd_academy_backup_${dateStr}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('Backup downloaded', 'success');
      if (typeof writeAuditLog === 'function') writeAuditLog('DATA_EXPORT', 'All Tables', `Full ZIP backup exported on ${dateStr}`);

    } catch (err) {
      console.error('[Settings] exportAllData error:', err);
      showToast('Export failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Download backup'; }
    }
  },

  confirmClearAll() {
    createModal('Delete all records', `
      <p>This permanently deletes every pupil, staff member, fee, payment, result, inventory record, application and log. It cannot be undone.</p>
      <p class="ui-card-note" style="margin-top:8px;">Settings, the fee structure and subjects are kept. Download a backup first.</p>
      <label class="form-group" style="margin-top:14px;"><span class="form-label">Type DELETE EVERYTHING to confirm</span>
        <input type="text" id="clearAllTyped" class="form-input" autocomplete="off"></label>
      <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
        <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
        <button type="button" class="ui-btn pc-danger" onclick="settingsModule._clearAll(this)">Delete</button>
      </div>`);
  },

  async _clearAll(btn) {
    if (document.getElementById('clearAllTyped')?.value.trim() !== 'DELETE EVERYTHING') {
      showToast('Type DELETE EVERYTHING to confirm', 'warning');
      return;
    }
    closeModal(btn);
    showToast('Deleting records…', 'info');

    // Tables to wipe — structural tables (school_settings, subject_catalog, school_schedules, fee structure in settings_json) are preserved
    const tables = [
      'students', 'staff', 'fees_payments', 'fee_items',
      'payment_allocations', 'payment_idempotency', 'payment_transaction_logs', 'payment_verification_issues',
      'inventory', 'inventory_requests', 'inventory_assignments', 'inventory_transactions',
      'assessments', 'grades', 'student_assignments', 'student_subjects',
      'attendance_records', 'student_schedules',
      'lesson_plans', 'teacher_assessments', 'teacher_tasks',
      'applications', 'audit_logs', 'email_logs', 'invitations',
      'notifications'
    ];

    if (window.supabaseClient) {
      // First nullify FK refs that block student deletion
      try { await supabaseClient.from('applications').update({ student_id: null }).not('student_id', 'is', null); } catch(_) {}

      for (const table of tables) {
        try {
          await window.supabaseClient.from(table).delete().not('id', 'is', null);
        } catch (e) {
          console.warn('[Settings] Could not clear table:', table, e.message);
        }
      }

    }

    showToast('Records deleted. Settings, fee structure and subjects kept; logins are removed in Users & access.', 'success');
    if (typeof writeAuditLog === 'function') writeAuditLog('CLEAR_ALL_DATA', 'System', 'All transactional data cleared via Settings');
  }
};

// Register module globally
if (typeof window !== 'undefined') {
  window.settingsModule = settingsModule;
}
