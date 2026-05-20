// ================================================================
// ACADEMIC HUB — Classes · Timetable · Assessments · Grades · Lesson Plans · Subjects
// Consolidated module replacing academics.js + class-schedule.js + lesson-plans.js
// ================================================================

const academicsModule = {

  // ── State ──────────────────────────────────────────────────────
  _tab: 'classes',

  // Classes
  _classSearch: '',

  // Timetable
  _ttGrade: 'all', _ttSection: '', _ttDay: 'all',
  _pendingScheduleData: null,

  // Assessments
  _assessSearch: '', _filterGrade: 'all', _filterStatus: 'all',

  // Grades
  _selAssessment: null, _pendingGrades: {},

  // Lesson Plans
  _lpTab: 'my-plans', _lpWeekFilter: '', _lpSubjectFilter: 'all', _lpStatusFilter: 'all',
  _lpSelectedPlan: null, _currentTeacher: null,

  // Subjects
  _subjectSearch: '', _subjectGradeFilter: 'all',

  // ── Init ─────────────────────────────────────────────────────
  async init(container) {
    this.container = container || document.getElementById('main-content');
    this.container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:400px;"><div class="spinner"></div></div>';
    await dataManager.waitForReady();
    this._resolveTeacher();
    if (!this._lpWeekFilter) {
      const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
      this._lpWeekFilter = d.toISOString().split('T')[0];
    }
    this.render();
    if (this._onChange) window.removeEventListener('datamanager:change', this._onChange);
    this._onChange = (e) => {
      const watched = ['classes','schoolSchedules','students','staff','assessments','grades',
                       'subjectCatalog','studentSubjects','lessonPlans'];
      if (watched.includes(e.detail?.collection)) { this._resolveTeacher(); this.render(); }
    };
    window.addEventListener('datamanager:change', this._onChange);
  },

  // ── Helpers ──────────────────────────────────────────────────
  _esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; },
  _session() { return typeof authManager !== 'undefined' ? authManager.getSession() : null; },
  _isAdmin() { const r = this._session()?.role; return r === 'admin' || r === 'staff'; },

  _letterGrade(pct) {
    if (pct >= 90) return 'A+'; if (pct >= 75) return 'A';
    if (pct >= 65) return 'B';  if (pct >= 55) return 'C';
    if (pct >= 45) return 'D';  return 'F';
  },
  _gradeColor(pct) {
    if (pct >= 75) return '#10b981'; if (pct >= 55) return '#f59e0b';
    if (pct >= 45) return '#f97316'; return '#ef4444';
  },
  _subjectGrades(s) {
    if (Array.isArray(s.grades) && s.grades.length > 0) return s.grades;
    if (s.grade) return [s.grade]; return [];
  },
  _calcAvg(grades) {
    const valid = (grades || []).filter(g => g.score != null && (g.total_marks || g.totalMarks));
    if (!valid.length) return 0;
    return Math.round(valid.reduce((s, g) => s + (g.score / (g.total_marks || g.totalMarks || 100)) * 100, 0) / valid.length);
  },

  _resolveTeacher() {
    const session = this._session();
    if (!session) { this._currentTeacher = null; return; }
    const staff = dataManager.getAll('staff') || [];
    const t = staff.find(s => s.authId === session.supabaseId || s.auth_id === session.supabaseId)
           || staff.find(s => s.id === session.userId);
    this._currentTeacher = t
      ? { ...t, sessionId: session.supabaseId, role: session.role }
      : { id: session.supabaseId, name: session.fullName, sessionId: session.supabaseId, role: session.role };
  },

  _getUniqueClasses() {
    const students = dataManager.getAll('students') || [];
    const map = new Map();
    students.forEach(s => { if (s.grade && s.section) map.set(`${s.grade}|${s.section}`, { grade: s.grade, section: s.section }); });
    return [...map.values()].sort((a, b) => String(a.grade).localeCompare(String(b.grade)) || a.section.localeCompare(b.section));
  },

  _getClasses() { return dataManager.getAll('classes') || []; },
  _getSchedules() { return dataManager.getAll('schoolSchedules') || []; },
  _getStaff() { return (dataManager.getAll('staff') || []).filter(s => s.type === 'teaching'); },

  _getAvailableClasses() {
    const seen = new Set(); const list = [];
    const add = (grade, section) => { const k = `${grade}|${section}`; if (!seen.has(k)) { seen.add(k); list.push({ grade, section }); } };
    try { (window.schoolConfig?.getAllGrades() || []).forEach(g => (g.sections || ['A']).forEach(sec => add(g.name, sec))); } catch(e) {}
    (dataManager.getAll('students') || []).forEach(s => { if (s.grade && s.section) add(s.grade, s.section); });
    (dataManager.getAll('classes') || []).forEach(c => { if (c.grade && c.section) add(c.grade, c.section); });
    return list.sort((a, b) => String(a.grade).localeCompare(String(b.grade)) || String(a.section).localeCompare(String(b.section)));
  },

  _getAssessments() {
    const all = dataManager.getAll('assessments') || [];
    if (this._isAdmin()) return all;
    const myClasses = this._getUniqueClasses();
    return all.filter(a => myClasses.some(c => String(c.grade) === String(a.grade) && c.section === a.section));
  },

  // ── Direct Supabase CRUD ──────────────────────────────────────
  async _insertClass(data) {
    const row = { grade: data.grade, section: data.section, class_teacher: data.class_teacher || '',
                  student_count: data.student_count || 0, room: data.room || '', academic_year: data.academic_year || '2025-2026' };
    const { data: res, error } = await supabaseClient.from('classes').insert(row).select();
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return null; }
    return res;
  },
  async _updateClass(id, data) {
    const row = { updated_at: new Date().toISOString() };
    ['section','class_teacher','student_count','room','academic_year'].forEach(k => { if (data[k] !== undefined) row[k] = data[k]; });
    const { error } = await supabaseClient.from('classes').update(row).eq('id', id);
    if (error) { showToast('Failed to update: ' + error.message, 'error'); return false; }
    return true;
  },
  async _deleteClassRow(id) {
    const { error } = await supabaseClient.from('classes').delete().eq('id', id);
    if (error) { showToast('Failed to delete: ' + error.message, 'error'); return false; }
    return true;
  },
  async _insertSchedule(data) {
    const row = { type: data.type || 'class', title: data.title || '', description: data.description || null,
      grade: data.grade || null, section: data.section || null, day: data.day || null,
      start_time: data.start_time || null, end_time: data.end_time || null,
      start_date: data.start_date || null, end_date: data.end_date || null,
      room: data.room || null, teacher: data.teacher || null, subject: data.subject || null,
      period: data.period || null, recurring: data.recurring || false,
      status: data.status || 'active', academic_year: data.academic_year || '2025-2026' };
    const { data: res, error } = await supabaseClient.from('school_schedules').insert(row).select();
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return null; }
    return res;
  },
  async _updateSchedule(id, data) {
    const allowed = ['type','title','description','grade','section','day','start_time','end_time',
                     'start_date','end_date','room','teacher','subject','period','recurring','status','academic_year'];
    const row = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (data[k] !== undefined) row[k] = data[k]; });
    const { error } = await supabaseClient.from('school_schedules').update(row).eq('id', id);
    if (error) { showToast('Failed to update: ' + error.message, 'error'); return false; }
    return true;
  },
  async _deleteScheduleRow(id) {
    const { error } = await supabaseClient.from('school_schedules').delete().eq('id', id);
    if (error) { showToast('Failed to delete: ' + error.message, 'error'); return false; }
    return true;
  },
  async _refreshAndRender() {
    await Promise.all([dataManager.refresh('classes'), dataManager.refresh('schoolSchedules'), dataManager.refresh('students')]);
    this.render();
  },

  // ── Main Render ──────────────────────────────────────────────
  render() {
    if (!this.container) return;
    const assessments = this._getAssessments();
    const grades      = dataManager.getAll('grades') || [];
    const subjects    = dataManager.getAll('subjectCatalog') || [];
    const classes     = this._getClasses();
    const schedules   = this._getSchedules();
    const lpAll       = dataManager.getAll('lessonPlans') || [];
    const lpPending   = lpAll.filter(p => p.status === 'submitted').length;

    const headerActions = {
      classes:   this._isAdmin() ? `<button class="btn btn-primary" onclick="academicsModule.showAddClassModal()">➕ Add Class</button>` : '',
      timetable: this._isAdmin() ? `<button class="btn btn-primary" onclick="academicsModule.showAddScheduleModal()">➕ Add Schedule</button>` : '',
      assessments: `<button class="btn btn-primary" onclick="academicsModule._openAddAssessmentModal()">➕ New Assessment</button>`,
      grades:    '',
      lessonPlans: `<button class="btn btn-primary" onclick="academicsModule.openCreateModal()">➕ New Plan</button>`,
      subjects:  this._isAdmin() ? `<div style="display:flex;gap:8px;"><button class="btn btn-secondary" onclick="academicsModule._openSeedModal()">🌱 Seed</button><button class="btn btn-primary" onclick="academicsModule._openAddSubjectModal()">➕ Add Subject</button></div>` : '',
    }[this._tab] || '';

    this.container.innerHTML = `
      <div class="animate-fadeIn" style="max-width:1200px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="margin:0;font-size:1.5rem;font-weight:700;">🎓 Academic Hub</h1>
            <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.875rem;">Classes · Timetable · Assessments · Grades · Lesson Plans · Subjects</p>
          </div>
          ${headerActions}
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:24px;">
          ${this._stat('🏫', 'Classes', classes.length || this._getAvailableClasses().length, '#6366f1')}
          ${this._stat('📅', 'Schedules', schedules.filter(s => s.type === 'class').length, '#3b82f6')}
          ${this._stat('📝', 'Assessments', assessments.length, '#f59e0b')}
          ${this._stat('📊', 'Avg Score', this._calcAvg(grades) + '%', '#10b981')}
          ${this._isAdmin() ? this._stat('⏳', 'Plans Pending', lpPending, lpPending > 0 ? '#ef4444' : '#94a3b8') : ''}
        </div>

        <!-- Tabs -->
        <div style="display:flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:12px;margin-bottom:24px;overflow-x:auto;width:fit-content;max-width:100%;">
          ${this._tabBtn('classes',    '🏫 Classes')}
          ${this._tabBtn('timetable',  '📅 Timetable')}
          ${this._tabBtn('assessments','📝 Assessments')}
          ${this._tabBtn('grades',     '📊 Grades')}
          ${this._tabBtn('lessonPlans','📖 Lesson Plans')}
          ${this._isAdmin() ? this._tabBtn('subjects', '📚 Subjects') : ''}
        </div>

        <div id="hub-content">${this._renderTabContent()}</div>
      </div>`;
  },

  _stat(icon, label, value, color) {
    return `<div style="background:white;border-radius:12px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
      <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${icon} ${label}</div>
      <div style="font-size:1.5rem;font-weight:700;color:${color};">${value}</div>
    </div>`;
  },

  _tabBtn(id, label) {
    const active = this._tab === id;
    return `<button onclick="academicsModule._switchTab('${id}')"
      style="padding:9px 18px;border:none;border-radius:9px;font-size:0.84rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s;
      ${active ? 'background:white;color:#0f172a;box-shadow:0 1px 4px rgba(0,0,0,0.1);' : 'background:transparent;color:#64748b;'}">
      ${label}</button>`;
  },

  _switchTab(tab) { this._tab = tab; this._selAssessment = null; this.render(); },
  _refreshContent() { const el = document.getElementById('hub-content'); if (el) el.innerHTML = this._renderTabContent(); },

  _renderTabContent() {
    switch (this._tab) {
      case 'classes':     return this._renderClassesTab();
      case 'timetable':   return this._renderTimetableTab();
      case 'assessments': return this._renderAssessmentsTab();
      case 'grades':      return this._renderGradesTab();
      case 'lessonPlans': return this._renderLessonPlansTab();
      case 'subjects':    return this._isAdmin() ? this._renderSubjectsTab() : '';
      default:            return '';
    }
  },

  // ================================================================
  // TAB 1: CLASSES
  // ================================================================
  _renderClassesTab() {
    const gradeMap = {};
    const addEntry = (grade, section, record) => {
      if (!gradeMap[grade]) gradeMap[grade] = [];
      if (!gradeMap[grade].find(x => x.section === section)) gradeMap[grade].push({ ...record, grade, section });
    };
    // schoolConfig
    try { (window.schoolConfig?.getAllGrades() || []).forEach(g => (g.sections || ['A']).forEach(s => addEntry(g.name, s, { isSynthetic: true, student_count: 0 }))); } catch(e) {}
    // students
    (dataManager.getAll('students') || []).forEach(s => { if (s.grade && s.section) addEntry(s.grade, s.section, { isSynthetic: true, student_count: 0 }); });
    // DB classes (override synthetic)
    this._getClasses().forEach(c => {
      if (!gradeMap[c.grade]) gradeMap[c.grade] = [];
      const idx = gradeMap[c.grade].findIndex(x => x.section === c.section);
      if (idx >= 0) gradeMap[c.grade][idx] = c; else gradeMap[c.grade].push(c);
    });

    // Augment with live student counts
    const students = dataManager.getAll('students') || [];
    const teachers = this._getStaff();
    const gradeKeys = Object.keys(gradeMap).sort((a, b) => String(a).localeCompare(String(b)));

    const q = this._classSearch.toLowerCase();
    const filtered = gradeKeys.filter(g => !q || g.toLowerCase().includes(q) ||
      gradeMap[g].some(c => (c.section || '').toLowerCase().includes(q) || (c.class_teacher || '').toLowerCase().includes(q)));

    if (filtered.length === 0) return `
      <div style="text-align:center;padding:60px;color:var(--text-secondary);">
        <div style="font-size:3rem;margin-bottom:12px;">🏫</div>
        <p style="font-weight:600;margin:0 0 4px;">No classes found</p>
        ${this._isAdmin() ? `<button class="btn btn-primary" style="margin-top:12px;" onclick="academicsModule.showAddClassModal()">➕ Add Class</button>` : ''}
      </div>`;

    return `
      <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;flex-wrap:wrap;">
        <input type="text" class="form-input" placeholder="🔍 Search grade or teacher…" value="${this._esc(this._classSearch)}"
          oninput="academicsModule._classSearch=this.value;academicsModule._refreshContent()"
          style="flex:1;min-width:180px;max-width:280px;margin:0;">
        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:auto;">${filtered.length} grade level${filtered.length !== 1 ? 's' : ''}</span>
      </div>
      ${filtered.map(grade => {
        const classes = gradeMap[grade];
        return `
          <div style="margin-bottom:20px;">
            <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Grade ${this._esc(grade)}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
              ${classes.map(c => {
                const sc = students.filter(s => String(s.grade) === String(c.grade) && s.section === c.section).length;
                const teacher = teachers.find(t => t.id === c.class_teacher || t.name === c.class_teacher);
                const isSynth = c.isSynthetic && !c.id?.startsWith('synth');
                return `
                  <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;border-left:4px solid #6366f1;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                      <div>
                        <div style="font-weight:700;font-size:1rem;color:#0f172a;">Grade ${this._esc(c.grade)} — Section ${this._esc(c.section)}</div>
                        <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">👩‍🏫 ${teacher ? this._esc(teacher.name) : (c.class_teacher ? this._esc(c.class_teacher) : '<em>No class teacher</em>')}</div>
                      </div>
                      ${this._isAdmin() && !c.isSynthetic ? `
                        <div style="display:flex;gap:4px;">
                          <button class="btn btn-ghost btn-sm" onclick="academicsModule.showEditClassModal('${c.id}')">✏️</button>
                          <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="academicsModule.deleteClass('${c.id}')">🗑️</button>
                        </div>` : ''}
                    </div>
                    <div style="display:flex;gap:12px;font-size:0.8rem;color:#64748b;">
                      <span>👥 ${sc} student${sc !== 1 ? 's' : ''}</span>
                      ${c.room ? `<span>🏛️ ${this._esc(c.room)}</span>` : ''}
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('')}`;
  },

  showAddClassModal() {
    const teachers = this._getStaff();
    const grades = ['Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JSS1','JSS2','JSS3','SS1','SS2','SS3'];
    const content = `
      <form id="add-class-form">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">Grade *</label>
            <select id="cls-grade" class="form-input" required>
              <option value="">— Select —</option>
              ${grades.map(g => `<option value="${g}">${g}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Section *</label>
            <input type="text" id="cls-section" class="form-input" placeholder="e.g. A" required maxlength="5">
          </div>
          <div class="form-group">
            <label class="form-label">Class Teacher</label>
            <select id="cls-teacher" class="form-input">
              <option value="">— Unassigned —</option>
              ${teachers.map(t => `<option value="${this._esc(t.id)}">${this._esc(t.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Room</label>
            <input type="text" id="cls-room" class="form-input" placeholder="e.g. Block A - Room 2">
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="button" class="btn btn-primary flex-1" onclick="academicsModule.saveClass()">✓ Add Class</button>
        </div>
      </form>`;
    createModal('Add Class', content);
  },

  async saveClass() {
    const grade   = (document.getElementById('cls-grade')?.value || '').trim();
    const section = (document.getElementById('cls-section')?.value || '').trim().toUpperCase();
    const teacher = document.getElementById('cls-teacher')?.value || '';
    const room    = (document.getElementById('cls-room')?.value || '').trim();
    if (!grade || !section) { showToast('Grade and section are required', 'error'); return; }
    const res = await this._insertClass({ grade, section, class_teacher: teacher, room });
    document.querySelector('.modal-backdrop')?.remove();
    if (res) { await this._refreshAndRender(); showToast('Class added', 'success'); }
  },

  showEditClassModal(id) {
    const c = this._getClasses().find(x => x.id === id); if (!c) return;
    const teachers = this._getStaff();
    const content = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div class="form-group">
          <label class="form-label">Section</label>
          <input type="text" id="ecls-section" class="form-input" value="${this._esc(c.section || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Class Teacher</label>
          <select id="ecls-teacher" class="form-input">
            <option value="">— Unassigned —</option>
            ${teachers.map(t => `<option value="${this._esc(t.id)}" ${c.class_teacher === t.id || c.class_teacher === t.name ? 'selected' : ''}>${this._esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Room</label>
          <input type="text" id="ecls-room" class="form-input" value="${this._esc(c.room || '')}">
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="academicsModule.updateClass('${id}')">✓ Save</button>
      </div>`;
    createModal(`Edit Grade ${c.grade} — Section ${c.section}`, content);
  },

  async updateClass(id) {
    const section = (document.getElementById('ecls-section')?.value || '').trim().toUpperCase();
    const teacher = document.getElementById('ecls-teacher')?.value || '';
    const room    = (document.getElementById('ecls-room')?.value || '').trim();
    const ok = await this._updateClass(id, { section, class_teacher: teacher, room });
    document.querySelector('.modal-backdrop')?.remove();
    if (ok) { await this._refreshAndRender(); showToast('Class updated', 'success'); }
  },

  deleteClass(id) {
    createModal('Delete Class', `
      <p style="color:#64748b;margin-bottom:20px;">This removes the class record only. Students and schedules are not affected.</p>
      <div class="flex gap-3">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn flex-1" style="background:#ef4444;color:white;" onclick="closeModal(this);academicsModule._confirmDeleteClass('${id}')">Delete</button>
      </div>`);
  },

  async _confirmDeleteClass(id) {
    const ok = await this._deleteClassRow(id);
    if (ok) { await this._refreshAndRender(); showToast('Class deleted', 'info'); }
  },

  // ================================================================
  // TAB 2: TIMETABLE
  // ================================================================
  _renderTimetableTab() {
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    const allClasses = this._getAvailableClasses();
    const gradeKeys = [...new Set(allClasses.map(c => c.grade))].sort();
    const schedules = this._getSchedules().filter(s => s.type === 'class');

    let filtered = schedules;
    if (this._ttGrade !== 'all') filtered = filtered.filter(s => String(s.grade) === this._ttGrade);
    if (this._ttSection) filtered = filtered.filter(s => s.section === this._ttSection);
    if (this._ttDay !== 'all') filtered = filtered.filter(s => s.day === this._ttDay);

    // Group by day
    const byDay = {};
    days.forEach(d => { byDay[d] = filtered.filter(s => s.day === d).sort((a, b) => (a.period || 99) - (b.period || 99) || (a.start_time || '').localeCompare(b.start_time || '')); });

    return `
      <!-- Filters -->
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;align-items:center;">
        <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._ttGrade=this.value;academicsModule._ttSection='';academicsModule._refreshContent()">
          <option value="all">All Grades</option>
          ${gradeKeys.map(g => `<option value="${g}" ${this._ttGrade === g ? 'selected' : ''}>Grade ${this._esc(g)}</option>`).join('')}
        </select>
        ${this._ttGrade !== 'all' ? `
          <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._ttSection=this.value;academicsModule._refreshContent()">
            <option value="">All Sections</option>
            ${allClasses.filter(c => String(c.grade) === this._ttGrade).map(c => `<option value="${c.section}" ${this._ttSection === c.section ? 'selected' : ''}>Section ${this._esc(c.section)}</option>`).join('')}
          </select>` : ''}
        <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._ttDay=this.value;academicsModule._refreshContent()">
          <option value="all">All Days</option>
          ${days.map(d => `<option value="${d}" ${this._ttDay === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:auto;">${filtered.length} schedule${filtered.length !== 1 ? 's' : ''}</span>
      </div>

      ${filtered.length === 0 ? `
        <div style="text-align:center;padding:60px;color:var(--text-secondary);">
          <div style="font-size:3rem;margin-bottom:12px;">📅</div>
          <p style="font-weight:600;margin:0 0 4px;">No schedules found</p>
          ${this._isAdmin() ? `<button class="btn btn-primary" style="margin-top:12px;" onclick="academicsModule.showAddScheduleModal()">➕ Add Schedule</button>` : ''}
        </div>` : `
        <div style="display:grid;gap:20px;">
          ${(this._ttDay !== 'all' ? [this._ttDay] : days).map(day => {
            const entries = byDay[day] || [];
            if (entries.length === 0 && this._ttDay === 'all') return '';
            return `
              <div>
                <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">${day}</div>
                ${entries.length === 0 ? `<p style="color:#94a3b8;font-size:0.85rem;padding:10px 0;">No classes scheduled</p>` : `
                  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">
                    ${entries.map(s => `
                      <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-left:4px solid #3b82f6;">
                        <div style="font-weight:700;font-size:0.92rem;color:#0f172a;margin-bottom:4px;">${this._esc(s.subject || s.title || '—')}</div>
                        <div style="font-size:0.78rem;color:#64748b;display:flex;flex-direction:column;gap:2px;">
                          <span>🏫 Grade ${this._esc(s.grade || '?')}-${this._esc(s.section || '?')}</span>
                          ${s.start_time ? `<span>🕐 ${this._esc(s.start_time)}–${this._esc(s.end_time || '')}</span>` : ''}
                          ${s.period ? `<span>📌 Period ${s.period}</span>` : ''}
                          ${s.teacher ? `<span>👨‍🏫 ${this._esc(s.teacher)}</span>` : ''}
                          ${s.room ? `<span>🏛️ ${this._esc(s.room)}</span>` : ''}
                        </div>
                        ${this._isAdmin() ? `
                          <div style="display:flex;gap:4px;margin-top:10px;">
                            <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;" onclick="academicsModule.showEditScheduleModal('${s.id}')">✏️</button>
                            <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;color:#ef4444;" onclick="academicsModule.deleteSchedule('${s.id}')">🗑️</button>
                          </div>` : ''}
                      </div>`).join('')}
                  </div>`}
              </div>`;
          }).join('')}
        </div>`}`;
  },

  updateSubjectOptions(classVal, targetId) {
    const [grade] = (classVal || '').split('|');
    const catalog = dataManager.getAll('subjectCatalog') || [];
    const matched = catalog.filter(s => { const sg = (s.grade || '').trim(); return !sg || sg.toLowerCase() === (grade || '').toLowerCase(); });
    const el = document.getElementById(targetId); if (!el) return;
    el.innerHTML = `<option value="">— Select —</option>` + matched.map(s => `<option value="${this._esc(s.name)}">${this._esc(s.name)}</option>`).join('');
  },

  showAddScheduleModal() {
    const classes  = this._getAvailableClasses();
    const teachers = this._getStaff();
    const days     = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    const content  = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div class="form-group">
          <label class="form-label">Class *</label>
          <select id="sch-class" class="form-input" onchange="academicsModule.updateSubjectOptions(this.value,'sch-subject')">
            <option value="">— Select —</option>
            ${classes.map(c => `<option value="${this._esc(c.grade)}|${this._esc(c.section)}">Grade ${this._esc(c.grade)} — Sec ${this._esc(c.section)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Subject *</label>
          <select id="sch-subject" class="form-input"><option value="">— Pick class first —</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">Day *</label>
          <select id="sch-day" class="form-input">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Period #</label>
          <input type="number" id="sch-period" class="form-input" min="1" max="12" placeholder="e.g. 3">
        </div>
        <div class="form-group">
          <label class="form-label">Start Time</label>
          <input type="time" id="sch-start" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">End Time</label>
          <input type="time" id="sch-end" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Room</label>
          <input type="text" id="sch-room" class="form-input" placeholder="e.g. Room 12">
        </div>
        <div class="form-group">
          <label class="form-label">Teacher</label>
          <select id="sch-teacher" class="form-input">
            <option value="">— Select —</option>
            ${teachers.map(t => `<option value="${this._esc(t.name)}">${this._esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="academicsModule.saveSchedule()">✓ Add Schedule</button>
      </div>`;
    createModal('Add Class Schedule', content);
  },

  _checkConflicts({ grade, section, teacher, room, day, period, startTime, endTime }, excludeId = null) {
    const schedules = this._getSchedules().filter(s => s.type === 'class' && s.id !== excludeId && s.day === day);
    const overlaps = (s1, e1, s2, e2) => s1 && e1 && s2 && e2 && s1 < e2 && s2 < e1;
    const conflicts = [];
    for (const s of schedules) {
      const samePeriod = period && s.period && s.period === period;
      const timeClash  = overlaps(startTime, endTime, s.start_time || s.startTime, s.end_time || s.endTime);
      if (!samePeriod && !timeClash) continue;
      if (s.grade === grade && s.section === section)
        conflicts.push({ type: 'hard', msg: `Grade ${grade}-${section} already has ${s.subject || s.title} on ${day} at this time` });
      if (teacher && s.teacher && s.teacher === teacher)
        conflicts.push({ type: 'soft', msg: `${teacher} is already teaching ${s.subject || s.title} on ${day} at this time` });
      if (room && s.room && s.room === room)
        conflicts.push({ type: 'soft', msg: `Room ${room} is already in use on ${day} at this time` });
    }
    return conflicts;
  },

  async saveSchedule() {
    const classVal = document.getElementById('sch-class')?.value || '';
    const [grade, section] = classVal.split('|');
    const subject   = (document.getElementById('sch-subject')?.value || '').trim();
    const day       = document.getElementById('sch-day')?.value || '';
    const period    = parseInt(document.getElementById('sch-period')?.value || '0') || null;
    const startTime = document.getElementById('sch-start')?.value || '';
    const endTime   = document.getElementById('sch-end')?.value || '';
    const room      = (document.getElementById('sch-room')?.value || '').trim();
    const teacher   = (document.getElementById('sch-teacher')?.value || '').trim();
    if (!grade || !subject || !day) { showToast('Class, Subject, and Day are required', 'error'); return; }

    const conflicts = this._checkConflicts({ grade, section, teacher, room, day, period, startTime, endTime });
    const hard = conflicts.filter(c => c.type === 'hard');
    const soft = conflicts.filter(c => c.type === 'soft');
    if (hard.length > 0) { showToast('⚠️ Conflict: ' + hard[0].msg, 'error'); return; }
    if (soft.length > 0) {
      this._pendingScheduleData = { type: 'add', grade, section, subject, day, period, startTime, endTime, room, teacher };
      document.querySelector('.modal-backdrop')?.remove();
      createModal('Scheduling Conflict', `
        <p style="color:#64748b;margin-bottom:12px;">Soft conflict detected:</p>
        <ul style="margin:0 0 16px;padding-left:20px;">${soft.map(c => `<li style="margin-bottom:6px;">${this._esc(c.msg)}</li>`).join('')}</ul>
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="closeModal(this);academicsModule._forceSaveSchedule()">Proceed Anyway</button>
        </div>`);
      return;
    }
    await this._doSaveSchedule({ grade, section, subject, day, period, startTime, endTime, room, teacher });
  },

  async _forceSaveSchedule() {
    if (this._pendingScheduleData) await this._doSaveSchedule(this._pendingScheduleData);
    this._pendingScheduleData = null;
  },

  async _doSaveSchedule(d) {
    const res = await this._insertSchedule({ type: 'class', title: d.subject, subject: d.subject, grade: d.grade, section: d.section, day: d.day, period: d.period, start_time: d.startTime, end_time: d.endTime, room: d.room, teacher: d.teacher, status: 'active', academic_year: '2025-2026' });
    if (res) { await this._refreshAndRender(); showToast('Schedule added', 'success'); }
  },

  showEditScheduleModal(id) {
    const s = this._getSchedules().find(x => x.id === id); if (!s) return;
    const classes  = this._getAvailableClasses();
    const teachers = this._getStaff();
    const days     = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    const catalog  = dataManager.getAll('subjectCatalog') || [];
    const cur      = s.subject || s.title || '';
    const content  = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div class="form-group">
          <label class="form-label">Class</label>
          <select id="esch-class" class="form-input" onchange="academicsModule.updateSubjectOptions(this.value,'esch-subject')">
            ${classes.map(c => `<option value="${this._esc(c.grade)}|${this._esc(c.section)}" ${c.grade === s.grade && c.section === s.section ? 'selected' : ''}>Grade ${this._esc(c.grade)} — Sec ${this._esc(c.section)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select id="esch-subject" class="form-input">
            ${catalog.filter(sub => !sub.grade || sub.grade.toLowerCase() === (s.grade || '').toLowerCase()).map(sub => `<option value="${this._esc(sub.name)}" ${sub.name === cur ? 'selected' : ''}>${this._esc(sub.name)}</option>`).join('') || `<option value="${this._esc(cur)}" selected>${this._esc(cur)}</option>`}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Day</label>
          <select id="esch-day" class="form-input">${days.map(d => `<option value="${d}" ${d === s.day ? 'selected' : ''}>${d}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Period #</label>
          <input type="number" id="esch-period" class="form-input" value="${s.period || ''}" min="1" max="12">
        </div>
        <div class="form-group">
          <label class="form-label">Start Time</label>
          <input type="time" id="esch-start" class="form-input" value="${s.start_time || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">End Time</label>
          <input type="time" id="esch-end" class="form-input" value="${s.end_time || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Room</label>
          <input type="text" id="esch-room" class="form-input" value="${this._esc(s.room || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Teacher</label>
          <select id="esch-teacher" class="form-input">
            <option value="">— Select —</option>
            ${teachers.map(t => `<option value="${this._esc(t.name)}" ${t.name === s.teacher ? 'selected' : ''}>${this._esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="academicsModule.updateSchedule('${id}')">✓ Save</button>
      </div>`;
    createModal('Edit Schedule', content);
  },

  async updateSchedule(id) {
    const classVal  = document.getElementById('esch-class')?.value || '';
    const [grade, section] = classVal.split('|');
    const subject   = (document.getElementById('esch-subject')?.value || '').trim();
    const day       = document.getElementById('esch-day')?.value || '';
    const period    = parseInt(document.getElementById('esch-period')?.value || '0') || null;
    const startTime = document.getElementById('esch-start')?.value || '';
    const endTime   = document.getElementById('esch-end')?.value || '';
    const room      = (document.getElementById('esch-room')?.value || '').trim();
    const teacher   = (document.getElementById('esch-teacher')?.value || '').trim();

    const conflicts = this._checkConflicts({ grade, section, teacher, room, day, period, startTime, endTime }, id);
    const hard = conflicts.filter(c => c.type === 'hard');
    if (hard.length > 0) { showToast('⚠️ Conflict: ' + hard[0].msg, 'error'); return; }

    const ok = await this._updateSchedule(id, { title: subject, subject, grade, section, day, period, start_time: startTime, end_time: endTime, room, teacher });
    document.querySelector('.modal-backdrop')?.remove();
    if (ok) { await this._refreshAndRender(); showToast('Schedule updated', 'success'); }
  },

  deleteSchedule(id) {
    createModal('Delete Schedule', `
      <p style="color:#64748b;margin-bottom:20px;">Remove this schedule entry?</p>
      <div class="flex gap-3">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn flex-1" style="background:#ef4444;color:white;" onclick="closeModal(this);academicsModule._confirmDeleteSchedule('${id}')">Delete</button>
      </div>`);
  },

  async _confirmDeleteSchedule(id) {
    const ok = await this._deleteScheduleRow(id);
    if (ok) { await this._refreshAndRender(); showToast('Schedule deleted', 'info'); }
  },

  // ================================================================
  // TAB 3: ASSESSMENTS
  // ================================================================
  _renderAssessmentsTab() {
    let items = this._getAssessments();
    const gradeList = [...new Set(items.map(a => a.grade).filter(Boolean))].sort();
    if (this._filterGrade !== 'all')   items = items.filter(a => String(a.grade) === this._filterGrade);
    if (this._filterStatus !== 'all')  items = items.filter(a => a.status === this._filterStatus);
    if (this._assessSearch) { const q = this._assessSearch.toLowerCase(); items = items.filter(a => a.name?.toLowerCase().includes(q) || a.subject?.toLowerCase().includes(q)); }
    items = [...items].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center;">
        <input type="text" class="form-input" placeholder="🔍 Search…" value="${this._esc(this._assessSearch)}"
          oninput="academicsModule._assessSearch=this.value;academicsModule._refreshContent()"
          style="flex:1;min-width:180px;max-width:280px;margin:0;">
        <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._filterGrade=this.value;academicsModule._refreshContent()">
          <option value="all">All Grades</option>
          ${gradeList.map(g => `<option value="${g}" ${this._filterGrade === g ? 'selected' : ''}>Grade ${g}</option>`).join('')}
        </select>
        <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._filterStatus=this.value;academicsModule._refreshContent()">
          <option value="all" ${this._filterStatus === 'all' ? 'selected' : ''}>All Status</option>
          <option value="scheduled" ${this._filterStatus === 'scheduled' ? 'selected' : ''}>Scheduled</option>
          <option value="completed" ${this._filterStatus === 'completed' ? 'selected' : ''}>Completed</option>
        </select>
        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:auto;">${items.length} result${items.length !== 1 ? 's' : ''}</span>
      </div>
      ${items.length === 0 ? `
        <div style="text-align:center;padding:56px;color:var(--text-secondary);">
          <div style="font-size:3rem;margin-bottom:12px;">📝</div>
          <p style="font-weight:600;margin:0 0 4px;">No assessments found</p>
        </div>` : `
        <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Name</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Subject</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Class</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Date</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Marks</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Status</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Actions</th>
            </tr></thead>
            <tbody>${items.map((a, i) => {
              const dateStr = a.date ? new Date(a.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
              const done = a.status === 'completed';
              return `<tr style="border-bottom:1px solid #f1f5f9;${i % 2 ? 'background:#fafafa;' : ''}">
                <td style="padding:12px 16px;font-weight:600;">${this._esc(a.name || '—')}</td>
                <td style="padding:12px 16px;color:#64748b;">${this._esc(a.subject || '—')}</td>
                <td style="padding:12px 16px;"><span style="background:#eff6ff;color:#3b82f6;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;">Gr.${this._esc(a.grade || '?')}-${this._esc(a.section || '?')}</span></td>
                <td style="padding:12px 16px;color:#64748b;white-space:nowrap;">${dateStr}</td>
                <td style="padding:12px 16px;color:#64748b;">${a.total_marks || a.totalMarks || '—'}</td>
                <td style="padding:12px 16px;"><span style="padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;${done ? 'background:#dcfce7;color:#16a34a;' : 'background:#fef9c3;color:#ca8a04;'}">${(a.status || 'SCHEDULED').toUpperCase()}</span></td>
                <td style="padding:12px 16px;">
                  <div style="display:flex;gap:6px;">
                    <button onclick="academicsModule._enterGrades('${a.id}')" style="padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;font-weight:600;color:#475569;">✏️ Grades</button>
                    ${this._isAdmin() ? `<button onclick="academicsModule._deleteAssessment('${a.id}')" style="padding:5px 8px;border:1px solid #fee2e2;border-radius:6px;background:white;cursor:pointer;color:#ef4444;font-size:0.75rem;">🗑️</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>`}`;
  },

  _openAddAssessmentModal() {
    const classes  = this._getUniqueClasses();
    const subjects = [...new Set((dataManager.getAll('subjectCatalog') || []).map(s => s.name).filter(Boolean))];
    const today    = new Date().toISOString().split('T')[0];
    const content  = `
      <form id="acad-assessment-form" onsubmit="academicsModule._handleAddAssessment(event)">
        <div class="form-group">
          <label class="form-label">Assessment Name *</label>
          <input type="text" class="form-input" name="name" required placeholder="e.g., Mid-Term Exam">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" name="type">
              <option value="Quiz">Quiz</option><option value="Test">Test</option>
              <option value="Exam" selected>Exam</option><option value="Assignment">Assignment</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subject *</label>
            <select class="form-select" name="subject" required>
              <option value="">Select Subject</option>
              ${subjects.map(s => `<option value="${this._esc(s)}">${this._esc(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Class *</label>
            <select class="form-select" name="class" required onchange="academicsModule._updateClassHidden(this.value)">
              <option value="">Select Class</option>
              ${classes.map(c => `<option value="${c.grade}|${c.section}">Grade ${c.grade} — Section ${c.section}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Total Marks *</label>
            <input type="number" class="form-input" name="totalMarks" required min="1" value="100">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input type="date" class="form-input" name="date" required value="${today}">
        </div>
        <input type="hidden" name="grade" id="acad-hidden-grade">
        <input type="hidden" name="section" id="acad-hidden-section">
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">📝 Create</button>
        </div>
      </form>`;
    createModal('New Assessment', content);
  },

  _updateClassHidden(val) {
    const [g, s] = (val || '').split('|');
    const hg = document.getElementById('acad-hidden-grade'); if (hg) hg.value = g || '';
    const hs = document.getElementById('acad-hidden-section'); if (hs) hs.value = s || '';
  },

  async _handleAddAssessment(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const result = await dataManager.create('assessments', {
      name: fd.get('name'), subject: fd.get('subject'), type: fd.get('type'),
      grade: fd.get('grade'), section: fd.get('section'),
      date: fd.get('date'), totalMarks: parseInt(fd.get('totalMarks')), status: 'scheduled'
    });
    if (!result) return;
    document.querySelector('.modal-backdrop')?.remove();
    showToast('Assessment created!', 'success');
  },

  _deleteAssessment(id) {
    createModal('Delete Assessment', `
      <p style="color:#64748b;margin-bottom:20px;">Delete this assessment? Existing grades will be kept.</p>
      <div class="flex gap-3">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn flex-1" style="background:#ef4444;color:white;" onclick="closeModal(this);academicsModule._confirmDeleteAssessment('${id}')">Delete</button>
      </div>`);
  },

  async _confirmDeleteAssessment(id) {
    await dataManager.delete('assessments', id);
    showToast('Assessment deleted.', 'success');
  },

  _enterGrades(assessmentId) { this._tab = 'grades'; this._selAssessment = assessmentId; this.render(); },

  // ================================================================
  // TAB 4: GRADES
  // ================================================================
  _renderGradesTab() {
    const assessments = this._getAssessments();
    const allGrades   = dataManager.getAll('grades') || [];
    const options     = [...assessments].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .map(a => `<option value="${a.id}" ${this._selAssessment === a.id ? 'selected' : ''}>${a.type || 'Assessment'} · ${a.subject || 'Subject'} · Gr${a.grade || '?'}-${a.section || '?'} · ${a.date ? new Date(a.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : 'No date'} (${a.total_marks || a.totalMarks || 100} marks)</option>`).join('');
    const selected    = assessments.find(a => a.id === this._selAssessment);
    const totalMarks  = selected ? (selected.total_marks || selected.totalMarks || 100) : 100;
    let students = [];
    if (selected) students = (dataManager.getAll('students') || []).filter(s => s.status === 'active' && String(s.grade) === String(selected.grade) && s.section === selected.section).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const existingGrades = selected ? allGrades.filter(g => (g.assessment_id || g.assessmentId) === selected.id) : [];
    const gradedCount    = existingGrades.length;
    const progress       = students.length > 0 ? Math.round((gradedCount / students.length) * 100) : 0;

    return `
      <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">
        <label style="display:block;font-weight:600;font-size:0.875rem;color:#374151;margin-bottom:8px;">Select Assessment</label>
        <select class="form-select" style="margin:0;" onchange="academicsModule._selAssessment=this.value;academicsModule._refreshContent()">
          <option value="">— Pick an assessment —</option>${options}
        </select>
        ${selected ? `<div style="display:flex;align-items:center;gap:12px;margin-top:14px;"><div style="flex:1;height:6px;background:#f1f5f9;border-radius:4px;overflow:hidden;"><div style="width:${progress}%;height:100%;background:#6366f1;border-radius:4px;"></div></div><span style="font-size:0.8rem;color:#64748b;font-weight:600;">${gradedCount}/${students.length} graded</span></div>` : ''}
      </div>
      ${!selected ? `<div style="text-align:center;padding:56px;color:var(--text-secondary);"><div style="font-size:3rem;margin-bottom:12px;">📊</div><p style="font-weight:600;margin:0 0 4px;">Select an assessment above</p></div>`
      : students.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text-secondary);"><p>No active students in Grade ${selected.grade}-${selected.section}.</p></div>`
      : `<div style="background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <span style="font-weight:700;">${this._esc(selected.name)}</span>
            <div style="display:flex;gap:8px;">
              <button onclick="academicsModule._cancelGrades()" class="btn btn-ghost" style="font-size:0.875rem;">✕ Cancel</button>
              <button onclick="academicsModule._saveGrades()" class="btn btn-primary" id="acad-save-btn" style="font-size:0.875rem;">💾 Save All</button>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
              <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;width:40px;">#</th>
                <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Student</th>
                <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Score /${totalMarks}</th>
                <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Grade</th>
                <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Remarks</th>
              </tr></thead>
              <tbody>${students.map((s, i) => {
                const existing = existingGrades.find(g => (g.student_id || g.studentId) === s.id);
                const pending  = (this._pendingGrades[selected.id] || []).find(g => g.studentId === s.id);
                const score    = pending?.score ?? (existing?.score ?? '');
                const remarks  = pending?.remarks ?? (existing?.remarks ?? '');
                const pct      = score !== '' ? Math.round((parseFloat(score) / totalMarks) * 100) : null;
                const letter   = pct !== null ? this._letterGrade(pct) : '—';
                const color    = pct !== null ? this._gradeColor(pct) : '#94a3b8';
                return `<tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:10px 16px;color:#94a3b8;font-size:0.8rem;">${i + 1}</td>
                  <td style="padding:10px 16px;"><div style="font-weight:600;">${this._esc(s.name || '—')}</div><div style="font-size:0.72rem;color:#94a3b8;">${s.roll_no || s.rollNo || ''}</div></td>
                  <td style="padding:10px 16px;"><input type="number" min="0" max="${totalMarks}" step="0.5" value="${score}" placeholder="—" oninput="academicsModule._updateGrade('${selected.id}','${s.id}','score',this.value,${totalMarks})" style="width:80px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.875rem;text-align:center;"></td>
                  <td style="padding:10px 16px;"><span data-grade-badge="${s.id}" style="background:${color}22;color:${color};padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;">${letter}</span></td>
                  <td style="padding:10px 16px;"><input type="text" value="${this._esc(remarks)}" placeholder="Optional…" oninput="academicsModule._updateGrade('${selected.id}','${s.id}','remarks',this.value)" style="width:160px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.875rem;"></td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>`}`;
  },

  _updateGrade(assessmentId, studentId, field, value, totalMarks) {
    if (!this._pendingGrades[assessmentId]) this._pendingGrades[assessmentId] = [];
    let entry = this._pendingGrades[assessmentId].find(g => g.studentId === studentId);
    if (!entry) { entry = { studentId, score: '', remarks: '' }; this._pendingGrades[assessmentId].push(entry); }
    entry[field] = value;
    if (field === 'score' && totalMarks) {
      const pct = value !== '' ? Math.round((parseFloat(value) / totalMarks) * 100) : null;
      const letter = pct !== null ? this._letterGrade(pct) : '—';
      const color  = pct !== null ? this._gradeColor(pct) : '#94a3b8';
      const badge  = document.querySelector(`[data-grade-badge="${studentId}"]`);
      if (badge) { badge.textContent = letter; badge.style.background = color + '22'; badge.style.color = color; }
    }
  },

  async _saveGrades() {
    const btn = document.getElementById('acad-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
    try {
      const assessment = this._getAssessments().find(a => a.id === this._selAssessment);
      const pending    = this._pendingGrades[this._selAssessment] || [];
      const totalMarks = assessment?.total_marks || assessment?.totalMarks || 100;
      let saved = 0;
      for (const g of pending) {
        if (g.score !== '' && g.score !== undefined && g.score !== null) {
          const pct = Math.round((parseFloat(g.score) / totalMarks) * 100);
          const result = await dataManager.create('grades', {
            studentId: g.studentId, assessmentId: this._selAssessment,
            subject: assessment?.subject || '', score: parseFloat(g.score),
            totalMarks, grade: this._letterGrade(pct), remarks: g.remarks || '',
            gradedBy: this._session()?.supabaseId || null
          });
          if (result) saved++;
        }
      }
      delete this._pendingGrades[this._selAssessment];
      showToast(`${saved} grade${saved !== 1 ? 's' : ''} saved!`, 'success');
      this._selAssessment = null;
      this._refreshContent();
    } catch (err) {
      console.error('[Academics] saveGrades:', err);
      showToast('Failed to save grades.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Save All'; }
    }
  },

  _cancelGrades() {
    if (this._selAssessment) delete this._pendingGrades[this._selAssessment];
    this._selAssessment = null; this._refreshContent();
  },

  // ================================================================
  // TAB 5: LESSON PLANS
  // ================================================================
  _renderLessonPlansTab() {
    const all      = dataManager.getAll('lessonPlans') || [];
    const tid      = this._currentTeacher?.id || this._currentTeacher?.sessionId;
    const myPlans  = this._isAdmin() && this._lpTab === 'all-plans' ? all : all.filter(p => p.teacherId === tid || p.teacher_id === tid);
    const pending  = all.filter(p => p.status === 'submitted').length;
    const approved = myPlans.filter(p => p.status === 'approved').length;
    const draft    = myPlans.filter(p => p.status === 'draft').length;

    let filtered = [...myPlans];
    if (this._lpSubjectFilter !== 'all') filtered = filtered.filter(p => p.subjectId === this._lpSubjectFilter || p.subject_id === this._lpSubjectFilter);
    if (this._lpStatusFilter !== 'all')  filtered = filtered.filter(p => p.status === this._lpStatusFilter);
    if (this._lpWeekFilter)              filtered = filtered.filter(p => (p.weekStarting || p.week_starting || '').startsWith(this._lpWeekFilter.slice(0, 7)));
    filtered = filtered.sort((a, b) => new Date(b.weekStarting || b.week_starting || 0) - new Date(a.weekStarting || a.week_starting || 0));

    const subjects = dataManager.getAll('subjectCatalog') || [];

    return `
      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;">
        ${this._stat('📋', 'My Plans', myPlans.length, 'var(--color-primary)')}
        ${this._stat('📝', 'Draft', draft, '#94a3b8')}
        ${this._stat('⏳', 'Pending', pending, '#f59e0b')}
        ${this._stat('✅', 'Approved', approved, '#10b981')}
      </div>

      <!-- Sub-tabs -->
      ${this._isAdmin() ? `
        <div style="display:flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:10px;margin-bottom:16px;width:fit-content;">
          ${['my-plans','all-plans'].map(k => `<button onclick="academicsModule._lpTab='${k}';academicsModule._refreshContent()" style="padding:7px 16px;border:none;border-radius:7px;font-size:0.82rem;font-weight:600;cursor:pointer;${this._lpTab === k ? 'background:white;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:#64748b;'}">${k === 'my-plans' ? '📋 My Plans' : '👁 All Plans'}</button>`).join('')}
        </div>` : ''}

      <!-- Filters -->
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;align-items:center;">
        <input type="date" class="form-input" value="${this._lpWeekFilter}" onchange="academicsModule._lpWeekFilter=this.value;academicsModule._refreshContent()" style="width:160px;margin:0;">
        <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._lpSubjectFilter=this.value;academicsModule._refreshContent()">
          <option value="all">All Subjects</option>
          ${subjects.map(s => `<option value="${s.id}" ${this._lpSubjectFilter === s.id ? 'selected' : ''}>${this._esc(s.name)}</option>`).join('')}
        </select>
        <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._lpStatusFilter=this.value;academicsModule._refreshContent()">
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option><option value="submitted">Submitted</option>
          <option value="approved">Approved</option><option value="needs_revision">Needs Revision</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="academicsModule._lpWeekFilter='';academicsModule._lpSubjectFilter='all';academicsModule._lpStatusFilter='all';academicsModule._refreshContent()">↺ Clear</button>
      </div>

      <!-- Plan cards -->
      <div style="display:grid;gap:16px;">
        ${filtered.length === 0 ? `
          <div style="text-align:center;padding:60px;color:var(--text-secondary);">
            <div style="font-size:3rem;margin-bottom:12px;">📖</div>
            <p style="font-weight:600;margin:0 0 8px;">No lesson plans</p>
            <button class="btn btn-primary" onclick="academicsModule.openCreateModal()">➕ Create Plan</button>
          </div>` : filtered.map(p => this._renderPlanCard(p)).join('')}
      </div>

      <!-- Inline modals -->
      <div id="lp-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this)academicsModule.closeLpModal()">
        <div class="modal-container" style="max-width:680px;width:95%;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
          <div id="lp-modal-body"></div>
        </div>
      </div>
      <div id="lp-view-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this)academicsModule.closeViewModal()">
        <div class="modal-container" style="max-width:700px;width:95%;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
          <div id="lp-view-body"></div>
        </div>
      </div>`;
  },

  _renderPlanCard(p) {
    const statusColors = { draft:'#94a3b8', submitted:'#f59e0b', approved:'#10b981', needs_revision:'#ef4444' };
    const statusIcons  = { draft:'📝', submitted:'📤', approved:'✅', needs_revision:'⚠️' };
    const color = statusColors[p.status] || '#94a3b8';
    const icon  = statusIcons[p.status]  || '📝';
    const weekStr = p.weekStarting || p.week_starting;
    const dayCount = (p.days || []).length;
    return `
      <div class="card" style="border-left:4px solid ${color};">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px;">
            <div style="flex:1;min-width:200px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:1.2rem;">${icon}</span>
                <h3 style="margin:0;font-size:1rem;font-weight:600;">${this._esc(p.title || p.subjectName || 'Untitled Plan')}</h3>
                <span style="font-size:0.7rem;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};font-weight:600;text-transform:uppercase;">${p.status}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:0.8rem;color:#64748b;">
                <span>📚 ${this._esc(p.subjectName || p.subject || '—')}</span>
                <span>🏫 ${this._esc(p.grade || p.class || '—')}</span>
                ${weekStr ? `<span>📅 Week of ${new Date(weekStr).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>` : ''}
                <span>📋 ${dayCount} day${dayCount !== 1 ? 's' : ''} planned</span>
                ${p.teacherName || p.teacher_name ? `<span>👨‍🏫 ${this._esc(p.teacherName || p.teacher_name)}</span>` : ''}
              </div>
              ${p.adminFeedback ? `<div style="margin-top:8px;padding:8px 12px;background:${p.status === 'approved' ? '#f0fdf4' : '#fef2f2'};border-radius:8px;font-size:0.8rem;color:${p.status === 'approved' ? '#166534' : '#991b1b'};">💬 ${this._esc(p.adminFeedback)}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <button class="btn btn-sm btn-secondary" onclick="academicsModule.viewPlan('${p.id}')">👁 View</button>
              ${p.status !== 'approved' ? `<button class="btn btn-sm btn-secondary" onclick="academicsModule.openEditModal('${p.id}')">✏️ Edit</button>` : ''}
              ${p.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="academicsModule.submitPlan('${p.id}')">📤 Submit</button>` : ''}
              ${this._isAdmin() && p.status === 'submitted' ? `
                <button class="btn btn-sm" style="background:#10b981;color:#fff;" onclick="academicsModule.approvePlan('${p.id}')">✅ Approve</button>
                <button class="btn btn-sm" style="background:#ef4444;color:#fff;" onclick="academicsModule.requestRevision('${p.id}')">⚠️ Revise</button>` : ''}
              <button class="btn btn-sm btn-ghost" onclick="academicsModule.deletePlan('${p.id}')">🗑️</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  openCreateModal() { this._lpSelectedPlan = null; this._renderLpModal(null); document.getElementById('lp-modal').style.display = 'flex'; },
  openEditModal(id) {
    const all = dataManager.getAll('lessonPlans') || [];
    this._lpSelectedPlan = all.find(p => p.id === id);
    this._renderLpModal(this._lpSelectedPlan);
    document.getElementById('lp-modal').style.display = 'flex';
  },

  _renderLpModal(plan) {
    const subjects = dataManager.getAll('subjectCatalog') || [];
    const isEdit = !!plan;
    const days = plan?.days || [{ day:'Monday', topic:'', activities:'' }];
    document.getElementById('lp-modal-body').innerHTML = `
      <div style="padding:var(--space-6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="margin:0;font-size:1.2rem;font-weight:700;">${isEdit ? '✏️ Edit Lesson Plan' : '➕ New Lesson Plan'}</h2>
          <button class="btn btn-ghost btn-sm" onclick="academicsModule.closeLpModal()">✕</button>
        </div>
        <form id="lp-form" onsubmit="academicsModule.savePlan(event)">
          <div style="display:grid;gap:16px;">
            <div><label class="form-label">Plan Title *</label><input class="form-input" name="title" required placeholder="e.g. Introduction to Algebra" value="${this._esc(plan?.title || '')}"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div><label class="form-label">Subject *</label>
                <select class="form-select" name="subjectId" required onchange="academicsModule._syncLpSubject(this)">
                  <option value="">Select subject</option>
                  ${subjects.map(s => `<option value="${s.id}" data-name="${this._esc(s.name)}" ${plan?.subjectId === s.id ? 'selected' : ''}>${this._esc(s.name)}</option>`).join('')}
                </select>
              </div>
              <div><label class="form-label">Grade *</label>
                <select class="form-select" name="grade" required>
                  <option value="">Select grade</option>
                  ${['JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(g => `<option value="${g}" ${plan?.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
              </div>
              <div><label class="form-label">Week Starting *</label><input class="form-input" type="date" name="weekStarting" required value="${plan?.weekStarting ? plan.weekStarting.split('T')[0] : this._lpWeekFilter}"></div>
              <div><label class="form-label">Term</label>
                <select class="form-select" name="term">
                  ${['1st Term','2nd Term','3rd Term'].map(t => `<option value="${t}" ${plan?.term === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
            </div>
            <div><label class="form-label">Learning Objectives</label><textarea class="form-input" name="objectives" rows="2" placeholder="What students will learn…">${this._esc(plan?.objectives || '')}</textarea></div>
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <label class="form-label" style="margin:0;">Daily Plan</label>
                <button type="button" class="btn btn-sm btn-secondary" onclick="academicsModule.addDay()">+ Add Day</button>
              </div>
              <div id="lp-days-container" style="display:grid;gap:10px;">
                ${days.map((d, i) => this._dayRow(d, i)).join('')}
              </div>
            </div>
            <div><label class="form-label">Materials / Resources</label><textarea class="form-input" name="materials" rows="2" placeholder="Textbooks, worksheets…">${this._esc(plan?.materials || '')}</textarea></div>
          </div>
          <input type="hidden" name="subjectName" id="lp-subject-name" value="${this._esc(plan?.subjectName || '')}">
          <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" onclick="academicsModule.closeLpModal()">Cancel</button>
            <button type="submit" class="btn btn-secondary" onclick="this.form.elements.saveAs.value='draft'">💾 Save Draft</button>
            <button type="submit" class="btn btn-primary" onclick="this.form.elements.saveAs.value='submitted'">📤 Submit</button>
          </div>
          <input type="hidden" name="saveAs" value="draft">
        </form>
      </div>`;
  },

  _dayRow(day, idx) {
    return `<div class="card" style="padding:10px;" id="lp-day-${idx}">
      <div style="display:grid;grid-template-columns:auto 1fr 1fr auto;gap:10px;align-items:center;">
        <select class="form-select" style="width:120px;" name="day_${idx}_name">${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => `<option ${day.day === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <input class="form-input" name="day_${idx}_topic" placeholder="Topic" value="${this._esc(day.topic || '')}">
        <input class="form-input" name="day_${idx}_activities" placeholder="Activities" value="${this._esc(day.activities || '')}">
        <button type="button" class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="academicsModule.removeDay(${idx})">✕</button>
      </div>
    </div>`;
  },

  addDay() {
    const c = document.getElementById('lp-days-container'); if (!c) return;
    c.insertAdjacentHTML('beforeend', this._dayRow({ day:'Monday', topic:'', activities:'' }, c.children.length));
  },

  removeDay(idx) { const el = document.getElementById(`lp-day-${idx}`); if (el) el.remove(); },

  _syncLpSubject(sel) { const h = document.getElementById('lp-subject-name'); if (h) h.value = sel.options[sel.selectedIndex]?.dataset?.name || ''; },

  async savePlan(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tid = this._currentTeacher?.id || this._currentTeacher?.sessionId;
    const days = [];
    const c = document.getElementById('lp-days-container');
    if (c) [...c.children].forEach((_, i) => { const name = fd.get(`day_${i}_name`); const topic = fd.get(`day_${i}_topic`); const activities = fd.get(`day_${i}_activities`); if (name && topic) days.push({ day: name, topic, activities: activities || '' }); });
    const data = { title: fd.get('title'), subjectId: fd.get('subjectId'), subjectName: fd.get('subjectName'), grade: fd.get('grade'), weekStarting: fd.get('weekStarting'), term: fd.get('term'), objectives: fd.get('objectives'), materials: fd.get('materials'), days, status: fd.get('saveAs') || 'draft', teacherId: tid, teacher_id: tid, teacherName: this._currentTeacher?.name || '' };
    if (this._lpSelectedPlan) { data.updatedAt = new Date().toISOString(); await dataManager.update('lessonPlans', this._lpSelectedPlan.id, data); showToast('Plan updated', 'success'); }
    else { data.createdAt = new Date().toISOString(); await dataManager.create('lessonPlans', data); showToast(data.status === 'submitted' ? 'Plan submitted for approval' : 'Draft saved', 'success'); }
    this.closeLpModal();
    this._refreshContent();
  },

  closeLpModal() { const el = document.getElementById('lp-modal'); if (el) el.style.display = 'none'; },

  viewPlan(id) {
    const p = (dataManager.getAll('lessonPlans') || []).find(pl => pl.id === id); if (!p) return;
    const weekStr = p.weekStarting || p.week_starting;
    const statusColors = { draft:'#94a3b8', submitted:'#f59e0b', approved:'#10b981', needs_revision:'#ef4444' };
    document.getElementById('lp-view-body').innerHTML = `
      <div style="padding:var(--space-6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="margin:0;font-size:1.2rem;font-weight:700;">📖 ${this._esc(p.title)}</h2>
          <button class="btn btn-ghost btn-sm" onclick="academicsModule.closeViewModal()">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;background:var(--bg-secondary);padding:16px;border-radius:12px;">
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Subject</div><strong>${this._esc(p.subjectName || p.subject || '—')}</strong></div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Grade</div><strong>${this._esc(p.grade || '—')}</strong></div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Week of</div><strong>${weekStr ? new Date(weekStr).toLocaleDateString('en-GB') : '—'}</strong></div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Status</div><span style="font-size:0.75rem;padding:2px 8px;border-radius:99px;background:${statusColors[p.status] || '#94a3b8'}22;color:${statusColors[p.status] || '#94a3b8'};font-weight:600;text-transform:uppercase;">${p.status}</span></div>
        </div>
        ${p.objectives ? `<div style="margin-bottom:16px;"><h4 style="margin-bottom:8px;">🎯 Learning Objectives</h4><p style="color:var(--text-secondary);margin:0;">${this._esc(p.objectives)}</p></div>` : ''}
        ${p.days && p.days.length > 0 ? `
          <div style="margin-bottom:16px;"><h4 style="margin-bottom:12px;">📅 Daily Breakdown</h4>
          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
            <thead><tr style="background:var(--color-primary);color:#fff;"><th style="padding:10px;text-align:left;">Day</th><th style="padding:10px;text-align:left;">Topic</th><th style="padding:10px;text-align:left;">Activities</th></tr></thead>
            <tbody>${p.days.map((d, i) => `<tr style="background:${i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)'};border-bottom:1px solid var(--border-primary);"><td style="padding:10px;font-weight:600;">${this._esc(d.day)}</td><td style="padding:10px;">${this._esc(d.topic || '—')}</td><td style="padding:10px;color:var(--text-secondary);">${this._esc(d.activities || '—')}</td></tr>`).join('')}</tbody>
          </table></div>` : ''}
        ${p.materials ? `<div style="margin-bottom:12px;"><h4 style="margin-bottom:8px;">📚 Materials</h4><p style="color:var(--text-secondary);margin:0;">${this._esc(p.materials)}</p></div>` : ''}
        ${p.adminFeedback ? `<div style="padding:16px;background:${p.status === 'approved' ? '#f0fdf4' : '#fef2f2'};border-radius:12px;"><h4 style="margin:0 0 8px;color:${p.status === 'approved' ? '#166534' : '#991b1b'};">💬 Admin Feedback</h4><p style="margin:0;">${this._esc(p.adminFeedback)}</p></div>` : ''}
        <div style="display:flex;justify-content:flex-end;margin-top:20px;gap:8px;">
          ${p.status !== 'approved' ? `<button class="btn btn-secondary" onclick="academicsModule.closeViewModal();academicsModule.openEditModal('${p.id}')">✏️ Edit</button>` : ''}
          <button class="btn btn-primary" onclick="academicsModule.closeViewModal()">Close</button>
        </div>
      </div>`;
    document.getElementById('lp-view-modal').style.display = 'flex';
  },

  closeViewModal() { const el = document.getElementById('lp-view-modal'); if (el) el.style.display = 'none'; },

  submitPlan(id) {
    createModal('Submit Plan', `
      <p style="color:#64748b;margin-bottom:20px;">Submit this lesson plan for admin review?</p>
      <div class="flex gap-3">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="closeModal(this);academicsModule._doSubmitPlan('${id}')">📤 Submit</button>
      </div>`);
  },

  async _doSubmitPlan(id) {
    await dataManager.update('lessonPlans', id, { status: 'submitted', submittedAt: new Date().toISOString() });
    showToast('Plan submitted for review', 'success'); this._refreshContent();
  },

  approvePlan(id) {
    createModal('Approve Plan', `
      <div>
        <label class="form-label">Approval note (optional)</label>
        <textarea id="lp-approve-note" class="form-input" rows="2" placeholder="Leave blank to auto-fill 'Approved.'"></textarea>
        <div class="flex gap-3 mt-4">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" style="background:#10b981;" onclick="closeModal(this);academicsModule._doApprovePlan('${id}')">✅ Approve</button>
        </div>
      </div>`);
  },

  async _doApprovePlan(id) {
    const note = (document.getElementById('lp-approve-note')?.value || '').trim() || 'Approved.';
    await dataManager.update('lessonPlans', id, { status: 'approved', adminFeedback: note, approvedAt: new Date().toISOString(), approvedBy: this._currentTeacher?.name || this._session()?.fullName || 'Admin' });
    showToast('Plan approved', 'success'); this._refreshContent();
  },

  requestRevision(id) {
    createModal('Request Revision', `
      <div>
        <label class="form-label">What needs to be revised? *</label>
        <textarea id="lp-revision-note" class="form-input" rows="3" placeholder="Describe what the teacher needs to fix…"></textarea>
        <div class="flex gap-3 mt-4">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn flex-1" style="background:#ef4444;color:white;" onclick="academicsModule._doRequestRevision('${id}')">⚠️ Send Feedback</button>
        </div>
      </div>`);
  },

  async _doRequestRevision(id) {
    const feedback = (document.getElementById('lp-revision-note')?.value || '').trim();
    if (!feedback) { showToast('Please describe what needs revision', 'warning'); return; }
    await dataManager.update('lessonPlans', id, { status: 'needs_revision', adminFeedback: feedback });
    document.querySelector('.modal-backdrop')?.remove();
    showToast('Revision requested', 'info'); this._refreshContent();
  },

  deletePlan(id) {
    createModal('Delete Plan', `
      <p style="color:#64748b;margin-bottom:20px;">Permanently delete this lesson plan?</p>
      <div class="flex gap-3">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn flex-1" style="background:#ef4444;color:white;" onclick="closeModal(this);academicsModule._doDeletePlan('${id}')">Delete</button>
      </div>`);
  },

  async _doDeletePlan(id) {
    await dataManager.delete('lessonPlans', id);
    showToast('Plan deleted', 'info'); this._refreshContent();
  },

  // ================================================================
  // TAB 6: SUBJECTS (admin only)
  // ================================================================
  _renderSubjectsTab() {
    let subjects = dataManager.getAll('subjectCatalog') || [];
    const staff  = (dataManager.getAll('staff') || []).filter(s => s.type === 'teaching');
    const allStudents = dataManager.getAll('students') || [];
    const studentsByGrade = {};
    allStudents.filter(s => s.status === 'active').forEach(s => { if (s.grade) studentsByGrade[s.grade] = (studentsByGrade[s.grade] || 0) + 1; });
    const gradeList = [...new Set(subjects.flatMap(s => this._subjectGrades(s)).filter(Boolean))].sort();
    if (this._subjectGradeFilter !== 'all') subjects = subjects.filter(s => this._subjectGrades(s).includes(this._subjectGradeFilter));
    if (this._subjectSearch) { const q = this._subjectSearch.toLowerCase(); subjects = subjects.filter(s => s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q)); }

    return `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center;">
        <input type="text" class="form-input" placeholder="🔍 Search subjects…" value="${this._esc(this._subjectSearch)}" oninput="academicsModule._subjectSearch=this.value;academicsModule._refreshContent()" style="flex:1;min-width:180px;max-width:280px;margin:0;">
        <select class="form-select" style="width:auto;margin:0;" onchange="academicsModule._subjectGradeFilter=this.value;academicsModule._refreshContent()">
          <option value="all">All Grades</option>
          ${gradeList.map(g => `<option value="${g}" ${this._subjectGradeFilter === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:auto;">${subjects.length} subjects</span>
      </div>
      ${subjects.length === 0 ? `
        <div style="text-align:center;padding:56px;color:var(--text-secondary);">
          <div style="font-size:3rem;margin-bottom:12px;">📚</div>
          <p style="font-weight:600;margin:0 0 4px;">No subjects yet</p>
          <p style="font-size:0.875rem;margin:0;">Click <strong>Seed</strong> to import the Nigerian curriculum.</p>
        </div>` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
          ${subjects.map(s => {
            const teacher = staff.find(t => t.id === (s.teacherId || s.teacher_id));
            const sGrades = this._subjectGrades(s);
            const sc = sGrades.reduce((sum, g) => sum + (studentsByGrade[g] || 0), 0);
            return `<div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;border-left:4px solid #6366f1;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="font-size:1.3rem;">${s.icon || '📚'}</span><span style="font-weight:700;font-size:0.95rem;">${this._esc(s.name)}</span></div>
                  <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;">
                    <span style="background:#eff6ff;color:#3b82f6;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;">${this._esc(s.code || '—')}</span>
                    ${sGrades.map(g => `<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;">${g}</span>`).join('')}
                    <span style="background:#f8fafc;color:#64748b;padding:2px 8px;border-radius:6px;font-size:0.72rem;">👥 ${sc}</span>
                  </div>
                  <div style="font-size:0.8rem;color:#64748b;">👩‍🏫 ${teacher ? this._esc(teacher.name) : '<em style="opacity:0.6;">No teacher</em>'}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                  <button onclick="academicsModule._editSubject('${s.id}')" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;">✏️</button>
                  <button onclick="academicsModule._deleteSubject('${s.id}')" style="padding:5px 8px;border:1px solid #fee2e2;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;color:#ef4444;">🗑️</button>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`}`;
  },

  _allGradeGroups() {
    return [
      { label: 'Primary',          grades: ['Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'] },
      { label: 'Junior Secondary', grades: ['JSS1','JSS2','JSS3'] },
      { label: 'Senior Secondary', grades: ['SS1','SS2','SS3'] },
    ];
  },

  _openAddSubjectModal(existing) {
    const staff = (dataManager.getAll('staff') || []).filter(s => s.type === 'teaching');
    const s = existing || {};
    const selectedGrades = this._subjectGrades(s);
    const gradeCheckboxes = this._allGradeGroups().map(group => `
      <div style="margin-bottom:10px;">
        <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${group.label}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${group.grades.map(g => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:4px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.8rem;${selectedGrades.includes(g) ? 'background:#eff6ff;border-color:#3b82f6;color:#1d4ed8;font-weight:600;' : 'background:white;color:#475569;'}"><input type="checkbox" name="grades" value="${g}" ${selectedGrades.includes(g) ? 'checked' : ''} style="accent-color:#3b82f6;width:13px;height:13px;"> ${g}</label>`).join('')}
        </div>
      </div>`).join('');
    const content = `
      <form id="acad-subject-form">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Subject Name *</label><input type="text" class="form-input" name="name" required value="${this._esc(s.name || '')}" placeholder="Mathematics"></div>
          <div class="form-group"><label class="form-label">Code *</label><input type="text" class="form-input" name="code" required value="${this._esc(s.code || '')}" placeholder="MATH"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Applies to Grades *</label>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">${gradeCheckboxes}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Icon (emoji)</label><input type="text" class="form-input" name="icon" value="${this._esc(s.icon || '📚')}"></div>
          <div class="form-group"><label class="form-label">Assign Teacher</label>
            <select class="form-select" name="teacherId">
              <option value="">— Unassigned —</option>
              ${staff.map(t => `<option value="${t.id}" ${(s.teacherId || s.teacher_id) === t.id ? 'selected' : ''}>${this._esc(t.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="button" class="btn btn-primary flex-1" onclick="academicsModule._handleSaveSubject('${s.id || ''}')">
            ${s.id ? '💾 Save Changes' : '➕ Add Subject'}
          </button>
        </div>
      </form>`;
    createModal(s.id ? 'Edit Subject' : 'Add Subject', content);
  },

  _editSubject(id) { const s = (dataManager.getAll('subjectCatalog') || []).find(x => x.id === id); if (s) this._openAddSubjectModal(s); },

  async _handleSaveSubject(existingId) {
    const form = document.getElementById('acad-subject-form'); if (!form) return;
    const fd = new FormData(form);
    const selectedGrades = fd.getAll('grades');
    if (selectedGrades.length === 0) { showToast('Please select at least one grade.', 'warning'); return; }
    const payload = { name: fd.get('name'), code: fd.get('code'), grades: selectedGrades, grade: selectedGrades[0], icon: fd.get('icon'), teacherId: fd.get('teacherId') || null };
    if (existingId) { await dataManager.update('subjectCatalog', existingId, payload); showToast('Subject updated!', 'success'); }
    else { await dataManager.create('subjectCatalog', payload); showToast('Subject added!', 'success'); }
    document.querySelector('.modal-backdrop')?.remove();
  },

  _deleteSubject(id) {
    createModal('Delete Subject', `
      <p style="color:#64748b;margin-bottom:20px;">Delete this subject? Existing grades will be kept.</p>
      <div class="flex gap-3">
        <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
        <button class="btn flex-1" style="background:#ef4444;color:white;" onclick="closeModal(this);academicsModule._confirmDeleteSubject('${id}')">Delete</button>
      </div>`);
  },

  async _confirmDeleteSubject(id) { await dataManager.delete('subjectCatalog', id); showToast('Subject deleted.', 'success'); },

  _openSeedModal() {
    const existing = (dataManager.getAll('subjectCatalog') || []).map(s => s.code?.toUpperCase());
    const std = this._standardSubjects();
    const categories = [...new Set(std.map(s => s.category))];
    const rows = categories.map(cat => `
      <tr><td colspan="3" style="background:var(--bg-tertiary);font-size:0.72rem;font-weight:700;color:var(--text-secondary);padding:0.35rem 0.75rem;text-transform:uppercase;">${cat}</td></tr>
      ${std.filter(s => s.category === cat).map(s => { const exists = existing.includes(s.code.toUpperCase()); return `<tr><td style="padding:0.45rem 0.75rem;"><input type="checkbox" name="seed_${s.code}" value="${s.code}" ${exists ? 'disabled' : 'checked'} style="width:15px;height:15px;cursor:pointer;"></td><td style="padding:0.45rem 0.75rem;font-size:0.875rem;">${s.icon} ${this._esc(s.name)}</td><td style="padding:0.45rem 0.75rem;font-size:0.78rem;color:var(--text-secondary);">${exists ? '<span style="color:#10b981;font-weight:600;">✓ Added</span>' : `<code>${s.code}</code>`}</td></tr>`; }).join('')}`).join('');
    const grades = ['JSS1','JSS2','JSS3','SS1','SS2','SS3','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'];
    const content = `
      <form id="seed-form">
        <p style="margin-bottom:16px;font-size:0.875rem;color:var(--text-secondary);">Select subjects to import. Already-added subjects are disabled.</p>
        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Apply to Grade</label>
          <select class="form-select" name="grade"><option value="">— Assign later —</option>${grades.map(g => `<option value="${g}">${g}</option>`).join('')}</select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <button type="button" class="btn btn-sm btn-ghost" onclick="document.querySelectorAll('#seed-form input[type=checkbox]:not(:disabled)').forEach(cb=>cb.checked=true)">Select All</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="document.querySelectorAll('#seed-form input[type=checkbox]:not(:disabled)').forEach(cb=>cb.checked=false)">Deselect All</button>
        </div>
        <div style="max-height:50vh;overflow-y:auto;border:1px solid var(--border-primary);border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead style="position:sticky;top:0;background:var(--bg-secondary);"><tr><th style="padding:0.4rem 0.75rem;width:36px;"></th><th style="padding:0.4rem 0.75rem;text-align:left;font-size:0.78rem;">Subject</th><th style="padding:0.4rem 0.75rem;text-align:left;font-size:0.78rem;">Code</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">🌱 Import Selected</button>
        </div>
      </form>`;
    const modal = createModal('Seed Standard Subjects', content, 'large');
    const form  = modal?.querySelector('#seed-form');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); this._handleSeedSubjects(e); });
  },

  async _handleSeedSubjects(e) {
    const fd = new FormData(e.target);
    const grade = fd.get('grade') || null;
    const std = this._standardSubjects();
    const existing = (dataManager.getAll('subjectCatalog') || []).map(s => s.code?.toUpperCase());
    const toImport = std.filter(s => fd.get(`seed_${s.code}`) && !existing.includes(s.code.toUpperCase()));
    if (toImport.length === 0) { showToast('No new subjects selected.', 'warning'); return; }
    const btn = e.target.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    let success = 0;
    for (const s of toImport) {
      const res = await dataManager.create('subjectCatalog', { name: s.name, code: s.code, grade: grade || '', grades: grade ? [grade] : [], icon: s.icon, teacherId: null });
      if (res) success++;
    }
    document.querySelector('.modal-backdrop')?.remove();
    showToast(`✅ Imported ${success} subject${success !== 1 ? 's' : ''}!`, 'success');
  },

  _standardSubjects() {
    return [
      { name:'Mathematics', code:'MATH', icon:'🔢', category:'Core' },
      { name:'English Language', code:'ENG', icon:'📝', category:'Core' },
      { name:'Civic Education', code:'CIV', icon:'🏛️', category:'Core' },
      { name:'Physical Education', code:'PE', icon:'⚽', category:'Core' },
      { name:'Computer Studies (ICT)', code:'ICT', icon:'💻', category:'Core' },
      { name:'Basic Science & Technology', code:'BST', icon:'🔬', category:'Sciences' },
      { name:'Physics', code:'PHY', icon:'⚛️', category:'Sciences' },
      { name:'Chemistry', code:'CHEM', icon:'🧪', category:'Sciences' },
      { name:'Biology', code:'BIO', icon:'🌿', category:'Sciences' },
      { name:'Agricultural Science', code:'AGRIC', icon:'🌾', category:'Sciences' },
      { name:'Literature in English', code:'LIT', icon:'📖', category:'Humanities' },
      { name:'History', code:'HIST', icon:'🏺', category:'Humanities' },
      { name:'Geography', code:'GEO', icon:'🗺️', category:'Humanities' },
      { name:'Government', code:'GOVT', icon:'🏛️', category:'Humanities' },
      { name:'Christian Religious Studies', code:'CRS', icon:'✝️', category:'Humanities' },
      { name:'Islamic Religious Studies', code:'IRS', icon:'☪️', category:'Humanities' },
      { name:'Economics', code:'ECON', icon:'📈', category:'Social Sciences' },
      { name:'Commerce', code:'COMM', icon:'🏪', category:'Social Sciences' },
      { name:'Financial Accounting', code:'ACCT', icon:'💰', category:'Social Sciences' },
      { name:'Business Studies', code:'BUS', icon:'💼', category:'Social Sciences' },
      { name:'Technical Drawing', code:'TECH', icon:'📐', category:'Vocational' },
      { name:'Food & Nutrition', code:'FNT', icon:'🍽️', category:'Vocational' },
      { name:'Home Economics', code:'HEC', icon:'🏠', category:'Vocational' },
      { name:'Yoruba', code:'YOR', icon:'🗣️', category:'Languages' },
      { name:'Igbo', code:'IGB', icon:'🗣️', category:'Languages' },
      { name:'Hausa', code:'HAU', icon:'🗣️', category:'Languages' },
      { name:'French', code:'FRN', icon:'🇫🇷', category:'Languages' },
    ];
  },
};

// ── Exports + backward-compat aliases ────────────────────────────
window.academicsModule        = academicsModule;
window.assessmentsModule      = academicsModule;
window.gradesManagementModule = academicsModule;
window.classScheduleModule    = academicsModule;
window.lessonPlansModule      = academicsModule;
