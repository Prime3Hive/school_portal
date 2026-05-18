// ================================================================
// ACADEMICS MODULE — Assessments · Grade Entry · Subjects
// Single unified module replacing assessments.js + grades-management.js
// Role-aware: admin/staff sees everything; teachers see their classes
// ================================================================

const academicsModule = {
  _tab: 'assessments',
  _search: '',
  _filterGrade: 'all',
  _filterStatus: 'all',
  _selAssessment: null,
  _pendingGrades: {},
  _subjectSearch: '',
  _subjectGradeFilter: 'all',

  // ── INIT ──────────────────────────────────────────────────────
  async init(container) {
    this.container = container || document.getElementById('main-content');
    await dataManager.waitForReady();
    this.render();
    if (this._onChange) window.removeEventListener('datamanager:change', this._onChange);
    this._onChange = (e) => {
      const watched = ['assessments', 'grades', 'subjectCatalog', 'studentSubjects', 'students'];
      if (watched.includes(e.detail?.collection)) this.render();
    };
    window.addEventListener('datamanager:change', this._onChange);
  },

  // ── ROLE HELPERS ──────────────────────────────────────────────
  _session() { return typeof authManager !== 'undefined' ? authManager.getSession() : null; },
  _isAdmin() { const r = this._session()?.role; return r === 'admin' || r === 'staff'; },

  _getAssessments() {
    const all = dataManager.getAll('assessments') || [];
    if (this._isAdmin()) return all;
    // Teacher: show only assessments for classes where they teach at least one subject
    const session = this._session();
    const myClasses = this._getTeacherClasses(session?.supabaseId);
    return all.filter(a => myClasses.some(c => String(c.grade) === String(a.grade) && c.section === a.section));
  },

  _getTeacherClasses(teacherId) {
    const students = dataManager.getAll('students') || [];
    const classMap = new Map();
    students.forEach(s => {
      if (s.grade && s.section) classMap.set(`${s.grade}|${s.section}`, { grade: s.grade, section: s.section });
    });
    return [...classMap.values()].sort((a, b) =>
      String(a.grade).localeCompare(String(b.grade)) || a.section.localeCompare(b.section)
    );
  },

  _getUniqueClasses() {
    const students = dataManager.getAll('students') || [];
    const classMap = new Map();
    students.forEach(s => {
      if (s.grade && s.section) classMap.set(`${s.grade}|${s.section}`, { grade: s.grade, section: s.section });
    });
    return [...classMap.values()].sort((a, b) =>
      String(a.grade).localeCompare(String(b.grade)) || a.section.localeCompare(b.section)
    );
  },

  _letterGrade(pct) {
    if (pct >= 90) return 'A+';
    if (pct >= 75) return 'A';
    if (pct >= 65) return 'B';
    if (pct >= 55) return 'C';
    if (pct >= 45) return 'D';
    return 'F';
  },

  _gradeColor(pct) {
    if (pct >= 75) return '#10b981';
    if (pct >= 55) return '#f59e0b';
    if (pct >= 45) return '#f97316';
    return '#ef4444';
  },

  // Returns the grades[] array for a subject, handling both new multi-grade and legacy single-grade
  _subjectGrades(s) {
    if (Array.isArray(s.grades) && s.grades.length > 0) return s.grades;
    if (s.grade) return [s.grade];
    return [];
  },

  _calcAvg(grades) {
    const valid = (grades || []).filter(g => g.score != null && (g.total_marks || g.totalMarks));
    if (!valid.length) return 0;
    return Math.round(valid.reduce((s, g) => s + (g.score / (g.total_marks || g.totalMarks || 100)) * 100, 0) / valid.length);
  },

  // ── MAIN RENDER ───────────────────────────────────────────────
  render() {
    const assessments = this._getAssessments();
    const grades = dataManager.getAll('grades') || [];
    const subjects = dataManager.getAll('subjectCatalog') || [];
    const upcoming = assessments.filter(a => a.status !== 'completed').length;
    const avgScore = this._calcAvg(grades);

    const headerAction = {
      assessments: `<button class="btn btn-primary" onclick="academicsModule._openAddAssessmentModal()">➕ New Assessment</button>`,
      grades: '',
      subjects: this._isAdmin() ? `<div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="academicsModule._openSeedModal()">🌱 Seed Subjects</button>
        <button class="btn btn-primary" onclick="academicsModule._openAddSubjectModal()">➕ Add Subject</button>
      </div>` : ''
    }[this._tab] || '';

    this.container.innerHTML = `
      <div class="animate-fadeIn" style="max-width:1200px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="margin:0;font-size:1.5rem;font-weight:700;">📚 Academics</h1>
            <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.875rem;">Assessments · Grade Entry · Subject Catalog</p>
          </div>
          ${headerAction}
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:24px;">
          ${this._stat('📝', 'Assessments', assessments.length, '#6366f1')}
          ${this._stat('⏰', 'Upcoming', upcoming, '#f59e0b')}
          ${this._stat('✅', 'Completed', assessments.filter(a => a.status === 'completed').length, '#10b981')}
          ${this._stat('📊', 'Avg Score', avgScore + '%', '#3b82f6')}
          ${this._isAdmin() ? this._stat('📖', 'Subjects', subjects.length, '#8b5cf6') : ''}
        </div>

        <!-- Pill Tabs -->
        <div style="display:flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:12px;margin-bottom:24px;width:fit-content;">
          ${this._tabBtn('assessments', '📝 Assessments')}
          ${this._tabBtn('grades', '📊 Enter Grades')}
          ${this._isAdmin() ? this._tabBtn('subjects', '📚 Subjects') : ''}
        </div>

        <!-- Tab Content -->
        <div id="academics-content">
          ${this._renderTabContent()}
        </div>
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
      style="padding:9px 18px;border:none;border-radius:9px;font-size:0.84rem;font-weight:600;cursor:pointer;transition:all 0.15s;
      ${active ? 'background:white;color:#0f172a;box-shadow:0 1px 4px rgba(0,0,0,0.1);' : 'background:transparent;color:#64748b;'}">
      ${label}
    </button>`;
  },

  _switchTab(tab) {
    this._tab = tab;
    this._selAssessment = null;
    this.render();
  },

  _refreshContent() {
    const el = document.getElementById('academics-content');
    if (el) el.innerHTML = this._renderTabContent();
  },

  _renderTabContent() {
    switch (this._tab) {
      case 'assessments': return this._renderAssessmentsTab();
      case 'grades':      return this._renderGradesTab();
      case 'subjects':    return this._isAdmin() ? this._renderSubjectsTab() : '';
      default:            return '';
    }
  },

  // ── TAB 1: ASSESSMENTS ────────────────────────────────────────
  _renderAssessmentsTab() {
    let items = this._getAssessments();
    const gradeList = [...new Set(items.map(a => a.grade).filter(Boolean))].sort();

    if (this._filterGrade !== 'all')   items = items.filter(a => String(a.grade) === this._filterGrade);
    if (this._filterStatus !== 'all')  items = items.filter(a => a.status === this._filterStatus);
    if (this._search) {
      const q = this._search.toLowerCase();
      items = items.filter(a => a.name?.toLowerCase().includes(q) || a.subject?.toLowerCase().includes(q));
    }
    items = [...items].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center;">
        <input type="text" class="form-input" placeholder="🔍 Search…" value="${this._search}"
          oninput="academicsModule._search=this.value;academicsModule._refreshContent()"
          style="flex:1;min-width:180px;max-width:280px;margin:0;">
        <select class="form-select" style="width:auto;margin:0;"
          onchange="academicsModule._filterGrade=this.value;academicsModule._refreshContent()">
          <option value="all" ${this._filterGrade === 'all' ? 'selected' : ''}>All Grades</option>
          ${gradeList.map(g => `<option value="${g}" ${this._filterGrade === g ? 'selected' : ''}>Grade ${g}</option>`).join('')}
        </select>
        <select class="form-select" style="width:auto;margin:0;"
          onchange="academicsModule._filterStatus=this.value;academicsModule._refreshContent()">
          <option value="all"       ${this._filterStatus === 'all'       ? 'selected' : ''}>All Status</option>
          <option value="scheduled" ${this._filterStatus === 'scheduled' ? 'selected' : ''}>Scheduled</option>
          <option value="completed" ${this._filterStatus === 'completed' ? 'selected' : ''}>Completed</option>
        </select>
        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:auto;">${items.length} result${items.length !== 1 ? 's' : ''}</span>
      </div>

      ${items.length === 0 ? `
        <div style="text-align:center;padding:56px;color:var(--text-secondary);">
          <div style="font-size:3rem;margin-bottom:12px;">📝</div>
          <p style="font-weight:600;margin:0 0 4px;">No assessments found</p>
          <p style="font-size:0.875rem;margin:0;">Click <strong>New Assessment</strong> to schedule one.</p>
        </div>
      ` : `
        <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
            <thead>
              <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Name</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Subject</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Class</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Date</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Marks</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Status</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#475569;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((a, i) => {
                const marks = a.total_marks || a.totalMarks || '—';
                const dateStr = a.date ? new Date(a.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const isCompleted = a.status === 'completed';
                return `
                  <tr style="border-bottom:1px solid #f1f5f9;${i % 2 === 0 ? '' : 'background:#fafafa;'}">
                    <td style="padding:12px 16px;font-weight:600;">${a.name || '—'}</td>
                    <td style="padding:12px 16px;color:#64748b;">${a.subject || '—'}</td>
                    <td style="padding:12px 16px;">
                      <span style="background:#eff6ff;color:#3b82f6;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;">
                        Gr.${a.grade || '?'}-${a.section || '?'}
                      </span>
                    </td>
                    <td style="padding:12px 16px;color:#64748b;white-space:nowrap;">${dateStr}</td>
                    <td style="padding:12px 16px;color:#64748b;">${marks}</td>
                    <td style="padding:12px 16px;">
                      <span style="padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;
                        ${isCompleted ? 'background:#dcfce7;color:#16a34a;' : 'background:#fef9c3;color:#ca8a04;'}">
                        ${(a.status || 'SCHEDULED').toUpperCase()}
                      </span>
                    </td>
                    <td style="padding:12px 16px;">
                      <div style="display:flex;gap:6px;flex-wrap:nowrap;">
                        <button onclick="academicsModule._enterGrades('${a.id}')" title="Enter Grades"
                          style="padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;font-weight:600;color:#475569;white-space:nowrap;">
                          ✏️ Grades
                        </button>
                        ${this._isAdmin() ? `
                          <button onclick="academicsModule._deleteAssessment('${a.id}')" title="Delete"
                            style="padding:5px 8px;border:1px solid #fee2e2;border-radius:6px;background:white;cursor:pointer;color:#ef4444;font-size:0.75rem;">🗑️</button>` : ''}
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}`;
  },

  // ── TAB 2: GRADE ENTRY ────────────────────────────────────────
  _renderGradesTab() {
    const assessments = this._getAssessments();
    const allGrades   = dataManager.getAll('grades') || [];

    const options = [...assessments]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .map(a => {
        const label = `${a.type || 'Assessment'} · ${a.subject || 'Subject'} · Gr${a.grade || '?'}-${a.section || '?'} · ${a.date ? new Date(a.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'No date'} (${a.total_marks || a.totalMarks || 100} marks)`;
        return `<option value="${a.id}" ${this._selAssessment === a.id ? 'selected' : ''}>${label}</option>`;
      }).join('');

    const selected   = assessments.find(a => a.id === this._selAssessment);
    const totalMarks = selected ? (selected.total_marks || selected.totalMarks || 100) : 100;

    let students = [];
    if (selected) {
      students = (dataManager.getAll('students') || [])
        .filter(s => s.status === 'active' && String(s.grade) === String(selected.grade) && s.section === selected.section)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    const existingGrades = selected ? allGrades.filter(g => (g.assessment_id || g.assessmentId) === selected.id) : [];
    const gradedCount    = existingGrades.length;
    const progress       = students.length > 0 ? Math.round((gradedCount / students.length) * 100) : 0;

    return `
      <!-- Smart selector -->
      <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">
        <label style="display:block;font-weight:600;font-size:0.875rem;color:#374151;margin-bottom:8px;">Select Assessment</label>
        <select class="form-select" style="margin:0;"
          onchange="academicsModule._selAssessment=this.value;academicsModule._refreshContent()">
          <option value="">— Pick an assessment —</option>
          ${options}
        </select>
        ${selected ? `
          <div style="display:flex;align-items:center;gap:12px;margin-top:14px;">
            <div style="flex:1;height:6px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
              <div style="width:${progress}%;height:100%;background:#6366f1;border-radius:4px;transition:width 0.3s;"></div>
            </div>
            <span style="font-size:0.8rem;color:#64748b;white-space:nowrap;font-weight:600;">${gradedCount}/${students.length} graded</span>
          </div>` : ''}
      </div>

      ${!selected ? `
        <div style="text-align:center;padding:56px;color:var(--text-secondary);">
          <div style="font-size:3rem;margin-bottom:12px;">📊</div>
          <p style="font-weight:600;margin:0 0 4px;">Select an assessment above</p>
          <p style="font-size:0.875rem;margin:0;">The student table will load automatically.</p>
        </div>
      ` : students.length === 0 ? `
        <div style="text-align:center;padding:40px;color:var(--text-secondary);">
          <p>No active students in Grade ${selected.grade}-${selected.section}.</p>
        </div>
      ` : `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <span style="font-weight:700;">${selected.name}</span>
              <span style="margin-left:8px;font-size:0.8rem;color:#64748b;">${selected.subject} · Grade ${selected.grade}-${selected.section} · ${totalMarks} marks</span>
            </div>
            <div style="display:flex;gap:8px;">
              <button onclick="academicsModule._cancelGrades()" class="btn btn-ghost" style="font-size:0.875rem;">✕ Cancel</button>
              <button onclick="academicsModule._saveGrades()" class="btn btn-primary" id="acad-save-btn" style="font-size:0.875rem;">💾 Save All</button>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
              <thead>
                <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;width:40px;">#</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Student</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Score /${totalMarks}</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Grade</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:#475569;">Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${students.map((s, i) => {
                  const existing = existingGrades.find(g => (g.student_id || g.studentId) === s.id);
                  const pending  = (this._pendingGrades[selected.id] || []).find(g => g.studentId === s.id);
                  const score    = pending?.score ?? (existing?.score ?? '');
                  const remarks  = pending?.remarks ?? (existing?.remarks ?? '');
                  const pct      = score !== '' ? Math.round((parseFloat(score) / totalMarks) * 100) : null;
                  const letter   = pct !== null ? this._letterGrade(pct) : '—';
                  const color    = pct !== null ? this._gradeColor(pct) : '#94a3b8';
                  return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:10px 16px;color:#94a3b8;font-size:0.8rem;">${i + 1}</td>
                      <td style="padding:10px 16px;">
                        <div style="font-weight:600;">${s.name || '—'}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;">${s.roll_no || s.rollNo || ''}</div>
                      </td>
                      <td style="padding:10px 16px;">
                        <input type="number" min="0" max="${totalMarks}" step="0.5" value="${score}" placeholder="—"
                          oninput="academicsModule._updateGrade('${selected.id}','${s.id}','score',this.value,${totalMarks})"
                          style="width:80px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.875rem;text-align:center;">
                      </td>
                      <td style="padding:10px 16px;">
                        <span data-grade-badge="${s.id}"
                          style="background:${color}22;color:${color};padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;">
                          ${letter}
                        </span>
                      </td>
                      <td style="padding:10px 16px;">
                        <input type="text" value="${remarks}" placeholder="Optional…"
                          oninput="academicsModule._updateGrade('${selected.id}','${s.id}','remarks',this.value)"
                          style="width:160px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.875rem;">
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`}`;
  },

  _enterGrades(assessmentId) {
    this._tab = 'grades';
    this._selAssessment = assessmentId;
    this.render();
  },

  _updateGrade(assessmentId, studentId, field, value, totalMarks) {
    if (!this._pendingGrades[assessmentId]) this._pendingGrades[assessmentId] = [];
    let entry = this._pendingGrades[assessmentId].find(g => g.studentId === studentId);
    if (!entry) { entry = { studentId, score: '', remarks: '' }; this._pendingGrades[assessmentId].push(entry); }
    entry[field] = value;
    if (field === 'score' && totalMarks) {
      const pct    = value !== '' ? Math.round((parseFloat(value) / totalMarks) * 100) : null;
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
      const session    = this._session();
      let saved = 0;
      for (const g of pending) {
        if (g.score !== '' && g.score !== undefined && g.score !== null) {
          const pct = Math.round((parseFloat(g.score) / totalMarks) * 100);
          const result = await dataManager.create('grades', {
            studentId:    g.studentId,
            assessmentId: this._selAssessment,
            subject:      assessment?.subject || '',
            score:        parseFloat(g.score),
            totalMarks,
            grade:        this._letterGrade(pct),
            remarks:      g.remarks || '',
            gradedBy:     session?.supabaseId || null
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
    this._selAssessment = null;
    this._refreshContent();
  },

  // ── TAB 3: SUBJECTS (admin only) ──────────────────────────────
  _renderSubjectsTab() {
    let subjects = dataManager.getAll('subjectCatalog') || [];
    const staff  = (dataManager.getAll('staff') || []).filter(s => s.type === 'teaching');

    // Count active students per grade for auto-enrollment display
    const allStudents = dataManager.getAll('students') || [];
    const studentsByGrade = {};
    allStudents.filter(s => s.status === 'active').forEach(s => {
      if (s.grade) studentsByGrade[s.grade] = (studentsByGrade[s.grade] || 0) + 1;
    });

    // Build grade filter list from all grades present across subjects
    const gradeList = [...new Set(subjects.flatMap(s => this._subjectGrades(s)).filter(Boolean))].sort();
    if (this._subjectGradeFilter !== 'all') {
      subjects = subjects.filter(s => this._subjectGrades(s).includes(this._subjectGradeFilter));
    }
    if (this._subjectSearch) {
      const q = this._subjectSearch.toLowerCase();
      subjects = subjects.filter(s => s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q));
    }

    return `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center;">
        <input type="text" class="form-input" placeholder="🔍 Search subjects…" value="${this._subjectSearch}"
          oninput="academicsModule._subjectSearch=this.value;academicsModule._refreshContent()"
          style="flex:1;min-width:180px;max-width:280px;margin:0;">
        <select class="form-select" style="width:auto;margin:0;"
          onchange="academicsModule._subjectGradeFilter=this.value;academicsModule._refreshContent()">
          <option value="all" ${this._subjectGradeFilter === 'all' ? 'selected' : ''}>All Grades</option>
          ${gradeList.map(g => `<option value="${g}" ${this._subjectGradeFilter === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:auto;">${subjects.length} of ${(dataManager.getAll('subjectCatalog') || []).length} subjects</span>
      </div>

      ${subjects.length === 0 ? `
        <div style="text-align:center;padding:56px;color:var(--text-secondary);">
          <div style="font-size:3rem;margin-bottom:12px;">📚</div>
          <p style="font-weight:600;margin:0 0 4px;">No subjects yet</p>
          <p style="font-size:0.875rem;margin:0;">Click <strong>Seed Subjects</strong> to import the Nigerian curriculum.</p>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
          ${subjects.map(s => {
            const teacher     = staff.find(t => t.id === (s.teacherId || s.teacher_id));
            const sGrades     = this._subjectGrades(s);
            const studentCount = sGrades.reduce((sum, g) => sum + (studentsByGrade[g] || 0), 0);
            return `
              <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;border-left:4px solid #6366f1;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                      <span style="font-size:1.3rem;">${s.icon || '📚'}</span>
                      <span style="font-weight:700;font-size:0.95rem;">${s.name}</span>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;">
                      <span style="background:#eff6ff;color:#3b82f6;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;">${s.code || '—'}</span>
                      ${sGrades.length === 0 ? '<span style="background:#f8fafc;color:#94a3b8;padding:2px 8px;border-radius:6px;font-size:0.72rem;">No grade</span>' : sGrades.map(g => `<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;">${g}</span>`).join('')}
                      <span style="background:#f8fafc;color:#64748b;padding:2px 8px;border-radius:6px;font-size:0.72rem;">👥 ${studentCount} student${studentCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style="font-size:0.8rem;color:#64748b;">👩‍🏫 ${teacher ? teacher.name : '<em style="opacity:0.6;">No teacher</em>'}</div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                    <button onclick="academicsModule._editSubject('${s.id}')" title="Edit"
                      style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;">✏️</button>
                    <button onclick="academicsModule._deleteSubject('${s.id}')" title="Delete"
                      style="padding:5px 8px;border:1px solid #fee2e2;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;color:#ef4444;">🗑️</button>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>`}`;
  },

  // ── ASSESSMENT CRUD ───────────────────────────────────────────
  _openAddAssessmentModal() {
    const classes  = this._getUniqueClasses();
    const subjects = [...new Set((dataManager.getAll('subjectCatalog') || []).map(s => s.name).filter(Boolean))];
    const today    = new Date().toISOString().split('T')[0];

    const content = `
      <form id="acad-assessment-form" onsubmit="academicsModule._handleAddAssessment(event)">
        <div class="form-group">
          <label class="form-label">Assessment Name *</label>
          <input type="text" class="form-input" name="name" required placeholder="e.g., Mid-Term Exam">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" name="type">
              <option value="Quiz">Quiz</option>
              <option value="Test">Test</option>
              <option value="Exam" selected>Exam</option>
              <option value="Assignment">Assignment</option>
              <option value="Practical">Practical</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subject *</label>
            <select class="form-select" name="subject" required>
              <option value="">Select Subject</option>
              ${subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Class *</label>
            <select class="form-select" name="class" required onchange="academicsModule._updateClassHidden(this.value)">
              <option value="">Select Class</option>
              ${classes.map(c => `<option value="${c.grade}|${c.section}">Grade ${c.grade} — Section ${c.section}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Total Marks *</label>
            <input type="number" class="form-input" name="totalMarks" required min="1" max="1000" value="100">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input type="date" class="form-input" name="date" required value="${today}">
        </div>
        <input type="hidden" name="grade"   id="acad-hidden-grade">
        <input type="hidden" name="section" id="acad-hidden-section">
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">📝 Create Assessment</button>
        </div>
      </form>`;
    createModal('New Assessment', content);
  },

  _updateClassHidden(val) {
    const [g, s] = (val || '').split('|');
    const hg = document.getElementById('acad-hidden-grade');
    const hs = document.getElementById('acad-hidden-section');
    if (hg) hg.value = g || '';
    if (hs) hs.value = s || '';
  },

  async _handleAddAssessment(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const result = await dataManager.create('assessments', {
      name:       fd.get('name'),
      subject:    fd.get('subject'),
      type:       fd.get('type'),
      grade:      fd.get('grade'),
      section:    fd.get('section'),
      date:       fd.get('date'),
      totalMarks: parseInt(fd.get('totalMarks')),
      status:     'scheduled'
    });
    if (!result) return;
    document.querySelector('.modal-backdrop')?.remove();
    showToast('Assessment created!', 'success');
  },

  async _deleteAssessment(id) {
    if (!confirm('Delete this assessment? Existing grades will be kept.')) return;
    await dataManager.delete('assessments', id);
    showToast('Assessment deleted.', 'success');
  },

  // ── SUBJECT CRUD ──────────────────────────────────────────────
  _allGradeGroups() {
    return [
      { label: 'Primary',           grades: ['Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'] },
      { label: 'Junior Secondary',  grades: ['JSS1','JSS2','JSS3'] },
      { label: 'Senior Secondary',  grades: ['SS1','SS2','SS3'] },
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
          ${group.grades.map(g => `
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:4px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.8rem;
              ${selectedGrades.includes(g) ? 'background:#eff6ff;border-color:#3b82f6;color:#1d4ed8;font-weight:600;' : 'background:white;color:#475569;'}">
              <input type="checkbox" name="grades" value="${g}" ${selectedGrades.includes(g) ? 'checked' : ''}
                style="accent-color:#3b82f6;width:13px;height:13px;"> ${g}
            </label>`).join('')}
        </div>
      </div>`).join('');

    const content = `
      <form id="acad-subject-form">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Subject Name *</label>
            <input type="text" class="form-input" name="name" required value="${s.name || ''}" placeholder="Mathematics">
          </div>
          <div class="form-group">
            <label class="form-label">Code *</label>
            <input type="text" class="form-input" name="code" required value="${s.code || ''}" placeholder="MATH">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Applies to Grades <span style="color:#ef4444;">*</span></label>
          <p style="font-size:0.78rem;color:#64748b;margin:0 0 10px;">Students registered under a selected grade will automatically study this subject.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">
            ${gradeCheckboxes}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Icon (emoji)</label>
            <input type="text" class="form-input" name="icon" value="${s.icon || '📚'}" placeholder="📚">
          </div>
          <div class="form-group">
            <label class="form-label">Assign Teacher</label>
            <select class="form-select" name="teacherId">
              <option value="">— Unassigned —</option>
              ${staff.map(t => `<option value="${t.id}" ${(s.teacherId || s.teacher_id) === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="button" class="btn btn-primary flex-1"
            onclick="academicsModule._handleSaveSubject('${s.id || ''}')">
            ${s.id ? '💾 Save Changes' : '➕ Add Subject'}
          </button>
        </div>
      </form>`;
    createModal(s.id ? 'Edit Subject' : 'Add Subject', content);
  },

  _editSubject(id) {
    const s = (dataManager.getAll('subjectCatalog') || []).find(x => x.id === id);
    if (s) this._openAddSubjectModal(s);
  },

  async _handleSaveSubject(existingId) {
    const form = document.getElementById('acad-subject-form');
    if (!form) return;
    const fd = new FormData(form);
    const selectedGrades = fd.getAll('grades');
    if (selectedGrades.length === 0) { showToast('Please select at least one grade.', 'warning'); return; }
    const payload = {
      name:      fd.get('name'),
      code:      fd.get('code'),
      grades:    selectedGrades,
      grade:     selectedGrades[0],  // keep first grade in legacy field for backward compat
      icon:      fd.get('icon'),
      teacherId: fd.get('teacherId') || null
    };
    if (existingId) {
      await dataManager.update('subjectCatalog', existingId, payload);
      showToast('Subject updated!', 'success');
    } else {
      await dataManager.create('subjectCatalog', payload);
      showToast('Subject added!', 'success');
    }
    document.querySelector('.modal-backdrop')?.remove();
  },

  async _deleteSubject(id) {
    if (!confirm('Delete this subject? This will not remove existing grades.')) return;
    await dataManager.delete('subjectCatalog', id);
    showToast('Subject deleted.', 'success');
  },

  // ── SEED STANDARD SUBJECTS ────────────────────────────────────
  _standardSubjects() {
    return [
      { name: 'Mathematics',                  code: 'MATH',  icon: '🔢', category: 'Core' },
      { name: 'English Language',             code: 'ENG',   icon: '📝', category: 'Core' },
      { name: 'Civic Education',              code: 'CIV',   icon: '🏛️', category: 'Core' },
      { name: 'Physical Education',           code: 'PE',    icon: '⚽', category: 'Core' },
      { name: 'Computer Studies (ICT)',       code: 'ICT',   icon: '💻', category: 'Core' },
      { name: 'Basic Science & Technology',  code: 'BST',   icon: '🔬', category: 'Sciences' },
      { name: 'Physics',                      code: 'PHY',   icon: '⚛️', category: 'Sciences' },
      { name: 'Chemistry',                    code: 'CHEM',  icon: '🧪', category: 'Sciences' },
      { name: 'Biology',                      code: 'BIO',   icon: '🌿', category: 'Sciences' },
      { name: 'Agricultural Science',         code: 'AGRIC', icon: '🌾', category: 'Sciences' },
      { name: 'Literature in English',        code: 'LIT',   icon: '📖', category: 'Humanities' },
      { name: 'History',                      code: 'HIST',  icon: '🏺', category: 'Humanities' },
      { name: 'Geography',                    code: 'GEO',   icon: '🗺️', category: 'Humanities' },
      { name: 'Government',                   code: 'GOVT',  icon: '🏛️', category: 'Humanities' },
      { name: 'Christian Religious Studies',  code: 'CRS',   icon: '✝️', category: 'Humanities' },
      { name: 'Islamic Religious Studies',    code: 'IRS',   icon: '☪️', category: 'Humanities' },
      { name: 'Economics',                    code: 'ECON',  icon: '📈', category: 'Social Sciences' },
      { name: 'Commerce',                     code: 'COMM',  icon: '🏪', category: 'Social Sciences' },
      { name: 'Financial Accounting',         code: 'ACCT',  icon: '💰', category: 'Social Sciences' },
      { name: 'Business Studies',             code: 'BUS',   icon: '💼', category: 'Social Sciences' },
      { name: 'Technical Drawing',            code: 'TECH',  icon: '📐', category: 'Vocational' },
      { name: 'Food & Nutrition',             code: 'FNT',   icon: '🍽️', category: 'Vocational' },
      { name: 'Home Economics',               code: 'HEC',   icon: '🏠', category: 'Vocational' },
      { name: 'Yoruba',                       code: 'YOR',   icon: '🗣️', category: 'Languages' },
      { name: 'Igbo',                         code: 'IGB',   icon: '🗣️', category: 'Languages' },
      { name: 'Hausa',                        code: 'HAU',   icon: '🗣️', category: 'Languages' },
      { name: 'French',                       code: 'FRN',   icon: '🇫🇷', category: 'Languages' },
    ];
  },

  _openSeedModal() {
    const existing  = (dataManager.getAll('subjectCatalog') || []).map(s => s.code?.toUpperCase());
    const std       = this._standardSubjects();
    const categories = [...new Set(std.map(s => s.category))];

    const rows = categories.map(cat => `
      <tr><td colspan="3" style="background:var(--bg-tertiary);font-size:0.72rem;font-weight:700;color:var(--text-secondary);padding:0.35rem 0.75rem;text-transform:uppercase;letter-spacing:0.06em;">${cat}</td></tr>
      ${std.filter(s => s.category === cat).map(s => {
        const exists = existing.includes(s.code.toUpperCase());
        return `<tr>
          <td style="padding:0.45rem 0.75rem;">
            <input type="checkbox" name="seed_${s.code}" value="${s.code}" ${exists ? 'disabled' : 'checked'} style="width:15px;height:15px;cursor:pointer;">
          </td>
          <td style="padding:0.45rem 0.75rem;font-weight:500;font-size:0.875rem;">${s.icon} ${s.name}</td>
          <td style="padding:0.45rem 0.75rem;font-size:0.78rem;color:var(--text-secondary);">
            ${exists ? '<span class="badge badge-success">Already added</span>' : `<code>${s.code}</code>`}
          </td>
        </tr>`;
      }).join('')}
    `).join('');

    const grades = ['JSS1','JSS2','JSS3','SS1','SS2','SS3','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'];
    const content = `
      <form id="seed-form">
        <p style="margin-bottom:16px;font-size:0.875rem;color:var(--text-secondary);">Select subjects to import. Already-added subjects are disabled.</p>
        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Apply to Grade (optional)</label>
          <select class="form-select" name="grade">
            <option value="">— Assign later —</option>
            ${grades.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <button type="button" class="btn btn-sm btn-ghost"
            onclick="document.querySelectorAll('#seed-form input[type=checkbox]:not(:disabled)').forEach(cb=>cb.checked=true)">Select All</button>
          <button type="button" class="btn btn-sm btn-ghost"
            onclick="document.querySelectorAll('#seed-form input[type=checkbox]:not(:disabled)').forEach(cb=>cb.checked=false)">Deselect All</button>
        </div>
        <div style="max-height:50vh;overflow-y:auto;border:1px solid var(--border-primary);border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
              <tr>
                <th style="padding:0.4rem 0.75rem;width:36px;"></th>
                <th style="padding:0.4rem 0.75rem;text-align:left;font-size:0.78rem;">Subject</th>
                <th style="padding:0.4rem 0.75rem;text-align:left;font-size:0.78rem;">Code</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">🌱 Import Selected</button>
        </div>
      </form>`;
    const modal = createModal('Seed Standard Subjects', content, 'large');
    const form  = modal.querySelector('#seed-form');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); this._handleSeedSubjects(e); });
  },

  async _handleSeedSubjects(e) {
    const fd       = new FormData(e.target);
    const grade    = fd.get('grade') || null;
    const std      = this._standardSubjects();
    const existing = (dataManager.getAll('subjectCatalog') || []).map(s => s.code?.toUpperCase());
    const toImport = std.filter(s => fd.get(`seed_${s.code}`) && !existing.includes(s.code.toUpperCase()));

    if (toImport.length === 0) { showToast('No new subjects selected.', 'warning'); return; }

    const btn = e.target.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

    let success = 0;
    for (const s of toImport) {
      const gradeArr = grade ? [grade] : [];
      const res = await dataManager.create('subjectCatalog', {
        name: s.name, code: s.code, grade: grade || '', grades: gradeArr, icon: s.icon, teacherId: null, description: `${s.category} subject`
      });
      if (res) success++;
    }
    document.querySelector('.modal-backdrop')?.remove();
    showToast(`✅ Imported ${success} subject${success !== 1 ? 's' : ''}!`, 'success');
    this._subjectGradeFilter = 'all';
    this._subjectSearch = '';
    this.render();
  },
};

// ── Exports + backward-compat aliases ────────────────────────────
window.academicsModule       = academicsModule;
window.assessmentsModule     = academicsModule;  // teacher portal compat
window.gradesManagementModule = academicsModule; // old grades-management links
