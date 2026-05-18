// ============================================
// STUDENT DIRECTORY MODULE - ENHANCED
// ============================================

const studentDirectoryModule = {
  _searchTerm: '',
  _gradeFilter: 'all',
  _statusFilter: 'all',

  async init(container) {
    this.container = container;
    this._searchTerm = '';
    this._gradeFilter = 'all';
    this._statusFilter = 'all';
    await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['students'].includes(e.detail.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  render() {
    let students = dataManager.getAll('students');
    // Re-apply any active filters so data-change re-renders respect the current search/filter state
    if (this._searchTerm || this._gradeFilter !== 'all' || this._statusFilter !== 'all') {
      const q = this._searchTerm.toLowerCase();
      students = students.filter(s => {
        const matchesSearch = !q || s.name.toLowerCase().includes(q) || (s.rollNo || '').toLowerCase().includes(q);
        const matchesGrade = this._gradeFilter === 'all' || s.grade === this._gradeFilter;
        const matchesStatus = this._statusFilter === 'all' || s.status === this._statusFilter;
        return matchesSearch && matchesGrade && matchesStatus;
      });
    }

    this.container.innerHTML = `
      <div class="animate-fadeIn">
        <!-- Header with Actions -->
        <div class="flex justify-between items-center mb-6">
          <div>
            <h2 class="page-title" style="margin-bottom: var(--space-2);">Student Directory</h2>
            <p class="page-description">Manage and view all student records</p>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-secondary" onclick="studentDirectoryModule.showImportModal()">
              <span>📥</span> Import Students
            </button>
            <button class="btn btn-secondary" onclick="studentDirectoryModule.exportToCSV()">
              <span>📄</span> Export CSV
            </button>
            <button class="btn btn-secondary" onclick="studentDirectoryModule.exportToExcel()">
              <span>📊</span> Export Excel
            </button>
            <button class="btn btn-primary" onclick="studentDirectoryModule.showAddStudentModal()">
              <span>➕</span> Add Student
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="card mb-6">
          <div class="flex flex-wrap gap-4 items-center">
            <div class="search-bar" style="flex: 1; min-width: 300px;">
              <span class="search-icon">🔍</span>
              <input type="text" class="search-input" id="student-search" placeholder="Search by name, roll number..." value="${this._searchTerm}" onkeyup="studentDirectoryModule.filterStudents()">
            </div>
            <select class="form-select" id="grade-filter" onchange="studentDirectoryModule.filterStudents()" style="width: auto;">
              <option value="all">All Grades</option>
              ${schoolConfig.getAllGrades().map(g => `<option value="${g.code}" ${this._gradeFilter === g.code ? 'selected' : ''}>${g.name}</option>`).join('')}
            </select>
            <select class="form-select" id="status-filter" onchange="studentDirectoryModule.filterStudents()" style="width: auto;">
              <option value="all" ${this._statusFilter === 'all' ? 'selected' : ''}>All Status</option>
              <option value="active" ${this._statusFilter === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${this._statusFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>

        <!-- Student Grid -->
        <div id="students-container">
          ${this.renderStudentGrid(students)}
        </div>
      </div>
    `;
  },

  renderStudentGrid(students) {
    if (students.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <h3 class="empty-state-title">No Students Found</h3>
          <p class="empty-state-description">Add your first student to get started</p>
          <button class="btn btn-primary mt-4" onclick="studentDirectoryModule.showAddStudentModal()">
            <span>➕</span> Add Student
          </button>
        </div>
      `;
    }

    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${students.map((student, index) => `
          <div class="card animate-slideUp" style="animation-delay: ${index * 0.05}s; cursor: pointer; transition: all var(--transition-base);" 
               onclick="studentDirectoryModule.showStudentProfile('${student.id}')"
               onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-xl)'"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow=''">
            <div class="flex items-start gap-4">
              <div style="width: 60px; height: 60px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: var(--font-size-3xl); flex-shrink: 0; overflow: hidden;">
                ${student.photo && student.photo.startsWith('data:')
        ? `<img src="${student.photo}" style="width: 100%; height: 100%; object-fit: cover;" alt="${student.name}" />`
        : `<span>${student.photo || '👤'}</span>`
      }
              </div>
              <div style="flex: 1; min-width: 0;">
                <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--text-primary); margin-bottom: var(--space-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${student.name}
                </h3>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-2);">
                  Roll No: ${student.rollNo}
                </p>
                <div class="flex gap-2 flex-wrap">
                  ${createBadge(`Grade ${student.grade}-${student.section}`, 'primary')}
                  ${createBadge(student.status, student.status === 'active' ? 'success' : 'danger')}
                </div>
              </div>
            </div>
            <div class="card-footer mt-4">
              <div class="flex justify-between text-sm">
                <span style="color: var(--text-secondary);">Attendance:</span>
                <span style="color: ${student.attendance >= 90 ? 'var(--color-success)' : student.attendance >= 75 ? 'var(--color-warning)' : 'var(--color-danger)'}; font-weight: var(--font-weight-semibold);">
                  ${student.attendance}%
                </span>
              </div>
              <div class="flex justify-between text-sm mt-2">
                <span style="color: var(--text-secondary);">Fees:</span>
                ${createBadge(student.fees, student.fees === 'paid' ? 'success' : student.fees === 'pending' ? 'warning' : 'danger')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  filterStudents() {
    const searchTerm = document.getElementById('student-search').value.toLowerCase();
    const gradeFilter = document.getElementById('grade-filter').value;
    const statusFilter = document.getElementById('status-filter').value;

    // Persist filter state so re-renders don't reset inputs
    this._searchTerm = document.getElementById('student-search').value;
    this._gradeFilter = gradeFilter;
    this._statusFilter = statusFilter;

    let students = dataManager.getAll('students');

    // Apply filters
    students = students.filter(student => {
      const matchesSearch = student.name.toLowerCase().includes(searchTerm) ||
        student.rollNo.toLowerCase().includes(searchTerm);
      const matchesGrade = gradeFilter === 'all' || student.grade === gradeFilter;
      const matchesStatus = statusFilter === 'all' || student.status === statusFilter;

      return matchesSearch && matchesGrade && matchesStatus;
    });

    // Update grid
    const container = document.getElementById('students-container');
    container.innerHTML = this.renderStudentGrid(students);
  },

  showStudentProfile(studentId) {
    const student = dataManager.getById('students', studentId);
    if (!student) return;

    // Get student's grades and payment history
    const grades = dataManager.getAll('grades').filter(g => g.studentId === studentId);
    const enhancedPayments = dataManager.getAll('enhancedPayments').filter(p => (p.studentId || p.student_id) === studentId);
    const paymentHistory = enhancedPayments;

    // Fee bills assigned to this student (feeItems table — what they owe per term/type)
    const studentFeeItems = (dataManager.getAll('feeItems') || [])
      .filter(fi => (fi.student_id || fi.studentId) === studentId);

    // Calculate profile completion
    const profileCompletion = this.calculateProfileCompletion(student);

    const content = `
      <div style="max-height: 80vh; overflow-y: auto;">
        <!-- Student Header -->
        <div style="text-align: center; margin-bottom: var(--space-6); padding-bottom: var(--space-6); border-bottom: 1px solid var(--border-primary);">
          <div style="width: 100px; height: 100px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 60px; margin: 0 auto var(--space-4); overflow: hidden;">
            ${student.photo && student.photo.startsWith('data:')
        ? `<img src="${student.photo}" style="width: 100%; height: 100%; object-fit: cover;" alt="${student.name}" />`
        : `<span>${student.photo || '👤'}</span>`
      }
          </div>
          <h2 style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--text-primary); margin-bottom: var(--space-2);">
            ${student.name}
          </h2>
          <div class="flex gap-2 justify-center mb-3">
            ${createBadge(`Grade ${student.grade}-${student.section}`, 'primary')}
            ${createBadge(student.status, student.status === 'active' ? 'success' : 'danger')}
          </div>
          ${student.rollNo ? `<p style="color: var(--text-secondary);">Roll No: ${student.rollNo}</p>` : ''}
          
          <!-- Profile Completion -->
          <div style="margin-top: var(--space-4); max-width: 300px; margin-left: auto; margin-right: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
              <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">Profile Completion</span>
              <span style="font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); color: ${profileCompletion >= 80 ? 'var(--color-success)' : profileCompletion >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'};">${profileCompletion}%</span>
            </div>
            <div style="width: 100%; height: 8px; background: var(--bg-secondary); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: ${profileCompletion}%; height: 100%; background: ${profileCompletion >= 80 ? 'var(--gradient-success)' : profileCompletion >= 50 ? 'var(--gradient-warning)' : 'var(--gradient-danger)'}; transition: width var(--transition-base);"></div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div style="border-bottom: 1px solid var(--border-primary); margin-bottom: var(--space-6); overflow-x: auto;">
          <div style="display: flex; gap: var(--space-1); min-width: max-content; padding-bottom: var(--space-2);">
            <button class="profile-tab active" onclick="studentDirectoryModule.switchTab(event, 'overview')" data-tab="overview" style="white-space: nowrap; font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3);">
              📋 Overview
            </button>
            <button class="profile-tab" onclick="studentDirectoryModule.switchTab(event, 'personal')" data-tab="personal" style="white-space: nowrap; font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3);">
              👤 Personal
            </button>
            <button class="profile-tab" onclick="studentDirectoryModule.switchTab(event, 'contact')" data-tab="contact" style="white-space: nowrap; font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3);">
              📍 Contact
            </button>
            <button class="profile-tab" onclick="studentDirectoryModule.switchTab(event, 'guardian')" data-tab="guardian" style="white-space: nowrap; font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3);">
              👨‍👩‍👧 Guardian
            </button>
            <button class="profile-tab" onclick="studentDirectoryModule.switchTab(event, 'emergency')" data-tab="emergency" style="white-space: nowrap; font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3);">
              🚨 Emergency
            </button>
            <button class="profile-tab" onclick="studentDirectoryModule.switchTab(event, 'academics')" data-tab="academics" style="white-space: nowrap; font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3);">
              📚 Academics
            </button>
            <button class="profile-tab" onclick="studentDirectoryModule.switchTab(event, 'fees')" data-tab="fees" style="white-space: nowrap; font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3);">
              💰 Fees
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="profile-tab-content">
          ${this.renderOverviewTab(student)}
        </div>
      </div>
    `;

    createModal(`Student Profile - ${student.name}`, content);

    // Store data for tab switching
    window.currentStudentData = { student, grades, paymentHistory, enhancedPayments, studentFeeItems };
  },

  calculateProfileCompletion(student) {
    let totalFields = 0;
    let filledFields = 0;

    // Basic fields (always present)
    totalFields += 7;
    filledFields += 7; // name, grade, section, rollNo, status, attendance, fees

    // Personal info
    totalFields += 5;
    if (student.dateOfBirth) filledFields++;
    if (student.gender) filledFields++;
    if (student.bloodGroup) filledFields++;
    if (student.admissionDate) filledFields++;
    if (student.previousSchool) filledFields++;

    // Contact info
    totalFields += 6;
    if (student.email) filledFields++;
    if (student.phone) filledFields++;
    if (student.address && student.address.street) filledFields++;
    if (student.address && student.address.city) filledFields++;
    if (student.address && student.address.state) filledFields++;
    if (student.address && student.address.postalCode) filledFields++;

    // Parent info
    totalFields += 8;
    if (student.father && student.father.name) filledFields++;
    if (student.father && student.father.phone) filledFields++;
    if (student.father && student.father.email) filledFields++;
    if (student.father && student.father.occupation) filledFields++;
    if (student.mother && student.mother.name) filledFields++;
    if (student.mother && student.mother.phone) filledFields++;
    if (student.mother && student.mother.email) filledFields++;
    if (student.mother && student.mother.occupation) filledFields++;

    // Emergency contacts
    totalFields += 2;
    if (student.emergencyContacts && student.emergencyContacts.length >= 1) filledFields++;
    if (student.emergencyContacts && student.emergencyContacts.length >= 2) filledFields++;

    return Math.round((filledFields / totalFields) * 100);
  },

  switchTab(event, tabName) {
    // Update active tab
    document.querySelectorAll('.profile-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    event.target.classList.add('active');

    // Render tab content
    const contentDiv = document.getElementById('profile-tab-content');
    const { student, grades, paymentHistory, enhancedPayments } = window.currentStudentData;

    switch (tabName) {
      case 'overview':
        contentDiv.innerHTML = this.renderOverviewTab(student);
        break;
      case 'personal':
        contentDiv.innerHTML = this.renderPersonalInfoTab(student);
        break;
      case 'contact':
        contentDiv.innerHTML = this.renderContactTab(student);
        break;
      case 'guardian':
        contentDiv.innerHTML = this.renderGuardianTab(student);
        break;
      case 'emergency':
        contentDiv.innerHTML = this.renderEmergencyTab(student);
        break;
      case 'academics':
        contentDiv.innerHTML = this.renderAcademicsTab(student, grades);
        break;
      case 'fees':
        contentDiv.innerHTML = this.renderFeesTab(student, enhancedPayments.length > 0 ? enhancedPayments : paymentHistory, window.currentStudentData.studentFeeItems || []);
        break;
    }
  },

  renderOverviewTab(student) {
    return `
      <div class="grid grid-cols-2 gap-6">
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Roll Number</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">${student.rollNo || 'Not assigned'}</p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Class</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">Grade ${student.grade} - Section ${student.section}</p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Attendance</p>
          <p style="color: ${student.attendance >= 90 ? 'var(--color-success)' : 'var(--color-warning)'}; font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">
            ${student.attendance}%
          </p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Fee Status</p>
          ${createBadge(student.fees, student.fees === 'paid' ? 'success' : student.fees === 'pending' ? 'warning' : 'danger')}
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Status</p>
          ${createBadge(student.status, student.status === 'active' ? 'success' : 'danger')}
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Enrollment Date</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">${formatDate(student.createdAt)}</p>
        </div>
      </div>

      <div class="mt-6">
        <button class="btn btn-primary" onclick="studentDirectoryModule.editStudent('${student.id}')">
          ✏️ Edit Profile
        </button>
        <button class="btn btn-danger ml-3" onclick="studentDirectoryModule.archiveStudent('${student.id}')">
          🗄️ Archive Student
        </button>
      </div>
    `;
  },

  renderPersonalInfoTab(student) {
    const calculateAge = (dob) => {
      if (!dob) return 'N/A';
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    };

    return `
      <div class="grid grid-cols-2 gap-6">
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Date of Birth</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">
            ${student.dateOfBirth ? formatDate(student.dateOfBirth) : 'Not provided'}
          </p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Age</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">
            ${calculateAge(student.dateOfBirth)} years
          </p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Gender</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg); text-transform: capitalize;">
            ${student.gender || 'Not provided'}
          </p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Blood Group</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">
            ${student.bloodGroup || 'Not provided'}
          </p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Admission Date</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
            ${student.admissionDate ? formatDate(student.admissionDate) : 'Not provided'}
          </p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Previous School</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
            ${student.previousSchool || 'Not provided'}
          </p>
        </div>
      </div>

      <div class="mt-6">
        <button class="btn btn-primary" onclick="studentDirectoryModule.editStudent('${student.id}')">
          ✏️ Edit Personal Info
        </button>
      </div>
    `;
  },

  renderContactTab(student) {
    const address = student.address || {};
    return `
      <div class="grid grid-cols-2 gap-6 mb-6">
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Email Address</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
            ${student.email || 'Not provided'}
          </p>
        </div>
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Phone Number</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
            ${student.phone || 'Not provided'}
          </p>
        </div>
      </div>

      <div class="card" style="background: var(--bg-secondary); padding: var(--space-4);">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
          📍 Residential Address
        </h3>
        <div class="grid grid-cols-2 gap-4">
          <div style="grid-column: span 2;">
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Street Address</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${address.street || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">City</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${address.city || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">State</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${address.state || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Postal Code</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${address.postalCode || 'Not provided'}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-6">
        <button class="btn btn-primary" onclick="studentDirectoryModule.editStudent('${student.id}')">
          ✏️ Edit Contact Info
        </button>
      </div>
    `;
  },

  renderGuardianTab(student) {
    const father = student.father || {};
    const mother = student.mother || {};
    const guardian = student.guardian || {};

    return `
      <!-- Father's Information -->
      <div class="card" style="background: var(--bg-secondary); padding: var(--space-4); margin-bottom: var(--space-4);">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
          👨 Father's Information
        </h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Name</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${father.name || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Phone</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${father.phone || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Email</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${father.email || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Occupation</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${father.occupation || 'Not provided'}
            </p>
          </div>
        </div>
      </div>

      <!-- Mother's Information -->
      <div class="card" style="background: var(--bg-secondary); padding: var(--space-4); margin-bottom: var(--space-4);">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
          👩 Mother's Information
        </h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Name</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${mother.name || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Phone</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${mother.phone || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Email</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${mother.email || 'Not provided'}
            </p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Occupation</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
              ${mother.occupation || 'Not provided'}
            </p>
          </div>
        </div>
      </div>

      ${guardian.name ? `
        <!-- Guardian's Information -->
        <div class="card" style="background: var(--bg-secondary); padding: var(--space-4); margin-bottom: var(--space-4);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
            👤 Guardian's Information
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Name</p>
              <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
                ${guardian.name}
              </p>
            </div>
            <div>
              <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Relationship</p>
              <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
                ${guardian.relationship}
              </p>
            </div>
            <div>
              <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Phone</p>
              <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
                ${guardian.phone}
              </p>
            </div>
            <div>
              <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Email</p>
              <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
                ${guardian.email}
              </p>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="mt-6">
        <button class="btn btn-primary" onclick="studentDirectoryModule.editStudent('${student.id}')">
          ✏️ Edit Parent/Guardian Info
        </button>
      </div>
    `;
  },

  renderEmergencyTab(student) {
    const emergencyContacts = student.emergencyContacts || [];

    if (emergencyContacts.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🚨</div>
          <h3 class="empty-state-title">No Emergency Contacts</h3>
          <p class="empty-state-description">No emergency contacts have been added for this student</p>
          <button class="btn btn-primary mt-4" onclick="studentDirectoryModule.editStudent('${student.id}')">
            ➕ Add Emergency Contacts
          </button>
        </div>
      `;
    }

    return `
      <div class="grid grid-cols-1 gap-4">
        ${emergencyContacts.map((contact, index) => `
          <div class="card" style="background: var(--bg-secondary); padding: var(--space-4);">
            <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-3); color: var(--text-primary);">
              ${index === 0 ? '🚨 Primary' : '🚨 Secondary'} Emergency Contact
            </h3>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Name</p>
                <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
                  ${contact.name || 'Not provided'}
                </p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Relationship</p>
                <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
                  ${contact.relationship || 'Not provided'}
                </p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Phone Number</p>
                <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">
                  ${contact.phone || 'Not provided'}
                </p>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="mt-6">
        <button class="btn btn-primary" onclick="studentDirectoryModule.editStudent('${student.id}')">
          ✏️ Edit Emergency Contacts
        </button>
      </div>
    `;
  },

  renderAcademicsTab(student, grades) {
    if (grades.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <h3 class="empty-state-title">No Academic Records</h3>
          <p class="empty-state-description">No grades have been recorded for this student yet</p>
        </div>
      `;
    }

    // Calculate average
    const average = (grades.reduce((sum, g) => sum + (parseFloat(g.score) || 0), 0) / grades.length).toFixed(1);

    // Get student's class/grade level name
    const gradeName = schoolConfig.getAllGrades().find(g => g.code === student.grade)?.name || student.grade;
    const letterGrade = average >= 90 ? 'A' : average >= 80 ? 'B' : average >= 70 ? 'C' : average >= 60 ? 'D' : 'F';

    return `
      <!-- Academic Summary -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="card" style="background: var(--gradient-primary); color: white; text-align: center; padding: var(--space-4);">
          <p style="font-size: var(--font-size-xs); margin-bottom: var(--space-1); opacity: 0.9;">Class/Grade</p>
          <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold);">${gradeName}</p>
        </div>
        <div class="card" style="background: var(--gradient-secondary); color: white; text-align: center; padding: var(--space-4);">
          <p style="font-size: var(--font-size-xs); margin-bottom: var(--space-1); opacity: 0.9;">Overall Average</p>
          <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold);">${average}%</p>
        </div>
        <div class="card" style="background: var(--gradient-info); color: white; text-align: center; padding: var(--space-4);">
          <p style="font-size: var(--font-size-xs); margin-bottom: var(--space-1); opacity: 0.9;">Letter Grade</p>
          <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold);">${letterGrade}</p>
        </div>
        <div class="card" style="background: var(--gradient-success); color: white; text-align: center; padding: var(--space-4);">
          <p style="font-size: var(--font-size-xs); margin-bottom: var(--space-1); opacity: 0.9;">Subjects</p>
          <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold);">${grades.length}</p>
        </div>
      </div>

      <!-- Subject Grades -->
      <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">Subject Performance</h3>
      <div style="overflow-x: auto;">
        <table class="table" style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; padding: var(--space-3); white-space: nowrap;">Subject</th>
              <th style="text-align: center; padding: var(--space-3);">Score</th>
              <th style="text-align: center; padding: var(--space-3);">Total</th>
              <th style="text-align: center; padding: var(--space-3);">%</th>
              <th style="text-align: center; padding: var(--space-3);">Grade</th>
              <th style="text-align: left; padding: var(--space-3);">Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${grades.map(grade => {
      const score = parseFloat(grade.score) || 0;
      const total = parseFloat(grade.totalMarks) || 100;
      const percentage = (score / total * 100).toFixed(1);
      const letterGrade = percentage >= 90 ? 'A' : percentage >= 80 ? 'B' : percentage >= 70 ? 'C' : percentage >= 60 ? 'D' : 'F';
      return `
                <tr>
                  <td style="font-weight: var(--font-weight-semibold); padding: var(--space-3); white-space: nowrap;">${grade.subject || 'N/A'}</td>
                  <td style="text-align: center; padding: var(--space-3);">${score}</td>
                  <td style="text-align: center; padding: var(--space-3);">${total}</td>
                  <td style="text-align: center; padding: var(--space-3);">
                    <span style="color: ${percentage >= 90 ? 'var(--color-success)' : percentage >= 75 ? 'var(--color-info)' : percentage >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'}; font-weight: var(--font-weight-semibold);">
                      ${percentage}%
                    </span>
                  </td>
                  <td style="text-align: center; padding: var(--space-3);">${createBadge(grade.grade || letterGrade, letterGrade === 'A' ? 'success' : letterGrade === 'B' ? 'info' : letterGrade === 'C' ? 'warning' : 'danger')}</td>
                  <td style="color: var(--text-secondary); padding: var(--space-3);">${grade.remarks || '-'}</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderFeesTab(student, paymentHistory, studentFeeItems = []) {
    const amt = (p) => parseFloat(p.amount) || 0;

    // Source of truth: prefer feeItems (assigned bills) if they exist
    let totalAmount, totalPaid, totalPending;
    if (studentFeeItems.length > 0) {
      totalAmount   = studentFeeItems.reduce((s, fi) => s + parseFloat(fi.amount || 0), 0);
      const paidOnItems = studentFeeItems.reduce((s, fi) => s + parseFloat(fi.amount_paid || 0), 0);
      const paidTxns    = paymentHistory.filter(p => p.status === 'paid').reduce((s, p) => s + amt(p), 0);
      totalPaid    = Math.max(paidOnItems, paidTxns);
      totalPending = Math.max(0, totalAmount - totalPaid);
    } else {
      // No assigned bills — fall back to payment records alone
      totalPaid    = paymentHistory.filter(p => p.status === 'paid').reduce((s, p) => s + amt(p), 0);
      totalPending = paymentHistory.filter(p => p.status !== 'paid').reduce((s, p) => s + amt(p), 0);
      totalAmount  = totalPaid + totalPending;
    }

    const hasBills = studentFeeItems.length > 0;

    return `
      <!-- Payment Summary -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="card" style="background: var(--gradient-primary); color: white; text-align: center; padding: var(--space-4);">
          <p style="font-size: var(--font-size-xs); margin-bottom: var(--space-1); opacity: 0.9;">Total Fees</p>
          <p style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">${formatCurrency(totalAmount)}</p>
        </div>
        <div class="card" style="background: var(--gradient-success); color: white; text-align: center; padding: var(--space-4);">
          <p style="font-size: var(--font-size-xs); margin-bottom: var(--space-1); opacity: 0.9;">Paid</p>
          <p style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">${formatCurrency(totalPaid)}</p>
        </div>
        <div class="card" style="background: ${totalPending > 0 ? 'var(--gradient-warning)' : 'var(--gradient-success)'}; color: white; text-align: center; padding: var(--space-4);">
          <p style="font-size: var(--font-size-xs); margin-bottom: var(--space-1); opacity: 0.9;">Outstanding</p>
          <p style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">${formatCurrency(totalPending)}</p>
        </div>
      </div>

      ${totalAmount === 0 && !hasBills ? `
        <div style="background: linear-gradient(135deg,rgba(245,158,11,0.08),rgba(254,225,64,0.08)); border:1.5px solid var(--color-warning); border-radius:var(--radius-lg); padding:var(--space-4); margin-bottom:var(--space-5); display:flex; align-items:center; gap:var(--space-3);">
          <span style="font-size:1.5rem;">⚠️</span>
          <div>
            <p style="font-weight:700; color:var(--text-primary); margin:0 0 2px;">No fee bills assigned yet</p>
            <p style="font-size:var(--font-size-sm); color:var(--text-secondary); margin:0;">Go to <strong>Fees & Payments → Assign Fees for Term</strong> to create fee bills for this student.</p>
          </div>
        </div>
      ` : ''}

      ${hasBills ? `
        <!-- Assigned Fee Bills -->
        <h3 style="font-size:var(--font-size-lg); font-weight:var(--font-weight-semibold); margin-bottom:var(--space-3);">Fee Bills</h3>
        <div style="overflow-x:auto; margin-bottom:var(--space-6);">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:var(--space-3);">Fee Type</th>
                <th style="text-align:left; padding:var(--space-3);">Term</th>
                <th style="text-align:right; padding:var(--space-3);">Billed</th>
                <th style="text-align:right; padding:var(--space-3);">Paid</th>
                <th style="text-align:right; padding:var(--space-3);">Balance</th>
                <th style="text-align:center; padding:var(--space-3);">Status</th>
              </tr>
            </thead>
            <tbody>
              ${studentFeeItems.map(fi => {
                const billed   = parseFloat(fi.amount || 0);
                const paid     = parseFloat(fi.amount_paid || 0);
                const balance  = Math.max(0, billed - paid);
                const status   = fi.status || (balance === 0 ? 'paid' : balance < billed ? 'partial' : 'pending');
                return `<tr>
                  <td style="font-weight:var(--font-weight-semibold); padding:var(--space-3);">${fi.item_name || fi.fee_type || fi.feeType || 'Fee'}</td>
                  <td style="padding:var(--space-3); color:var(--text-secondary);">${fi.term || fi.academic_year || '-'}</td>
                  <td style="text-align:right; padding:var(--space-3);">${formatCurrency(billed)}</td>
                  <td style="text-align:right; padding:var(--space-3); color:var(--color-success);">${formatCurrency(paid)}</td>
                  <td style="text-align:right; padding:var(--space-3); font-weight:700; color:${balance > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">${formatCurrency(balance)}</td>
                  <td style="text-align:center; padding:var(--space-3);">${createBadge(status, status === 'paid' ? 'success' : status === 'partial' ? 'info' : 'warning')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Payment History -->
      <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">Payment History</h3>
      ${paymentHistory.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">💰</div>
          <h3 class="empty-state-title">No Payment Records</h3>
          <p class="empty-state-description">No payments have been recorded for this student yet</p>
        </div>
      ` : `
        <div style="overflow-x: auto;">
          <table class="table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding: var(--space-3); white-space: nowrap;">Fee Type</th>
                <th style="text-align: right; padding: var(--space-3);">Amount</th>
                <th style="text-align: center; padding: var(--space-3);">Date</th>
                <th style="text-align: center; padding: var(--space-3);">Method</th>
                <th style="text-align: center; padding: var(--space-3);">Receipt</th>
                <th style="text-align: center; padding: var(--space-3);">Status</th>
              </tr>
            </thead>
            <tbody>
              ${paymentHistory.map(payment => `
                <tr>
                  <td style="font-weight: var(--font-weight-semibold); padding: var(--space-3); white-space: nowrap;">${payment.feeType || payment.fee_type || payment.term || '-'}</td>
                  <td style="text-align: right; padding: var(--space-3);">${formatCurrency(parseFloat(payment.amount) || 0)}</td>
                  <td style="text-align: center; padding: var(--space-3);">${formatDate(payment.paymentDate || payment.payment_date || payment.createdAt)}</td>
                  <td style="text-align: center; padding: var(--space-3); text-transform: capitalize;">${(payment.paymentMethod || payment.payment_method || '-').replace(/-/g, ' ')}</td>
                  <td style="text-align: center; padding: var(--space-3); font-family: monospace; font-size: var(--font-size-sm);">${payment.receiptNo || payment.receipt_no || '-'}</td>
                  <td style="text-align: center; padding: var(--space-3);">${createBadge(payment.status || 'pending', payment.status === 'paid' ? 'success' : payment.status === 'overdue' ? 'danger' : 'warning')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
  },

  showAddStudentModal() {
    const content = `
      <form id="add-student-form" onsubmit="studentDirectoryModule.handleAddStudent(event)" style="max-height: 70vh; overflow-y: auto;">
        <!-- Basic Information -->
        <div style="margin-bottom: var(--space-6);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary); border-bottom: 2px solid var(--border-primary); padding-bottom: var(--space-2);">
            📋 Basic Information
          </h3>
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" class="form-input" name="name" required placeholder="Enter student name">
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div class="form-group">
              <label class="form-label">Grade *</label>
              <select class="form-select" name="grade" required>
                <option value="">Select Grade</option>
                ${Object.keys(window.feeStructure?.feeItems || {}).map(g => `
                  <option value="${g}">${g}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Section *</label>
              <select class="form-select" name="section" required>
                <option value="">Select</option>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Roll Number</label>
              <input type="text" class="form-input" name="rollNo" placeholder="e.g., 1001">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label class="form-label">Gender</label>
              <select class="form-select" name="gender">
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Date of Birth</label>
              <input type="date" class="form-input" name="dateOfBirth">
            </div>
          </div>
        </div>

        <!-- Guardian Information -->
        <div style="margin-bottom: var(--space-6);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary); border-bottom: 2px solid var(--border-primary); padding-bottom: var(--space-2);">
            👨‍👩‍👧 Guardian Information
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label class="form-label">Guardian Name</label>
              <input type="text" class="form-input" name="guardianName" placeholder="Guardian's full name">
            </div>
            <div class="form-group">
              <label class="form-label">Relationship</label>
              <select class="form-select" name="guardianRelationship">
                <option value="">Select</option>
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Uncle">Uncle</option>
                <option value="Aunt">Aunt</option>
                <option value="Grandparent">Grandparent</option>
                <option value="Sibling">Sibling</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Guardian Email</label>
              <input type="email" class="form-input" name="guardianEmail" placeholder="guardian@example.com" id="guardian-email-input">
            </div>
            <div class="form-group">
              <label class="form-label">Guardian Phone</label>
              <input type="tel" class="form-input" name="guardianPhone" placeholder="+234-XXX-XXX-XXXX">
            </div>
          </div>

          <!-- Send Invite Toggle -->
          <div style="margin-top: var(--space-4); padding: var(--space-4); background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-primary);">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <label style="position: relative; display: inline-block; width: 48px; height: 26px; flex-shrink: 0;">
                <input type="checkbox" name="sendGuardianInvite" id="send-guardian-invite" onchange="studentDirectoryModule.toggleGuardianInvite(this.checked)" style="opacity: 0; width: 0; height: 0;">
                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--bg-tertiary); transition: .3s; border-radius: 26px; border: 2px solid var(--border-primary);" id="invite-toggle-track">
                  <span style="position: absolute; content: ''; height: 18px; width: 18px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: var(--shadow-sm);" id="invite-toggle-thumb"></span>
                </span>
              </label>
              <div>
                <p style="font-weight: var(--font-weight-semibold); color: var(--text-primary); margin-bottom: var(--space-1);">
                  ✉️ Send Portal Invite to Guardian
                </p>
                <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                  Creates a guardian account and generates login credentials they can use to access the portal
                </p>
              </div>
            </div>

            <!-- Invite Details (shown when toggle is on) -->
            <div id="guardian-invite-details" style="display: none; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border-primary);">
              <div class="grid grid-cols-2 gap-4">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Login ID (auto-generated)</label>
                  <input type="text" class="form-input" name="guardianSchoolId" id="guardian-school-id" readonly style="background: var(--bg-tertiary); font-family: monospace;">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Default Password</label>
                  <input type="text" class="form-input" name="guardianPassword" id="guardian-password" value="" placeholder="Auto-generated" readonly style="background: var(--bg-tertiary); font-family: monospace;">
                </div>
              </div>
              <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: var(--space-2);">
                These credentials will be shown after submission. Share them with the guardian so they can log in.
              </p>
            </div>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="flex gap-3 mt-6" style="position: sticky; bottom: 0; background: var(--bg-primary); padding: var(--space-4) 0; border-top: 1px solid var(--border-primary);">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">➕ Add Student</button>
        </div>
      </form>
    `;

    createModal('Add New Student', content);
  },

  toggleGuardianInvite(checked) {
    const details = document.getElementById('guardian-invite-details');
    const track = document.getElementById('invite-toggle-track');
    const thumb = document.getElementById('invite-toggle-thumb');

    if (checked) {
      details.style.display = 'block';
      track.style.backgroundColor = 'var(--color-primary)';
      track.style.borderColor = 'var(--color-primary)';
      thumb.style.transform = 'translateX(22px)';

      // Auto-generate school ID and password
      const year = new Date().getFullYear();
      const rand = String(Math.floor(Math.random() * 900) + 100);
      const schoolId = `GRD-${year}-${rand}`;
      const password = this.generateRandomPassword();

      document.getElementById('guardian-school-id').value = schoolId;
      document.getElementById('guardian-password').value = password;

      // Guardian email becomes required
      document.getElementById('guardian-email-input').setAttribute('required', 'required');
    } else {
      details.style.display = 'none';
      track.style.backgroundColor = 'var(--bg-tertiary)';
      track.style.borderColor = 'var(--border-primary)';
      thumb.style.transform = 'translateX(0)';

      document.getElementById('guardian-school-id').value = '';
      document.getElementById('guardian-password').value = '';
      document.getElementById('guardian-email-input').removeAttribute('required');
    }
  },

  generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  },

  async handleAddStudent(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const guardianName = formData.get('guardianName') || '';
    const guardianEmail = formData.get('guardianEmail') || '';
    const guardianPhone = formData.get('guardianPhone') || '';
    const guardianRelationship = formData.get('guardianRelationship') || '';

    // Validate guardian email and phone if provided
    if (typeof validationManager !== 'undefined' && (guardianEmail || guardianPhone)) {
      const validationData = {};
      if (guardianEmail) validationData.email = guardianEmail;
      if (guardianPhone) validationData.phone = guardianPhone;

      const validation = await validationManager.validateUserInput(validationData, { 
        checkUniqueness: true, 
        excludeTable: 'students' 
      });

      if (!validation.isValid) {
        validation.errors.forEach(err => showToast(err.message, 'error'));
        return;
      }
    }

    const studentData = {
      name: formData.get('name'),
      grade: formData.get('grade'),
      section: formData.get('section'),
      rollNo: formData.get('rollNo') || null,
      gender: formData.get('gender') || null,
      dateOfBirth: formData.get('dateOfBirth') || null,
      status: 'active',
      attendance: 100,
      fees: 'pending',
      photo: '👤',
      guardian: guardianName ? {
        name: guardianName,
        relationship: guardianRelationship,
        email: guardianEmail || null,
        phone: guardianPhone || null
      } : {}
    };

    // Create the student
    const newStudent = await dataManager.create('students', studentData);
    if (!newStudent) { showToast('Failed to create student — check console', 'error'); return; }
    const studentName = formData.get('name');

    // Auto-apply grade fee structure
    if (typeof feeManager !== 'undefined' && newStudent.id && studentData.grade) {
      feeManager.applyFeeStructure(newStudent.id, studentData.grade)
        .then(r => { if (!r.success) console.warn('[StudentDir] Fee structure apply:', r.error); });
    }

    // Auto-enroll in grade subjects
    if (typeof subjectManager !== 'undefined' && newStudent.id) {
      subjectManager.autoEnroll(newStudent.id, studentData.name, studentData.grade, studentData.section)
        .then(r => { if (!r.success && !r.existing) console.warn('[StudentDir] Subject auto-enroll:', r.error); });
    }

    // Handle guardian invite if toggled on
    const sendInvite = formData.get('sendGuardianInvite');
    if (sendInvite && guardianEmail && guardianName) {
      const schoolId = formData.get('guardianSchoolId');
      const password = formData.get('guardianPassword');

      // Show loading state
      const submitBtn = event.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin .6s linear infinite;margin-right:8px;vertical-align:middle;"></span> Creating invite...';
      submitBtn.disabled = true;

      try {
        const result = await authManager.createInvitation({
          email: guardianEmail,
          role: 'guardian',
          fullName: guardianName,
          expiryDays: 30
        });

        // Close the add student modal
        document.querySelector('.modal-backdrop')?.remove();

        if (result.success) {
          // Show success modal with credentials (use returned schoolId/password)
          this.showGuardianInviteSuccess(studentName, guardianName, guardianEmail, result.schoolId, result.password, result.token);
        } else {
          showToast(`Student added but guardian invite failed: ${result.error}`, 'warning');
          this.render();
        }
      } catch (err) {
        console.error('Guardian invite error:', err);
        document.querySelector('.modal-backdrop')?.remove();
        showToast(`Student added but guardian invite failed: ${err.message}`, 'warning');
        this.render();
      }
    } else {
      showToast('Student added successfully!', 'success');
      if (typeof writeAuditLog === 'function') writeAuditLog('STUDENT_CREATED', studentData.name, `Grade: ${studentData.grade}, Section: ${studentData.section}`);
      document.querySelector('.modal-backdrop')?.remove();
      this.render();
    }
  },

  showGuardianInviteSuccess(studentName, guardianName, guardianEmail, schoolId, password, token) {
    const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    const inviteLink = `${baseUrl}verify-invitation.html?token=${token}`;

    const content = `
      <div style="text-align: center; margin-bottom: var(--space-6);">
        <div style="width: 80px; height: 80px; background: var(--gradient-success); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 40px; margin: 0 auto var(--space-4);">
          ✅
        </div>
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); color: var(--text-primary); margin-bottom: var(--space-2);">
          Student Added & Guardian Invited!
        </h3>
        <p style="color: var(--text-secondary);">
          <strong>${studentName}</strong> has been enrolled and an invite has been created for <strong>${guardianName}</strong>.
        </p>
      </div>

      <!-- Credentials Card -->
      <div style="background: var(--bg-secondary); border-radius: var(--radius-lg); padding: var(--space-5); margin-bottom: var(--space-4); border: 1px solid var(--border-primary);">
        <h4 style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
          🔑 Guardian Login Credentials
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div>
            <p style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: var(--space-1);">Login ID</p>
            <p style="font-family: monospace; font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); color: var(--color-primary); background: var(--bg-primary); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border: 1px dashed var(--color-primary);" id="invite-school-id">
              ${schoolId}
            </p>
          </div>
          <div>
            <p style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: var(--space-1);">Password</p>
            <p style="font-family: monospace; font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); color: var(--color-primary); background: var(--bg-primary); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border: 1px dashed var(--color-primary);" id="invite-password">
              ${password}
            </p>
          </div>
        </div>
        <div style="margin-bottom: var(--space-3);">
          <p style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: var(--space-1);">Guardian Email</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-medium);">${guardianEmail}</p>
        </div>
        ${token ? `
          <div>
            <p style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: var(--space-1);">Invite Link (optional — guardian can change password here)</p>
            <div style="display: flex; gap: var(--space-2); align-items: center;">
              <input type="text" class="form-input" value="${inviteLink}" readonly style="font-size: var(--font-size-sm); font-family: monospace; flex: 1;" id="invite-link-input">
              <button type="button" class="btn btn-ghost" onclick="studentDirectoryModule.copyToClipboard('invite-link-input', this)" title="Copy link" style="flex-shrink: 0;">
                📋 Copy
              </button>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: var(--space-3);">
        <button type="button" class="btn btn-ghost flex-1" onclick="studentDirectoryModule.copyAllCredentials('${schoolId}', '${password}', '${guardianEmail}', '${inviteLink.replace(/'/g, "\\'")}')">
          📋 Copy All
        </button>
        <button type="button" class="btn btn-primary flex-1" onclick="closeModal(this); studentDirectoryModule.render();">
          ✅ Done
        </button>
      </div>

      <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); text-align: center; margin-top: var(--space-4);">
        Share these credentials with the guardian. They can log in at the portal login page using the Login ID and Password above.
      </p>
    `;

    createModal('Guardian Invitation Created', content);
  },

  copyToClipboard(inputId, button) {
    const input = document.getElementById(inputId);
    if (input) {
      navigator.clipboard.writeText(input.value).then(() => {
        const original = button.innerHTML;
        button.innerHTML = '✅ Copied!';
        setTimeout(() => { button.innerHTML = original; }, 2000);
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        const original = button.innerHTML;
        button.innerHTML = '✅ Copied!';
        setTimeout(() => { button.innerHTML = original; }, 2000);
      });
    }
  },

  copyAllCredentials(schoolId, password, email, inviteLink) {
    const text = `Guardian Portal Access\n---------------------\nLogin ID: ${schoolId}\nPassword: ${password}\nEmail: ${email}\n${inviteLink ? 'Invite Link: ' + inviteLink : ''}\n\nLog in at the school portal login page.`;
    navigator.clipboard.writeText(text).then(() => {
      showToast('All credentials copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Could not copy to clipboard', 'error');
    });
  },


  editStudent(studentId) {
    const student = dataManager.getById('students', studentId);
    if (!student) return;

    // Close current modal if open to prevent conflicts
    const existingModal = document.querySelector('.modal-backdrop');
    if (existingModal) {
      existingModal.remove();
    }

    // Small delay to ensure clean transition
    setTimeout(() => {
      this.showEditForm(studentId, student);
    }, 100);
  },

  showEditForm(studentId, student) {
    // Helper function to safely get nested values
    const getValue = (obj, path, defaultValue = '') => {
      return path.split('.').reduce((acc, part) => acc && acc[part], obj) || defaultValue;
    };

    const content = `
      <form id="edit-student-form" onsubmit="studentDirectoryModule.handleEditStudent(event, '${studentId}')" style="max-height: 70vh; overflow-y: auto;">
        <!-- Basic Information Section -->
        <div style="margin-bottom: var(--space-6);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary); border-bottom: 2px solid var(--border-primary); padding-bottom: var(--space-2);">
            📋 Basic Information
          </h3>
          
          <!-- Photo Upload Section -->
          <div class="form-group" style="grid-column: span 2; margin-bottom: var(--space-4);">
            <label class="form-label">Student Photo</label>
            <div style="display: flex; align-items: center; gap: var(--space-4);">
              <div id="photo-preview" style="width: 100px; height: 100px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 60px; overflow: hidden; flex-shrink: 0;">
                ${student.photo && student.photo.startsWith('data:')
        ? `<img src="${student.photo}" style="width: 100%; height: 100%; object-fit: cover;" alt="Student photo" />`
        : `<span>${student.photo || '👤'}</span>`
      }
              </div>
              <div style="flex: 1;">
                <input type="file" id="photo-upload" accept="image/jpeg,image/png,image/webp" class="form-input" onchange="studentDirectoryModule.handlePhotoUpload(event)" style="margin-bottom: var(--space-2);">
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin: 0;">
                  Max size: 2MB. Formats: JPG, PNG, WebP
                </p>
              </div>
            </div>
            <input type="hidden" id="photo-data" name="photo" value="${student.photo || '👤'}">
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label">Full Name *</label>
              <input type="text" class="form-input" name="name" value="${student.name}" required placeholder="Enter student name">
            </div>
            <div class="form-group">
              <label class="form-label">Grade *</label>
              <select class="form-select" name="grade" required>
                <option value="">Select Grade</option>
                ${Object.keys(window.feeStructure?.feeItems || {}).map(g => `
                  <option value="${g}" ${student.grade === g ? 'selected' : ''}>${g}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Section *</label>
              <select class="form-select" name="section" required>
                <option value="">Select Section</option>
                ${['A', 'B', 'C'].map(section => `
                  <option value="${section}" ${student.section === section ? 'selected' : ''}>Section ${section}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Roll Number *</label>
              <input type="text" class="form-input" name="rollNo" value="${student.rollNo}" required placeholder="e.g., 1001">
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" name="status">
                <option value="active" ${student.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="inactive" ${student.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                <option value="archived" ${student.status === 'archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Personal Information Section -->
        <div style="margin-bottom: var(--space-6);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary); border-bottom: 2px solid var(--border-primary); padding-bottom: var(--space-2);">
            👤 Personal Information
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label class="form-label">Date of Birth</label>
              <input type="date" class="form-input" name="dateOfBirth" value="${getValue(student, 'dateOfBirth')}">
            </div>
            <div class="form-group">
              <label class="form-label">Gender</label>
              <select class="form-select" name="gender">
                <option value="">Select Gender</option>
                <option value="male" ${student.gender === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${student.gender === 'female' ? 'selected' : ''}>Female</option>
                <option value="other" ${student.gender === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Blood Group</label>
              <select class="form-select" name="bloodGroup">
                <option value="">Select Blood Group</option>
                <option value="A+" ${student.bloodGroup === 'A+' ? 'selected' : ''}>A+</option>
                <option value="A-" ${student.bloodGroup === 'A-' ? 'selected' : ''}>A-</option>
                <option value="B+" ${student.bloodGroup === 'B+' ? 'selected' : ''}>B+</option>
                <option value="B-" ${student.bloodGroup === 'B-' ? 'selected' : ''}>B-</option>
                <option value="AB+" ${student.bloodGroup === 'AB+' ? 'selected' : ''}>AB+</option>
                <option value="AB-" ${student.bloodGroup === 'AB-' ? 'selected' : ''}>AB-</option>
                <option value="O+" ${student.bloodGroup === 'O+' ? 'selected' : ''}>O+</option>
                <option value="O-" ${student.bloodGroup === 'O-' ? 'selected' : ''}>O-</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Admission Date</label>
              <input type="date" class="form-input" name="admissionDate" value="${getValue(student, 'admissionDate')}">
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label">Previous School</label>
              <input type="text" class="form-input" name="previousSchool" value="${getValue(student, 'previousSchool')}" placeholder="Enter previous school name">
            </div>
          </div>
        </div>

        <!-- Contact Information Section -->
        <div style="margin-bottom: var(--space-6);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary); border-bottom: 2px solid var(--border-primary); padding-bottom: var(--space-2);">
            📍 Contact Information
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input type="email" class="form-input" name="email" value="${getValue(student, 'email')}" placeholder="student@example.com">
            </div>
            <div class="form-group">
              <label class="form-label">Phone Number</label>
              <input type="tel" class="form-input" name="phone" value="${getValue(student, 'phone')}" placeholder="+234-XXX-XXX-XXXX">
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label">Street Address</label>
              <input type="text" class="form-input" name="address_street" value="${getValue(student, 'address.street')}" placeholder="Enter street address">
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <input type="text" class="form-input" name="address_city" value="${getValue(student, 'address.city')}" placeholder="Enter city">
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <input type="text" class="form-input" name="address_state" value="${getValue(student, 'address.state')}" placeholder="Enter state">
            </div>
            <div class="form-group">
              <label class="form-label">Postal Code</label>
              <input type="text" class="form-input" name="address_postalCode" value="${getValue(student, 'address.postalCode')}" placeholder="Enter postal code">
            </div>
          </div>
        </div>

        <!-- Parent/Guardian Information Section -->
        <div style="margin-bottom: var(--space-6);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary); border-bottom: 2px solid var(--border-primary); padding-bottom: var(--space-2);">
            👨‍👩‍👧 Parent/Guardian Information
          </h3>
          
          <!-- Father's Information -->
          <div style="margin-bottom: var(--space-4);">
            <h4 style="font-size: var(--font-size-md); font-weight: var(--font-weight-medium); margin-bottom: var(--space-3); color: var(--text-secondary);">
              👨 Father's Information
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" name="father_name" value="${getValue(student, 'father.name')}" placeholder="Father's name">
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" class="form-input" name="father_phone" value="${getValue(student, 'father.phone')}" placeholder="+234-XXX-XXX-XXXX">
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" name="father_email" value="${getValue(student, 'father.email')}" placeholder="father@example.com">
              </div>
              <div class="form-group">
                <label class="form-label">Occupation</label>
                <input type="text" class="form-input" name="father_occupation" value="${getValue(student, 'father.occupation')}" placeholder="Occupation">
              </div>
            </div>
          </div>

          <!-- Mother's Information -->
          <div style="margin-bottom: var(--space-4);">
            <h4 style="font-size: var(--font-size-md); font-weight: var(--font-weight-medium); margin-bottom: var(--space-3); color: var(--text-secondary);">
              👩 Mother's Information
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" name="mother_name" value="${getValue(student, 'mother.name')}" placeholder="Mother's name">
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" class="form-input" name="mother_phone" value="${getValue(student, 'mother.phone')}" placeholder="+234-XXX-XXX-XXXX">
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" name="mother_email" value="${getValue(student, 'mother.email')}" placeholder="mother@example.com">
              </div>
              <div class="form-group">
                <label class="form-label">Occupation</label>
                <input type="text" class="form-input" name="mother_occupation" value="${getValue(student, 'mother.occupation')}" placeholder="Occupation">
              </div>
            </div>
          </div>

          <!-- Guardian's Information (Optional) -->
          <div>
            <h4 style="font-size: var(--font-size-md); font-weight: var(--font-weight-medium); margin-bottom: var(--space-3); color: var(--text-secondary);">
              👤 Guardian's Information (Optional)
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" name="guardian_name" value="${getValue(student, 'guardian.name')}" placeholder="Guardian's name">
              </div>
              <div class="form-group">
                <label class="form-label">Relationship</label>
                <input type="text" class="form-input" name="guardian_relationship" value="${getValue(student, 'guardian.relationship')}" placeholder="e.g., Uncle, Aunt">
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" class="form-input" name="guardian_phone" value="${getValue(student, 'guardian.phone')}" placeholder="+234-XXX-XXX-XXXX">
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" name="guardian_email" value="${getValue(student, 'guardian.email')}" placeholder="guardian@example.com">
              </div>
            </div>
          </div>
        </div>

        <!-- Emergency Contacts Section -->
        <div style="margin-bottom: var(--space-6);">
          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary); border-bottom: 2px solid var(--border-primary); padding-bottom: var(--space-2);">
            🚨 Emergency Contacts
          </h3>
          
          <!-- Emergency Contact 1 -->
          <div style="margin-bottom: var(--space-4);">
            <h4 style="font-size: var(--font-size-md); font-weight: var(--font-weight-medium); margin-bottom: var(--space-3); color: var(--text-secondary);">
              Primary Emergency Contact
            </h4>
            <div class="grid grid-cols-3 gap-4">
              <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" name="emergency1_name" value="${getValue(student, 'emergencyContacts.0.name')}" placeholder="Contact name">
              </div>
              <div class="form-group">
                <label class="form-label">Relationship</label>
                <input type="text" class="form-input" name="emergency1_relationship" value="${getValue(student, 'emergencyContacts.0.relationship')}" placeholder="e.g., Uncle">
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" class="form-input" name="emergency1_phone" value="${getValue(student, 'emergencyContacts.0.phone')}" placeholder="+234-XXX-XXX-XXXX">
              </div>
            </div>
          </div>

          <!-- Emergency Contact 2 -->
          <div>
            <h4 style="font-size: var(--font-size-md); font-weight: var(--font-weight-medium); margin-bottom: var(--space-3); color: var(--text-secondary);">
              Secondary Emergency Contact
            </h4>
            <div class="grid grid-cols-3 gap-4">
              <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" name="emergency2_name" value="${getValue(student, 'emergencyContacts.1.name')}" placeholder="Contact name">
              </div>
              <div class="form-group">
                <label class="form-label">Relationship</label>
                <input type="text" class="form-input" name="emergency2_relationship" value="${getValue(student, 'emergencyContacts.1.relationship')}" placeholder="e.g., Aunt">
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" class="form-input" name="emergency2_phone" value="${getValue(student, 'emergencyContacts.1.phone')}" placeholder="+234-XXX-XXX-XXXX">
              </div>
            </div>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="flex gap-3 mt-6" style="position: sticky; bottom: 0; background: var(--bg-primary); padding: var(--space-4) 0; border-top: 1px solid var(--border-primary);">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">💾 Save Changes</button>
        </div>
      </form>
    `;

    createModal(`Edit Student - ${student.name}`, content, 'large');
  },

  handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Please upload a valid image file (JPG, PNG, or WebP)', 'error');
      event.target.value = '';
      return;
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      showToast('Image size must be less than 2MB', 'error');
      event.target.value = '';
      return;
    }

    // Show loading state
    const preview = document.getElementById('photo-preview');
    preview.innerHTML = '<div style="font-size: var(--font-size-sm); color: var(--text-secondary);">Uploading...</div>';

    // Read and convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Image = e.target.result;

      // Update preview
      preview.innerHTML = `<img src="${base64Image}" style="width: 100%; height: 100%; object-fit: cover;" alt="Preview" />`;

      // Update hidden input
      document.getElementById('photo-data').value = base64Image;

      showToast('Photo uploaded successfully!', 'success');
    };

    reader.onerror = () => {
      showToast('Failed to read image file', 'error');
      preview.innerHTML = '<span>👤</span>';
    };

    reader.readAsDataURL(file);
  },

  async handleEditStudent(event, studentId) {
    event.preventDefault();
    const formData = new FormData(event.target);

    // Validate email and phone fields if provided
    if (typeof validationManager !== 'undefined') {
      const validationData = {};
      const studentEmail = formData.get('email');
      const studentPhone = formData.get('phone');
      const fatherEmail = formData.get('father_email');
      const fatherPhone = formData.get('father_phone');
      const motherEmail = formData.get('mother_email');
      const motherPhone = formData.get('mother_phone');
      const guardianEmail = formData.get('guardian_email');
      const guardianPhone = formData.get('guardian_phone');

      // Collect all emails and phones to validate
      if (studentEmail) validationData.email = studentEmail;
      if (studentPhone) validationData.phone = studentPhone;

      const validation = await validationManager.validateUserInput(validationData, { 
        checkUniqueness: true, 
        excludeTable: 'students',
        excludeId: studentId
      });

      if (!validation.isValid) {
        validation.errors.forEach(err => showToast(err.message, 'error'));
        return;
      }

      // Validate parent/guardian emails separately (format only, not uniqueness)
      const parentEmails = [fatherEmail, motherEmail, guardianEmail].filter(e => e);
      const parentPhones = [fatherPhone, motherPhone, guardianPhone].filter(p => p);
      
      for (const email of parentEmails) {
        if (email && !validationManager.isValidEmail(email)) {
          showToast('Invalid parent/guardian email format', 'error');
          return;
        }
      }
      
      for (const phone of parentPhones) {
        if (phone && !validationManager.isValidPhone(phone)) {
          showToast('Invalid parent/guardian phone format', 'error');
          return;
        }
      }
    }

    // Build emergency contacts array
    const emergencyContacts = [];
    if (formData.get('emergency1_name')) {
      emergencyContacts.push({
        name: formData.get('emergency1_name'),
        relationship: formData.get('emergency1_relationship'),
        phone: formData.get('emergency1_phone')
      });
    }
    if (formData.get('emergency2_name')) {
      emergencyContacts.push({
        name: formData.get('emergency2_name'),
        relationship: formData.get('emergency2_relationship'),
        phone: formData.get('emergency2_phone')
      });
    }

    // Build updated student data
    const updatedData = {
      name: formData.get('name'),
      grade: formData.get('grade'),
      section: formData.get('section'),
      rollNo: formData.get('rollNo'),
      status: formData.get('status'),
      photo: formData.get('photo') || '👤',
      // Convert empty date strings to null to prevent database errors
      dateOfBirth: formData.get('dateOfBirth') || null,
      gender: formData.get('gender'),
      bloodGroup: formData.get('bloodGroup'),
      // Convert empty date strings to null to prevent database errors
      admissionDate: formData.get('admissionDate') || null,
      previousSchool: formData.get('previousSchool'),
      // Convert empty email/phone to null to satisfy database constraints
      email: formData.get('email') || null,
      phone: formData.get('phone') || null,
      address: {
        street: formData.get('address_street'),
        city: formData.get('address_city'),
        state: formData.get('address_state'),
        postalCode: formData.get('address_postalCode')
      },
      father: {
        name: formData.get('father_name'),
        phone: formData.get('father_phone') || null,
        email: formData.get('father_email') || null,
        occupation: formData.get('father_occupation')
      },
      mother: {
        name: formData.get('mother_name'),
        phone: formData.get('mother_phone') || null,
        email: formData.get('mother_email') || null,
        occupation: formData.get('mother_occupation')
      },
      guardian: {
        name: formData.get('guardian_name'),
        relationship: formData.get('guardian_relationship'),
        phone: formData.get('guardian_phone') || null,
        email: formData.get('guardian_email') || null
      },
      emergencyContacts: emergencyContacts
    };

    // Detect grade change before updating
    const existingStudent = dataManager.getById('students', studentId);
    const gradeChanged = existingStudent && existingStudent.grade !== updatedData.grade;

    // Update student
    const result = await dataManager.update('students', studentId, updatedData);
    if (!result) return;
    showToast('Student information updated successfully!', 'success');
    if (typeof writeAuditLog === 'function') writeAuditLog('STUDENT_UPDATED', updatedData.name || studentId, gradeChanged ? `Grade changed to ${updatedData.grade}` : 'Profile updated');

    // Re-apply fee structure if grade changed
    if (gradeChanged && typeof feeManager !== 'undefined' && updatedData.grade) {
      feeManager.applyFeeStructure(studentId, updatedData.grade)
        .then(r => {
          if (r.success) showToast(`Fee structure updated for ${updatedData.grade}`, 'info');
          else console.warn('[StudentDir] Fee re-apply on grade change:', r.error);
        });
    }

    // Close modal and refresh
    document.querySelector('.modal-backdrop')?.remove();
    this.render();
  },


  async archiveStudent(studentId) {
    const student = dataManager.getById('students', studentId);
    if (!student) return;

    const confirmMessage = `Are you sure you want to archive ${student.name}? This will remove them from the active student list, but their data will be preserved and can be restored later.`;

    if (confirm(confirmMessage)) {
      await dataManager.update('students', studentId, { status: 'archived' });
      showToast(`${student.name} has been archived successfully!`, 'success');
      if (typeof writeAuditLog === 'function') writeAuditLog('STUDENT_ARCHIVED', student.name, `Grade: ${student.grade}`);

      // Close modal if open
      const modalBackdrop = document.querySelector('.modal-backdrop');
      if (modalBackdrop) {
        modalBackdrop.remove();
      }

      this.render();
    }
  },

  async restoreStudent(studentId) {
    const student = dataManager.getById('students', studentId);
    if (!student) return;

    await dataManager.update('students', studentId, { status: 'active' });
    showToast(`${student.name} has been restored successfully!`, 'success');
    if (typeof writeAuditLog === 'function') writeAuditLog('STUDENT_RESTORED', student.name, `Grade: ${student.grade}`);
    this.render();
  },

  // ============================================
  // BULK EXPORT OPERATIONS
  // ============================================

  exportToCSV() {
    const students = dataManager.getAll('students');

    if (students.length === 0) {
      showToast('No students to export', 'warning');
      return;
    }

    // Define CSV headers
    const headers = [
      'Name', 'Roll No', 'Grade', 'Section', 'Status', 'Attendance', 'Fees',
      'Date of Birth', 'Gender', 'Blood Group', 'Admission Date', 'Previous School',
      'Email', 'Phone',
      'Street Address', 'City', 'State', 'Postal Code',
      'Father Name', 'Father Phone', 'Father Email', 'Father Occupation',
      'Mother Name', 'Mother Phone', 'Mother Email', 'Mother Occupation',
      'Guardian Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email',
      'Emergency Contact 1 Name', 'Emergency Contact 1 Relationship', 'Emergency Contact 1 Phone',
      'Emergency Contact 2 Name', 'Emergency Contact 2 Relationship', 'Emergency Contact 2 Phone'
    ];

    // Build CSV rows
    const rows = students.map(student => {
      const getValue = (obj, path, defaultValue = '') => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj) || defaultValue;
      };

      return [
        student.name || '',
        student.rollNo || '',
        student.grade || '',
        student.section || '',
        student.status || '',
        student.attendance || '',
        student.fees || '',
        student.dateOfBirth || '',
        student.gender || '',
        student.bloodGroup || '',
        student.admissionDate || '',
        student.previousSchool || '',
        student.email || '',
        student.phone || '',
        getValue(student, 'address.street'),
        getValue(student, 'address.city'),
        getValue(student, 'address.state'),
        getValue(student, 'address.postalCode'),
        getValue(student, 'father.name'),
        getValue(student, 'father.phone'),
        getValue(student, 'father.email'),
        getValue(student, 'father.occupation'),
        getValue(student, 'mother.name'),
        getValue(student, 'mother.phone'),
        getValue(student, 'mother.email'),
        getValue(student, 'mother.occupation'),
        getValue(student, 'guardian.name'),
        getValue(student, 'guardian.relationship'),
        getValue(student, 'guardian.phone'),
        getValue(student, 'guardian.email'),
        getValue(student, 'emergencyContacts.0.name'),
        getValue(student, 'emergencyContacts.0.relationship'),
        getValue(student, 'emergencyContacts.0.phone'),
        getValue(student, 'emergencyContacts.1.name'),
        getValue(student, 'emergencyContacts.1.relationship'),
        getValue(student, 'emergencyContacts.1.phone')
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `students_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${students.length} students to CSV`, 'success');
  },

  async exportToExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Loading Excel library…', 'info');
      try { await window.loadLib('xlsx'); } catch {
        showToast('Failed to load Excel library.', 'error'); return;
      }
    }
    const students = dataManager.getAll('students');

    if (students.length === 0) {
      showToast('No students to export', 'warning');
      return;
    }

    // Check if XLSX library is loaded
    if (typeof XLSX === 'undefined') {
      showToast('Excel export library not loaded. Please refresh the page.', 'error');
      return;
    }

    const getValue = (obj, path, defaultValue = '') => {
      return path.split('.').reduce((acc, part) => acc && acc[part], obj) || defaultValue;
    };

    // Prepare data for Excel
    const excelData = students.map(student => ({
      'Name': student.name || '',
      'Roll No': student.rollNo || '',
      'Grade': student.grade || '',
      'Section': student.section || '',
      'Status': student.status || '',
      'Attendance': student.attendance || '',
      'Fees': student.fees || '',
      'Date of Birth': student.dateOfBirth || '',
      'Gender': student.gender || '',
      'Blood Group': student.bloodGroup || '',
      'Admission Date': student.admissionDate || '',
      'Previous School': student.previousSchool || '',
      'Email': student.email || '',
      'Phone': student.phone || '',
      'Street Address': getValue(student, 'address.street'),
      'City': getValue(student, 'address.city'),
      'State': getValue(student, 'address.state'),
      'Postal Code': getValue(student, 'address.postalCode'),
      'Father Name': getValue(student, 'father.name'),
      'Father Phone': getValue(student, 'father.phone'),
      'Father Email': getValue(student, 'father.email'),
      'Father Occupation': getValue(student, 'father.occupation'),
      'Mother Name': getValue(student, 'mother.name'),
      'Mother Phone': getValue(student, 'mother.phone'),
      'Mother Email': getValue(student, 'mother.email'),
      'Mother Occupation': getValue(student, 'mother.occupation'),
      'Guardian Name': getValue(student, 'guardian.name'),
      'Guardian Relationship': getValue(student, 'guardian.relationship'),
      'Guardian Phone': getValue(student, 'guardian.phone'),
      'Guardian Email': getValue(student, 'guardian.email'),
      'Emergency Contact 1 Name': getValue(student, 'emergencyContacts.0.name'),
      'Emergency Contact 1 Relationship': getValue(student, 'emergencyContacts.0.relationship'),
      'Emergency Contact 1 Phone': getValue(student, 'emergencyContacts.0.phone'),
      'Emergency Contact 2 Name': getValue(student, 'emergencyContacts.1.name'),
      'Emergency Contact 2 Relationship': getValue(student, 'emergencyContacts.1.relationship'),
      'Emergency Contact 2 Phone': getValue(student, 'emergencyContacts.1.phone')
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const colWidths = [
      { wch: 20 }, // Name
      { wch: 10 }, // Roll No
      { wch: 8 },  // Grade
      { wch: 8 },  // Section
      { wch: 10 }, // Status
      { wch: 10 }, // Attendance
      { wch: 10 }, // Fees
      { wch: 12 }, // Date of Birth
      { wch: 10 }, // Gender
      { wch: 12 }, // Blood Group
      { wch: 12 }, // Admission Date
      { wch: 20 }, // Previous School
      { wch: 25 }, // Email
      { wch: 18 }, // Phone
      { wch: 30 }, // Street Address
      { wch: 15 }, // City
      { wch: 15 }, // State
      { wch: 12 }, // Postal Code
      { wch: 20 }, // Father Name
      { wch: 18 }, // Father Phone
      { wch: 25 }, // Father Email
      { wch: 18 }, // Father Occupation
      { wch: 20 }, // Mother Name
      { wch: 18 }, // Mother Phone
      { wch: 25 }, // Mother Email
      { wch: 18 }, // Mother Occupation
      { wch: 20 }, // Guardian Name
      { wch: 15 }, // Guardian Relationship
      { wch: 18 }, // Guardian Phone
      { wch: 25 }, // Guardian Email
      { wch: 20 }, // Emergency Contact 1 Name
      { wch: 15 }, // Emergency Contact 1 Relationship
      { wch: 18 }, // Emergency Contact 1 Phone
      { wch: 20 }, // Emergency Contact 2 Name
      { wch: 15 }, // Emergency Contact 2 Relationship
      { wch: 18 }  // Emergency Contact 2 Phone
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    // Generate Excel file and download
    XLSX.writeFile(wb, `students_export_${new Date().toISOString().split('T')[0]}.xlsx`);

    showToast(`Exported ${students.length} students to Excel`, 'success');
  },

  // ============================================
  // BULK IMPORT OPERATIONS
  // ============================================

  // ── Import constants ──
  _IMPORT_MAX_FILE_SIZE: 5 * 1024 * 1024, // 5 MB
  _IMPORT_MAX_ROWS: 500,
  _IMPORT_ALLOWED_TYPES: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  _IMPORT_ALLOWED_EXTENSIONS: ['.csv', '.xls', '.xlsx'],

  _IMPORT_TEMPLATE_HEADERS: [
    'Name', 'Roll No', 'Grade', 'Section', 'Gender', 'Date of Birth',
    'Email', 'Phone', 'Blood Group', 'Admission Date', 'Previous School',
    'Street Address', 'City', 'State', 'Postal Code',
    'Father Name', 'Father Phone', 'Father Email', 'Father Occupation',
    'Mother Name', 'Mother Phone', 'Mother Email', 'Mother Occupation',
    'Guardian Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email',
    'Emergency Contact 1 Name', 'Emergency Contact 1 Relationship', 'Emergency Contact 1 Phone',
    'Emergency Contact 2 Name', 'Emergency Contact 2 Relationship', 'Emergency Contact 2 Phone'
  ],

  _IMPORT_REQUIRED: ['Name', 'Roll No', 'Grade', 'Section'],

  // ── Download template ──
  async downloadImportTemplate(format) {
    const headers = this._IMPORT_TEMPLATE_HEADERS;
    const sampleRows = [
      ['John Doe', 'STU-2026-001', '10', 'A', 'Male', '2010-05-15',
       'john@example.com', '+234-800-111-2222', 'O+', '2024-09-01', 'Previous Academy',
       '12 Main Street', 'Lagos', 'Lagos', '100001',
       'James Doe', '+234-800-333-4444', 'james@example.com', 'Engineer',
       'Jane Doe', '+234-800-555-6666', 'jane@example.com', 'Doctor',
       '', '', '', '',
       'Uncle Ben', 'Uncle', '+234-800-777-8888',
       '', '', ''],
      ['Sarah Smith', 'STU-2026-002', '10', 'B', 'Female', '2010-08-22',
       'sarah@example.com', '+234-801-222-3333', 'A+', '2024-09-01', '',
       '45 Park Avenue', 'Abuja', 'FCT', '900001',
       'Tom Smith', '+234-801-444-5555', 'tom@example.com', 'Accountant',
       'Lisa Smith', '+234-801-666-7777', 'lisa@example.com', 'Teacher',
       '', '', '', '',
       '', '', '',
       '', '', '']
    ];

    if (format === 'csv') {
      const csvContent = [
        headers.map(h => `"${h}"`).join(','),
        ...sampleRows.map(r => r.map(c => `"${c}"`).join(','))
      ].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      this._downloadBlob(blob, 'student_import_template.csv');
    } else {
      if (typeof XLSX === 'undefined') {
        showToast('Loading Excel library…', 'info');
        try { await window.loadLib('xlsx'); } catch { showToast('Failed to load Excel library.', 'error'); return; }
      }
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
      // Column widths
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));
      XLSX.utils.book_append_sheet(wb, ws, 'Students');

      // Instructions sheet
      const instrData = [
        ['Student Import Template — Instructions'],
        [''],
        ['REQUIRED FIELDS (must not be empty):'],
        ['  - Name: Full name of the student'],
        ['  - Roll No: Unique student ID (e.g. STU-2026-001)'],
        ['  - Grade: Class/grade level (e.g. 10, 11, JSS1)'],
        ['  - Section: Section letter (e.g. A, B, C)'],
        [''],
        ['OPTIONAL FIELDS:'],
        ['  - Gender: Male / Female'],
        ['  - Date of Birth: YYYY-MM-DD format'],
        ['  - Email, Phone, Blood Group, etc.'],
        ['  - Parent/Guardian details'],
        ['  - Emergency contacts (up to 2)'],
        [''],
        ['NOTES:'],
        ['  - Maximum 500 students per import'],
        ['  - Maximum file size: 5 MB'],
        ['  - Duplicate Roll Numbers will be flagged'],
        ['  - Do NOT modify column headers on the Students sheet'],
        ['  - Delete the sample rows before filling in your data'],
      ];
      const instrWs = XLSX.utils.aoa_to_sheet(instrData);
      instrWs['!cols'] = [{ wch: 60 }];
      XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');

      XLSX.writeFile(wb, 'student_import_template.xlsx');
    }
    showToast(`Template downloaded (${format.toUpperCase()})`, 'success');
  },

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  },

  // ── Modal ──
  showImportModal() {
    const content = `
      <div>
        <div style="margin-bottom:var(--space-5);">
          <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:var(--space-2);color:var(--text-primary);">
            📥 Import Students from CSV / Excel
          </h3>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:var(--space-4);">
            Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file to bulk-import students.
            Download a template first to ensure your data is formatted correctly.
          </p>

          <!-- Template download -->
          <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-5);">
            <button type="button" class="btn btn-secondary" style="flex:1;" onclick="studentDirectoryModule.downloadImportTemplate('csv')">
              📄 Download CSV Template
            </button>
            <button type="button" class="btn btn-secondary" style="flex:1;" onclick="studentDirectoryModule.downloadImportTemplate('xlsx')">
              📊 Download Excel Template
            </button>
          </div>

          <!-- Required fields -->
          <div style="background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-5);">
            <h4 style="font-size:0.9rem;font-weight:600;margin-bottom:var(--space-2);color:var(--text-primary);">📋 Required Fields</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:0.85rem;color:var(--text-secondary);">
              <div>• <strong>Name</strong> — full name</div>
              <div>• <strong>Roll No</strong> — unique ID</div>
              <div>• <strong>Grade</strong> — class level</div>
              <div>• <strong>Section</strong> — section letter</div>
            </div>
          </div>

          <!-- Security notes -->
          <div style="background:#fef9f0;border:1px solid #fed7aa;border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-5);font-size:0.82rem;color:#78350f;">
            🔒 <strong>Security:</strong> Only .csv / .xlsx files up to 5 MB accepted. Max 500 rows per import.
            All data is sanitised and validated before import. Duplicate Roll Numbers are flagged.
          </div>

          <!-- File input -->
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-weight:600;">Select File</label>
            <div id="import-drop-zone" style="border:2px dashed var(--border-primary);border-radius:var(--radius-lg);padding:var(--space-6);text-align:center;cursor:pointer;transition:all 0.2s;background:var(--bg-secondary);"
              onclick="document.getElementById('csv-file-input').click()"
              ondragover="event.preventDefault();this.style.borderColor='var(--color-primary)';this.style.background='rgba(19,127,236,0.05)'"
              ondragleave="this.style.borderColor='var(--border-primary)';this.style.background='var(--bg-secondary)'"
              ondrop="event.preventDefault();this.style.borderColor='var(--border-primary)';this.style.background='var(--bg-secondary)';studentDirectoryModule.handleFileSelect({target:{files:event.dataTransfer.files}})">
              <div style="font-size:2rem;margin-bottom:var(--space-2);">📁</div>
              <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Click or drag file here</div>
              <div style="font-size:0.82rem;color:var(--text-tertiary);">Supports .csv, .xls, .xlsx — Max 5 MB</div>
            </div>
            <input type="file" id="csv-file-input" accept=".csv,.xls,.xlsx" style="display:none;" onchange="studentDirectoryModule.handleFileSelect(event)">
          </div>
        </div>

        <!-- File info bar (hidden until file selected) -->
        <div id="import-file-info" style="display:none;"></div>

        <!-- Preview container -->
        <div id="import-preview-container" style="display:none;">
          <h4 style="font-size:0.95rem;font-weight:600;margin-bottom:var(--space-3);color:var(--text-primary);">
            Verification Results
          </h4>
          <div id="import-preview-content"></div>
        </div>

        <div class="flex gap-3" style="margin-top:var(--space-5);">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="button" id="import-confirm-btn" class="btn btn-primary flex-1" style="display:none;" onclick="studentDirectoryModule.confirmImport()">
            ✓ Import Students
          </button>
        </div>
      </div>
    `;
    createModal('Import Students', content);
  },

  // ── File selection & security checks ──
  handleFileSelect(event) {
    const file = (event.target.files || [])[0];
    if (!file) return;

    // Reset previous import state
    this.importData = null;
    const previewContainer = document.getElementById('import-preview-container');
    const confirmBtn = document.getElementById('import-confirm-btn');
    const fileInfo = document.getElementById('import-file-info');
    if (previewContainer) previewContainer.style.display = 'none';
    if (confirmBtn) confirmBtn.style.display = 'none';

    // ── Security: file extension ──
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!this._IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
      this._showImportError(fileInfo, `Rejected: <strong>${this._escapeHtml(file.name)}</strong> — only .csv, .xls, .xlsx files are allowed.`);
      return;
    }

    // ── Security: MIME type (loose check — some browsers report differently) ──
    if (file.type && !this._IMPORT_ALLOWED_TYPES.includes(file.type) && file.type !== 'application/octet-stream' && file.type !== '') {
      this._showImportError(fileInfo, `Rejected: unexpected file type <strong>${this._escapeHtml(file.type)}</strong>. Please upload a valid spreadsheet.`);
      return;
    }

    // ── Security: file size ──
    if (file.size > this._IMPORT_MAX_FILE_SIZE) {
      this._showImportError(fileInfo, `Rejected: file is ${(file.size / 1024 / 1024).toFixed(1)} MB — maximum allowed is 5 MB.`);
      return;
    }

    // ── Security: zero-byte file ──
    if (file.size === 0) {
      this._showImportError(fileInfo, 'Rejected: file is empty.');
      return;
    }

    // Show accepted file info
    if (fileInfo) {
      fileInfo.style.display = 'block';
      fileInfo.innerHTML = `
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:rgba(19,127,236,0.06);border:1px solid rgba(19,127,236,0.2);border-radius:var(--radius-md);margin-bottom:var(--space-4);">
          <span style="font-size:1.3rem;">📄</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._escapeHtml(file.name)}</div>
            <div style="font-size:0.8rem;color:var(--text-tertiary);">${(file.size / 1024).toFixed(1)} KB • ${ext.toUpperCase().slice(1)}</div>
          </div>
          <div class="spinner" style="width:20px;height:20px;" id="import-spinner"></div>
        </div>
      `;
    }

    // Parse based on extension
    if (ext === '.csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          this._parseFromCSVText(e.target.result);
        } catch (err) {
          this._showImportError(fileInfo, `Parse error: ${this._escapeHtml(err.message)}`);
        }
        this._hideSpinner();
      };
      reader.onerror = () => { this._showImportError(fileInfo, 'Failed to read file.'); };
      reader.readAsText(file);
    } else {
      // Excel (.xls / .xlsx) via SheetJS
      if (typeof XLSX === 'undefined') {
        this._showImportError(fileInfo, 'Excel library (SheetJS) is not loaded. Please use CSV format instead.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const sheetName = wb.SheetNames.find(n => n.toLowerCase() !== 'instructions') || wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (rows.length < 2) { this._showImportError(fileInfo, 'Spreadsheet is empty or has only headers.'); this._hideSpinner(); return; }
          const headers = rows[0].map(h => String(h).trim());
          const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
          const parsed = dataRows.map(r => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = String(r[i] ?? '').trim(); });
            return obj;
          });
          this._validateAndPreview(headers, parsed);
        } catch (err) {
          this._showImportError(fileInfo, `Failed to parse Excel file: ${this._escapeHtml(err.message)}`);
        }
        this._hideSpinner();
      };
      reader.onerror = () => { this._showImportError(fileInfo, 'Failed to read file.'); };
      reader.readAsArrayBuffer(file);
    }
  },

  // ── CSV text parser (RFC 4180 aware) ──
  _parseFromCSVText(text) {
    // Strip BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          lines.push(current);
          current = '';
        } else { current += ch; }
      }
    }
    if (current.trim()) lines.push(current);

    if (lines.length < 2) { showToast('CSV is empty or has only headers', 'error'); return; }

    const splitRow = (line) => {
      const cells = [];
      let cell = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
          if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
          else if (c === '"') { q = false; }
          else { cell += c; }
        } else {
          if (c === '"') { q = true; }
          else if (c === ',') { cells.push(cell.trim()); cell = ''; }
          else { cell += c; }
        }
      }
      cells.push(cell.trim());
      return cells;
    };

    const headers = splitRow(lines[0]);
    const dataRows = lines.slice(1)
      .filter(l => l.trim())
      .map(line => {
        const values = splitRow(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
        return obj;
      });

    this._validateAndPreview(headers, dataRows);
  },

  // ── Validation & sanitisation engine ──
  _validateAndPreview(headers, rows) {
    const required = this._IMPORT_REQUIRED;

    // Check required headers exist
    const missingHeaders = required.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      const fileInfo = document.getElementById('import-file-info');
      this._showImportError(fileInfo, `Missing required column${missingHeaders.length > 1 ? 's' : ''}: <strong>${missingHeaders.join(', ')}</strong>. Download the template to see the correct format.`);
      return;
    }

    // Row limit
    if (rows.length > this._IMPORT_MAX_ROWS) {
      const fileInfo = document.getElementById('import-file-info');
      this._showImportError(fileInfo, `Too many rows (${rows.length}). Maximum allowed is ${this._IMPORT_MAX_ROWS} per import.`);
      return;
    }

    // Existing roll numbers for duplicate detection
    const existingStudents = dataManager.getAll('students') || [];
    const existingRollNos = new Set(existingStudents.map(s => (s.rollNo || s.roll_no || '').toString().trim().toUpperCase()));

    const valid = [];
    const invalid = [];
    const seenRollNos = new Set();

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // 1-indexed, +1 for header
      const errors = [];

      // Sanitise every cell value
      for (const key of Object.keys(row)) {
        row[key] = this._sanitize(row[key]);
      }

      // Required field checks
      for (const field of required) {
        if (!row[field]) errors.push(`${field} is required`);
      }

      // Roll No format & duplicate checks
      const rollNo = (row['Roll No'] || '').toUpperCase();
      if (rollNo) {
        if (seenRollNos.has(rollNo)) {
          errors.push(`Duplicate Roll No "${rollNo}" in this file`);
        } else if (existingRollNos.has(rollNo)) {
          errors.push(`Roll No "${rollNo}" already exists in the directory`);
        }
        seenRollNos.add(rollNo);
      }

      // Email format check (optional field)
      const email = row['Email'] || '';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Invalid email format');
      }

      // Date format check (optional)
      const dob = row['Date of Birth'] || '';
      if (dob && isNaN(Date.parse(dob))) {
        errors.push('Invalid Date of Birth format (use YYYY-MM-DD)');
      }
      const admDate = row['Admission Date'] || '';
      if (admDate && isNaN(Date.parse(admDate))) {
        errors.push('Invalid Admission Date format (use YYYY-MM-DD)');
      }

      // Gender normalisation
      if (row['Gender']) {
        const g = row['Gender'].toLowerCase();
        if (['m', 'male'].includes(g)) row['Gender'] = 'Male';
        else if (['f', 'female'].includes(g)) row['Gender'] = 'Female';
      }

      // Name length check
      if (row['Name'] && row['Name'].length > 100) {
        errors.push('Name exceeds 100 characters');
      }

      if (errors.length > 0) {
        invalid.push({ row: rowNum, errors, data: row });
      } else {
        valid.push(row);
      }
    });

    this.importData = { valid, invalid };
    this._showImportPreview(valid, invalid);
  },

  // ── Sanitise a single cell value ──
  _sanitize(value) {
    if (value == null) return '';
    let v = String(value).trim();
    // Strip potential formula injection (=, +, -, @, tab, CR at start)
    v = v.replace(/^[\t\r\n=+\-@]+/, '');
    // Strip HTML tags
    v = v.replace(/<[^>]*>/g, '');
    // Collapse whitespace
    v = v.replace(/\s+/g, ' ');
    // Limit length
    if (v.length > 500) v = v.slice(0, 500);
    return v;
  },

  _escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  _showImportError(container, msg) {
    if (!container) container = document.getElementById('import-file-info');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-md);margin-bottom:var(--space-4);color:#b91c1c;font-size:0.9rem;">
          <span style="font-size:1.2rem;">❌</span>
          <div>${msg}</div>
        </div>
      `;
    }
    showToast('File validation failed', 'error');
  },

  _hideSpinner() {
    const sp = document.getElementById('import-spinner');
    if (sp) sp.remove();
  },

  // ── Preview UI ──
  _showImportPreview(validRows, invalidRows) {
    const previewContainer = document.getElementById('import-preview-container');
    const previewContent = document.getElementById('import-preview-content');
    const confirmBtn = document.getElementById('import-confirm-btn');
    if (!previewContainer || !previewContent) return;

    let html = '';

    // Summary bar
    html += `
      <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-4);">
        <div style="flex:1;padding:var(--space-3);border-radius:var(--radius-md);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:#059669;">${validRows.length}</div>
          <div style="font-size:0.8rem;color:#065f46;">Ready to Import</div>
        </div>
        <div style="flex:1;padding:var(--space-3);border-radius:var(--radius-md);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:#dc2626;">${invalidRows.length}</div>
          <div style="font-size:0.8rem;color:#991b1b;">Will Be Skipped</div>
        </div>
      </div>
    `;

    // Invalid rows detail
    if (invalidRows.length > 0) {
      html += `
        <div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-4);">
          <h5 style="font-weight:600;color:#b91c1c;margin-bottom:var(--space-2);font-size:0.85rem;">⚠️ Issues Found</h5>
          <div style="max-height:180px;overflow-y:auto;font-size:0.82rem;">
            ${invalidRows.map(item => `
              <div style="padding:6px 8px;background:var(--bg-primary);border-radius:var(--radius-sm);margin-bottom:4px;display:flex;gap:8px;">
                <span style="font-weight:600;color:var(--text-secondary);white-space:nowrap;">Row ${item.row}</span>
                <span style="color:#b91c1c;">${item.errors.map(e => this._escapeHtml(e)).join('; ')}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Valid rows preview table
    if (validRows.length > 0) {
      const sample = validRows.slice(0, 8);
      html += `
        <div style="background:var(--bg-secondary);border-radius:var(--radius-md);padding:var(--space-3);">
          <h5 style="font-weight:600;margin-bottom:var(--space-2);color:var(--text-primary);font-size:0.85rem;">
            Preview (${sample.length} of ${validRows.length})
          </h5>
          <div style="overflow-x:auto;">
            <table class="table" style="font-size:0.82rem;">
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Roll No</th><th>Grade</th><th>Section</th><th>Gender</th><th>Email</th>
                </tr>
              </thead>
              <tbody>
                ${sample.map((row, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${this._escapeHtml(row['Name'])}</td>
                    <td>${this._escapeHtml(row['Roll No'])}</td>
                    <td>${this._escapeHtml(row['Grade'])}</td>
                    <td>${this._escapeHtml(row['Section'])}</td>
                    <td>${this._escapeHtml(row['Gender'] || '-')}</td>
                    <td>${this._escapeHtml(row['Email'] || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${validRows.length > 8 ? `<div style="font-size:0.8rem;color:var(--text-tertiary);margin-top:var(--space-2);text-align:center;">...and ${validRows.length - 8} more</div>` : ''}
        </div>
      `;
    }

    previewContent.innerHTML = html;
    previewContainer.style.display = 'block';
    if (confirmBtn && validRows.length > 0) {
      confirmBtn.style.display = 'block';
      confirmBtn.textContent = `✓ Import ${validRows.length} Student${validRows.length > 1 ? 's' : ''}`;
    }
  },

  // ── Confirm & persist ──
  async confirmImport() {
    if (!this.importData || !this.importData.valid || this.importData.valid.length === 0) {
      showToast('No valid data to import', 'error');
      return;
    }

    const validRows = this.importData.valid;
    const confirmBtn = document.getElementById('import-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;display:inline-block;margin-right:6px;"></span> Importing...';
    }

    let importedCount = 0;
    let failedCount = 0;

    for (const row of validRows) {
      try {
        const studentData = {
          name: row['Name'],
          rollNo: row['Roll No'],
          roll_no: row['Roll No'],
          grade: row['Grade'],
          section: row['Section'],
          status: 'active',
          attendance: 100,
          fees: 'pending',
          photo: '',
          dateOfBirth: row['Date of Birth'] || '',
          gender: row['Gender'] || '',
          bloodGroup: row['Blood Group'] || '',
          admissionDate: row['Admission Date'] || new Date().toISOString().split('T')[0],
          previousSchool: row['Previous School'] || '',
          email: row['Email'] || '',
          phone: row['Phone'] || '',
          address: {
            street: row['Street Address'] || '',
            city: row['City'] || '',
            state: row['State'] || '',
            postalCode: row['Postal Code'] || ''
          },
          father: {
            name: row['Father Name'] || '',
            phone: row['Father Phone'] || '',
            email: row['Father Email'] || '',
            occupation: row['Father Occupation'] || ''
          },
          mother: {
            name: row['Mother Name'] || '',
            phone: row['Mother Phone'] || '',
            email: row['Mother Email'] || '',
            occupation: row['Mother Occupation'] || ''
          },
          guardian: {
            name: row['Guardian Name'] || '',
            relationship: row['Guardian Relationship'] || '',
            phone: row['Guardian Phone'] || '',
            email: row['Guardian Email'] || ''
          },
          emergencyContacts: []
        };

        if (row['Emergency Contact 1 Name']) {
          studentData.emergencyContacts.push({
            name: row['Emergency Contact 1 Name'],
            relationship: row['Emergency Contact 1 Relationship'] || '',
            phone: row['Emergency Contact 1 Phone'] || ''
          });
        }
        if (row['Emergency Contact 2 Name']) {
          studentData.emergencyContacts.push({
            name: row['Emergency Contact 2 Name'],
            relationship: row['Emergency Contact 2 Relationship'] || '',
            phone: row['Emergency Contact 2 Phone'] || ''
          });
        }

        const created = await dataManager.create('students', studentData);
        if (created) {
          importedCount++;
          if (typeof subjectManager !== 'undefined' && created.id) {
            subjectManager.autoEnroll(created.id, studentData.name, studentData.grade, studentData.section)
              .catch(e => console.warn('[Import] Subject auto-enroll failed:', e.message));
          }
        } else { failedCount++; }
      } catch (err) {
        console.error(`[Import] Failed to create student row:`, err);
        failedCount++;
      }
    }

    // Small delay to let async Supabase writes start
    await new Promise(r => setTimeout(r, 300));

    this.importData = null;

    // Close modal
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) backdrop.remove();

    // Refresh directory view
    await dataManager.refresh('students');
    const container = document.getElementById('main-content');
    if (container && typeof this.init === 'function') {
      await this.init(container);
    }

    if (failedCount > 0) {
      showToast(`Imported ${importedCount} student${importedCount !== 1 ? 's' : ''}. ${failedCount} failed — check console.`, 'warning');
    } else {
      showToast(`Successfully imported ${importedCount} student${importedCount !== 1 ? 's' : ''}!`, 'success');
    }
  }
};

// Register module globally
window.studentDirectoryModule = studentDirectoryModule;
