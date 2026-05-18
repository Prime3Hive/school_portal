// ============================================
// GRADES & SUBJECTS MANAGEMENT MODULE
// Admin tool to manage the subject catalog,
// student subject enrollments, and grades.
// ============================================

const gradesManagementModule = {
  currentTab: 'subjects',
  _subjectSearch: '',
  _subjectGradeFilter: 'all',
  _enrollMode: 'individual',  // 'individual' | 'bulk'

  async init(container) {
    this.container = container || document.getElementById('main-content');
    await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['grades', 'assessments', 'subjectCatalog', 'studentSubjects', 'assignments'].includes(e.detail.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  render() {
    const subjects    = dataManager.getAll('subjectCatalog');
    const students    = dataManager.getAll('students').filter(s => s.status === 'active');
    const enrollments = dataManager.getAll('studentSubjects');
    const enrolled    = enrollments.filter(e => e.subjects && e.subjects.length > 0).length;

    this.container.innerHTML = `
          <div class="animate-fadeIn">
            <!-- Header -->
            <div class="module-header" style="margin-bottom: var(--space-4);">
              <div>
                <h1 class="module-title">📚 Grades & Subjects</h1>
                <p class="module-subtitle">Manage subject catalog, student enrollment and grades</p>
              </div>
            </div>

            <!-- Stats Bar -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-3);margin-bottom:var(--space-5);">
              ${this._statChip('📖 Subjects', subjects.length, 'var(--color-primary)')}
              ${this._statChip('👥 Active Students', students.length, '#10b981')}
              ${this._statChip('🎓 Enrolled', enrolled, '#6366f1')}
              ${this._statChip('📊 Unassigned', students.length - enrolled, '#f59e0b')}
            </div>

            <!-- Tabs -->
            <div style="display:flex; gap: var(--space-2); margin-bottom: var(--space-5); border-bottom: 2px solid var(--border-primary); padding-bottom: 0; overflow-x:auto; flex-shrink:0;">
              ${this.renderTab('subjects', '📖 Subjects')}
              ${this.renderTab('enrollment', '🎓 Assign Subjects')}
              ${this.renderTab('grades', '📊 Student Grades')}
            </div>

            <!-- Tab Content -->
            <div id="gm-tab-content">
              ${this.renderCurrentTab()}
            </div>
          </div>
        `;
  },

  _statChip(label, value, color) {
    return `<div class="card" style="padding:var(--space-4);text-align:center;">
      <div style="font-size:1.4rem;font-weight:700;color:${color};">${value}</div>
      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">${label}</div>
    </div>`;
  },

  renderTab(key, label) {
    const active = this.currentTab === key;
    return `<button
          onclick="gradesManagementModule.switchTab('${key}')"
          style="padding: var(--space-3) var(--space-5); background:none; border:none; cursor:pointer;
                 font-size: var(--font-size-base); font-weight: ${active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)'};
                 color: ${active ? 'var(--color-primary)' : 'var(--text-secondary)'};
                 border-bottom: 3px solid ${active ? 'var(--color-primary)' : 'transparent'};
                 margin-bottom:-2px; transition: all 0.2s;">
          ${label}
        </button>`;
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  renderCurrentTab() {
    switch (this.currentTab) {
      case 'subjects': return this.renderSubjectsTab();
      case 'enrollment': return this.renderEnrollmentTab();
      case 'grades': return this.renderGradesTab();
      default: return '';
    }
  },

  // ============================================
  // TAB 1 — SUBJECT CATALOG
  // ============================================

  renderSubjectsTab() {
    const allSubjects = dataManager.getAll('subjectCatalog');
    const staff       = dataManager.getAll('staff').filter(s => s.type === 'teaching');
    const enrollments = dataManager.getAll('studentSubjects');
    const search      = (this._subjectSearch || '').toLowerCase();
    const gradeFilter = this._subjectGradeFilter || 'all';

    // Count students enrolled in each subject
    const enrollCount = {};
    enrollments.forEach(e => {
      (e.subjects || []).forEach(s => {
        enrollCount[s.subjectId] = (enrollCount[s.subjectId] || 0) + 1;
      });
    });

    // Filter subjects
    let subjects = allSubjects;
    if (gradeFilter !== 'all') subjects = subjects.filter(s => String(s.grade) === String(gradeFilter));
    if (search) subjects = subjects.filter(s =>
      s.name?.toLowerCase().includes(search) ||
      s.code?.toLowerCase().includes(search)
    );

    // Unique grades for filter
    const grades = [...new Set(allSubjects.map(s => s.grade).filter(Boolean))].sort();

    return `
          <div>
            <!-- Toolbar -->
            <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:flex-end;margin-bottom:var(--space-5);">
              <div style="flex:1;min-width:200px;">
                <input type="text" class="form-input" placeholder="🔍 Search subjects…" value="${this._subjectSearch || ''}"
                  oninput="gradesManagementModule._subjectSearch=this.value;gradesManagementModule.renderCurrentTab_inplace()" style="margin:0;">
              </div>
              <select class="form-select" style="width:auto;min-width:140px;margin:0;"
                onchange="gradesManagementModule._subjectGradeFilter=this.value;gradesManagementModule.renderCurrentTab_inplace()">
                <option value="all" ${gradeFilter==='all'?'selected':''}>All Grades</option>
                ${grades.map(g => `<option value="${g}" ${String(gradeFilter)===String(g)?'selected':''}>Grade ${g}</option>`).join('')}
              </select>
              <div style="display:flex;gap:var(--space-2);flex-shrink:0;">
                <button class="btn btn-secondary" onclick="gradesManagementModule.openSeedSubjectsModal()" title="Import standard subjects">
                  🌱 Seed Standard Subjects
                </button>
                <button class="btn btn-primary" onclick="gradesManagementModule.openAddSubjectModal()">
                  ➕ Add Subject
                </button>
              </div>
            </div>

            <!-- Results count -->
            <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-4);">
              Showing ${subjects.length} of ${allSubjects.length} subjects
            </p>

            ${allSubjects.length === 0 ? `
              <div class="card">
                <div class="card-body">
                  <div class="empty-state">
                    <div class="empty-state-icon">📖</div>
                    <h3 class="empty-state-title">No Subjects Yet</h3>
                    <p class="empty-state-description">Click <strong>Seed Standard Subjects</strong> to import a full Nigerian curriculum subject list, or add subjects manually.</p>
                    <div style="margin-top:var(--space-4);display:flex;gap:var(--space-3);justify-content:center;">
                      <button class="btn btn-secondary" onclick="gradesManagementModule.openSeedSubjectsModal()">🌱 Seed Standard Subjects</button>
                      <button class="btn btn-primary" onclick="gradesManagementModule.openAddSubjectModal()">➕ Add Manually</button>
                    </div>
                  </div>
                </div>
              </div>
            ` : subjects.length === 0 ? `
              <div class="card"><div class="card-body" style="text-align:center;padding:2rem;">
                <p style="color:var(--text-secondary);">No subjects match your search/filter.</p>
              </div></div>
            ` : `
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                ${subjects.map(sub => this.renderSubjectCard(sub, staff, enrollCount[sub.id] || 0)).join('')}
              </div>
            `}
          </div>
        `;
  },

  renderCurrentTab_inplace() {
    const area = document.getElementById('gm-tab-content');
    if (area) area.innerHTML = this.renderCurrentTab();
  },

  renderSubjectCard(sub, staff, studentCount = 0) {
    const teacher = staff.find(s => s.id === sub.teacherId);
    return `
          <div class="card" style="border-left: 4px solid var(--color-primary);transition:box-shadow 0.2s;">
            <div class="card-body" style="padding: var(--space-4);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1);">
                    <span style="font-size:1.5rem;">${sub.icon || '📚'}</span>
                    <span style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);">${sub.name}</span>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-2);">
                    <span class="badge badge-secondary">${sub.code}</span>
                    <span class="badge badge-info">Grade ${sub.grade}</span>
                    <span class="badge ${studentCount > 0 ? 'badge-success' : 'badge-secondary'}" title="Students enrolled">
                      👥 ${studentCount} student${studentCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style="font-size:var(--font-size-sm);color:var(--text-secondary);">
                    👩‍🏫 ${teacher ? teacher.name : '<em>No teacher assigned</em>'}
                  </div>
                  ${sub.description ? `<div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:var(--space-1);">${sub.description}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:var(--space-1);flex-shrink:0;">
                  <button class="table-action-btn" title="Edit subject" onclick="gradesManagementModule.openEditSubjectModal('${sub.id}')">✏️</button>
                  <button class="table-action-btn" title="Delete subject" onclick="gradesManagementModule.deleteSubject('${sub.id}')">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        `;
  },

  // ============================================
  // SEED STANDARD SUBJECTS
  // ============================================

  _standardSubjects() {
    return [
      // Core
      { name: 'Mathematics',            code: 'MATH',  icon: '🔢', category: 'Core' },
      { name: 'English Language',       code: 'ENG',   icon: '📝', category: 'Core' },
      { name: 'Civic Education',        code: 'CIV',   icon: '🏛️', category: 'Core' },
      { name: 'Physical Education',     code: 'PE',    icon: '⚽', category: 'Core' },
      { name: 'Computer Studies (ICT)', code: 'ICT',   icon: '💻', category: 'Core' },
      // Sciences
      { name: 'Basic Science & Technology', code: 'BST', icon: '🔬', category: 'Sciences' },
      { name: 'Physics',                code: 'PHY',   icon: '⚛️', category: 'Sciences' },
      { name: 'Chemistry',              code: 'CHEM',  icon: '🧪', category: 'Sciences' },
      { name: 'Biology',                code: 'BIO',   icon: '🌿', category: 'Sciences' },
      { name: 'Agricultural Science',   code: 'AGRIC', icon: '🌾', category: 'Sciences' },
      // Humanities
      { name: 'Literature in English',  code: 'LIT',   icon: '📖', category: 'Humanities' },
      { name: 'History',                code: 'HIST',  icon: '🏺', category: 'Humanities' },
      { name: 'Geography',              code: 'GEO',   icon: '🗺️', category: 'Humanities' },
      { name: 'Government',             code: 'GOVT',  icon: '🏛️', category: 'Humanities' },
      { name: 'Christian Religious Studies', code: 'CRS', icon: '✝️', category: 'Humanities' },
      { name: 'Islamic Religious Studies',   code: 'IRS', icon: '☪️', category: 'Humanities' },
      // Social Sciences
      { name: 'Economics',              code: 'ECON',  icon: '📈', category: 'Social Sciences' },
      { name: 'Commerce',               code: 'COMM',  icon: '🏪', category: 'Social Sciences' },
      { name: 'Financial Accounting',   code: 'ACCT',  icon: '💰', category: 'Social Sciences' },
      { name: 'Business Studies',       code: 'BUS',   icon: '💼', category: 'Social Sciences' },
      // Vocational / Technical
      { name: 'Technical Drawing',      code: 'TECH',  icon: '📐', category: 'Vocational' },
      { name: 'Food & Nutrition',       code: 'FNT',   icon: '🍽️', category: 'Vocational' },
      { name: 'Home Economics',         code: 'HEC',   icon: '🏠', category: 'Vocational' },
      // Languages
      { name: 'Yoruba',                 code: 'YOR',   icon: '🗣️', category: 'Languages' },
      { name: 'Igbo',                   code: 'IGB',   icon: '🗣️', category: 'Languages' },
      { name: 'Hausa',                  code: 'HAU',   icon: '🗣️', category: 'Languages' },
      { name: 'French',                 code: 'FRN',   icon: '🇫🇷', category: 'Languages' },
    ];
  },

  openSeedSubjectsModal() {
    const existing = dataManager.getAll('subjectCatalog').map(s => s.code?.toUpperCase());
    const std = this._standardSubjects();
    const categories = [...new Set(std.map(s => s.category))];

    const rows = categories.map(cat => `
      <tr><td colspan="3" style="background:var(--bg-tertiary);font-size:0.75rem;font-weight:700;color:var(--text-secondary);padding:0.35rem 0.75rem;text-transform:uppercase;letter-spacing:0.05em;">${cat}</td></tr>
      ${std.filter(s => s.category === cat).map(s => {
        const alreadyExists = existing.includes(s.code.toUpperCase());
        return `<tr>
          <td style="padding:0.5rem 0.75rem;">
            <input type="checkbox" name="seed_${s.code}" value="${s.code}" ${alreadyExists ? 'disabled' : 'checked'}
              style="width:16px;height:16px;cursor:pointer;">
          </td>
          <td style="padding:0.5rem 0.75rem;font-weight:500;">${s.icon} ${s.name}</td>
          <td style="padding:0.5rem 0.75rem;font-size:0.8rem;color:var(--text-secondary);">
            ${alreadyExists ? '<span class="badge badge-success">✅ Already added</span>' : `<code>${s.code}</code>`}
          </td>
        </tr>`;
      }).join('')}
    `).join('');

    const content = `
      <form id="seed-form">
        <p style="margin-bottom:var(--space-4);font-size:var(--font-size-sm);color:var(--text-secondary);">Select the subjects to import. Subjects already in your catalog are disabled. You can assign a grade level to all imported subjects (editable after import).</p>
        <div class="form-group" style="margin-bottom:var(--space-4);">
          <label class="form-label">Apply to Grade Level (optional)</label>
          <select class="form-select" name="grade">
            <option value="">— All / assign later —</option>
            ${schoolConfig.gradeOptionsHTML()}
          </select>
        </div>
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);">
          <button type="button" class="btn btn-sm btn-ghost"
            onclick="document.querySelectorAll('#seed-form input[type=checkbox]:not(:disabled)').forEach(cb=>cb.checked=true)">Select All</button>
          <button type="button" class="btn btn-sm btn-ghost"
            onclick="document.querySelectorAll('#seed-form input[type=checkbox]:not(:disabled)').forEach(cb=>cb.checked=false)">Deselect All</button>
        </div>
        <div style="max-height:55vh;overflow-y:auto;border:1px solid var(--border-primary);border-radius:var(--radius-md);">
          <table style="width:100%;border-collapse:collapse;">
            <thead style="position:sticky;top:0;z-index:1;background:var(--bg-secondary);">
              <tr>
                <th style="padding:0.5rem 0.75rem;width:40px;"></th>
                <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Subject</th>
                <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Code / Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">🌱 Import Selected</button>
        </div>
      </form>
    `;
    const modal = createModal('Seed Standard Subjects', content, 'large');
    const form = modal.querySelector('#seed-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSeedSubjects(e); });
  },

  async handleSeedSubjects(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const grade = fd.get('grade') || null;
    const std = this._standardSubjects();
    const existing = dataManager.getAll('subjectCatalog').map(s => s.code?.toUpperCase());

    const toImport = std.filter(s => {
      const checked = fd.get(`seed_${s.code}`);
      return checked && !existing.includes(s.code.toUpperCase());
    });

    if (toImport.length === 0) {
      showToast('No new subjects selected to import.', 'warning');
      return;
    }

    const btn = event.target.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

    let success = 0;
    for (const s of toImport) {
      const result = await dataManager.create('subjectCatalog', {
        name: s.name,
        code: s.code,
        grade: grade || '',
        icon: s.icon,
        teacherId: null,
        description: `${s.category} subject`
      });
      if (result) success++;
    }

    document.querySelector('.modal-backdrop')?.remove();
    showToast(`✅ Imported ${success} subjects successfully!`, 'success');
    this._subjectGradeFilter = 'all';
    this._subjectSearch = '';
    this.render();
  },

  openAddSubjectModal() {
    const staff = dataManager.getAll('staff').filter(s => s.type === 'teaching');
    const content = `
          <form id="subject-form">
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Subject Name *</label>
                <input type="text" class="form-input" name="name" required placeholder="e.g., Mathematics">
              </div>
              <div class="form-group">
                <label class="form-label">Subject Code *</label>
                <input type="text" class="form-input" name="code" required placeholder="e.g., MATH-10">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Grade Level *</label>
                <select class="form-select" name="grade" required>
                  ${schoolConfig.gradeOptionsHTML()}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Icon (Emoji)</label>
                <input type="text" class="form-input" name="icon" placeholder="📚" maxlength="4">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Assigned Teacher</label>
              <select class="form-select" name="teacherId">
                <option value="">None</option>
                ${staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-input" name="description" rows="2" placeholder="Optional subject description"></textarea>
            </div>
            <div class="flex gap-3 mt-6">
              <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
              <button type="submit" class="btn btn-primary flex-1">➕ Add Subject</button>
            </div>
          </form>
        `;
    const modal = createModal('Add Subject', content);
    const form = modal.querySelector('#subject-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSaveSubject(e, null); });
  },

  openEditSubjectModal(subjectId) {
    const sub = dataManager.getById('subjectCatalog', subjectId);
    if (!sub) return;
    const staff = dataManager.getAll('staff').filter(s => s.type === 'teaching');
    const content = `
          <form id="subject-form">
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Subject Name *</label>
                <input type="text" class="form-input" name="name" required value="${sub.name}">
              </div>
              <div class="form-group">
                <label class="form-label">Subject Code *</label>
                <input type="text" class="form-input" name="code" required value="${sub.code}">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Grade Level *</label>
                <select class="form-select" name="grade" required>
                  ${schoolConfig.gradeOptionsHTML(sub.grade)}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Icon (Emoji)</label>
                <input type="text" class="form-input" name="icon" value="${sub.icon || ''}" maxlength="4">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Assigned Teacher</label>
              <select class="form-select" name="teacherId">
                <option value="">None</option>
                ${staff.map(s => `<option value="${s.id}" ${sub.teacherId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-input" name="description" rows="2">${sub.description || ''}</textarea>
            </div>
            <div class="flex gap-3 mt-6">
              <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
              <button type="submit" class="btn btn-primary flex-1">💾 Save Changes</button>
            </div>
          </form>
        `;
    const modal = createModal('Edit Subject', content);
    const form = modal.querySelector('#subject-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSaveSubject(e, subjectId); });
  },

  async handleSaveSubject(event, subjectId) {
    event.preventDefault();
    try {
      const fd = new FormData(event.target);
      const data = {
        name: fd.get('name')?.trim(),
        code: fd.get('code')?.trim().toUpperCase(),
        grade: fd.get('grade'),
        icon: fd.get('icon') || '📚',
        teacherId: fd.get('teacherId') || null,
        description: fd.get('description')?.trim() || ''
      };

      if (!data.name || !data.code) {
        showToast('Subject name and code are required', 'error');
        return;
      }

      if (subjectId) {
        const result = await dataManager.update('subjectCatalog', subjectId, data);
        if (!result) return;
        showToast('Subject updated!', 'success');
      } else {
        const result = await dataManager.create('subjectCatalog', data);
        if (!result) return;
        showToast('Subject added!', 'success');
      }

      document.querySelector('.modal-backdrop')?.remove();
      this.currentTab = 'subjects';
      this.render();
    } catch (err) {
      console.error('[GradesManagement] handleSaveSubject error:', err);
      showToast('Error saving subject: ' + err.message, 'error');
    }
  },

  async deleteSubject(subjectId) {
    const sub = dataManager.getById('subjectCatalog', subjectId);
    if (!sub) return;
    if (!confirm(`Delete subject "${sub.name}"? This will NOT remove already-assigned grades.`)) return;
    await dataManager.delete('subjectCatalog', subjectId);
    showToast('Subject deleted.', 'info');
    this.render();
  },

  // ============================================
  // TAB 2 — STUDENT ENROLLMENT
  // Individual per-student or Bulk by Grade/Class
  // ============================================

  renderEnrollmentTab() {
    const students    = dataManager.getAll('students').filter(s => s.status === 'active');
    const subjects    = dataManager.getAll('subjectCatalog');
    const enrollments = dataManager.getAll('studentSubjects');
    const mode        = this._enrollMode || 'individual';

    // Grades available
    const grades = [...new Set(students.map(s => s.grade).filter(Boolean))].sort();

    // Per-student enrollment summary
    const enrollMap = {};
    enrollments.forEach(e => { if (e.studentId) enrollMap[e.studentId] = (e.subjects || []).length; });

    return `
          <div>
            <!-- Mode Toggle -->
            <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-5);">
              <button class="btn ${mode==='individual' ? 'btn-primary' : 'btn-ghost'}"
                onclick="gradesManagementModule._enrollMode='individual';gradesManagementModule.renderCurrentTab_inplace()">
                👤 Individual Student
              </button>
              <button class="btn ${mode==='bulk' ? 'btn-primary' : 'btn-ghost'}"
                onclick="gradesManagementModule._enrollMode='bulk';gradesManagementModule.renderCurrentTab_inplace()">
                👥 Bulk Assign by Grade
              </button>
            </div>

            ${mode === 'individual' ? `
              <!-- Individual Mode -->
              <div class="card mb-5">
                <div class="card-body">
                  <div style="display:flex;flex-wrap:wrap;gap:var(--space-4);align-items:flex-end;">
                    <div class="form-group" style="flex:1;min-width:220px;margin-bottom:0;">
                      <label class="form-label">👤 Select Student</label>
                      <select class="form-select" id="enroll-student-select"
                        onchange="gradesManagementModule.loadStudentEnrollment(this.value)">
                        <option value="">— Choose a student —</option>
                        ${grades.map(g => `
                          <optgroup label="Grade ${g}">
                            ${students.filter(s => String(s.grade) === String(g)).map(s => {
                              const cnt = enrollMap[s.id] || 0;
                              return `<option value="${s.id}">${s.name} (${s.section}) — ${cnt > 0 ? cnt + ' subjects' : 'not enrolled'}</option>`;
                            }).join('')}
                          </optgroup>
                        `).join('')}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div id="enrollment-area">
                <div class="card"><div class="card-body" style="text-align:center;padding:2rem;">
                  <p style="color:var(--text-secondary);">Select a student above to manage their subject enrollment.</p>
                </div></div>
              </div>
            ` : `
              <!-- Bulk Mode -->
              <div class="card mb-5">
                <div class="card-body">
                  <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">
                    Select a grade and subjects to assign to <strong>all active students</strong> in that grade at once. Existing enrollments are preserved — only new subjects are added.
                  </p>
                  <div style="display:flex;flex-wrap:wrap;gap:var(--space-4);align-items:flex-end;">
                    <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0;">
                      <label class="form-label">🎓 Select Grade</label>
                      <select class="form-select" id="bulk-grade-select"
                        onchange="gradesManagementModule.loadBulkAssignArea(this.value)">
                        <option value="">— Choose a grade —</option>
                        ${grades.map(g => `<option value="${g}">Grade ${g} (${students.filter(s => String(s.grade) === String(g)).length} students)</option>`).join('')}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div id="bulk-enrollment-area">
                <div class="card"><div class="card-body" style="text-align:center;padding:2rem;">
                  <p style="color:var(--text-secondary);">Select a grade above to begin bulk assignment.</p>
                </div></div>
              </div>
            `}
          </div>
        `;
  },

  loadBulkAssignArea(grade) {
    const area = document.getElementById('bulk-enrollment-area');
    if (!area) return;
    if (!grade) {
      area.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;"><p style="color:var(--text-secondary);">Select a grade above.</p></div></div>';
      return;
    }

    const students    = dataManager.getAll('students').filter(s => s.status === 'active' && String(s.grade) === String(grade));
    const allSubjects = dataManager.getAll('subjectCatalog');
    const gradeSubj   = allSubjects.filter(s => String(s.grade) === String(grade));
    const otherSubj   = allSubjects.filter(s => String(s.grade) !== String(grade));
    const staff       = dataManager.getAll('staff').filter(s => s.type === 'teaching');
    const enrollments = dataManager.getAll('studentSubjects');

    if (students.length === 0) {
      area.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;"><p style="color:var(--text-secondary);">No active students in Grade ${grade}.</p></div></div>`;
      return;
    }
    if (allSubjects.length === 0) {
      area.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;"><p style="color:var(--text-secondary);">No subjects in the catalog yet. Add subjects in the <strong>Subjects</strong> tab first.</p></div></div>`;
      return;
    }

    const renderSubjCheckRow = (sub) => {
      const teacher = staff.find(t => t.id === sub.teacherId);
      return `<tr>
        <td style="padding:0.5rem 0.75rem;"><input type="checkbox" name="bulk_subj_${sub.id}" value="${sub.id}" checked style="width:16px;height:16px;"></td>
        <td style="padding:0.5rem 0.75rem;font-weight:500;">${sub.icon || '📚'} ${sub.name}</td>
        <td style="padding:0.5rem 0.75rem;"><span class="badge badge-secondary">${sub.code}</span></td>
        <td style="padding:0.5rem 0.75rem;font-size:0.8rem;color:var(--text-secondary);">${teacher ? teacher.name : '—'}</td>
      </tr>`;
    };

    area.innerHTML = `
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h4 class="card-title">🎓 Grade ${grade} Bulk Assignment</h4>
          <span class="badge badge-info">${students.length} student${students.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="card-body">
          <form id="bulk-assign-form">
            <!-- Subject Selection -->
            <div style="margin-bottom:var(--space-5);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
                <label class="form-label" style="margin:0;">Select subjects to assign:</label>
                <div style="display:flex;gap:var(--space-2);">
                  <button type="button" class="btn btn-sm btn-ghost"
                    onclick="document.querySelectorAll('#bulk-assign-form input[type=checkbox]').forEach(cb=>cb.checked=true)">Select All</button>
                  <button type="button" class="btn btn-sm btn-ghost"
                    onclick="document.querySelectorAll('#bulk-assign-form input[type=checkbox]').forEach(cb=>cb.checked=false)">Deselect All</button>
                </div>
              </div>
              <div style="border:1px solid var(--border-primary);border-radius:var(--radius-md);overflow:auto;max-height:40vh;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                    <tr>
                      <th style="padding:0.5rem 0.75rem;width:40px;"></th>
                      <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Subject</th>
                      <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Code</th>
                      <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.8rem;">Teacher</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${gradeSubj.length > 0 ? `
                      <tr><td colspan="4" style="background:var(--bg-tertiary);font-size:0.73rem;font-weight:700;color:var(--text-secondary);padding:0.3rem 0.75rem;">GRADE ${grade} SUBJECTS</td></tr>
                      ${gradeSubj.map(renderSubjCheckRow).join('')}
                    ` : ''}
                    ${otherSubj.length > 0 ? `
                      <tr><td colspan="4" style="background:var(--bg-tertiary);font-size:0.73rem;font-weight:700;color:var(--text-secondary);padding:0.3rem 0.75rem;">OTHER GRADES (optional)</td></tr>
                      ${otherSubj.map(s => { const r = renderSubjCheckRow(s); return r.replace('checked', ''); }).join('')}
                    ` : ''}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Students in this grade -->
            <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-5);">
              <p style="font-size:var(--font-size-sm);font-weight:600;margin-bottom:var(--space-2);">Will assign to ${students.length} student${students.length !== 1 ? 's' : ''} in Grade ${grade}:</p>
              <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
                ${students.map(s => `<span class="badge badge-secondary">${s.name}</span>`).join('')}
              </div>
            </div>

            <div class="flex gap-3">
              <button type="submit" class="btn btn-primary" id="bulk-assign-btn">
                🚀 Assign to All Grade ${grade} Students
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = area.querySelector('#bulk-assign-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.saveBulkEnrollment(grade, students); });
  },

  async saveBulkEnrollment(grade, students) {
    const form = document.getElementById('bulk-assign-form');
    if (!form) return;

    const allSubjects = dataManager.getAll('subjectCatalog');
    const allStaff    = dataManager.getAll('staff').filter(s => s.type === 'teaching');
    const allEnroll   = dataManager.getAll('studentSubjects');

    // Collect selected subjects
    const selectedSubjectIds = allSubjects
      .filter(sub => form.querySelector(`input[name="bulk_subj_${sub.id}"]`)?.checked)
      .map(sub => sub);

    if (selectedSubjectIds.length === 0) {
      showToast('Select at least one subject to assign.', 'warning');
      return;
    }

    const btn = form.querySelector('#bulk-assign-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    let updated = 0, created = 0;

    for (const student of students) {
      const existing = allEnroll.find(e => e.studentId === student.id);
      const currentSubjs = existing ? (existing.subjects || []) : [];

      // Merge: add new subjects, keep existing ones
      const merged = [...currentSubjs];
      for (const sub of selectedSubjectIds) {
        if (!merged.find(m => m.subjectId === sub.id)) {
          const teacher = allStaff.find(t => t.id === sub.teacherId);
          merged.push({
            subjectId:    sub.id,
            subjectName:  sub.name,
            teacherId:    sub.teacherId || null,
            teacherName:  teacher ? teacher.name : null,
            currentGrade: null,
            letterGrade:  null
          });
        }
      }

      const payload = {
        studentId:    student.id,
        studentName:  student.name,
        grade:        student.grade,
        section:      student.section,
        academicYear: window.CURRENT_ACADEMIC_YEAR || '2025-2026',
        subjects:     merged
      };

      if (existing) {
        const r = await dataManager.update('studentSubjects', existing.id, payload);
        if (r) updated++;
      } else {
        const r = await dataManager.create('studentSubjects', payload);
        if (r) created++;
      }
    }

    if (btn) { btn.disabled = false; btn.textContent = `🚀 Assign to All Grade ${grade} Students`; }
    showToast(`✅ Assigned ${selectedSubjectIds.length} subjects to ${updated + created} students! (${created} new, ${updated} updated)`, 'success');
    this.render();
  },

  loadStudentEnrollment(studentId) {
    const area = document.getElementById('enrollment-area');
    if (!studentId) {
      area.innerHTML = '<div class="card"><div class="card-body"><p style="text-align:center;color:var(--text-secondary);">Select a student above.</p></div></div>';
      return;
    }

    const student = dataManager.getById('students', studentId);
    const allSubjects = dataManager.getAll('subjectCatalog');
    const allStaff = dataManager.getAll('staff').filter(s => s.type === 'teaching');
    const allEnrollments = dataManager.getAll('studentSubjects');
    let enrollment = allEnrollments.find(e => e.studentId === studentId);

    const enrolled = enrollment ? enrollment.subjects : [];

    // Filter catalog subjects for this student's grade
    const gradeSubjects = allSubjects.filter(s => s.grade === student.grade);
    const otherSubjects = allSubjects.filter(s => s.grade !== student.grade);

    const renderSubjectRow = (sub, isEnrolled, grade, letter) => {
      const teacher = allStaff.find(s => s.id === sub.teacherId);
      return `
              <tr>
                <td><input type="checkbox" name="subject_${sub.id}" value="${sub.id}" ${isEnrolled ? 'checked' : ''}
                      onchange="gradesManagementModule.toggleEnrollmentRow('${sub.id}', this.checked)"
                      style="width:18px;height:18px;cursor:pointer;"></td>
                <td style="font-weight: var(--font-weight-medium);">${sub.icon || '📚'} ${sub.name}</td>
                <td style="color:var(--text-secondary); font-size:var(--font-size-sm);">${sub.code}</td>
                <td style="color:var(--text-secondary); font-size:var(--font-size-sm);">${teacher ? teacher.name : '—'}</td>
                <td>
                  <input type="number" id="grade_num_${sub.id}" class="form-input" style="width:90px;"
                    min="0" max="100" placeholder="0–100"
                    value="${isEnrolled && grade != null ? grade : ''}"
                    ${isEnrolled ? '' : 'disabled'}
                    onchange="gradesManagementModule.updateGradePreview('${sub.id}', this.value)">
                </td>
                <td>
                  <span id="grade_letter_${sub.id}" class="badge badge-${this.badgeForGrade(letter)}">
                    ${isEnrolled && letter ? letter : '—'}
                  </span>
                </td>
              </tr>
            `;
    };

    const enrolledCount = enrolled.length;
    area.innerHTML = `
          <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--space-2);">
              <h4 class="card-title">
                ${student.photo || '👤'} ${student.name} &nbsp;—&nbsp; Grade ${student.grade}-${student.section}
              </h4>
              <span class="badge badge-${enrolledCount > 0 ? 'success' : 'secondary'}">${enrolledCount} subject${enrolledCount !== 1 ? 's' : ''} enrolled</span>
            </div>
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4);">
                <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin:0;">
                  ✅ Check subjects to enroll. Enter current grade (0–100) for each enrolled subject.
                </p>
                <div style="display:flex;gap:var(--space-2);flex-shrink:0;">
                  <button type="button" class="btn btn-sm btn-ghost"
                    onclick="document.querySelectorAll('#enrollment-table input[type=checkbox]').forEach(cb=>{if(!cb.checked){cb.checked=true;gradesManagementModule.toggleEnrollmentRow(cb.value,true);}})">
                    ☑️ Select All Grade
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost"
                    onclick="document.querySelectorAll('#enrollment-table input[type=checkbox]').forEach(cb=>{if(cb.checked){cb.checked=false;gradesManagementModule.toggleEnrollmentRow(cb.value,false);}})">
                    Deselect All
                  </button>
                </div>
              </div>
              <div style="overflow-x:auto;">
                <table class="table" id="enrollment-table">
                  <thead>
                    <tr>
                      <th style="width:40px;">Enroll</th>
                      <th>Subject</th>
                      <th>Code</th>
                      <th>Teacher</th>
                      <th>Current Grade (%)</th>
                      <th>Letter</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${gradeSubjects.length > 0 ? `
                      <tr><td colspan="6" style="background:var(--bg-tertiary);font-size:0.73rem;font-weight:700;color:var(--text-secondary);padding:0.3rem var(--space-3);text-transform:uppercase;letter-spacing:0.05em;">Grade ${student.grade} Subjects (${gradeSubjects.length})</td></tr>
                      ${gradeSubjects.map(sub => {
      const existing = enrolled.find(e => e.subjectId === sub.id);
      return renderSubjectRow(sub, !!existing, existing?.currentGrade, existing?.letterGrade);
    }).join('')}
                    ` : ''}
                    ${otherSubjects.length > 0 ? `
                      <tr><td colspan="6" style="background:var(--bg-tertiary);font-size:0.73rem;font-weight:700;color:var(--text-secondary);padding:0.3rem var(--space-3);text-transform:uppercase;letter-spacing:0.05em;">Other Grades (${otherSubjects.length})</td></tr>
                      ${otherSubjects.map(sub => {
      const existing = enrolled.find(e => e.subjectId === sub.id);
      return renderSubjectRow(sub, !!existing, existing?.currentGrade, existing?.letterGrade);
    }).join('')}
                    ` : ''}
                    ${allSubjects.length === 0 ? `
                      <tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:var(--space-8);">
                        No subjects in catalog yet. Add subjects in the <strong>Subjects</strong> tab first.
                      </td></tr>
                    ` : ''}
                  </tbody>
                </table>
              </div>
              <div class="flex gap-3 mt-6" style="justify-content:flex-end;">
                <button class="btn btn-ghost" onclick="gradesManagementModule.loadStudentEnrollment('${studentId}')">↩️ Reset</button>
                <button class="btn btn-primary" onclick="gradesManagementModule.saveEnrollment('${studentId}')">
                  💾 Save Enrollment & Grades
                </button>
              </div>
            </div>
          </div>
        `;

    // Store the studentId reference for saveEnrollment
    this._enrollStudent = studentId;
  },

  toggleEnrollmentRow(subjectId, checked) {
    const gradeInput = document.getElementById(`grade_num_${subjectId}`);
    const letterSpan = document.getElementById(`grade_letter_${subjectId}`);
    if (gradeInput) {
      gradeInput.disabled = !checked;
      if (!checked) {
        gradeInput.value = '';
        letterSpan.textContent = '—';
        letterSpan.className = 'badge badge-secondary';
      }
    }
  },

  updateGradePreview(subjectId, value) {
    const pct = parseFloat(value);
    const letterSpan = document.getElementById(`grade_letter_${subjectId}`);
    if (!letterSpan) return;
    if (isNaN(pct)) { letterSpan.textContent = '—'; return; }
    const info = this.calcLetterGrade(pct);
    letterSpan.textContent = info.letter;
    letterSpan.className = `badge badge-${this.badgeForGrade(info.letter)}`;
  },

  async saveEnrollment(studentId) {
    const allSubjects = dataManager.getAll('subjectCatalog');
    const allStaff = dataManager.getAll('staff').filter(s => s.type === 'teaching');
    const student = dataManager.getById('students', studentId);

    const newSubjects = [];
    allSubjects.forEach(sub => {
      const cb = document.querySelector(`input[name="subject_${sub.id}"]`);
      if (!cb || !cb.checked) return;

      const gradeInput = document.getElementById(`grade_num_${sub.id}`);
      const pct = gradeInput && gradeInput.value !== '' ? parseFloat(gradeInput.value) : null;
      const teacher = allStaff.find(s => s.id === sub.teacherId);
      const gradeInfo = pct != null ? this.calcLetterGrade(pct) : { letter: null };

      newSubjects.push({
        subjectId: sub.id,
        subjectName: sub.name,
        teacherId: sub.teacherId || null,
        teacherName: teacher ? teacher.name : null,
        currentGrade: pct,
        letterGrade: gradeInfo.letter
      });
    });

    const allEnrollments = dataManager.getAll('studentSubjects');
    const existing = allEnrollments.find(e => e.studentId === studentId);

    const enrollmentData = {
      studentId: studentId,
      studentName: student.name,
      grade: student.grade,
      section: student.section,
      academicYear: window.CURRENT_ACADEMIC_YEAR || '2025-2026',
      subjects: newSubjects
    };

    if (existing) {
      const result = await dataManager.update('studentSubjects', existing.id, enrollmentData);
      if (!result) return;
    } else {
      const result = await dataManager.create('studentSubjects', enrollmentData);
      if (!result) return;
    }

    showToast(`Saved ${newSubjects.length} subjects for ${student.name}!`, 'success');
    this.loadStudentEnrollment(studentId);
  },

  // ============================================
  // TAB 3 — STUDENT GRADES
  // View/edit a student's subject grades, and
  // add / edit individual assessment records.
  // ============================================

  renderGradesTab() {
    const students = dataManager.getAll('students').filter(s => s.status === 'active');
    return `
          <div>
            <div class="flex justify-between items-center mb-6">
              <div>
                <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold);">Student Grades</h3>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">Edit subject grades and manage assessment records per student</p>
              </div>
            </div>

            <!-- Student Selector -->
            <div class="card mb-6">
              <div class="card-body" style="display:flex; flex-wrap:wrap; gap: var(--space-4); align-items:flex-end;">
                <div class="form-group" style="flex:1; min-width:200px; margin-bottom:0;">
                  <label class="form-label">Select Student</label>
                  <select class="form-select" id="grades-student-select"
                    onchange="gradesManagementModule.loadStudentGrades(this.value)">
                    <option value="">— Choose a student —</option>
                    ${students.map(s => `<option value="${s.id}">${s.name} (Grade ${s.grade}-${s.section})</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>

            <div id="student-grades-area">
              <div class="card"><div class="card-body">
                <p style="text-align:center; color: var(--text-secondary);">Select a student above to view and edit their grades.</p>
              </div></div>
            </div>
          </div>
        `;
  },

  loadStudentGrades(studentId) {
    const area = document.getElementById('student-grades-area');
    if (!studentId) {
      area.innerHTML = '<div class="card"><div class="card-body"><p style="text-align:center;color:var(--text-secondary);">Select a student above.</p></div></div>';
      return;
    }

    const student = dataManager.getById('students', studentId);
    const allEnroll = dataManager.getAll('studentSubjects');
    const enrollment = allEnroll.find(e => e.studentId === studentId);
    const subjects = enrollment ? enrollment.subjects : [];
    const allAssign = dataManager.getAll('studentAssignments').filter(a => a.studentId === studentId);

    // Cache subjects so assessment modals can access them without inline JSON
    if (!this._cachedSubjects) this._cachedSubjects = {};
    this._cachedSubjects[studentId] = subjects;

    const subjectSection = subjects.length === 0 ? `
          <div class="card mb-6"><div class="card-body">
            <div class="empty-state">
              <div class="empty-state-icon">📋</div>
              <h3 class="empty-state-title">No Subjects Enrolled</h3>
              <p class="empty-state-description">Use the <strong>Enroll Students</strong> tab to assign subjects first.</p>
            </div>
          </div></div>
        ` : `
          <div class="card mb-6">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
              <h4 class="card-title">Subject Grades</h4>
              <button class="btn btn-sm btn-primary" onclick="gradesManagementModule.openQuickGradeEdit('${studentId}')">
                ✏️ Quick Edit All
              </button>
            </div>
            <div class="card-body" style="padding:0;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Teacher</th>
                    <th>Current Grade</th>
                    <th>Letter</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${subjects.map(sub => `
                    <tr>
                      <td style="font-weight:var(--font-weight-semibold);">${sub.subjectName}</td>
                      <td style="color:var(--text-secondary);font-size:var(--font-size-sm);">${sub.teacherName || '—'}</td>
                      <td>${sub.currentGrade != null ? sub.currentGrade + '%' : '—'}</td>
                      <td>${sub.letterGrade ? `<span class="badge badge-${this.badgeForGrade(sub.letterGrade)}">${sub.letterGrade}</span>` : '—'}</td>
                      <td>
                        <button class="btn btn-sm btn-secondary"
                          onclick="gradesManagementModule.openEditSubjectGrade('${studentId}', '${sub.subjectId}')">
                          ✏️ Edit
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

    const assessSection = `
          <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
              <h4 class="card-title">Assessment Records (${allAssign.length})</h4>
              <button class="btn btn-sm btn-primary"
                onclick="gradesManagementModule.openAddAssessmentModal('${studentId}')">
                ➕ Add Record
              </button>
            </div>
            <div class="card-body" style="padding:0;">
              ${allAssign.length === 0 ? `
                <div class="empty-state" style="padding: var(--space-8);">
                  <div class="empty-state-icon">📝</div>
                  <h3 class="empty-state-title">No Assessment Records</h3>
                  <p class="empty-state-description">Add assessment records for quizzes, exams, assignments, etc.</p>
                </div>
              ` : `
                <div style="overflow-x:auto;">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Subject</th>
                        <th>Type</th>
                        <th>Score</th>
                        <th>Grade</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${allAssign.map(a => `
                        <tr>
                          <td style="font-weight:var(--font-weight-medium);">${a.title}</td>
                          <td style="font-size:var(--font-size-sm);">${a.subjectName}</td>
                          <td>${createBadge(a.type, 'secondary')}</td>
                          <td>${a.score != null ? a.score + '/' + a.totalMarks : '—'}</td>
                          <td>${a.grade ? `<span class="badge badge-${this.badgeForGrade(a.grade)}">${a.grade}</span>` : '—'}</td>
                          <td style="font-size:var(--font-size-sm);">${formatDate(a.dueDate)}</td>
                          <td>${createBadge(a.status, a.status === 'graded' ? 'success' : a.status === 'overdue' ? 'danger' : 'warning')}</td>
                          <td>
                            <div class="table-actions">
                              <button class="table-action-btn" title="Edit"
                                onclick="gradesManagementModule.openEditAssessmentModal('${studentId}', '${a.id}')">✏️</button>
                              <button class="table-action-btn" title="Delete"
                                onclick="gradesManagementModule.deleteAssessment('${studentId}', '${a.id}')">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `}
            </div>
          </div>
        `;

    area.innerHTML = `
          <div style="margin-bottom: var(--space-4);">
            <div class="flex items-center gap-3" style="margin-bottom: var(--space-6); justify-content:space-between;">
              <div class="flex items-center gap-3">
                <div style="font-size:2.5rem;">${student.photo || '👤'}</div>
                <div>
                  <div style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold);">${student.name}</div>
                  <div style="color:var(--text-secondary);">Roll No: ${student.rollNo} • Grade ${student.grade}-${student.section}</div>
                </div>
              </div>
              <button class="btn btn-secondary" onclick="gradesManagementModule.exportReportCard('${studentId}')">
                🖨️ Print Report Card
              </button>
            </div>

            ${subjectSection}
            ${assessSection}
          </div>
        `;
  },

  openEditSubjectGrade(studentId, subjectId) {
    const allEnroll = dataManager.getAll('studentSubjects');
    const enrollment = allEnroll.find(e => e.studentId === studentId);
    if (!enrollment) return;
    const sub = enrollment.subjects.find(s => s.subjectId === subjectId);
    if (!sub) return;

    const content = `
          <form id="sg-form">
            <p style="margin-bottom:var(--space-4); font-size:var(--font-size-lg); font-weight:var(--font-weight-semibold);">
              ${sub.subjectName}
            </p>
            <div class="form-group">
              <label class="form-label">Current Grade (%) *</label>
              <input type="number" class="form-input" name="currentGrade"
                min="0" max="100" step="0.5" required
                value="${sub.currentGrade != null ? sub.currentGrade : ''}"
                placeholder="Enter percentage 0–100"
                oninput="document.getElementById('sg-preview').textContent = gradesManagementModule.calcLetterGrade(parseFloat(this.value)||0).letter">
            </div>
            <div class="form-group">
              <label class="form-label">Letter Grade Preview</label>
              <div id="sg-preview" class="badge badge-${this.badgeForGrade(sub.letterGrade)}"
                style="font-size:var(--font-size-lg); padding: var(--space-2) var(--space-4);">
                ${sub.letterGrade || '—'}
              </div>
            </div>
            <div class="flex gap-3 mt-6">
              <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
              <button type="submit" class="btn btn-primary flex-1">💾 Save Grade</button>
            </div>
          </form>
        `;
    const modal = createModal('Edit Subject Grade', content);
    const form = modal.querySelector('#sg-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSaveSubjectGrade(e, studentId, subjectId); });
  },

  async handleSaveSubjectGrade(event, studentId, subjectId) {
    event.preventDefault();
    const pct = parseFloat(new FormData(event.target).get('currentGrade'));
    const info = this.calcLetterGrade(pct);

    const allEnroll = dataManager.getAll('studentSubjects');
    const enrollment = allEnroll.find(e => e.studentId === studentId);
    if (!enrollment) return;

    const updatedSubjects = enrollment.subjects.map(s =>
      s.subjectId === subjectId
        ? { ...s, currentGrade: pct, letterGrade: info.letter }
        : s
    );

    await dataManager.update('studentSubjects', enrollment.id, { subjects: updatedSubjects });
    showToast('Grade updated!', 'success');
    document.querySelector('.modal-backdrop')?.remove();
    this.loadStudentGrades(studentId);
  },

  openQuickGradeEdit(studentId) {
    const allEnroll = dataManager.getAll('studentSubjects');
    const enrollment = allEnroll.find(e => e.studentId === studentId);
    if (!enrollment || !enrollment.subjects.length) {
      showToast('No subjects enrolled for this student.', 'warning');
      return;
    }

    const rows = enrollment.subjects.map(sub => `
          <tr>
            <td style="font-weight:var(--font-weight-medium);">${sub.subjectName}</td>
            <td>
              <input type="number" name="grade_${sub.subjectId}" class="form-input"
                style="width:100px;" min="0" max="100" step="0.5"
                value="${sub.currentGrade != null ? sub.currentGrade : ''}"
                placeholder="0–100">
            </td>
            <td>
              <span id="ql_${sub.subjectId}" class="badge badge-${this.badgeForGrade(sub.letterGrade)}">
                ${sub.letterGrade || '—'}
              </span>
            </td>
          </tr>
        `).join('');

    const content = `
          <form id="qg-form">
            <div style="max-height:60vh; overflow-y:auto;">
              <table class="table">
                <thead><tr><th>Subject</th><th>Grade (%)</th><th>Letter</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="flex gap-3 mt-6">
              <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
              <button type="submit" class="btn btn-primary flex-1">💾 Save All Grades</button>
            </div>
          </form>
        `;
    const modal = createModal('Quick Edit — All Subject Grades', content, 'large');
    const form = modal.querySelector('#qg-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleQuickGradeSave(e, studentId); });
  },

  async handleQuickGradeSave(event, studentId) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const allEnroll = dataManager.getAll('studentSubjects');
    const enrollment = allEnroll.find(e => e.studentId === studentId);
    if (!enrollment) return;

    const updatedSubjects = enrollment.subjects.map(sub => {
      const raw = fd.get(`grade_${sub.subjectId}`);
      if (raw === '' || raw == null) return sub;
      const pct = parseFloat(raw);
      const info = this.calcLetterGrade(pct);
      return { ...sub, currentGrade: pct, letterGrade: info.letter };
    });

    await dataManager.update('studentSubjects', enrollment.id, { subjects: updatedSubjects });
    showToast('All grades saved!', 'success');
    document.querySelector('.modal-backdrop')?.remove();
    this.loadStudentGrades(studentId);
  },

  // -------- Assessment CRUD --------

  openAddAssessmentModal(studentId) {
    const subjects = this._cachedSubjects?.[studentId] || [];
    const content = this.buildAssessmentForm(studentId, null, subjects);
    const modal = createModal('Add Assessment Record', content, 'large');
    const form = modal.querySelector('#assessment-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSaveAssessment(e, studentId, null); });
  },

  openEditAssessmentModal(studentId, assessmentId) {
    const subjects = this._cachedSubjects?.[studentId] || [];
    const content = this.buildAssessmentForm(studentId, assessmentId, subjects);
    const modal = createModal('Edit Assessment Record', content, 'large');
    const form = modal.querySelector('#assessment-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSaveAssessment(e, studentId, assessmentId); });
  },

  buildAssessmentForm(studentId, assessmentId, subjects) {
    const a = assessmentId ? dataManager.getById('studentAssignments', assessmentId) : null;
    const subOpts = subjects.map(s =>
      `<option value="${s.subjectId}" data-name="${s.subjectName}" ${a && a.subjectId === s.subjectId ? 'selected' : ''}>${s.subjectName}</option>`
    ).join('');

    return `
          <form id="assessment-form">
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Title *</label>
                <input type="text" class="form-input" name="title" required value="${a ? a.title : ''}" placeholder="e.g., Mid-Term Exam">
              </div>
              <div class="form-group">
                <label class="form-label">Subject *</label>
                <select class="form-select" name="subjectId" required>${subOpts || '<option value="">No subjects enrolled</option>'}</select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Type *</label>
                <select class="form-select" name="type" required>
                  ${['assignment', 'quiz', 'exam', 'test', 'project'].map(t =>
      `<option value="${t}" ${a && a.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Status *</label>
                <select class="form-select" name="status" required>
                  ${['upcoming', 'pending', 'graded', 'overdue'].map(st =>
      `<option value="${st}" ${a && a.status === st ? 'selected' : ''}>${st.charAt(0).toUpperCase() + st.slice(1)}</option>`
    ).join('')}
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Total Marks *</label>
                <input type="number" class="form-input" name="totalMarks" required min="1" value="${a ? a.totalMarks : 100}">
              </div>
              <div class="form-group">
                <label class="form-label">Score Achieved</label>
                <input type="number" class="form-input" name="score" min="0"
                  value="${a && a.score != null ? a.score : ''}" placeholder="Leave blank if not graded">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Due Date *</label>
                <input type="date" class="form-input" name="dueDate" required value="${a ? a.dueDate : ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Submitted Date</label>
                <input type="date" class="form-input" name="submittedDate" value="${a && a.submittedDate ? a.submittedDate : ''}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Teacher Remarks</label>
              <textarea class="form-input" name="remarks" rows="2" placeholder="Optional feedback">${a && a.remarks ? a.remarks : ''}</textarea>
            </div>
            <div class="flex gap-3 mt-6">
              <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
              <button type="submit" class="btn btn-primary flex-1">💾 ${assessmentId ? 'Save Changes' : 'Add Record'}</button>
            </div>
          </form>
        `;
  },

  async handleSaveAssessment(event, studentId, assessmentId) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const subjectSelect = event.target.querySelector('[name="subjectId"]');
    const selectedOption = subjectSelect ? subjectSelect.options[subjectSelect.selectedIndex] : null;

    const totalMarks = parseInt(fd.get('totalMarks'));
    const scoreRaw = fd.get('score');
    const score = scoreRaw !== '' && scoreRaw != null ? parseFloat(scoreRaw) : null;
    const pct = score != null ? (score / totalMarks) * 100 : null;
    const gradeInfo = pct != null ? this.calcLetterGrade(pct) : { letter: null };

    const data = {
      studentId,
      subjectId: fd.get('subjectId'),
      subjectName: selectedOption ? selectedOption.dataset.name : fd.get('subjectId'),
      title: fd.get('title').trim(),
      type: fd.get('type'),
      status: fd.get('status'),
      totalMarks,
      score,
      grade: gradeInfo.letter,
      dueDate: fd.get('dueDate'),
      submittedDate: fd.get('submittedDate') || null,
      remarks: fd.get('remarks').trim() || null
    };

    if (assessmentId) {
      const result = await dataManager.update('studentAssignments', assessmentId, data);
      if (!result) return;
      showToast('Assessment updated!', 'success');
    } else {
      const result = await dataManager.create('studentAssignments', data);
      if (!result) return;
      showToast('Assessment added!', 'success');
    }

    document.querySelector('.modal-backdrop')?.remove();
    this.loadStudentGrades(studentId);
  },

  async deleteAssessment(studentId, assessmentId) {
    if (!confirm('Delete this assessment record?')) return;
    await dataManager.delete('studentAssignments', assessmentId);
    showToast('Assessment deleted.', 'info');
    this.loadStudentGrades(studentId);
  },

  // ============================================
  // REPORT CARD PDF EXPORT
  // ============================================

  exportReportCard(studentId) {
    const student = dataManager.getById('students', studentId);
    if (!student) { showToast('Student not found', 'error'); return; }

    const allEnroll = dataManager.getAll('studentSubjects');
    const enrollment = allEnroll.find(e => e.studentId === studentId);
    const subjects = enrollment ? enrollment.subjects : [];

    const allAssign = dataManager.getAll('studentAssignments').filter(a => a.studentId === studentId);
    const graded = allAssign.filter(a => a.score != null);

    // Compute overall average from subject grades
    const withGrade = subjects.filter(s => s.currentGrade != null);
    const overallAvg = withGrade.length > 0
      ? (withGrade.reduce((sum, s) => sum + s.currentGrade, 0) / withGrade.length).toFixed(1)
      : null;

    const overallLetter = overallAvg != null ? this.calcLetterGrade(parseFloat(overallAvg)).letter : '—';

    const letterBadgeColor = (l) => {
      if (!l) return '#94a3b8';
      if (l.startsWith('A')) return '#16a34a';
      if (l.startsWith('B')) return '#2563eb';
      if (l.startsWith('C')) return '#d97706';
      return '#dc2626';
    };

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const academicYear = window.CURRENT_ACADEMIC_YEAR || '2025-2026';

    const subjectRows = subjects.map(s => `
      <tr>
        <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; font-weight:600;">${s.subjectName}</td>
        <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; text-align:center;">${s.teacherName || '—'}</td>
        <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; text-align:center; font-weight:700;">${s.currentGrade != null ? s.currentGrade + '%' : '—'}</td>
        <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; text-align:center;">
          <span style="background:${letterBadgeColor(s.letterGrade)}; color:white; padding:3px 12px; border-radius:12px; font-weight:700; font-size:13px;">${s.letterGrade || '—'}</span>
        </td>
      </tr>
    `).join('');

    const assessRows = graded.slice(-10).reverse().map(a => `
      <tr>
        <td style="padding:8px 14px; border-bottom:1px solid #e2e8f0;">${a.title}</td>
        <td style="padding:8px 14px; border-bottom:1px solid #e2e8f0;">${a.subjectName}</td>
        <td style="padding:8px 14px; border-bottom:1px solid #e2e8f0; text-align:center; text-transform:capitalize;">${a.type}</td>
        <td style="padding:8px 14px; border-bottom:1px solid #e2e8f0; text-align:center; font-weight:700;">${a.score}/${a.totalMarks}</td>
        <td style="padding:8px 14px; border-bottom:1px solid #e2e8f0; text-align:center;">
          <span style="background:${letterBadgeColor(a.grade)}; color:white; padding:2px 10px; border-radius:10px; font-weight:700; font-size:12px;">${a.grade || '—'}</span>
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Report Card — ${student.name}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; background: white; padding: 32px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 28px; }
          .school-name { font-size: 22px; font-weight: 800; color: #4338ca; }
          .school-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          .report-title { font-size: 15px; font-weight: 700; color: #6366f1; text-align: right; }
          .report-date { font-size: 12px; color: #94a3b8; margin-top: 4px; text-align: right; }
          .student-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; }
          .student-name { font-size: 20px; font-weight: 800; }
          .student-meta { font-size: 13px; color: #64748b; margin-top: 6px; }
          .overall { text-align: center; }
          .overall-pct { font-size: 28px; font-weight: 900; color: #4338ca; }
          .overall-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
          .overall-grade { display: inline-block; background: ${letterBadgeColor(overallLetter)}; color: white; padding: 4px 18px; border-radius: 20px; font-size: 18px; font-weight: 800; margin-top: 4px; }
          .section-title { font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #6366f1; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
          thead th { background: #4338ca; color: white; padding: 10px 14px; text-align: left; font-size: 13px; font-weight: 700; }
          thead th:nth-child(n+3) { text-align: center; }
          tbody tr:hover { background: #f8fafc; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; }
          @media print {
            body { padding: 20px; }
            .no-print { display: none !important; }
            @page { margin: 1cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="school-name">TBD Academy</div>
            <div class="school-sub">Excellence in Education</div>
          </div>
          <div>
            <div class="report-title">🎓 STUDENT REPORT CARD</div>
            <div class="report-date">Academic Year: ${academicYear}</div>
            <div class="report-date">Generated: ${today}</div>
          </div>
        </div>

        <div class="student-box">
          <div>
            <div class="student-name">${student.name}</div>
            <div class="student-meta">
              Roll No: <strong>${student.rollNo || '—'}</strong> &nbsp;|&nbsp;
              Grade: <strong>${student.grade}</strong> &nbsp;|&nbsp;
              Section: <strong>${student.section}</strong>
            </div>
          </div>
          <div class="overall">
            <div class="overall-label">Overall Average</div>
            <div class="overall-pct">${overallAvg != null ? overallAvg + '%' : 'N/A'}</div>
            <div class="overall-grade">${overallLetter}</div>
          </div>
        </div>

        ${subjects.length > 0 ? `
          <div class="section-title">Subject Performance</div>
          <table>
            <thead><tr><th>Subject</th><th>Teacher</th><th>Grade (%)</th><th>Letter</th></tr></thead>
            <tbody>${subjectRows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px;">No subjects enrolled</td></tr>'}</tbody>
          </table>
          ` : ''
      }

        ${graded.length > 0 ? `
          <div class="section-title">Recent Assessments (Last 10)</div>
          <table>
            <thead><tr><th>Title</th><th>Subject</th><th>Type</th><th>Score</th><th>Grade</th></tr></thead>
            <tbody>${assessRows}</tbody>
          </table>
          ` : ''
      }

        <div class="footer">
          <span>Student ID: ${studentId}</span>
          <span>Printed on ${today}</span>
          <span>TBD Academy Portal</span>
        </div>

        <div class="no-print" style="text-align:center; margin-top:24px;">
          <button onclick="window.print()" style="padding:12px 32px; background:#4338ca; color:white; border:none; border-radius:8px; font-size:16px; font-weight:700; cursor:pointer;">
            🖨️ Print / Save as PDF
          </button>
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      showToast('Pop-up blocked. Allow pop-ups and try again.', 'warning');
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  },

  // ============================================
  // UTILS
  // ============================================

  calcLetterGrade(pct) {
    if (pct >= 90) return { letter: 'A+' };
    if (pct >= 80) return { letter: 'A' };
    if (pct >= 75) return { letter: 'B+' };
    if (pct >= 70) return { letter: 'B' };
    if (pct >= 65) return { letter: 'C+' };
    if (pct >= 60) return { letter: 'C' };
    if (pct >= 50) return { letter: 'D' };
    return { letter: 'F' };
  },

  badgeForGrade(letter) {
    if (!letter) return 'secondary';
    if (letter.startsWith('A')) return 'success';
    if (letter.startsWith('B')) return 'info';
    if (letter.startsWith('C')) return 'warning';
    return 'danger';
  }
};

// Register globally
if (typeof window !== 'undefined') {
  window.gradesManagementModule = gradesManagementModule;
}
