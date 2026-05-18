// ============================================
// STUDENT TASKS MODULE - ASSIGNMENTS, TESTS, EXAMS & ASSESSMENTS
// Comprehensive task management for all academic work assigned by teachers
// ============================================

const myTasksModule = {
  currentSession: null,
  tasksData: null,
  currentFilter: 'all',
  currentSort: 'dueDate',

  async init(container) {
    this.currentSession = authManager.getSession();

    if (!container) {
      container = document.getElementById('main-content');
    }
    this._container = container;

    await dataManager.waitForReady();
    this.loadTasksData();
    container.innerHTML = this.render();

    this.attachEventListeners();

    // FIX BUG #8: Remove old listener before adding new one to prevent duplicates
    if (this._onDataChange) {
      window.removeEventListener('datamanager:change', this._onDataChange);
    }
    this._onDataChange = (e) => {
      if (['studentAssignments'].includes(e.detail.collection)) {
        this.loadTasksData();
        this._container.innerHTML = this.render();
        this.attachEventListeners();
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  loadTasksData() {
    const supabaseId = this.currentSession?.supabaseId;
    const schoolId = this.currentSession?.userId;

    // Resolve student UUID (auth_id) — same pattern as other modules
    const students = dataManager.getAll('students') || [];
    const student = students.find(s => s.authId === supabaseId || s.auth_id === supabaseId)
      || students.find(s => s.id === supabaseId)
      || students.find(s => s.id === schoolId);
    
    // FIX BUG #1: Don't fallback to first student - return error instead
    if (!student) {
      console.error('[StudentTasks] Student not found for session:', { schoolId, supabaseId });
      this.tasksData = [];
      this._error = 'Student record not found. Please contact administrator.';
      return;
    }
    const studentUUID = student.id;

    // Filter assignments by UUID
    const allAssignments = dataManager.getAll('studentAssignments') || [];
    this.tasksData = studentUUID
      ? allAssignments.filter(a => (a.studentId || a.student_id) === studentUUID)
      : [];
  },

  render() {
    // FIX BUG #2: Handle error state when student not found
    if (this._error) {
      return `
        <div class="module-container">
          <div class="card" style="text-align: center; padding: var(--space-10);">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
              style="margin: 0 auto var(--space-4); color: var(--color-danger); opacity: 0.5;">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h2 style="color: var(--color-danger); margin-bottom: var(--space-2);">Error Loading Student Data</h2>
            <p style="color: var(--text-secondary); margin-bottom: var(--space-4);">
              ${this._error}
            </p>
            <button class="btn btn-primary" onclick="window.location.reload()">
              Reload Page
            </button>
          </div>
        </div>
      `;
    }

    const stats = this.calculateStats();
    const filteredTasks = this.getFilteredTasks();
    const sortedTasks = this.sortTasks(filteredTasks);

    return `
      <div class="module-container animate-fadeIn">
        <!-- Header -->
        <div class="module-header">
          <div>
            <h1 class="module-title">📝 My Tasks & Assignments</h1>
            <p class="module-subtitle">Track all your assignments, tests, exams, and assessments</p>
          </div>
          <div style="display: flex; gap: var(--space-3);">
            <button class="btn btn-secondary" onclick="myTasksModule.exportTasks()">
              📥 Export Tasks
            </button>
          </div>
        </div>

        <!-- Statistics Overview -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
          ${this.createStatCard('Total Tasks', stats.total, '📊', 'primary')}
          ${this.createStatCard('Upcoming', stats.upcoming, '⏰', 'warning')}
          ${this.createStatCard('Pending', stats.pending, '📝', 'info')}
          ${this.createStatCard('Graded', stats.graded, '✅', 'success')}
          ${this.createStatCard('Overdue', stats.overdue, '❌', 'danger')}
        </div>

        <!-- Filters and Sorting -->
        <div class="card mb-6">
          <div class="card-body" style="padding: var(--space-4);">
            <div style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; justify-content: space-between;">
              <!-- Filter Buttons -->
              <div style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
                <button class="btn btn-sm ${this.currentFilter === 'all' ? 'btn-primary' : 'btn-ghost'}" onclick="myTasksModule.setFilter('all')">
                  All (${stats.total})
                </button>
                <button class="btn btn-sm ${this.currentFilter === 'upcoming' ? 'btn-primary' : 'btn-ghost'}" onclick="myTasksModule.setFilter('upcoming')">
                  Upcoming (${stats.upcoming})
                </button>
                <button class="btn btn-sm ${this.currentFilter === 'pending' ? 'btn-primary' : 'btn-ghost'}" onclick="myTasksModule.setFilter('pending')">
                  Pending (${stats.pending})
                </button>
                <button class="btn btn-sm ${this.currentFilter === 'graded' ? 'btn-primary' : 'btn-ghost'}" onclick="myTasksModule.setFilter('graded')">
                  Graded (${stats.graded})
                </button>
                <button class="btn btn-sm ${this.currentFilter === 'overdue' ? 'btn-primary' : 'btn-ghost'}" onclick="myTasksModule.setFilter('overdue')">
                  Overdue (${stats.overdue})
                </button>
              </div>

              <!-- Sort Dropdown -->
              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <label style="font-size: var(--font-size-sm); color: var(--text-secondary);">Sort by:</label>
                <select class="form-select" style="min-width: 150px;" onchange="myTasksModule.setSort(this.value)">
                  <option value="dueDate" ${this.currentSort === 'dueDate' ? 'selected' : ''}>Due Date</option>
                  <option value="subject" ${this.currentSort === 'subject' ? 'selected' : ''}>Subject</option>
                  <option value="type" ${this.currentSort === 'type' ? 'selected' : ''}>Type</option>
                  <option value="status" ${this.currentSort === 'status' ? 'selected' : ''}>Status</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Tasks List -->
        <div class="grid grid-cols-1 gap-4">
          ${sortedTasks.length > 0 ? sortedTasks.map(task => this.renderTaskCard(task)).join('') : this.renderEmptyState()}
        </div>
      </div>
    `;
  },

  createStatCard(label, value, icon, type) {
    return `
      <div class="stat-card ${type}">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <div class="stat-label">${label}</div>
            <div class="stat-value">${value}</div>
          </div>
          <div style="font-size: 2rem; opacity: 0.3;">${icon}</div>
        </div>
      </div>
    `;
  },

  renderTaskCard(task) {
    const typeIcons = {
      'assignment': '📄',
      'quiz': '📝',
      'exam': '📋',
      'project': '🎯',
      'test': '📊'
    };

    const statusColors = {
      'upcoming': 'warning',
      'pending': 'info',
      'graded': 'success',
      'overdue': 'danger',
      'submitted': 'primary'
    };

    const dueDate = new Date(task.dueDate);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    const isOverdue = daysUntilDue < 0 && task.status !== 'graded';
    const urgencyClass = daysUntilDue <= 2 && daysUntilDue >= 0 ? 'urgent' : '';

    return `
      <div class="card ${urgencyClass}" style="border-left: 4px solid var(--color-${statusColors[task.status] || 'primary'});">
        <div class="card-body">
          <div style="display: flex; justify-content: space-between; align-items: start; gap: var(--space-4);">
            <!-- Left Section -->
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                <span style="font-size: 2rem;">${typeIcons[task.type] || '📄'}</span>
                <div>
                  <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-1);">
                    ${task.title}
                  </h3>
                  <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
                    <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                      📚 ${task.subjectName}
                    </span>
                    <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                      ${createBadge(task.type.charAt(0).toUpperCase() + task.type.slice(1), 'secondary')}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Task Details -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); margin-top: var(--space-4);">
                <div>
                  <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: var(--space-1);">Due Date</div>
                  <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: ${isOverdue ? 'var(--color-danger)' : 'var(--text-primary)'};">
                    📅 ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    ${isOverdue ? ' (Overdue)' : daysUntilDue === 0 ? ' (Today)' : daysUntilDue === 1 ? ' (Tomorrow)' : daysUntilDue > 0 && daysUntilDue <= 7 ? ` (${daysUntilDue} days)` : ''}
                  </div>
                </div>

                ${task.submittedDate ? `
                  <div>
                    <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: var(--space-1);">Submitted</div>
                    <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);">
                      ✅ ${new Date(task.submittedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ` : ''}

                <div>
                  <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: var(--space-1);">Total Marks</div>
                  <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);">
                    🎯 ${task.totalMarks} marks
                  </div>
                </div>

                ${task.score !== null && task.score !== undefined ? `
                  <div>
                    <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: var(--space-1);">Your Score</div>
                    <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-bold); color: var(--color-success);">
                      ⭐ ${task.score}/${task.totalMarks} (${task.grade})
                    </div>
                  </div>
                ` : ''}
              </div>

              ${task.remarks ? `
                <div style="margin-top: var(--space-3); padding: var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 3px solid var(--color-info);">
                  <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: var(--space-1);">Teacher's Remarks</div>
                  <div style="font-size: var(--font-size-sm); font-style: italic; color: var(--text-secondary);">
                    💬 "${task.remarks}"
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Right Section - Status Badge -->
            <div style="text-align: right;">
              ${createBadge(task.status.charAt(0).toUpperCase() + task.status.slice(1), statusColors[task.status] || 'primary')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderEmptyState() {
    const messages = {
      'all': { icon: '📝', title: 'No Tasks Found', desc: 'You have no assignments or assessments yet' },
      'upcoming': { icon: '⏰', title: 'No Upcoming Tasks', desc: 'You have no tasks due soon' },
      'pending': { icon: '📄', title: 'No Pending Tasks', desc: 'Great! You have no pending submissions' },
      'graded': { icon: '✅', title: 'No Graded Tasks', desc: 'No tasks have been graded yet' },
      'overdue': { icon: '🎉', title: 'No Overdue Tasks', desc: 'Excellent! You\'re all caught up' }
    };

    const message = messages[this.currentFilter] || messages['all'];

    return `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">${message.icon}</div>
            <h3 class="empty-state-title">${message.title}</h3>
            <p class="empty-state-description">${message.desc}</p>
          </div>
        </div>
      </div>
    `;
  },

  calculateStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      total: this.tasksData.length,
      upcoming: this.tasksData.filter(t => {
        const dueDate = new Date(t.dueDate);
        const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        return t.status === 'upcoming' || (daysUntil > 0 && daysUntil <= 7 && t.status !== 'graded');
      }).length,
      pending: this.tasksData.filter(t => t.status === 'pending').length,
      graded: this.tasksData.filter(t => t.status === 'graded').length,
      overdue: this.tasksData.filter(t => {
        const dueDate = new Date(t.dueDate);
        return dueDate < today && t.status !== 'graded' && !t.submittedDate;
      }).length
    };
  },

  getFilteredTasks() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (this.currentFilter) {
      case 'upcoming':
        return this.tasksData.filter(t => {
          const dueDate = new Date(t.dueDate);
          const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
          return t.status === 'upcoming' || (daysUntil > 0 && daysUntil <= 7 && t.status !== 'graded');
        });
      case 'pending':
        return this.tasksData.filter(t => t.status === 'pending');
      case 'graded':
        return this.tasksData.filter(t => t.status === 'graded');
      case 'overdue':
        return this.tasksData.filter(t => {
          const dueDate = new Date(t.dueDate);
          return dueDate < today && t.status !== 'graded' && !t.submittedDate;
        });
      default:
        return this.tasksData;
    }
  },

  sortTasks(tasks) {
    const sorted = [...tasks];

    switch (this.currentSort) {
      case 'dueDate':
        sorted.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        break;
      case 'subject':
        sorted.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        break;
      case 'type':
        sorted.sort((a, b) => a.type.localeCompare(b.type));
        break;
      case 'status':
        sorted.sort((a, b) => a.status.localeCompare(b.status));
        break;
    }

    return sorted;
  },

  setFilter(filter) {
    this.currentFilter = filter;
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = this.render();
      this.attachEventListeners();
    }
  },

  setSort(sort) {
    this.currentSort = sort;
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = this.render();
      this.attachEventListeners();
    }
  },

  attachEventListeners() {
    // Event listeners are handled via onclick attributes in the HTML
  },

  exportTasks() {
    if (this.tasksData.length === 0) {
      showToast('No tasks to export', 'warning');
      return;
    }

    // Prepare CSV data
    const headers = ['Subject', 'Title', 'Type', 'Due Date', 'Status', 'Total Marks', 'Score', 'Grade', 'Submitted Date', 'Remarks'];

    const rows = this.tasksData.map(t => [
      t.subjectName,
      t.title,
      t.type,
      new Date(t.dueDate).toLocaleDateString('en-US'),
      t.status,
      t.totalMarks,
      t.score !== null ? t.score : '-',
      t.grade || '-',
      t.submittedDate ? new Date(t.submittedDate).toLocaleDateString('en-US') : '-',
      t.remarks || '-'
    ]);

    // Add summary at the top
    const stats = this.calculateStats();
    const summaryRows = [
      ['TASKS & ASSIGNMENTS SUMMARY'],
      ['Student', this.currentSession.fullName],
      ['Student ID', this.currentSession.userId],
      ['Total Tasks', stats.total],
      ['Upcoming', stats.upcoming],
      ['Pending', stats.pending],
      ['Graded', stats.graded],
      ['Overdue', stats.overdue],
      [],
      headers
    ];

    const csvContent = [
      ...summaryRows.map(row => row.join(',')),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tasks_${this.currentSession.userId}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Tasks exported successfully!', 'success');
  }
};

// Initialize module
if (typeof window !== 'undefined') {
  window.myTasksModule = myTasksModule;
}
