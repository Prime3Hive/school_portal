const guardianPortalModule = {
  currentTab: 'overview',
  currentChild: null,
  children: [],

  async init(container) {
    this.container = container;
    await dataManager.waitForReady();
    await this.loadChildren();
    this.render();
    this._onDataChange = (e) => {
      if (['students', 'payments', 'grades'].includes(e.detail.collection)) {
        this.loadChildren().then(() => this.render());
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  async loadChildren() {
    const session = authManager.getSession();
    if (!session) return;

    const guardianEmail = session.email;
    const allStudents = dataManager.getAll('students') || [];
    
    this.children = allStudents.filter(student => 
      student.parentEmail === guardianEmail || 
      student.parent_email === guardianEmail ||
      student.guardianEmail === guardianEmail ||
      student.guardian_email === guardianEmail
    );

    if (this.children.length > 0 && !this.currentChild) {
      this.currentChild = this.children[0];
    }
  },

  render() {
    if (this.children.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👨‍👩‍👧‍👦</div>
          <h3 class="empty-state-title">No Children Found</h3>
          <p class="empty-state-description">
            No student records are linked to your account. Please contact the school administration.
          </p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="animate-fadeIn">
        <!-- Header -->
        <div style="margin-bottom: var(--space-8);">
          <h2 class="page-title" style="margin-bottom: var(--space-2);">👨‍👩‍👧‍👦 Guardian Portal</h2>
          <p class="page-description">Monitor your child's academic progress and activities</p>
        </div>

        <!-- Child Selector -->
        ${this.children.length > 1 ? `
          <div style="margin-bottom: var(--space-6);">
            <label style="display: block; font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2);">
              Select Child:
            </label>
            <select 
              onchange="guardianPortalModule.selectChild(this.value)" 
              class="form-input"
              style="max-width: 400px;"
            >
              ${this.children.map(child => `
                <option value="${child.id}" ${child.id === this.currentChild?.id ? 'selected' : ''}>
                  ${child.name} - ${child.grade || 'N/A'} ${child.section || ''}
                </option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        <!-- Tabs -->
        <div style="border-bottom: 1px solid var(--border-primary); margin-bottom: var(--space-6);">
          <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
            <button class="profile-tab ${this.currentTab === 'overview' ? 'active' : ''}" 
                    onclick="guardianPortalModule.switchTab('overview')">
              📊 Overview
            </button>
            <button class="profile-tab ${this.currentTab === 'grades' ? 'active' : ''}" 
                    onclick="guardianPortalModule.switchTab('grades')">
              📝 Grades
            </button>
            <button class="profile-tab ${this.currentTab === 'schedule' ? 'active' : ''}" 
                    onclick="guardianPortalModule.switchTab('schedule')">
              🗓️ Schedule
            </button>
            <button class="profile-tab ${this.currentTab === 'fees' ? 'active' : ''}" 
                    onclick="guardianPortalModule.switchTab('fees')">
              💰 Fees
            </button>
            <button class="profile-tab ${this.currentTab === 'assignments' ? 'active' : ''}" 
                    onclick="guardianPortalModule.switchTab('assignments')">
              ✅ Assignments
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="guardian-tab-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
  },

  selectChild(childId) {
    this.currentChild = this.children.find(c => c.id === childId);
    this.render();
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  renderTabContent() {
    if (!this.currentChild) return '';

    switch (this.currentTab) {
      case 'overview':
        return this.renderOverview();
      case 'grades':
        return this.renderGrades();
      case 'schedule':
        return this.renderSchedule();
      case 'fees':
        return this.renderFees();
      case 'assignments':
        return this.renderAssignments();
      default:
        return '';
    }
  },

  renderOverview() {
    const student = this.currentChild;
    const grades = (dataManager.getAll('grades') || []).filter(g => 
      (g.studentId || g.student_id) === student.id
    );
    const payments = (dataManager.getAll('payments') || []).filter(p => 
      (p.studentId || p.student_id) === student.id
    );

    const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);

    const avgGrade = grades.length > 0 
      ? (grades.reduce((sum, g) => sum + (g.score || 0), 0) / grades.length).toFixed(1)
      : 'N/A';

    return `
      <div class="grid grid-2" style="margin-bottom: var(--space-6);">
        <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <div class="stat-icon">👤</div>
          <div class="stat-content">
            <div class="stat-label">Student Name</div>
            <div class="stat-value">${student.name}</div>
          </div>
        </div>

        <div class="stat-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
          <div class="stat-icon">🎓</div>
          <div class="stat-content">
            <div class="stat-label">Class</div>
            <div class="stat-value">${student.grade || 'N/A'} ${student.section || ''}</div>
          </div>
        </div>

        <div class="stat-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <div class="stat-label">Average Grade</div>
            <div class="stat-value">${avgGrade}${avgGrade !== 'N/A' ? '%' : ''}</div>
          </div>
        </div>

      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
            📝 Recent Grades
          </h3>
          ${grades.slice(0, 5).length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              ${grades.slice(0, 5).map(g => `
                <div style="display: flex; justify-content: space-between; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <span>${g.subject || g.assessment_name || 'Assessment'}</span>
                  <span style="font-weight: var(--font-weight-semibold); color: ${g.score >= 70 ? 'var(--color-success)' : g.score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'};">
                    ${g.score || 0}%
                  </span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color: var(--text-secondary);">No grades recorded yet</p>'}
        </div>

        <div class="card">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
            💰 Fee Status
          </h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-4);">
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-2);">
                <span style="color: var(--text-secondary);">Total Paid</span>
                <span style="font-weight: var(--font-weight-semibold); color: var(--color-success);">
                  ₦${totalPaid.toLocaleString()}
                </span>
              </div>
              <div style="display: flex; justify-content: space-between);">
                <span style="color: var(--text-secondary);">Outstanding</span>
                <span style="font-weight: var(--font-weight-semibold); color: var(--color-danger);">
                  ₦${totalPending.toLocaleString()}
                </span>
              </div>
            </div>
            <button onclick="guardianPortalModule.switchTab('fees')" class="btn btn-primary" style="width: 100%;">
              View Details
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderGrades() {
    const student = this.currentChild;
    const grades = (dataManager.getAll('grades') || []).filter(g => 
      (g.studentId || g.student_id) === student.id
    );

    if (grades.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <h3 class="empty-state-title">No Grades Yet</h3>
          <p class="empty-state-description">Grades will appear here once assessments are graded.</p>
        </div>
      `;
    }

    return `
      <div class="card">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
          📊 Academic Performance
        </h3>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Assessment</th>
                <th>Score</th>
                <th>Grade</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${grades.map(g => {
                const score = g.score || 0;
                const grade = score >= 70 ? 'A' : score >= 60 ? 'B' : score >= 50 ? 'C' : score >= 40 ? 'D' : 'F';
                const gradeColor = score >= 70 ? 'var(--color-success)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
                
                return `
                  <tr>
                    <td>${g.subject || 'N/A'}</td>
                    <td>${g.assessment_name || g.assessmentType || 'Assessment'}</td>
                    <td style="font-weight: var(--font-weight-semibold);">${score}%</td>
                    <td><span style="padding: 0.25rem 0.75rem; background: ${gradeColor}; color: white; border-radius: var(--radius-full); font-weight: var(--font-weight-semibold);">${grade}</span></td>
                    <td>${g.date || g.created_at ? new Date(g.date || g.created_at).toLocaleDateString() : 'N/A'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderSchedule() {
    const student = this.currentChild;
    const schedules = (dataManager.getAll('studentSchedules') || []).filter(s => 
      (s.studentId || s.student_id) === student.id || s.grade === student.grade
    );

    if (schedules.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🗓️</div>
          <h3 class="empty-state-title">No Schedule Available</h3>
          <p class="empty-state-description">Class schedule will be displayed here once available.</p>
        </div>
      `;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const scheduleByDay = {};
    days.forEach(day => {
      scheduleByDay[day] = schedules.filter(s => s.day === day).sort((a, b) => {
        const timeA = a.startTime || a.start_time || '';
        const timeB = b.startTime || b.start_time || '';
        return timeA.localeCompare(timeB);
      });
    });

    return `
      <div class="card">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
          🗓️ Weekly Schedule
        </h3>
        <div style="display: flex; flex-direction: column; gap: var(--space-6);">
          ${days.map(day => `
            <div>
              <h4 style="font-weight: var(--font-weight-semibold); color: var(--color-primary); margin-bottom: var(--space-3);">
                ${day}
              </h4>
              ${scheduleByDay[day].length > 0 ? `
                <div style="display: flex; flex-direction: column; gap: var(--space-2);">
                  ${scheduleByDay[day].map(s => `
                    <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
                      <div style="min-width: 100px; font-weight: var(--font-weight-semibold); color: var(--text-secondary);">
                        ${s.startTime || s.start_time} - ${s.endTime || s.end_time}
                      </div>
                      <div style="flex: 1;">
                        <div style="font-weight: var(--font-weight-semibold);">${s.subject}</div>
                        <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">${s.teacher || 'Teacher TBA'}</div>
                      </div>
                      <div style="padding: 0.25rem 0.75rem; background: var(--bg-primary); border-radius: var(--radius-md); font-size: var(--font-size-xs);">
                        ${s.room || 'Room TBA'}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : '<p style="color: var(--text-secondary); font-size: var(--font-size-sm);">No classes scheduled</p>'}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  renderFees() {
    const student = this.currentChild;
    const payments = (dataManager.getAll('payments') || []).filter(p => 
      (p.studentId || p.student_id) === student.id
    ).sort((a, b) => new Date(b.paymentDate || b.payment_date) - new Date(a.paymentDate || a.payment_date));

    const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);

    return `
      <div class="grid grid-2" style="margin-bottom: var(--space-6);">
        <div class="stat-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-label">Total Paid</div>
            <div class="stat-value">₦${totalPaid.toLocaleString()}</div>
          </div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
          <div class="stat-icon">⏳</div>
          <div class="stat-content">
            <div class="stat-label">Outstanding</div>
            <div class="stat-value">₦${totalPending.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
          💰 Payment History
        </h3>
        ${payments.length > 0 ? `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Fee Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map(p => {
                  const statusColors = {
                    paid: 'var(--color-success)',
                    pending: 'var(--color-warning)',
                    overdue: 'var(--color-danger)'
                  };
                  
                  return `
                    <tr>
                      <td>${new Date(p.paymentDate || p.payment_date || p.created_at).toLocaleDateString()}</td>
                      <td>${p.feeType || p.fee_type || 'Fee Payment'}</td>
                      <td style="font-weight: var(--font-weight-semibold);">₦${(p.amount || 0).toLocaleString()}</td>
                      <td>
                        <span style="padding: 0.25rem 0.75rem; background: ${statusColors[p.status]}; color: white; border-radius: var(--radius-full); font-weight: var(--font-weight-semibold); text-transform: capitalize;">
                          ${p.status}
                        </span>
                      </td>
                      <td>
                        ${p.status === 'paid' ? `<button onclick="alert('Receipt: ${p.receiptNo || p.receipt_no || 'N/A'}')" class="btn btn-sm btn-secondary">View</button>` : '-'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p style="color: var(--text-secondary);">No payment records found</p>'}
      </div>
    `;
  },

  renderAssignments() {
    const student = this.currentChild;
    const assignments = (dataManager.getAll('studentAssignments') || []).filter(a => 
      (a.studentId || a.student_id) === student.id
    ).sort((a, b) => new Date(b.dueDate || b.due_date) - new Date(a.dueDate || a.due_date));

    const pendingCount = assignments.filter(a => a.status === 'pending').length;
    const submittedCount = assignments.filter(a => a.status === 'submitted').length;
    const gradedCount = assignments.filter(a => a.status === 'graded').length;

    return `
      <div class="grid grid-3" style="margin-bottom: var(--space-6);">
        <div class="stat-card" style="background: linear-gradient(135deg, #ffa726 0%, #ff9800 100%);">
          <div class="stat-icon">⏳</div>
          <div class="stat-content">
            <div class="stat-label">Pending</div>
            <div class="stat-value">${pendingCount}</div>
          </div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
          <div class="stat-icon">📤</div>
          <div class="stat-content">
            <div class="stat-label">Submitted</div>
            <div class="stat-value">${submittedCount}</div>
          </div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-label">Graded</div>
            <div class="stat-value">${gradedCount}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
          ✅ Assignments
        </h3>
        ${assignments.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: var(--space-3);">
            ${assignments.map(a => {
              const statusColors = {
                pending: 'var(--color-warning)',
                submitted: 'var(--color-info)',
                graded: 'var(--color-success)',
                overdue: 'var(--color-danger)'
              };
              const dueDate = new Date(a.dueDate || a.due_date);
              const isOverdue = a.status === 'pending' && dueDate < new Date();
              const displayStatus = isOverdue ? 'overdue' : a.status;
              
              return `
                <div style="padding: var(--space-4); background: var(--bg-tertiary); border-radius: var(--radius-lg); border-left: 4px solid ${statusColors[displayStatus]};">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-2);">
                    <div>
                      <h4 style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-1);">
                        ${a.title || 'Assignment'}
                      </h4>
                      <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                        ${a.subject} • Due: ${dueDate.toLocaleDateString()}
                      </p>
                    </div>
                    <span style="padding: 0.25rem 0.75rem; background: ${statusColors[displayStatus]}; color: white; border-radius: var(--radius-full); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); text-transform: capitalize;">
                      ${displayStatus}
                    </span>
                  </div>
                  ${a.description ? `<p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">${a.description}</p>` : ''}
                  ${a.status === 'graded' && a.grade ? `
                    <div style="margin-top: var(--space-3); padding: var(--space-2); background: var(--bg-primary); border-radius: var(--radius-md);">
                      <span style="font-weight: var(--font-weight-semibold);">Grade: ${a.grade}%</span>
                      ${a.feedback ? `<p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-top: var(--space-1);">${a.feedback}</p>` : ''}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` : '<p style="color: var(--text-secondary);">No assignments found</p>'}
      </div>
    `;
  },

  cleanup() {
    this.currentChild = null;
    this.children = [];
  }
};
