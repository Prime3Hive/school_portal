// ============================================
// ASSESSMENTS & EXAMS MODULE - ENHANCED
// ============================================

const assessmentsModule = {
  async init(container) {
    this.container = container;
    
    // FIX BUG #5: Remove old listener before creating new one
    if (this._onDataChange) {
      window.removeEventListener('datamanager:change', this._onDataChange);
    }
    
    await dataManager.waitForReady();
    this.render();
    
    // Create and store new listener
    this._onDataChange = (e) => {
      if (['assessments', 'grades'].includes(e.detail.collection)) {
        this.render();
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  render() {
    const assessments = dataManager.getAll('assessments');
    const upcomingExams = assessments.filter(a => new Date(a.date) >= new Date()).length;

    this.container.innerHTML = `
      <div class="animate-fadeIn">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h2 class="page-title" style="margin-bottom: var(--space-2);">Assessments & Exams</h2>
            <p class="page-description">Manage exams, grades, and performance tracking</p>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-secondary" onclick="assessmentsModule.showExamScheduleManager()">
              <span>📅</span> Exam Schedule
            </button>
            <button class="btn btn-primary" onclick="assessmentsModule.addAssessment()">
              <span>➕</span> Add Assessment
            </button>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-8">
          ${createStatCard('Total Exams', assessments.length, null, 'primary')}
          ${createStatCard('Upcoming', upcomingExams, null, 'warning')}
          ${createStatCard('Completed', assessments.filter(a => a.status === 'completed').length, null, 'success')}
          ${createStatCard('Avg Score', this.calculateAverageScore() + '%', null, 'info')}
        </div>

        <!-- Exam Schedule -->
        <div class="card mb-6">
          <div class="card-header">
            <h3 class="card-title">Exam Schedule</h3>
          </div>
          <div class="card-body">
            ${this.renderExamSchedule(assessments)}
          </div>
        </div>

        <!-- Performance Analytics -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Subject-wise Performance</h3>
            </div>
            <div class="card-body">
              ${this.renderSubjectPerformance()}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Grade Distribution</h3>
            </div>
            <div class="card-body">
              ${this.renderGradeDistribution()}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  calculateAverageScore() {
    // FIX BUG #11: Add division by zero checks
    const grades = dataManager.getAll('grades');
    if (!grades || grades.length === 0) return 0;

    const validGrades = grades.filter(g => g.totalMarks && g.totalMarks > 0);
    if (validGrades.length === 0) return 0;

    const total = validGrades.reduce((sum, g) => sum + ((g.score / g.totalMarks) * 100), 0);
    return Math.round(total / validGrades.length);
  },

  renderExamSchedule(assessments) {
    if (assessments.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <h3 class="empty-state-title">No Exams Scheduled</h3>
          <p class="empty-state-description">Schedule exams to track student performance</p>
        </div>
      `;
    }

    // Sort by date
    const sortedAssessments = [...assessments].sort((a, b) => new Date(a.date) - new Date(b.date));

    return `
      <div style="overflow-x: auto;">
        <table class="table">
          <thead>
            <tr>
              <th>Exam Name</th>
              <th>Subject</th>
              <th>Class</th>
              <th>Date</th>
              <th>Total Marks</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sortedAssessments.map(exam => `
              <tr>
                <td style="font-weight: var(--font-weight-semibold);">${exam.name}</td>
                <td>${exam.subject}</td>
                <td>Grade ${exam.grade}-${exam.section}</td>
                <td>${formatDate(exam.date)}</td>
                <td>${exam.totalMarks}</td>
                <td>${createBadge(exam.status, exam.status === 'completed' ? 'success' : 'warning')}</td>
                <td>
                  <div class="table-actions">
                    ${exam.status === 'completed'
        ? `<button class="table-action-btn" onclick="assessmentsModule.viewResults('${exam.id}')" title="View Results">📊</button>`
        : `<button class="table-action-btn" onclick="assessmentsModule.enterGrades('${exam.id}')" title="Enter Grades">✏️</button>`
      }
                    <button class="table-action-btn" onclick="assessmentsModule.viewClassPerformance('${exam.grade}', '${exam.section}')" title="Class Performance">👥</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderSubjectPerformance() {
    const grades = dataManager.getAll('grades');

    // FIX BUG #11: Add division by zero checks
    // Group by subject and calculate average
    const subjectPerf = {};
    grades.forEach(g => {
      // Skip grades with invalid totalMarks
      if (!g.totalMarks || g.totalMarks === 0) return;
      
      if (!subjectPerf[g.subject]) {
        subjectPerf[g.subject] = { total: 0, count: 0 };
      }
      subjectPerf[g.subject].total += (g.score / g.totalMarks) * 100;
      subjectPerf[g.subject].count++;
    });

    const subjects = Object.entries(subjectPerf)
      .filter(([name, data]) => data.count > 0)
      .map(([name, data]) => ({
        name,
        avg: Math.round(data.total / data.count),
        color: this.getColorForPercentage(data.total / data.count)
      }));

    if (subjects.length === 0) {
      return '<p style="color: var(--text-secondary); text-align: center;">No performance data available</p>';
    }

    return `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        ${subjects.map(subject => `
          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-2);">
              <span style="color: var(--text-primary); font-weight: var(--font-weight-medium);">${subject.name}</span>
              <span style="color: var(--text-secondary); font-size: var(--font-size-sm);">${subject.avg}%</span>
            </div>
            <div style="width: 100%; height: 10px; background: var(--bg-tertiary); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: ${subject.avg}%; height: 100%; background: ${subject.color}; border-radius: var(--radius-full); transition: width var(--transition-slow);"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  getColorForPercentage(percentage) {
    // FIX BUG #11: Handle invalid percentages
    if (!percentage || isNaN(percentage)) return 'var(--text-secondary)';
    if (percentage >= 90) return 'var(--color-success)';
    if (percentage >= 80) return 'var(--color-info)';
    if (percentage >= 70) return 'var(--color-warning)';
    return 'var(--color-danger)';
  },

  renderGradeDistribution() {
    const grades = dataManager.getAll('grades');

    const distribution = {
      'A': 0,
      'B': 0,
      'C': 0,
      'D': 0,
      'F': 0
    };

    grades.forEach(g => {
      if (distribution.hasOwnProperty(g.grade)) {
        distribution[g.grade]++;
      }
    });

    const total = grades.length;
    if (total === 0) {
      return '<p style="color: var(--text-secondary); text-align: center;">No grade data available</p>';
    }

    const gradeData = [
      { grade: 'A (90-100)', count: distribution.A, color: 'var(--color-success)' },
      { grade: 'B (80-89)', count: distribution.B, color: 'var(--color-info)' },
      { grade: 'C (70-79)', count: distribution.C, color: 'var(--color-warning)' },
      { grade: 'D (60-69)', count: distribution.D, color: 'var(--color-danger)' },
      { grade: 'F (<60)', count: distribution.F, color: 'var(--color-danger)' }
    ];

    return `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        ${gradeData.filter(item => item.count > 0).map(item => {
      const percentage = ((item.count / total) * 100).toFixed(1);
      return `
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-2);">
                <span style="color: var(--text-primary); font-weight: var(--font-weight-medium);">${item.grade}</span>
                <span style="color: var(--text-secondary); font-size: var(--font-size-sm);">${item.count} students (${percentage}%)</span>
              </div>
              <div style="width: 100%; height: 10px; background: var(--bg-tertiary); border-radius: var(--radius-full); overflow: hidden;">
                <div style="width: ${percentage}%; height: 100%; background: ${item.color}; border-radius: var(--radius-full); transition: width var(--transition-slow);"></div>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  },

  // ============================================
  // ADD ASSESSMENT
  // ============================================

  addAssessment() {
    // Derive unique classes from students (the `classes` table may be empty)
    const students = dataManager.getAll('students') || [];
    const classMap = new Map();
    students.forEach(s => {
      if (s.grade && s.section) {
        const key = `${s.grade}|${s.section}`;
        if (!classMap.has(key)) classMap.set(key, { grade: s.grade, section: s.section });
      }
    });
    // Also include anything that IS in the classes table
    const classesTbl = dataManager.getAll('classes') || [];
    classesTbl.forEach(c => {
      if (c.grade && c.section) {
        const key = `${c.grade}|${c.section}`;
        if (!classMap.has(key)) classMap.set(key, { grade: c.grade, section: c.section });
      }
    });
    const uniqueClasses = [...classMap.values()].sort((a, b) =>
      String(a.grade).localeCompare(String(b.grade)) || String(a.section).localeCompare(String(b.section))
    );

    const subjects = [...new Set((dataManager.getAll('subjectCatalog') || []).map(s => s.name).filter(Boolean))];

    const classOptions = uniqueClasses.length > 0
      ? uniqueClasses.map(cls =>
          `<option value="${cls.grade}|${cls.section}">${cls.grade} — Section ${cls.section}</option>`
        ).join('')
      : '<option value="" disabled>No classes found — add students first</option>';

    const subjectOptions = subjects.length > 0
      ? subjects.map(name => `<option value="${name}">${name}</option>`).join('')
      : '<option value="" disabled>No subjects found in catalog</option>';

    const content = `
      <form id="add-assessment-form" onsubmit="assessmentsModule.handleAddAssessment(event)">
        <div class="form-group">
          <label class="form-label">Assessment Name *</label>
          <input type="text" class="form-input" name="name" required placeholder="e.g., Mid-Term Exam, Unit Test 1">
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Subject *</label>
            <select class="form-select" name="subject" required>
              <option value="">Select Subject</option>
              ${subjectOptions}
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Class *</label>
            <select class="form-select" name="class" required id="class-select" onchange="assessmentsModule.updateClassInfo(this.value)">
              <option value="">Select Class</option>
              ${classOptions}
            </select>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Date *</label>
            <input type="date" class="form-input" name="date" required>
          </div>
          
          <div class="form-group">
            <label class="form-label">Total Marks *</label>
            <input type="number" class="form-input" name="totalMarks" required min="1" max="1000" placeholder="e.g., 100">
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-input" name="description" rows="3" placeholder="Optional notes about this assessment"></textarea>
        </div>
        
        <input type="hidden" name="grade" id="hidden-grade">
        <input type="hidden" name="section" id="hidden-section">
        
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">📝 Create Assessment</button>
        </div>
      </form>
    `;

    createModal('Add Assessment', content);
  },

  updateClassInfo(classValue) {
    if (!classValue) return;
    const pipeIdx = classValue.indexOf('|');
    const grade   = pipeIdx !== -1 ? classValue.slice(0, pipeIdx) : classValue;
    const section = pipeIdx !== -1 ? classValue.slice(pipeIdx + 1) : '';
    document.getElementById('hidden-grade').value   = grade;
    document.getElementById('hidden-section').value = section;
  },

  async handleAddAssessment(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const assessmentData = {
      name: formData.get('name'),
      subject: formData.get('subject'),
      grade: formData.get('grade'),
      section: formData.get('section'),
      date: formData.get('date'),
      totalMarks: parseInt(formData.get('totalMarks')),
      description: formData.get('description') || '',
      status: 'scheduled'
    };

    const result = await dataManager.create('assessments', assessmentData);
    if (!result) return;
    showToast('Assessment created successfully!', 'success');

    document.querySelector('.modal-backdrop')?.remove();
    this.render();
  },

  // ============================================
  // ENTER GRADES
  // ============================================

  enterGrades(examId) {
    const exam = dataManager.getById('assessments', examId);
    if (!exam) return;

    // Get students for this class
    const students = dataManager.getAll('students').filter(s =>
      s.grade === exam.grade && s.section === exam.section && s.status === 'active'
    );

    const content = `
      <div style="max-height: 70vh; overflow-y: auto;">
        <div style="margin-bottom: var(--space-4); padding: var(--space-4); background: var(--bg-secondary); border-radius: var(--radius-md);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2);">
            ${exam.name}
          </h3>
          <p style="color: var(--text-secondary);">
            ${exam.subject} • Grade ${exam.grade}-${exam.section} • Total Marks: ${exam.totalMarks}
          </p>
        </div>
        
        <form id="enter-grades-form" onsubmit="assessmentsModule.handleEnterGrades(event, '${examId}')">
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Student Name</th>
                  <th>Score (out of ${exam.totalMarks})</th>
                  <th>Grade</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${students.map(student => {
      // Check if grade already exists
      const existingGrade = dataManager.getAll('grades').find(g =>
        g.studentId === student.id && g.subject === exam.subject && g.term === this.getCurrentTerm()
      );

      return `
                    <tr>
                      <td>${student.rollNo}</td>
                      <td style="font-weight: var(--font-weight-semibold);">${student.name}</td>
                      <td>
                        <input type="number" class="form-input" name="score_${student.id}" 
                          min="0" max="${exam.totalMarks}" step="0.5" 
                          value="${existingGrade ? existingGrade.score : ''}"
                          onchange="assessmentsModule.calculateGrade(this, ${exam.totalMarks}, '${student.id}')"
                          style="width: 100px;">
                      </td>
                      <td>
                        <span id="grade_${student.id}" class="badge ${existingGrade ? this.getBadgeClass(existingGrade.grade) : ''}">
                          ${existingGrade ? existingGrade.grade : '-'}
                        </span>
                      </td>
                      <td>
                        <input type="text" class="form-input" name="remarks_${student.id}" 
                          value="${existingGrade ? existingGrade.remarks : ''}"
                          placeholder="Optional" style="width: 150px;">
                      </td>
                    </tr>
                  `;
    }).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="flex gap-3 mt-6">
            <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
            <button type="submit" class="btn btn-primary flex-1">💾 Save Grades</button>
          </div>
        </form>
      </div>
    `;

    createModal('Enter Grades', content, 'large');
  },

  getBadgeClass(grade) {
    if (grade === 'A') return 'badge-success';
    if (grade === 'B') return 'badge-info';
    if (grade === 'C') return 'badge-warning';
    return 'badge-danger';
  },

  calculateGrade(input, totalMarks, studentId) {
    const score = parseFloat(input.value);
    if (isNaN(score)) return;

    const percentage = (score / totalMarks) * 100;
    const gradeInfo = schoolConfig.calculateGrade(percentage);

    const gradeSpan = document.getElementById(`grade_${studentId}`);
    gradeSpan.textContent = gradeInfo.grade;
    gradeSpan.className = `badge ${this.getBadgeClass(gradeInfo.grade)}`;
  },

  async handleEnterGrades(event, examId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const exam = dataManager.getById('assessments', examId);

    const students = dataManager.getAll('students').filter(s =>
      s.grade === exam.grade && s.section === exam.section && s.status === 'active'
    );

    let savedCount = 0;

    for (const student of students) {
      const score = formData.get(`score_${student.id}`);
      if (!score) continue;

      const scoreNum = parseFloat(score);
      const percentage = (scoreNum / exam.totalMarks) * 100;
      const gradeInfo = schoolConfig.calculateGrade(percentage);

      const gradeData = {
        studentId: student.id,
        subject: exam.subject,
        term: this.getCurrentTerm(),
        score: scoreNum,
        totalMarks: exam.totalMarks,
        grade: gradeInfo.grade,
        remark: gradeInfo.remark,
        remarks: formData.get(`remarks_${student.id}`) || '',
        assessmentId: examId
      };

      // Check if grade exists, update or create
      const existing = dataManager.getAll('grades').find(g =>
        g.studentId === student.id && g.subject === exam.subject && g.term === this.getCurrentTerm()
      );

      if (existing) {
        await dataManager.update('grades', existing.id, gradeData);
      } else {
        await dataManager.create('grades', gradeData);
      }

      savedCount++;
    }

    // Update exam status to completed
    await dataManager.update('assessments', examId, { status: 'completed' });

    showToast(`Grades saved for ${savedCount} students!`, 'success');
    document.querySelector('.modal-backdrop')?.remove();
    this.render();
  },

  getCurrentTerm() {
    return schoolConfig.getCurrentTerm().name + ' ' + schoolConfig.getCurrentAcademicYear();
  },

  // ============================================
  // EXAM SCHEDULE MANAGER
  // ============================================

  showExamScheduleManager() {
    const assessments = dataManager.getAll('assessments');
    const upcomingExams = assessments.filter(a => new Date(a.date) >= new Date()).sort((a, b) => new Date(a.date) - new Date(b.date));

    const content = `
      <div style="max-height: 70vh; overflow-y: auto;">
        <div class="flex justify-between items-center mb-4">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold);">Upcoming Exams</h3>
          <button class="btn btn-primary btn-sm" onclick="closeModal(this); setTimeout(() => assessmentsModule.addAssessment(), 150);">
            ➕ Add Exam
          </button>
        </div>
        
        ${upcomingExams.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">📅</div>
            <h3 class="empty-state-title">No Upcoming Exams</h3>
            <p class="empty-state-description">Schedule exams for the term</p>
          </div>
        ` : `
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Exam</th>
                  <th>Subject</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${upcomingExams.map(exam => `
                  <tr>
                    <td style="font-weight: var(--font-weight-semibold);">${formatDate(exam.date)}</td>
                    <td>${exam.name}</td>
                    <td>${exam.subject}</td>
                    <td>Grade ${exam.grade}-${exam.section}</td>
                    <td>${createBadge(exam.status, exam.status === 'completed' ? 'success' : 'warning')}</td>
                    <td>
                      <div class="table-actions">
                        <button class="table-action-btn" onclick="assessmentsModule.deleteExam('${exam.id}')" title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    createModal('Exam Schedule Manager', content, 'large');
  },

  async deleteExam(examId) {
    if (confirm('Are you sure you want to delete this exam? This action cannot be undone.')) {
      await dataManager.delete('assessments', examId);
      showToast('Exam deleted successfully', 'success');

      // Close and refresh
      document.querySelector('.modal-backdrop').remove();
      this.render();
    }
  },

  // ============================================
  // CLASS PERFORMANCE
  // ============================================

  viewClassPerformance(grade, section) {
    const students = dataManager.getAll('students').filter(s =>
      s.grade === grade && s.section === section && s.status === 'active'
    );

    const content = `
      <div style="max-height: 70vh; overflow-y: auto;">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
          Grade ${grade}-${section} Performance
        </h3>
        
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Student Name</th>
                <th>Average</th>
                <th>Grade</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${students.map(student => {
      const grades = dataManager.getAll('grades').filter(g => g.studentId === student.id);
      const average = grades.length > 0
        ? (grades.reduce((sum, g) => sum + ((g.score / g.totalMarks) * 100), 0) / grades.length).toFixed(1)
        : 'N/A';
      const avgGrade = average !== 'N/A' ? this.getGradeFromPercentage(parseFloat(average)) : '-';

      return `
                  <tr>
                    <td>${student.rollNo}</td>
                    <td style="font-weight: var(--font-weight-semibold);">${student.name}</td>
                    <td>${average}${average !== 'N/A' ? '%' : ''}</td>
                    <td>${avgGrade !== '-' ? createBadge(avgGrade, this.getBadgeClass(avgGrade)) : '-'}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="assessmentsModule.viewStudentGrades('${student.id}')">
                        View Details
                      </button>
                    </td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    createModal(`Class Performance - Grade ${grade}-${section}`, content, 'large');
  },

  getGradeFromPercentage(percentage) {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  },

  viewStudentGrades(studentId) {
    const student = dataManager.getById('students', studentId);
    const grades = dataManager.getAll('grades').filter(g => g.studentId === studentId);

    // Group by term
    const gradesByTerm = grades.reduce((acc, grade) => {
      if (!acc[grade.term]) acc[grade.term] = [];
      acc[grade.term].push(grade);
      return acc;
    }, {});

    const content = `
      <div style="max-height: 70vh; overflow-y: auto;">
        <div style="text-align: center; margin-bottom: var(--space-6);">
          <div style="width: 80px; height: 80px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 50px; margin: 0 auto var(--space-3); overflow: hidden;">
            ${student.photo && student.photo.startsWith('data:')
        ? `<img src="${student.photo}" style="width: 100%; height: 100%; object-fit: cover;" alt="${student.name}" />`
        : `<span>${student.photo || '👤'}</span>`
      }
          </div>
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">${student.name}</h3>
          <p style="color: var(--text-secondary);">Roll No: ${student.rollNo} • Grade ${student.grade}-${student.section}</p>
        </div>
        
        ${Object.keys(gradesByTerm).length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <h3 class="empty-state-title">No Grades Yet</h3>
            <p class="empty-state-description">Grades will appear here once assessments are completed</p>
          </div>
        ` : `
          ${Object.entries(gradesByTerm).map(([term, termGrades]) => `
            <div class="card" style="margin-bottom: var(--space-4);">
              <div class="card-header">
                <h4 class="card-title">${term}</h4>
              </div>
              <div class="card-body">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Score</th>
                      <th>Total</th>
                      <th>Percentage</th>
                      <th>Grade</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${termGrades.map(grade => {
        const percentage = ((grade.score / grade.totalMarks) * 100).toFixed(1);
        return `
                        <tr>
                          <td style="font-weight: var(--font-weight-semibold);">${grade.subject}</td>
                          <td>${grade.score}</td>
                          <td>${grade.totalMarks}</td>
                          <td>${percentage}%</td>
                          <td>${createBadge(grade.grade, this.getBadgeClass(grade.grade))}</td>
                          <td style="color: var(--text-secondary);">${grade.remarks || '-'}</td>
                        </tr>
                      `;
      }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `).join('')}
        `}
      </div>
    `;

    createModal(`Student Grades - ${student.name}`, content, 'large');
  },

  viewResults(examId) {
    const exam = dataManager.getById('assessments', examId);
    if (!exam) return;

    this.viewClassPerformance(exam.grade, exam.section);
  }
};

window.assessmentsModule = assessmentsModule;
