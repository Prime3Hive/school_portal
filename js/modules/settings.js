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
      schoolName: 'TBD Academy',
      schoolAddress: 'Lagos, Nigeria',
      schoolEmail: 'info@tbdacademy.edu.ng',
      schoolPhone: '+234-800-000-0000',
      academicYear: '2025/2026',
      currentTerm: 'Second Term',
      theme: 'dark',
      sessionTimeout: '24',
      currency: 'NGN'
    };
  },

  loadLocalSettings() {
    const defaults = this.getDefaults();
    const saved = JSON.parse(localStorage.getItem(this.SETTINGS_KEY) || '{}');
    return { ...defaults, ...saved };
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
      const merged = { ...this.getDefaults(), ...remote };
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
    return { settings: merged, ok: result.ok, error: result.error };
  },


  render() {
    const s = this.settings;

    return `
      <div class="module-container animate-fadeIn">
        <div class="module-header">
          <div>
            <h1 class="module-title">⚙️ Settings</h1>
            <p class="module-subtitle">Configure your school portal preferences</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <!-- School Information -->
          <div class="card">
            <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
              🏫 School Information
            </h3>
            <form onsubmit="settingsModule.saveSchoolInfo(event)">
              <div class="form-group">
                <label class="form-label">School Name</label>
                <input type="text" id="settingSchoolName" class="form-input"
                  value="${s.schoolName}" required>
              </div>
              <div class="form-group">
                <label class="form-label">School Address</label>
                <input type="text" id="settingSchoolAddress" class="form-input"
                  value="${s.schoolAddress}">
              </div>
              <div class="form-group">
                <label class="form-label">Contact Email</label>
                <input type="email" id="settingSchoolEmail" class="form-input"
                  value="${s.schoolEmail}">
              </div>
              <div class="form-group">
                <label class="form-label">Contact Phone</label>
                <input type="tel" id="settingSchoolPhone" class="form-input"
                  value="${s.schoolPhone}">
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: var(--space-4);">
                <button type="submit" class="btn btn-primary">💾 Save School Info</button>
              </div>
            </form>
          </div>

          <!-- Academic Settings -->
          <div class="card">
            <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
              📅 Academic Settings
            </h3>
            <form onsubmit="settingsModule.saveAcademicSettings(event)">
              <div class="form-group">
                <label class="form-label">Academic Year</label>
                <input type="text" id="settingAcademicYear" class="form-input"
                  value="${s.academicYear}" placeholder="e.g. 2024/2025">
              </div>
              <div class="form-group">
                <label class="form-label">Current Term</label>
                <select id="settingCurrentTerm" class="form-select">
                  ${schoolConfig.termOptionsHTML(s.currentTerm)}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Currency</label>
                <select id="settingCurrency" class="form-select">
                  <option value="NGN" ${s.currency === 'NGN' ? 'selected' : ''}>Nigerian Naira (NGN ₦)</option>
                  <option value="USD" ${s.currency === 'USD' ? 'selected' : ''}>US Dollar (USD $)</option>
                  <option value="GBP" ${s.currency === 'GBP' ? 'selected' : ''}>British Pound (GBP £)</option>
                </select>
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: var(--space-4);">
                <button type="submit" class="btn btn-primary">💾 Save Academic Settings</button>
              </div>
            </form>
          </div>

          <!-- Appearance Settings -->
          <div class="card">
            <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
              🎨 Appearance
            </h3>
            <div class="form-group">
              <label class="form-label">Theme</label>
              <div style="display: flex; gap: var(--space-3); margin-top: var(--space-2);">
                <button onclick="settingsModule.setTheme('dark')"
                  class="btn ${s.theme === 'dark' ? 'btn-primary' : 'btn-ghost'}"
                  style="flex: 1;">
                  🌙 Dark Mode
                </button>
                <button onclick="settingsModule.setTheme('light')"
                  class="btn ${s.theme === 'light' ? 'btn-primary' : 'btn-ghost'}"
                  style="flex: 1;">
                  ☀️ Light Mode
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-top: var(--space-6);">
              <label class="form-label">Session Timeout</label>
              <select id="settingSessionTimeout" class="form-select"
                onchange="settingsModule.saveSessionTimeout(this.value)">
                <option value="8" ${s.sessionTimeout === '8' ? 'selected' : ''}>8 hours (default)</option>
                <option value="24" ${s.sessionTimeout === '24' ? 'selected' : ''}>24 hours</option>
                <option value="48" ${s.sessionTimeout === '48' ? 'selected' : ''}>48 hours</option>
                <option value="720" ${s.sessionTimeout === '720' ? 'selected' : ''}>30 days (Remember me)</option>
              </select>
              <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: var(--space-1);">
                Session timeout applies to new logins only.
              </p>
            </div>
          </div>

          <!-- Data Management -->
          <div class="card">
            <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
              🗄️ Data Management
            </h3>
            <div style="display: flex; flex-direction: column; gap: var(--space-4);">

              <div style="padding: var(--space-4); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                <h4 style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2);">📥 Export Data Backup</h4>
                <p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-3);">
                  Downloads a complete ZIP backup of all portal data — students, staff, payments, fees, applications, attendance, inventory, audit logs, and more.
                </p>
                <button class="btn btn-secondary btn-sm" id="export-backup-btn" onclick="settingsModule.exportAllData()">
                  📥 Export Data Backup
                </button>
              </div>

              <div style="padding: var(--space-4); background: rgba(239,68,68,0.06); border: 1px solid var(--color-danger); border-radius: var(--radius-md);">
                <h4 style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2); color: var(--color-danger);">⛔ Clear All Data</h4>
                <p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-3);">
                  Permanently deletes all transactional data — students, staff, payments, fee items, assessments, grades, attendance, inventory records, applications, audit logs, and invitations.
                  <strong style="color:var(--color-danger)"> School settings, fee structure, and subject catalog are preserved.</strong>
                </p>
                <button class="btn btn-danger btn-sm" onclick="settingsModule.confirmClearAll()">
                  🗑️ Clear All Data
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>
    `;
  },

  async saveSchoolInfo(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }
    try {
      const updates = {
        schoolName:    document.getElementById('settingSchoolName').value.trim(),
        schoolAddress: document.getElementById('settingSchoolAddress').value.trim(),
        schoolEmail:   document.getElementById('settingSchoolEmail').value.trim(),
        schoolPhone:   document.getElementById('settingSchoolPhone').value.trim()
      };
      const { ok, error } = await this.saveSettings(updates);
      this._applyToSchoolConfig(this.settings);
      if (ok) {
        showToast('School information updated!', 'success');
      } else {
        showToast('Save failed: ' + (error || 'Could not reach database'), 'error');
      }
    } catch (e) {
      console.error('[Settings] saveSchoolInfo error:', e);
      showToast('Unexpected error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Save School Info'; }
    }
  },

  async saveAcademicSettings(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }
    try {
      const updates = {
        academicYear: document.getElementById('settingAcademicYear').value.trim(),
        currentTerm:  document.getElementById('settingCurrentTerm').value,
        currency:     document.getElementById('settingCurrency').value
      };
      const { ok, error } = await this.saveSettings(updates);
      if (ok) {
        showToast('Academic settings updated!', 'success');
      } else {
        showToast('Save failed: ' + (error || 'Could not reach database'), 'error');
      }
    } catch (e) {
      console.error('[Settings] saveAcademicSettings error:', e);
      showToast('Unexpected error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Save Academic Settings'; }
    }
  },

  setTheme(theme) {
    this.saveSettings({ theme });
    this.applyTheme(theme);
    showToast(`${theme === 'dark' ? 'Dark' : 'Light'} mode enabled!`, 'success');
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

  saveSessionTimeout(value) {
    this.saveSettings({ sessionTimeout: value });
    showToast('Session timeout preference saved!', 'info');
  },

  async exportAllData() {
    const btn = document.getElementById('export-backup-btn');
    if (btn) { btn.disabled = true; btn.textContent = ' Preparing backup…'; }

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
            const { data } = await window.supabaseClient.from(t.name).select('*');
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
        portal: window.schoolConfig?.name || 'TBD Academy',
        tables: tables.map(t => t.name)
      }, null, 2));

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tbd_academy_backup_${dateStr}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('Full data backup downloaded as ZIP!', 'success');
      if (typeof writeAuditLog === 'function') writeAuditLog('DATA_EXPORT', 'All Tables', `Full ZIP backup exported on ${dateStr}`);

    } catch (err) {
      console.error('[Settings] exportAllData error:', err);
      showToast('Export failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = ' Export Data Backup'; }
    }
  },

  confirmResetData() {
    if (confirm(' This will remove all current data and reload sample demo data. Are you sure?')) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('tbd_academy_') && k !== this.SETTINGS_KEY);
      keys.forEach(k => localStorage.removeItem(k));
      // Re-seed
      dataManager.seedSampleData();
      authManager.initializeDefaultUsers();
      showToast('Demo data has been reset successfully!', 'success');
    }
  },

  async confirmClearAll() {
    if (!confirm('⛔ WARNING: This will permanently delete all transactional data — students, staff, payments, assessments, grades, attendance, inventory records, applications, and audit logs.\n\nSchool settings, fee structure, and subject catalog will be preserved.\n\nThis cannot be undone. Continue?')) return;
    if (!confirm('Last chance — are you absolutely sure?')) return;

    const btn = document.querySelector('[onclick="settingsModule.confirmClearAll()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Clearing…'; }
    showToast('Clearing data…', 'info');

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

      // Delete all student auth users
      try {
        const { data: invs } = await supabaseClient.from('invitations').select('id').eq('role', 'student');
        if (invs?.length) {
          for (const inv of invs) {
            try { await supabaseClient.from('profiles').delete().eq('id', inv.id); } catch(_) {}
          }
        }
      } catch(_) {}
    }

    showToast('All data cleared successfully. Structural data preserved.', 'success');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Clear All Data'; }
    if (typeof writeAuditLog === 'function') writeAuditLog('CLEAR_ALL_DATA', 'System', 'All transactional data cleared via Settings');
  }
};

// Register module globally
if (typeof window !== 'undefined') {
  window.settingsModule = settingsModule;
}
