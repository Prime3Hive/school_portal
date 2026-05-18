// ============================================
// STUDENT DASHBOARD MODULE - ENHANCED
// Comprehensive dashboard showing student details, subjects, grades, assessments, and fees
// ============================================

const studentDashboardModule = {
  currentSession: null,
  studentData: null,
  gradeChart: null, // FIX BUG #7: Store chart instance for proper cleanup

  async init(container) {
    this.currentSession = authManager.getSession();

    if (!container) {
      container = document.getElementById('main-content');
    }
    this._container = container;

    await dataManager.waitForReady();
    this.loadStudentData();
    container.innerHTML = this.render();
    setTimeout(() => this.initializeCharts(), 100);

    if (this._onDataChange) {
      window.removeEventListener('datamanager:change', this._onDataChange);
    }
    this._onDataChange = (e) => {
      const watched = ['students','grades','assessments','studentAssignments','studentSubjects',
                       'enhancedPayments','feeItems','subjectCatalog'];
      if (watched.includes(e.detail?.collection)) {
        this.loadStudentData();
        this._container.innerHTML = this.render();
        setTimeout(() => this.initializeCharts(), 100);
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  loadStudentData() {
    const schoolId   = this.currentSession?.userId;
    const supabaseId = this.currentSession?.supabaseId;

    // ── Identify student ─────────────────────────────────────────────────────
    const students = dataManager.getAll('students') || [];
    const student  = students.find(s => s.authId === supabaseId || s.auth_id === supabaseId)
      || students.find(s => s.id === supabaseId)
      || students.find(s => s.id === schoolId);

    if (!student) {
      console.error('[StudentDashboard] Student not found:', { schoolId, supabaseId });
      this.studentData = {
        student: null, subjects: [], overallAvg: null,
        upcomingAssignments: [], recentAssignments: [],
        feeInfo: { total: 0, paid: 0, balance: 0, progress: 0, recentPayments: [] },
        error: 'Student record not found. Please contact administrator.'
      };
      return;
    }
    const uid = student.id;

    // ── Helper ───────────────────────────────────────────────────────────────
    const _letter = (pct) => {
      if (pct == null) return null;
      if (pct >= 90) return 'A+'; if (pct >= 80) return 'A'; if (pct >= 75) return 'B+';
      if (pct >= 70) return 'B';  if (pct >= 65) return 'C+'; if (pct >= 60) return 'C';
      if (pct >= 50) return 'D';  return 'F';
    };

    // ── GRADES — same tables as student-grades.js ─────────────────────────
    const allGrades    = dataManager.getAll('grades') || [];
    const assessments  = dataManager.getAll('assessments') || [];
    const asmtMap      = {};
    assessments.forEach(a => { asmtMap[a.id] = a; });

    const studentGrades     = allGrades.filter(g => (g.student_id || g.studentId) === uid);
    const allRawAssignments = dataManager.getAll('studentAssignments') || [];
    const studentAssigns    = allRawAssignments.filter(a => (a.student_id || a.studentId) === uid);

    const iconMap = {};
    (dataManager.getAll('subjectCatalog') || []).forEach(s => {
      if (s.name) iconMap[s.name.toLowerCase()] = s.icon || '📚';
    });

    // Enrich grade records from grades table
    const enrichedGrades = studentGrades.map(g => {
      const asmt = asmtMap[g.assessment_id || g.assessmentId] || {};
      const score = g.score != null ? parseFloat(g.score) : null;
      const total = g.total_marks || asmt.total_marks || 100;
      const pct   = g.percentage != null
        ? Math.round(parseFloat(g.percentage))
        : (score != null ? Math.round((score / total) * 100) : null);
      return {
        subject: g.subject || asmt.subject || 'Unknown',
        title: asmt.name || 'Assessment',
        type: (asmt.type || 'exam').toLowerCase(),
        date: asmt.date || g.created_at,
        score, total, percentage: pct,
        letterGrade: g.grade || _letter(pct),
        source: 'grades'
      };
    });

    // Enrich from student_assignments
    const enrichedAssigns = studentAssigns.map(a => {
      const score = a.score != null ? parseFloat(a.score) : null;
      const total = a.total_marks || a.totalMarks || 100;
      const pct   = score != null ? Math.round((score / total) * 100) : null;
      return {
        id: a.id,
        subject: a.subject_name || a.subjectName || 'Unknown',
        title: a.title || 'Assignment',
        type: (a.type || 'assignment').toLowerCase(),
        status: a.status || (pct != null ? 'graded' : 'pending'),
        dueDate: a.due_date || a.dueDate || null,
        date: a.submitted_date || a.due_date || a.created_at || null,
        score, total, percentage: pct,
        letterGrade: a.grade || _letter(pct),
        remarks: a.remarks || '',
        source: 'assignments'
      };
    });

    // ── Build per-subject averages ────────────────────────────────────────
    const subjectMap = {};
    enrichedGrades.filter(r => r.percentage != null).forEach(r => {
      if (!subjectMap[r.subject]) subjectMap[r.subject] = { name: r.subject, records: [], icon: iconMap[r.subject.toLowerCase()] || '📚' };
      subjectMap[r.subject].records.push(r);
    });

    // Auto-enrollment: subjects from catalog assigned to the student's grade
    const subjectCatalog = dataManager.getAll('subjectCatalog') || [];
    const catalogEnrolled = subjectCatalog.filter(s => {
      const sGrades = (Array.isArray(s.grades) && s.grades.length > 0) ? s.grades : (s.grade ? [s.grade] : []);
      return student.grade && sGrades.includes(student.grade);
    });
    // Legacy manual enrollment as fallback supplement
    const allStudentSubjects = dataManager.getAll('studentSubjects') || [];
    const legacyEnrollment = allStudentSubjects.find(s => (s.student_id || s.studentId) === uid);
    const legacySubjects   = legacyEnrollment?.subjects || [];
    const catalogNames = new Set(catalogEnrolled.map(s => s.name?.toLowerCase()).filter(Boolean));

    // Merge catalog subjects first, then any legacy-only subjects
    const allEnrolled = [
      ...catalogEnrolled.map(s => ({ subjectName: s.name, icon: s.icon || '📚', teacherName: null })),
      ...legacySubjects.filter(s => {
        const n = (s.subjectName || s.name || '').toLowerCase();
        return n && !catalogNames.has(n);
      })
    ];
    allEnrolled.forEach(s => {
      const name = s.subjectName || s.name || '';
      if (!name) return;
      if (!subjectMap[name]) subjectMap[name] = { name, records: [], icon: iconMap[name.toLowerCase()] || s.icon || '📚' };
      subjectMap[name].teacherName = s.teacherName || subjectMap[name].teacherName || null;
      if (subjectMap[name].records.length === 0 && s.currentGrade != null) {
        subjectMap[name].enrollGrade  = parseFloat(s.currentGrade);
        subjectMap[name].enrollLetter = s.letterGrade || _letter(parseFloat(s.currentGrade));
      }
    });

    const subjects = Object.values(subjectMap).map(s => {
      const graded = s.records.filter(r => r.percentage != null);
      const avg    = graded.length > 0 ? Math.round(graded.reduce((t, r) => t + r.percentage, 0) / graded.length) : null;
      return {
        name: s.name,
        icon: s.icon,
        teacherName: s.teacherName || null,
        currentGrade: avg != null ? avg : (s.enrollGrade != null ? s.enrollGrade : null),
        letterGrade:  avg != null ? _letter(avg) : (s.enrollLetter || null),
        recordCount: graded.length,
      };
    });

    const graded = subjects.filter(s => s.currentGrade != null);
    const overallAvg = graded.length > 0
      ? Math.round(graded.reduce((t, s) => t + s.currentGrade, 0) / graded.length)
      : null;

    // ── Upcoming / recent assignments ────────────────────────────────────
    const upcomingAssignments = enrichedAssigns
      .filter(a => a.status === 'upcoming' || a.status === 'pending')
      .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
    const recentAssignments = enrichedAssigns
      .filter(a => a.status === 'graded')
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);

    // ── FEES — same source-of-truth as student-fees.js ───────────────────
    const allFeeItems     = dataManager.getAll('feeItems') || [];
    const studentFeeItems = allFeeItems.filter(i => (i.student_id || i.studentId) === uid);
    const allPayments     = dataManager.getAll('enhancedPayments') || [];
    const studentPayments = allPayments.filter(p => (p.student_id || p.studentId) === uid);

    let totalFees = 0, paidFees = 0;
    if (studentFeeItems.length > 0) {
      totalFees = studentFeeItems.reduce((t, i) => t + (parseFloat(i.amount) || 0), 0);
      paidFees  = studentFeeItems.reduce((t, i) => t + (parseFloat(i.amount_paid || i.amountPaid) || 0), 0);
    } else {
      studentPayments.filter(p => p.status === 'paid').forEach(p => { paidFees += parseFloat(p.amount) || 0; });
    }
    const balance  = Math.max(0, totalFees - paidFees);
    const progress = totalFees > 0 ? (paidFees / totalFees) * 100 : 0;
    const recentPayments = [...studentPayments]
      .sort((a, b) => new Date(b.payment_date || b.paymentDate || 0) - new Date(a.payment_date || a.paymentDate || 0))
      .slice(0, 3);

    this.studentData = {
      student, subjects, overallAvg,
      upcomingAssignments, recentAssignments,
      feeInfo: { total: totalFees, paid: paidFees, balance, progress, recentPayments },
    };
  },

  render() {
    const { student, subjects, overallAvg, upcomingAssignments, recentAssignments, feeInfo, error } = this.studentData;

    if (error || !student) {
      return `
        <div class="module-container">
          <div class="card" style="text-align:center;padding:3rem;">
            <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
            <h2 style="color:var(--color-danger);margin-bottom:0.5rem;">Error Loading Student Data</h2>
            <p style="color:var(--text-secondary);margin-bottom:1rem;">
              ${error || 'Unable to load student information. Please try logging in again.'}
            </p>
            <button class="btn btn-primary" onclick="window.location.reload()">Reload Page</button>
          </div>
        </div>`;
    }

    const avgDisplay  = overallAvg != null ? overallAvg + '%' : 'N/A';
    const pendingFees = feeInfo.balance;

    return `
      <div class="module-container">
        <!-- Header -->
        <div class="module-header">
          <div>
            <h1 class="module-title">Welcome, ${this.currentSession.fullName || 'Student'}!</h1>
            <p class="module-subtitle">Grade ${student.grade || 'N/A'}-${student.section || 'A'} • Roll No: ${student.rollNo || 'N/A'}</p>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="dash-stat-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;margin-bottom:1.5rem;">
          ${this.createStatCard('Average Grade', avgDisplay, overallAvg == null ? 'secondary' : overallAvg >= 70 ? 'success' : overallAvg >= 50 ? 'warning' : 'danger', '📊')}
          ${this.createStatCard('Pending Fees', '₦' + pendingFees.toLocaleString(), pendingFees > 0 ? 'warning' : 'success', '💰')}
          ${this.createStatCard('Assignments', upcomingAssignments.length + ' due', 'primary', '📝')}
        </div>

        <!-- Main Content Grid: 2/3 + 1/3 -->
        <div class="dash-main-grid" style="display:grid;grid-template-columns:1fr 340px;gap:1.5rem;align-items:start;">
          <!-- Left Column -->
          <div style="display:flex;flex-direction:column;gap:1.5rem;min-width:0;">
            ${this.renderSubjectsSection(subjects)}
            ${this.renderAssessmentsSection(upcomingAssignments, recentAssignments)}
          </div>

          <!-- Right Column -->
          <div style="display:flex;flex-direction:column;gap:1.5rem;min-width:0;">
            ${this.renderStudentProfile(student)}
            ${this.renderGradeChart(subjects)}
            ${this.renderFeeSummary(feeInfo)}
          </div>
        </div>
      </div>
    `;
  },

  createStatCard(label, value, type, icon) {
    // Map labels to navigation routes
    const routes = {
      'Average Grade': 'my-grades',
      'Pending Fees': 'my-fees'
    };

    const route = routes[label];
    const clickAttr = route ? `onclick="window.location.hash='${route}'"` : '';
    const cursorStyle = route ? 'cursor:pointer;' : '';
    const hoverAttr   = route
      ? `onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'"
         onmouseout="this.style.transform='';this.style.boxShadow=''"` : '';

    return `
      <div class="stat-card ${type}" ${clickAttr} ${hoverAttr}
           style="${cursorStyle}transition:transform 0.18s ease,box-shadow 0.18s ease;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;">
          <div style="flex:1;min-width:0;">
            <div class="stat-label" style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.35rem;">${label}</div>
            <div class="stat-value" style="font-size:1.6rem;font-weight:700;line-height:1.15;">${value}</div>
            ${route ? '<div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:0.4rem;">View details →</div>' : ''}
          </div>
          <div style="font-size:1.6rem;line-height:1;opacity:0.5;flex-shrink:0;margin-top:2px;">${icon}</div>
        </div>
      </div>
    `;
  },

  renderStudentProfile(student) {
    return `
      <div class="card">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
          Student Profile
        </h3>
        
        <div style="text-align: center; margin-bottom: var(--space-4);">
          <div style="width: 80px; height: 80px; border-radius: var(--radius-full); background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto; font-size: 2rem; color: white;">
            ${student.photo || '👤'}
          </div>
          <h4 style="margin-top: var(--space-3); font-weight: var(--font-weight-semibold);">${student.name}</h4>
          <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">${this.currentSession.userId}</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          ${this.renderProfileItem('📚', 'Grade', `${student.grade || 'N/A'}-${student.section || 'A'}`)}
          ${this.renderProfileItem('🎫', 'Roll Number', student.rollNo || 'N/A')}
          ${this.renderProfileItem('📧', 'Email', student.email || 'N/A')}
          ${this.renderProfileItem('📱', 'Phone', student.phone || 'N/A')}
          ${this.renderProfileItem('🩸', 'Blood Group', student.bloodGroup || 'N/A')}
        </div>
      </div>
    `;
  },

  renderProfileItem(icon, label, value) {
    return `
      <div style="display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); background: var(--bg-tertiary); border-radius: var(--radius-md);">
        <span style="font-size: 1.2rem;">${icon}</span>
        <div style="flex: 1;">
          <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">${label}</div>
          <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);">${value}</div>
        </div>
      </div>
    `;
  },

  renderSubjectsSection(subjects) {
    return `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold);">
            Enrolled Subjects (${subjects.length})
          </h3>
          <button class="btn btn-sm btn-primary" onclick="window.location.hash='my-grades'">View All Grades</button>
        </div>
        
        <div class="dash-subjects-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;">
          ${subjects.map(subject => this.renderSubjectCard(subject)).join('')}
        </div>
      </div>
    `;
  },

  renderSubjectCard(subject) {
    const grade      = subject.currentGrade;
    const letter     = subject.letterGrade;
    const gradeColor = grade != null ? this.getGradeColor(letter || String(grade)) : 'var(--text-secondary)';
    const gradeText  = grade != null ? grade + '%' : '—';
    return `
      <div style="padding:1rem;border:1px solid var(--border-primary);border-radius:var(--radius-md);background:var(--bg-secondary);transition:transform 0.18s ease,box-shadow 0.18s ease;cursor:pointer;"
           onclick="window.location.hash='my-grades'"
           onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,0.1)'"
           onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.95rem;font-weight:600;margin-bottom:0.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${subject.icon || '📚'} ${subject.name}
            </div>
            <div style="font-size:0.75rem;color:var(--text-secondary);">
              ${subject.teacherName ? '👨‍🏫 ' + subject.teacherName : subject.recordCount > 0 ? subject.recordCount + ' assessment(s)' : 'No grades yet'}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:1.25rem;font-weight:700;color:${gradeColor};line-height:1;">${gradeText}</div>
            ${letter ? `<div style="font-size:0.72rem;font-weight:600;color:${gradeColor};margin-top:2px;">${letter}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  renderAssessmentsSection(upcoming, recent) {
    const show = upcoming.slice(0, 5);
    const showRecent = (recent || []).slice(0, 5);
    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);margin:0;">Assessments &amp; Assignments</h3>
          <button class="btn btn-sm btn-ghost" onclick="window.location.hash='my-grades'" style="font-size:0.75rem;">View All →</button>
        </div>

        <!-- Tabs -->
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;border-bottom:1px solid var(--border-primary);">
          <button class="tab-btn active" onclick="studentDashboardModule.switchTab('upcoming')" id="tab-upcoming">
            Upcoming (${show.length})
          </button>
          <button class="tab-btn" onclick="studentDashboardModule.switchTab('recent')" id="tab-recent">
            Recent (${showRecent.length})
          </button>
        </div>

        <div id="assessments-upcoming" class="tab-content">
          ${show.length > 0 ? show.map(a => this.renderAssessmentItem(a, true)).join('') : '<p style="text-align:center;color:var(--text-secondary);padding:1.5rem 0;">No upcoming assessments 🎉</p>'}
        </div>

        <div id="assessments-recent" class="tab-content" style="display:none;">
          ${showRecent.length > 0 ? showRecent.map(a => this.renderAssessmentItem(a, false)).join('') : '<p style="text-align:center;color:var(--text-secondary);padding:1.5rem 0;">No graded assessments yet</p>'}
        </div>
      </div>
    `;
  },

  renderAssessmentItem(assignment, isUpcoming) {
    const typeIcons   = { exam: '📝', quiz: '❓', assignment: '📄', project: '🎯', test: '📋' };
    const statusColors = { upcoming: 'primary', pending: 'warning', graded: 'success', submitted: 'info' };
    const dueDateStr  = assignment.dueDate
      ? new Date(assignment.dueDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      : '—';
    const typeLabel   = (assignment.type || 'task').charAt(0).toUpperCase() + (assignment.type || 'task').slice(1);
    const letter      = assignment.letterGrade;
    const gradeColor  = letter ? this.getGradeColor(letter) : 'var(--text-secondary)';

    return `
      <div style="padding:0.75rem;border:1px solid var(--border-primary);border-radius:var(--radius-md);margin-bottom:0.625rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.2rem;">
              <span>${typeIcons[assignment.type] || '📋'}</span>
              <strong style="font-size:0.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${assignment.title}</strong>
            </div>
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.15rem;">
              ${assignment.subject || 'Unknown'} &nbsp;·&nbsp; ${typeLabel}
            </div>
            <div style="font-size:0.72rem;color:var(--text-tertiary);">📅 ${dueDateStr}</div>
            ${assignment.remarks ? `<div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:0.25rem;font-style:italic;">${assignment.remarks}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            ${isUpcoming
              ? createBadge((assignment.status || 'pending').charAt(0).toUpperCase() + (assignment.status || 'pending').slice(1), statusColors[assignment.status] || 'secondary')
              : `<div style="font-size:1.1rem;font-weight:700;color:${gradeColor};line-height:1;">${assignment.score != null ? assignment.score + '/' + assignment.total : '—'}</div>
                 ${letter ? `<div style="font-size:0.72rem;font-weight:600;color:${gradeColor};">${letter}</div>` : ''}`
            }
          </div>
        </div>
      </div>
    `;
  },

  renderGradeChart(subjects) {
    return `
      <div class="card">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
          Grade Performance
        </h3>
        <canvas id="gradeChart" style="max-height: 250px;"></canvas>
      </div>
    `;
  },

  renderFeeSummary(feeInfo) {
    const { total, paid, balance, progress, recentPayments } = feeInfo;
    const balColor  = balance > 0 ? 'var(--color-warning)' : 'var(--color-success)';
    const balBg     = balance > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)';
    const latest    = recentPayments && recentPayments[0];

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);margin:0;">School Fees</h3>
          <button class="btn btn-sm btn-ghost" onclick="window.location.hash='my-fees'" style="font-size:0.75rem;">Details →</button>
        </div>

        <!-- Progress Bar -->
        <div style="margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.375rem;">
            <span style="font-size:0.8rem;color:var(--text-secondary);">Payment Progress</span>
            <span style="font-size:0.8rem;font-weight:600;">${progress.toFixed(0)}%</span>
          </div>
          <div style="height:7px;background:var(--bg-tertiary);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(progress, 100)}%;background:var(--gradient-success);transition:width 0.4s ease;"></div>
          </div>
        </div>

        <!-- Fee Breakdown -->
        <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;padding:0.625rem 0.75rem;background:var(--bg-tertiary);border-radius:var(--radius-md);">
            <span style="font-size:0.82rem;color:var(--text-secondary);">Total</span>
            <strong style="font-size:0.82rem;">₦${total.toLocaleString()}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:0.625rem 0.75rem;background:rgba(34,197,94,0.08);border-radius:var(--radius-md);">
            <span style="font-size:0.82rem;color:var(--text-secondary);">Paid</span>
            <strong style="font-size:0.82rem;color:var(--color-success);">₦${paid.toLocaleString()}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:0.625rem 0.75rem;background:${balBg};border-radius:var(--radius-md);">
            <span style="font-size:0.82rem;color:var(--text-secondary);">Balance</span>
            <strong style="font-size:0.82rem;color:${balColor};">₦${balance.toLocaleString()}</strong>
          </div>
        </div>

        ${latest ? `
          <div style="padding:0.625rem 0.75rem;background:var(--bg-tertiary);border-radius:var(--radius-md);margin-bottom:1rem;">
            <div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:0.2rem;">Last Payment</div>
            <div style="font-size:0.82rem;font-weight:500;">${latest.fee_type || latest.feeType || 'Fee'}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);">₦${(parseFloat(latest.amount)||0).toLocaleString()} &nbsp;·&nbsp; ${latest.payment_date || latest.paymentDate ? new Date(latest.payment_date || latest.paymentDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</div>
          </div>
        ` : ''}

        <button class="btn btn-success" style="width:100%;" onclick="window.location.hash='my-fees'">
          ${balance > 0 ? '💳 Pay Now' : '✅ View Receipt'}
        </button>
      </div>
    `;
  },

  initializeCharts() {
    const { subjects } = this.studentData;

    if (subjects.length === 0) return;

    const ctx = document.getElementById('gradeChart');
    if (!ctx) return;
    
    // FIX BUG #7: Properly destroy existing chart instance
    if (this.gradeChart) {
      this.gradeChart.destroy();
      this.gradeChart = null;
    }

    const getLetterGrade = (g) => g >= 90 ? 'A+' : g >= 80 ? 'A' : g >= 70 ? 'B' : g >= 60 ? 'C' : g >= 50 ? 'D' : 'F';
    const truncLabel = (name) => name.length > 10 ? name.substring(0, 10) + '…' : name;

    const chartSubjects = subjects.filter(s => s.currentGrade != null);
    if (chartSubjects.length === 0) return;

    this.gradeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartSubjects.map(s => truncLabel(s.name)),
        datasets: [{
          label: 'Current Grade',
          data: chartSubjects.map(s => s.currentGrade),
          backgroundColor: chartSubjects.map(s => {
            if (s.currentGrade >= 90) return 'rgba(34, 197, 94, 0.75)';
            if (s.currentGrade >= 80) return 'rgba(59, 130, 246, 0.75)';
            if (s.currentGrade >= 70) return 'rgba(251, 191, 36, 0.75)';
            return 'rgba(239, 68, 68, 0.75)';
          }),
          borderColor: chartSubjects.map(s => {
            if (s.currentGrade >= 90) return 'rgb(22, 163, 74)';
            if (s.currentGrade >= 80) return 'rgb(37, 99, 235)';
            if (s.currentGrade >= 70) return 'rgb(217, 119, 6)';
            return 'rgb(220, 38, 38)';
          }),
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            titleColor: '#e2e8f0',
            bodyColor: '#94a3b8',
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              title: (items) => chartSubjects[items[0].dataIndex]?.name || items[0].label,
              label: (ctx) => {
                const g = ctx.parsed.y;
                return [` Score: ${g}%`, ` Grade: ${getLetterGrade(g)}`];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(148,163,184,0.15)' },
            ticks: { callback: (v) => v + '%', font: { size: 11 } }
          }
        }
      }
    });
  },

  switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    document.getElementById(`assessments-${tab}`).style.display = 'block';
  },

  getGradeColor(grade) {
    if (!grade) return 'var(--text-secondary)';
    const numGrade = typeof grade === 'string' ? parseInt(grade) : grade;
    if (numGrade >= 90 || grade.includes('A+') || grade === 'A') return 'var(--color-success)';
    if (numGrade >= 80 || grade.includes('B')) return 'var(--color-info)';
    if (numGrade >= 70 || grade.includes('C')) return 'var(--color-warning)';
    return 'var(--color-danger)';
  },

  getGradeBadgeType(grade) {
    if (!grade) return 'secondary';
    if (grade.includes('A')) return 'success';
    if (grade.includes('B')) return 'info';
    if (grade.includes('C')) return 'warning';
    return 'danger';
  }
};

// Add CSS for tabs
const style = document.createElement('style');
style.textContent = `
  .tab-btn {
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .tab-btn:hover {
    color: var(--text-primary);
  }
  
  .tab-btn.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .space-y-6 > * + * {
    margin-top: var(--space-6);
  }
`;
document.head.appendChild(style);

// Initialize module
if (typeof window !== 'undefined') {
  window.studentDashboardModule = studentDashboardModule;
}
