// ============================================
// STUDENT GRADES MODULE
// Pulls from: grades (linked to assessments) + student_assignments
// Groups by subject, supports term filtering, charts, report card export
// ============================================

const studentGradesModule = {
  currentSession: null,
  studentData: null,
  _activeTerm: 'all',

  async init(container) {
    this.currentSession = authManager.getSession();
    if (!container) container = document.getElementById('main-content');
    this._container = container;

    await dataManager.waitForReady();
    this.loadStudentData();
    container.innerHTML = this.render();
    setTimeout(() => this.initializeCharts(), 150);

    this._onDataChange = (e) => {
      if (['grades', 'assessments', 'studentSubjects', 'studentAssignments', 'subjectCatalog'].includes(e.detail.collection)) {
        this.loadStudentData();
        this._container.innerHTML = this.render();
        setTimeout(() => this.initializeCharts(), 150);
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  loadStudentData() {
    const supabaseId = this.currentSession?.supabaseId;
    const schoolId = this.currentSession?.userId;

    const students = dataManager.getAll('students') || [];
    const student = students.find(s => s.authId === supabaseId || s.auth_id === supabaseId)
      || students.find(s => s.id === supabaseId)
      || students.find(s => s.id === schoolId);

    if (!student) {
      console.error('[StudentGrades] Student not found:', { schoolId, supabaseId });
      this.studentData = { error: 'Student record not found. Please contact administrator.' };
      return;
    }

    const studentUUID = student.id;

    // ── 1. Grades table (teacher/admin approved grades linked to assessments) ──
    const allGrades = dataManager.getAll('grades') || [];
    const studentGrades = allGrades.filter(g =>
      (g.student_id || g.studentId) === studentUUID
    );

    // ── 2. Assessments lookup table ──
    const assessments = dataManager.getAll('assessments') || [];
    const assessmentMap = {};
    assessments.forEach(a => { assessmentMap[a.id] = a; });

    // ── 3. Student assignments (graded projects / homework) ──
    const allAssignments = dataManager.getAll('studentAssignments') || [];
    const studentAssignments = allAssignments.filter(a =>
      (a.student_id || a.studentId) === studentUUID &&
      (a.score !== null && a.score !== undefined)
    );

    // ── 4. Subject catalog (icons, names) ──
    const subjectCatalog = dataManager.getAll('subjectCatalog') || [];
    const subjectIconMap = {};
    subjectCatalog.forEach(s => {
      if (s.name) subjectIconMap[s.name.toLowerCase()] = s.icon || '📚';
    });

    // ── 5. Enrolled subjects — auto from catalog by grade + legacy studentSubjects fallback ──
    // Primary: all subjects in catalog assigned to the student's grade
    const catalogEnrolled = subjectCatalog.filter(s => {
      const sGrades = (Array.isArray(s.grades) && s.grades.length > 0) ? s.grades : (s.grade ? [s.grade] : []);
      return student.grade && sGrades.includes(student.grade);
    }).map(s => ({ subjectId: s.id, subjectName: s.name, icon: s.icon || '📚', teacherName: null }));

    // Fallback: legacy studentSubjects table (keeps any manually enrolled subjects not in catalog)
    const allStudentSubjects = dataManager.getAll('studentSubjects') || [];
    const legacyEnrollment = allStudentSubjects.find(s => (s.student_id || s.studentId) === studentUUID);
    const legacySubjects   = legacyEnrollment?.subjects || [];
    const catalogNames = new Set(catalogEnrolled.map(s => s.subjectName?.toLowerCase()).filter(Boolean));
    const enrolledSubjects = [
      ...catalogEnrolled,
      ...legacySubjects.filter(s => {
        const n = (s.subjectName || s.name || '').toLowerCase();
        return n && !catalogNames.has(n);
      })
    ];

    // ── Build enriched grade records from grades table ──
    const enrichedGrades = studentGrades.map(g => {
      const assessment = assessmentMap[g.assessment_id || g.assessmentId] || {};
      const score = g.score != null ? parseFloat(g.score) : null;
      const totalMarks = g.total_marks || assessment.total_marks || 100;
      const pct = g.percentage != null
        ? Math.round(parseFloat(g.percentage))
        : (score != null ? Math.round((score / totalMarks) * 100) : null);
      return {
        id: g.id,
        subject: g.subject || assessment.subject || 'Unknown',
        title: assessment.name || 'Assessment',
        type: (assessment.type || 'exam').toLowerCase(),
        term: g.term || assessment.term || 'First Term',
        academicYear: g.academic_year || assessment.academic_year || '2025-2026',
        date: assessment.date || g.created_at,
        score,
        totalMarks,
        percentage: pct,
        letterGrade: g.grade || this._calcLetterGrade(pct),
        remarks: g.remarks || '',
        source: 'grades'
      };
    });

    // ── Build enriched records from student_assignments (graded) ──
    const enrichedAssignments = studentAssignments.map(a => {
      const score = a.score != null ? parseFloat(a.score) : null;
      const totalMarks = a.total_marks || a.totalMarks || 100;
      const pct = score != null ? Math.round((score / totalMarks) * 100) : null;
      return {
        id: a.id,
        subject: a.subject_name || a.subjectName || 'Unknown',
        title: a.title || 'Assignment',
        type: (a.type || 'assignment').toLowerCase(),
        term: a.term || 'First Term',
        academicYear: a.academic_year || '2025-2026',
        date: a.submitted_date || a.due_date || a.created_at,
        score,
        totalMarks,
        percentage: pct,
        letterGrade: a.grade || this._calcLetterGrade(pct),
        remarks: a.remarks || '',
        source: 'assignments'
      };
    });

    const allRecords = [...enrichedGrades, ...enrichedAssignments];

    // ── Group by subject ──
    const subjectGroups = {};
    allRecords.forEach(record => {
      const key = record.subject;
      if (!subjectGroups[key]) {
        subjectGroups[key] = {
          name: key,
          icon: subjectIconMap[key.toLowerCase()] || '📚',
          records: []
        };
      }
      subjectGroups[key].records.push(record);
    });

    // ── Merge enrollment data into subject groups ──
    enrolledSubjects.forEach(s => {
      const name = s.subjectName || s.name || (typeof s === 'string' ? s : null);
      if (!name) return;

      if (!subjectGroups[name]) {
        subjectGroups[name] = {
          name,
          icon: s.icon || subjectIconMap[name.toLowerCase()] || '📚',
          records: []
        };
      }

      subjectGroups[name].teacherName  = s.teacherName  || subjectGroups[name].teacherName  || null;
      subjectGroups[name].subjectId    = s.subjectId    || null;
      subjectGroups[name].enrollGrade  = s.currentGrade != null ? parseFloat(s.currentGrade) : null;
      subjectGroups[name].enrollLetter = s.letterGrade  || null;

      // If admin/teacher set a summary grade but no detailed records exist for this subject,
      // create a synthetic record so the charts and table always show something meaningful.
      const hasDetailRecords = subjectGroups[name].records.length > 0;
      if (!hasDetailRecords && s.currentGrade != null) {
        const pct = parseFloat(s.currentGrade);
        const synth = {
          id: 'enroll_' + name,
          subject: name,
          title: 'Term Summary Grade',
          type: 'term',
          term: schoolConfig?.getCurrentTerm?.()?.name || 'Current Term',
          academicYear: window.CURRENT_ACADEMIC_YEAR || '2025-2026',
          date: null,
          score: pct,
          totalMarks: 100,
          percentage: Math.round(pct),
          letterGrade: s.letterGrade || this._calcLetterGrade(pct),
          remarks: 'Summary grade from enrollment record',
          source: 'enrollment'
        };
        subjectGroups[name].records.push(synth);
        allRecords.push(synth);
      }
    });

    // ── Collect available terms ──
    const termSet = new Set();
    allRecords.forEach(r => { if (r.term) termSet.add(r.term); });
    const termOrder = ['First Term', 'Second Term', 'Third Term'];
    const terms = [...termSet].sort((a, b) => {
      const ai = termOrder.indexOf(a), bi = termOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    this.studentData = {
      student,
      subjects: Object.values(subjectGroups),
      allRecords,
      terms,
      enrolledSubjects
    };
  },

  _calcLetterGrade(pct) {
    if (pct == null) return null;
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 75) return 'B+';
    if (pct >= 70) return 'B';
    if (pct >= 65) return 'C+';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
  },

  _filterByTerm(records) {
    if (this._activeTerm === 'all') return records;
    return records.filter(r => r.term === this._activeTerm);
  },

  setTerm(term) {
    this._activeTerm = term;
    this._container.innerHTML = this.render();
    setTimeout(() => this.initializeCharts(), 150);
  },

  render() {
    if (!this.studentData) return '<div class="module-container"><p>Loading...</p></div>';

    const { error } = this.studentData;
    if (error) {
      return `
        <div class="module-container">
          <div class="card" style="text-align:center;padding:3rem;">
            <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
            <h3 style="color:var(--color-danger);margin:0 0 0.5rem;">${error}</h3>
            <button class="btn btn-primary" onclick="window.location.reload()" style="margin-top:1rem;">Reload Page</button>
          </div>
        </div>`;
    }

    const { student, subjects, allRecords, terms } = this.studentData;
    const filteredRecords = this._filterByTerm(allRecords);
    const gradedRecords = filteredRecords.filter(r => r.percentage != null);
    const avgPct = gradedRecords.length > 0
      ? Math.round(gradedRecords.reduce((s, r) => s + r.percentage, 0) / gradedRecords.length)
      : null;

    const typeCount = (type) => filteredRecords.filter(r => r.type === type).length;
    const testCount = filteredRecords.filter(r => r.type === 'test' || r.type === 'quiz').length;

    return `
      <div class="module-container">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1.5rem;">
          <div>
            <h1 style="margin:0 0 0.25rem;font-size:1.5rem;font-weight:700;">📊 My Grades &amp; Reports</h1>
            <p style="margin:0;color:var(--text-secondary);font-size:0.875rem;">
              ${student.name || 'Student'} &nbsp;·&nbsp; Grade ${student.grade || '-'} ${student.section || ''}
            </p>
          </div>
          <button class="btn btn-primary" onclick="studentGradesModule.downloadReportCard()">
            📄 Download Report Card
          </button>
        </div>

        <!-- Term Filter -->
        ${terms.length > 0 ? `
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
          <button class="btn btn-sm ${this._activeTerm === 'all' ? 'btn-primary' : 'btn-ghost'}"
            onclick="studentGradesModule.setTerm('all')">All Terms</button>
          ${terms.map(t => `
          <button class="btn btn-sm ${this._activeTerm === t ? 'btn-primary' : 'btn-ghost'}"
            onclick="studentGradesModule.setTerm('${t}')">${t}</button>`).join('')}
        </div>` : ''}

        <!-- Stats Row -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem;">
          ${this._statCard('Overall Avg', avgPct != null ? avgPct + '%' : 'N/A', avgPct != null ? this._gradeColor(avgPct) : '#94a3b8', '🎯')}
          ${this._statCard('Subjects', subjects.length, '#3b82f6', '📚')}
          ${this._statCard('Exams', typeCount('exam'), '#8b5cf6', '📝')}
          ${this._statCard('Tests/Quizzes', testCount, '#f59e0b', '❓')}
          ${this._statCard('Projects', typeCount('project'), '#10b981', '🎨')}
          ${this._statCard('Assignments', typeCount('assignment'), '#ef4444', '📋')}
        </div>

        ${subjects.length === 0 ? this._emptyState() : `
          <!-- Charts -->
          ${filteredRecords.length > 0 ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1.5rem;margin-bottom:1.5rem;">
            <div class="card">
              <h3 style="font-size:0.95rem;font-weight:600;margin:0 0 1rem;">Subject Performance</h3>
              <canvas id="subjectPerformanceChart" style="max-height:280px;"></canvas>
            </div>
            <div class="card">
              <h3 style="font-size:0.95rem;font-weight:600;margin:0 0 1rem;">Score Trend</h3>
              <canvas id="gradeTrendChart" style="max-height:280px;"></canvas>
            </div>
          </div>` : ''}

          <!-- Subject Overview Cards -->
          ${this._renderSubjectCards(subjects, filteredRecords)}

          <!-- Full Grade Table (hide synthetic enrollment rows) -->
          ${this._renderGradeTable(filteredRecords.filter(r => r.source !== 'enrollment'))}
        `}
      </div>`;
  },

  _statCard(label, value, color, icon) {
    return `
      <div class="card" style="padding:1.25rem;text-align:center;">
        <div style="font-size:1.5rem;margin-bottom:0.375rem;">${icon}</div>
        <div style="font-size:1.4rem;font-weight:700;color:${color};">${value}</div>
        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;">${label}</div>
      </div>`;
  },

  _gradeColor(pct) {
    if (pct == null) return '#94a3b8';
    if (pct >= 80) return 'var(--color-success, #22c55e)';
    if (pct >= 70) return '#3b82f6';
    if (pct >= 60) return '#f59e0b';
    if (pct >= 50) return '#f97316';
    return 'var(--color-danger, #ef4444)';
  },

  _badgeStyle(pct) {
    if (pct == null) return 'background:#e2e8f0;color:#475569;';
    if (pct >= 80) return 'background:#dcfce7;color:#166534;';
    if (pct >= 70) return 'background:#dbeafe;color:#1e40af;';
    if (pct >= 60) return 'background:#fef9c3;color:#854d0e;';
    if (pct >= 50) return 'background:#ffedd5;color:#9a3412;';
    return 'background:#fee2e2;color:#991b1b;';
  },

  _typeIcon(type) {
    const m = { exam: '📝', test: '❓', quiz: '❓', project: '🎨', assignment: '📋', homework: '📖' };
    return m[(type || '').toLowerCase()] || '📋';
  },

  _emptyState() {
    return `
      <div class="card" style="text-align:center;padding:3rem;">
        <div style="font-size:4rem;margin-bottom:1rem;">📊</div>
        <h3 style="margin:0 0 0.5rem;">No Grades Yet</h3>
        <p style="color:var(--text-secondary);margin:0;max-width:400px;margin:0 auto;">
          Your grades will appear here once teachers or admins publish results for your assessments, tests, exams, and projects.
        </p>
      </div>`;
  },

  _renderSubjectCards(subjects, filteredRecords) {
    // Show ALL enrolled subjects — graded or not
    const subjectsToShow = subjects.map(s => ({
      ...s,
      filtered: filteredRecords.filter(r => r.subject === s.name)
    }));

    if (subjectsToShow.length === 0) return '';

    return `
      <div class="card" style="margin-bottom:1.5rem;">
        <h3 style="font-size:0.95rem;font-weight:600;margin:0 0 1rem;">📚 Subject Overview</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
          ${subjectsToShow.map(subj => {
            // Use enrollment grade as primary if available, fall back to computed avg from records
            const graded = subj.filtered.filter(r => r.percentage != null && r.source !== 'enrollment');
            const computedAvg = graded.length > 0
              ? Math.round(graded.reduce((s, r) => s + r.percentage, 0) / graded.length)
              : null;
            const displayGrade  = subj.enrollGrade  != null ? Math.round(subj.enrollGrade)  : computedAvg;
            const displayLetter = subj.enrollLetter || (displayGrade != null ? this._calcLetterGrade(displayGrade) : null);
            const teacher = subj.teacherName || null;

            // Group non-synthetic records by type for breakdown tags
            const realRecords = subj.filtered.filter(r => r.source !== 'enrollment');
            const byType = ['exam', 'test', 'quiz', 'project', 'assignment', 'term']
              .map(t => ({ t, n: subj.filtered.filter(r => r.type === t).length }))
              .filter(x => x.n > 0);

            const isUngraded = displayGrade == null && realRecords.length === 0;

            return `
              <div style="border:1px solid ${isUngraded ? 'var(--border-primary)' : 'var(--border-primary)'};border-radius:0.75rem;padding:1rem;background:var(--bg-secondary);${isUngraded ? 'opacity:0.85;' : ''}">
                <!-- Subject Header -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.625rem;">
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      <span style="font-size:1.25rem;flex-shrink:0;">${subj.icon}</span>
                      <strong style="font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subj.name}</strong>
                    </div>
                    ${teacher ? `<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.25rem;margin-left:1.75rem;">👨‍🏫 ${teacher}</div>` : ''}
                    <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.15rem;margin-left:1.75rem;">
                      ${isUngraded ? '⏳ Awaiting grade' : realRecords.length > 0 ? `${realRecords.length} assessment${realRecords.length !== 1 ? 's' : ''}` : 'Enrollment grade'}
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;margin-left:0.75rem;">
                    ${isUngraded
                      ? `<span style="font-size:0.78rem;padding:0.3rem 0.7rem;border-radius:999px;background:var(--bg-tertiary);color:var(--text-secondary);font-weight:600;">Not Graded</span>`
                      : `<div style="font-size:1.75rem;font-weight:700;color:${this._gradeColor(displayGrade)};line-height:1;">${displayGrade}%</div>
                         ${displayLetter ? `<span style="font-size:0.75rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:999px;margin-top:0.25rem;display:inline-block;${this._badgeStyle(displayGrade)}">${displayLetter}</span>` : ''}`
                    }
                  </div>
                </div>

                <!-- Progress bar -->
                ${!isUngraded ? `
                <div style="height:5px;background:var(--bg-tertiary);border-radius:999px;overflow:hidden;margin-bottom:0.625rem;">
                  <div style="height:100%;width:${Math.min(displayGrade,100)}%;background:${this._gradeColor(displayGrade)};transition:width 0.4s;"></div>
                </div>` : `
                <div style="height:5px;background:var(--bg-tertiary);border-radius:999px;overflow:hidden;margin-bottom:0.625rem;">
                  <div style="height:100%;width:0%;background:var(--bg-tertiary);"></div>
                </div>`}

                <!-- Assessment breakdown tags -->
                ${byType.length > 0 ? `
                <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.5rem;">
                  ${byType.map(x => `
                  <span style="font-size:0.68rem;padding:0.15rem 0.45rem;background:var(--bg-tertiary);border-radius:999px;color:var(--text-secondary);">
                    ${this._typeIcon(x.t)} ${x.t.charAt(0).toUpperCase() + x.t.slice(1)}: ${x.n}
                  </span>`).join('')}
                </div>` : ''}

                <!-- Individual assessment scores (non-synthetic) -->
                ${realRecords.length > 0 ? `
                <div style="border-top:1px solid var(--border-primary);margin-top:0.5rem;padding-top:0.5rem;">
                  ${realRecords.slice(0, 4).map(r => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:0.2rem 0;font-size:0.78rem;">
                    <span style="color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">
                      ${this._typeIcon(r.type)} ${r.title}
                    </span>
                    <span style="font-weight:600;color:${this._gradeColor(r.percentage)};flex-shrink:0;">
                      ${r.score != null ? r.score + '/' + r.totalMarks : '—'}
                      ${r.percentage != null ? ' (' + r.percentage + '%)' : ''}
                    </span>
                  </div>`).join('')}
                  ${realRecords.length > 4 ? `<div style="font-size:0.72rem;color:var(--text-secondary);text-align:center;margin-top:0.25rem;">+${realRecords.length - 4} more in the table below</div>` : ''}
                </div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  },

  _renderGradeTable(records) {
    if (records.length === 0) return '';
    const sorted = [...records].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return `
      <div class="card">
        <h3 style="font-size:0.95rem;font-weight:600;margin:0 0 1rem;">📋 All Grades</h3>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-tertiary);">
                <th style="padding:0.75rem 1rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border-primary);">Subject</th>
                <th style="padding:0.75rem 1rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border-primary);">Assessment</th>
                <th style="padding:0.75rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Type</th>
                <th style="padding:0.75rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Term</th>
                <th style="padding:0.75rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Score</th>
                <th style="padding:0.75rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">%</th>
                <th style="padding:0.75rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Grade</th>
                <th style="padding:0.75rem 1rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border-primary);">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(r => `
              <tr style="border-bottom:1px solid var(--border-primary);">
                <td style="padding:0.75rem 1rem;"><strong>${r.subject}</strong></td>
                <td style="padding:0.75rem 1rem;">${r.title}</td>
                <td style="padding:0.75rem 0.5rem;text-align:center;">
                  <span style="font-size:0.72rem;padding:0.2rem 0.55rem;background:var(--bg-tertiary);border-radius:999px;white-space:nowrap;">
                    ${this._typeIcon(r.type)} ${r.type.charAt(0).toUpperCase() + r.type.slice(1)}
                  </span>
                </td>
                <td style="padding:0.75rem 0.5rem;text-align:center;color:var(--text-secondary);font-size:0.8rem;">${r.term || '—'}</td>
                <td style="padding:0.75rem 0.5rem;text-align:center;">
                  ${r.score != null ? `<strong>${r.score}/${r.totalMarks}</strong>` : '<span style="color:var(--text-secondary);">—</span>'}
                </td>
                <td style="padding:0.75rem 0.5rem;text-align:center;">
                  ${r.percentage != null
                    ? `<strong style="color:${this._gradeColor(r.percentage)};">${r.percentage}%</strong>`
                    : '<span style="color:var(--text-secondary);">—</span>'}
                </td>
                <td style="padding:0.75rem 0.5rem;text-align:center;">
                  ${r.letterGrade
                    ? `<span style="font-size:0.72rem;font-weight:700;padding:0.25rem 0.6rem;border-radius:999px;${this._badgeStyle(r.percentage)}">${r.letterGrade}</span>`
                    : '<span style="color:var(--text-secondary);">—</span>'}
                </td>
                <td style="padding:0.75rem 1rem;font-size:0.8rem;color:var(--text-secondary);max-width:200px;">${r.remarks || '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  initializeCharts() {
    if (!this.studentData || this.studentData.error) return;
    const { subjects, allRecords } = this.studentData;
    const filteredRecords = this._filterByTerm(allRecords);
    const gradedRecords = filteredRecords.filter(r => r.percentage != null);
    if (gradedRecords.length === 0) return;

    // Subject Performance Bar Chart
    const subjectCtx = document.getElementById('subjectPerformanceChart');
    if (subjectCtx && typeof Chart !== 'undefined') {
      const existing = Chart.getChart(subjectCtx);
      if (existing) existing.destroy();

      const subjectsWithGrades = subjects.map(s => {
        const recs = filteredRecords.filter(r => r.subject === s.name && r.percentage != null);
        return { name: s.name, avg: recs.length > 0 ? Math.round(recs.reduce((sum, r) => sum + r.percentage, 0) / recs.length) : null };
      }).filter(s => s.avg != null);

      const getLetterGrade = (g) => g >= 90 ? 'A+' : g >= 80 ? 'A' : g >= 70 ? 'B' : g >= 60 ? 'C' : g >= 50 ? 'D' : 'F';
      const truncLabel = (name) => name.length > 12 ? name.substring(0, 12) + '…' : name;
      const tooltipDefaults = {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(148,163,184,0.2)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
      };

      if (subjectsWithGrades.length > 0) {
        new Chart(subjectCtx, {
          type: 'bar',
          data: {
            labels: subjectsWithGrades.map(s => truncLabel(s.name)),
            datasets: [{
              label: 'Average %',
              data: subjectsWithGrades.map(s => s.avg),
              backgroundColor: subjectsWithGrades.map(s =>
                s.avg >= 80 ? 'rgba(34,197,94,0.8)'  :
                s.avg >= 70 ? 'rgba(59,130,246,0.8)' :
                s.avg >= 60 ? 'rgba(251,191,36,0.8)' :
                'rgba(239,68,68,0.8)'
              ),
              borderColor: subjectsWithGrades.map(s =>
                s.avg >= 80 ? 'rgb(22,163,74)'  :
                s.avg >= 70 ? 'rgb(37,99,235)'  :
                s.avg >= 60 ? 'rgb(217,119,6)'  :
                'rgb(220,38,38)'
              ),
              borderWidth: 2,
              borderRadius: 8,
              borderSkipped: false
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...tooltipDefaults,
                callbacks: {
                  title: (items) => subjectsWithGrades[items[0].dataIndex]?.name || items[0].label,
                  label: (ctx) => {
                    const g = ctx.parsed.y;
                    return [` Average: ${g}%`, ` Letter Grade: ${getLetterGrade(g)}`];
                  }
                }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxRotation: 35, font: { size: 11 } } },
              y: {
                beginAtZero: true, max: 100,
                grid: { color: 'rgba(148,163,184,0.15)' },
                ticks: { callback: v => v + '%', font: { size: 11 } }
              }
            }
          }
        });
      }
    }

    // Grade Trend Line Chart
    const trendCtx = document.getElementById('gradeTrendChart');
    if (trendCtx && typeof Chart !== 'undefined') {
      const existing = Chart.getChart(trendCtx);
      if (existing) existing.destroy();

      const getLetterGrade = (g) => g >= 90 ? 'A+' : g >= 80 ? 'A' : g >= 70 ? 'B' : g >= 60 ? 'C' : g >= 50 ? 'D' : 'F';
      const tooltipDefaults = {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(148,163,184,0.2)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
      };

      const sorted = [...gradedRecords]
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
        .slice(-15);

      if (sorted.length > 0) {
        new Chart(trendCtx, {
          type: 'line',
          data: {
            labels: sorted.map(r => {
              const t = r.title || '';
              return t.length > 12 ? t.substring(0, 12) + '…' : t;
            }),
            datasets: [{
              label: 'Score %',
              data: sorted.map(r => r.percentage),
              borderColor: 'rgb(99,102,241)',
              backgroundColor: 'rgba(99,102,241,0.08)',
              tension: 0.4, fill: true,
              pointRadius: 5, pointHoverRadius: 8,
              pointBackgroundColor: sorted.map(r =>
                r.percentage >= 80 ? 'rgb(22,163,74)' :
                r.percentage >= 70 ? 'rgb(37,99,235)'  :
                r.percentage >= 60 ? 'rgb(217,119,6)'  :
                'rgb(220,38,38)'
              ),
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...tooltipDefaults,
                callbacks: {
                  title: (items) => {
                    const r = sorted[items[0].dataIndex];
                    return r ? (r.title || '—') : items[0].label;
                  },
                  label: (ctx) => {
                    const r = sorted[ctx.dataIndex];
                    const g = ctx.parsed.y;
                    const lines = [` Score: ${g}%`, ` Grade: ${getLetterGrade(g)}`];
                    if (r?.subject) lines.push(` Subject: ${r.subject}`);
                    if (r?.date)    lines.push(` Date: ${new Date(r.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`);
                    return lines;
                  }
                }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxRotation: 35, font: { size: 10 } } },
              y: {
                beginAtZero: true, max: 100,
                grid: { color: 'rgba(148,163,184,0.15)' },
                ticks: { callback: v => v + '%', font: { size: 11 } }
              }
            }
          }
        });
      }
    }
  },

  downloadReportCard() {
    const container = document.getElementById('main-content');
    if (!container) return;
    showToast('Generating Report Card PDF...', 'info');

    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      showToast('PDF library unavailable.', 'error');
      return;
    }

    const { jsPDF } = jspdf;
    html2canvas(container, { scale: 1.5, useCORS: true })
      .then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (canvas.height * pdfW) / canvas.width;
        const pageH = pdf.internal.pageSize.getHeight();
        let pos = 0, rem = pdfH;
        while (rem > 0) {
          pdf.addImage(imgData, 'PNG', 0, pos, pdfW, pdfH);
          rem -= pageH; pos -= pageH;
          if (rem > 0) pdf.addPage();
        }
        const userId = authManager.getSession()?.userId || 'student';
        pdf.save(`report_card_${userId}_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('Report card downloaded!', 'success');
      })
      .catch(() => showToast('Failed to generate PDF.', 'error'));
  }
};

// Register module globally
if (typeof window !== 'undefined') {
  window.studentGradesModule = studentGradesModule;
  window.myGradesModule = studentGradesModule;
}
