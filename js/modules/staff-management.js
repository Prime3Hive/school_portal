// ============================================
// STAFF MANAGEMENT MODULE
// Full CRUD for non-teaching school staff
// ============================================

const staffManagementModule = {
  currentFilter: 'all',
  searchQuery: '',
  currentPage: 1,
  itemsPerPage: 10,

  async init(container) {
    if (!container) {
      container = document.getElementById('main-content');
    }
    this.container = container;
    this.currentPage = 1;
    await dataManager.waitForReady();
    container.innerHTML = this.renderPage();
    this._onDataChange = (e) => {
      if (['staff'].includes(e.detail.collection)) {
        this.container.innerHTML = this.renderPage();
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  getAllStaff() {
    return dataManager.getAll('staff') || [];
  },

  getFilteredStaff() {
    let staff = this.getAllStaff();

    if (this.currentFilter !== 'all') {
      staff = staff.filter(s =>
        s.status === this.currentFilter ||
        s.department === this.currentFilter ||
        s.type === this.currentFilter
      );
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      staff = staff.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.role || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.department || '').toLowerCase().includes(q) ||
        (s.position || '').toLowerCase().includes(q) ||
        (s.type || '').toLowerCase().includes(q)
      );
    }

    return staff;
  },

  renderPage() {
    const allStaff = this.getAllStaff();
    const filtered = this.getFilteredStaff();
    const total = filtered.length;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + this.itemsPerPage);
    const totalPages = Math.ceil(total / this.itemsPerPage);

    const active = allStaff.filter(s => (s.status || 'active') === 'active').length;
    const inactive = allStaff.filter(s => s.status && s.status !== 'active').length;
    const teaching = allStaff.filter(s => s.type === 'teaching').length;
    const nonTeaching = allStaff.filter(s => s.type !== 'teaching').length;
    const departments = [...new Set(allStaff.map(s => s.department).filter(Boolean))];

    return `
      <div class="module-container animate-fadeIn">
        <div class="module-header">
          <div>
            <h1 class="module-title">👨‍💼 Staff Management</h1>
            <p class="module-subtitle">Manage all school staff records and information</p>
          </div>
          <button class="btn btn-primary" onclick="staffManagementModule.showAddStaffModal()">
            ➕ Add Staff Member
          </button>
        </div>

        <!-- Stats Row -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
          ${createStatCard('Total Staff', allStaff.length, null, 'primary')}
          ${createStatCard('Active', active, null, 'success')}
          ${createStatCard('Teaching', teaching, null, 'info')}
          ${createStatCard('Non-Teaching', nonTeaching, null, 'warning')}
        </div>

        <!-- Filters and Search -->
        <div class="card" style="margin-bottom: var(--space-6);">
          <div style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
              <select class="form-select" style="min-width: 160px;"
                onchange="staffManagementModule.currentFilter = this.value; staffManagementModule.currentPage = 1; staffManagementModule.refresh()">
                <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>All Staff</option>
                <option value="active" ${this.currentFilter === 'active' ? 'selected' : ''}>Active Only</option>
                <option value="inactive" ${this.currentFilter === 'inactive' ? 'selected' : ''}>Inactive Only</option>
                <option value="teaching" ${this.currentFilter === 'teaching' ? 'selected' : ''}>Teaching</option>
                <option value="non-teaching" ${this.currentFilter === 'non-teaching' ? 'selected' : ''}>Non-Teaching</option>
                ${departments.map(d => `<option value="${d}" ${this.currentFilter === d ? 'selected' : ''}>📂 ${d}</option>`).join('')}
              </select>
            </div>
            <input type="text" class="form-input" placeholder="🔍 Search by name, role, or department..."
              style="max-width: 360px; flex: 1;"
              value="${this.searchQuery}"
              oninput="staffManagementModule.searchQuery = this.value; staffManagementModule.currentPage = 1; staffManagementModule.refresh()">
          </div>
        </div>

        <!-- Staff Table -->
        <div class="card">
          <div style="margin-bottom: var(--space-3); font-size: var(--font-size-sm); color: var(--text-secondary);">
            Showing ${Math.min(startIndex + 1, total)}–${Math.min(startIndex + this.itemsPerPage, total)} of ${total} staff members
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Role / Position</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${paginated.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align: center; padding: var(--space-12); color: var(--text-secondary);">
                      <div style="font-size: 3rem; margin-bottom: var(--space-3);">👨‍💼</div>
                      <div style="font-weight: 600; margin-bottom: var(--space-2);">No staff members found</div>
                      <div>Try adjusting your search or <button class="btn btn-primary btn-sm" onclick="staffManagementModule.showAddStaffModal()">add a new staff member</button></div>
                    </td>
                  </tr>
                ` : paginated.map(s => this.renderRow(s)).join('')}
              </tbody>
            </table>
          </div>

          ${totalPages > 1 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border-primary);">
              <button class="btn btn-ghost btn-sm" ${this.currentPage <= 1 ? 'disabled' : ''}
                onclick="staffManagementModule.currentPage--; staffManagementModule.refresh()">← Previous</button>
              <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                Page ${this.currentPage} of ${totalPages}
              </span>
              <button class="btn btn-ghost btn-sm" ${this.currentPage >= totalPages ? 'disabled' : ''}
                onclick="staffManagementModule.currentPage++; staffManagementModule.refresh()">Next →</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  renderRow(s) {
    const statusColors = { active: 'success', inactive: 'secondary', suspended: 'danger' };
    const typeColors = { teaching: 'primary', 'non-teaching': 'info', admin: 'warning' };
    const status = s.status || 'active';
    const type = s.type || 'non-teaching';

    return `
      <tr>
        <td><code style="font-size: 0.75rem;">${s.id || 'N/A'}</code></td>
        <td>
          <div style="display: flex; align-items: center; gap: var(--space-3);">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--gradient-primary);
              display: flex; align-items: center; justify-content: center; color: white; font-weight: 700;">
              ${(s.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>${s.name || 'Unknown'}</strong>
              ${s.email ? `<div style="font-size: var(--font-size-xs); color: var(--text-secondary);">${s.email}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="color: var(--text-secondary);">${s.role || s.position || 'N/A'}</td>
        <td>${createBadge(type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' '), typeColors[type] || 'secondary')}</td>
        <td style="color: var(--text-secondary);">
          ${s.phone || s.email || 'N/A'}
        </td>
        <td>${createBadge(status.charAt(0).toUpperCase() + status.slice(1), statusColors[status] || 'secondary')}</td>
        <td>
          <div style="display: flex; gap: var(--space-1);">
            <button class="btn-icon" title="View" onclick="staffManagementModule.viewStaff('${s.id}')">👁️</button>
            <button class="btn-icon" title="Edit" onclick="staffManagementModule.editStaff('${s.id}')">✏️</button>
            <button class="btn-icon" title="${status === 'active' ? 'Deactivate' : 'Activate'}"
              onclick="staffManagementModule.toggleStatus('${s.id}')">
              ${status === 'active' ? '🔒' : '🔓'}
            </button>
            <button class="btn-icon" title="Delete" onclick="staffManagementModule.deleteStaff('${s.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  },

  refresh() {
    if (this.container) {
      this.container.innerHTML = this.renderPage();
    } else {
      const c = document.getElementById('main-content');
      if (c) {
        this.container = c;
        c.innerHTML = this.renderPage();
      }
    }
  },

  showAddStaffModal() {
    const content = `
      <form id="addStaffForm" onsubmit="staffManagementModule.addStaff(event)">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" id="sName" class="form-input" required placeholder="e.g. John Doe">
          </div>
          <div class="form-group">
            <label class="form-label">Role / Position *</label>
            <input type="text" id="sRole" class="form-input" required placeholder="e.g. Security Guard">
          </div>
          <div class="form-group">
            <label class="form-label">Staff Type *</label>
            <select id="sType" class="form-select" required>
              <option value="">Select Type</option>
              <option value="teaching">Teaching</option>
              <option value="non-teaching">Non-Teaching</option>
              <option value="admin">Administrative</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Department</label>
            <select id="sDept" class="form-select">
              <option value="">Select Department</option>
              <option>Administration</option>
              <option>Maintenance</option>
              <option>Security</option>
              <option>Kitchen & Cafeteria</option>
              <option>Library</option>
              <option>IT Support</option>
              <option>Finance</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="sEmail" class="form-input" placeholder="staff@school.com">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="tel" id="sPhone" class="form-input" placeholder="+234-xxx-xxx-xxxx">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input type="text" id="sAddress" class="form-input" placeholder="Home address">
        </div>
      </form>
    `;

    createModal('➕ Add New Staff Member', content, [
      { label: 'Cancel', class: 'btn-ghost', onclick: 'closeModal(this)' },
      { label: '➕ Add Staff', class: 'btn-primary', onclick: "document.getElementById('addStaffForm').requestSubmit()" }
    ]);
  },

  async addStaff(event) {
    event.preventDefault();
    const data = {
      name: document.getElementById('sName').value.trim(),
      role: document.getElementById('sRole').value.trim(),
      type: document.getElementById('sType').value,
      department: document.getElementById('sDept').value,
      email: document.getElementById('sEmail').value.trim(),
      phone: document.getElementById('sPhone').value.trim(),
      address: document.getElementById('sAddress').value.trim(),
      status: 'active',
      subjects: [],
      classes: [],
      photo: '👤'
    };

    // Validate email and phone if provided
    if (typeof validationManager !== 'undefined' && (data.email || data.phone)) {
      const validationData = {};
      if (data.email) validationData.email = data.email;
      if (data.phone) validationData.phone = data.phone;

      const validation = await validationManager.validateUserInput(validationData, { 
        checkUniqueness: true, 
        excludeTable: 'staff' 
      });

      if (!validation.isValid) {
        validation.errors.forEach(err => showToast(err.message, 'error'));
        return;
      }
    }

    // Close modal first so the credential modal renders cleanly on top
    document.querySelector('.modal-backdrop')?.remove();

    if (data.email) {
      // Create portal account + staff record via edge function
      const role = data.type === 'teaching' ? 'teacher' : 'staff';
      let result;
      try {
        result = await authManager.createInvitation({
          email: data.email,
          role: role,
          fullName: data.name,
          department: data.department || '',
          expiryDays: 14
        });
      } catch (err) {
        result = { success: false, error: err.message };
      }

      if (result && result.success) {
        writeAuditLog('ADD_STAFF', data.email, `Name: ${data.name} | Role: ${role} | Portal ID: ${result.schoolId}`);
        showToast(`"${data.name}" added successfully!`, 'success');
        // Show credential modal — same flow as the invite/add-user path
        const roleLabel = data.type === 'teaching' ? 'Teacher' : 'Staff';
        if (typeof showCredentialModal === 'function') {
          setTimeout(() => showCredentialModal(
            data.name,
            data.email,
            roleLabel,
            result.schoolId,
            result.password,
            result.emailSent,
            result.emailMessage
          ), 300);
        } else {
          // Fallback: plain alert with credentials
          alert(`Portal credentials for ${data.name}:\n\nLogin ID : ${result.schoolId}\nPassword : ${result.password}\n\nPlease share these with the staff member.`);
        }
      } else {
        // Edge function failed — create staff record manually as fallback
        await dataManager.create('staff', data);
        showToast(`"${data.name}" added to staff but portal account could not be created: ${result?.error || 'Unknown error'}`, 'warning');
      }
    } else {
      // No email — create staff record without portal account
      await dataManager.create('staff', data);
      showToast(`"${data.name}" added to staff! (No portal account — email required)`, 'info');
    }

    this.refresh();
  },

  viewStaff(id) {
    const s = this.getAllStaff().find(m => m.id === id);
    if (!s) return;

    const rows = {
      'Full Name': s.name, 'Role': s.role || s.position || 'N/A',
      'Type': s.type || 'N/A', 'Department': s.department || 'N/A',
      'Email': s.email || 'N/A', 'Phone': s.phone || 'N/A',
      'Address': s.address || 'N/A', 'Status': s.status || 'active'
    };

    const content = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
        ${Object.entries(rows).map(([k, v]) => `
          <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
            <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">${k}</div>
            <strong>${v}</strong>
          </div>
        `).join('')}
      </div>
    `;

    createModal(`👁️ ${s.name}`, content, [
      { label: 'Close', class: 'btn-ghost', onclick: 'closeModal(this)' },
      { label: '✏️ Edit', class: 'btn-primary', onclick: `closeModal(this); staffManagementModule.editStaff('${id}')` }
    ]);
  },

  editStaff(id) {
    const s = this.getAllStaff().find(m => m.id === id);
    if (!s) return;

    const content = `
      <form id="editStaffForm" onsubmit="staffManagementModule.saveEdit(event, '${id}')">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="eName" class="form-input" value="${s.name || ''}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Role / Position</label>
            <input type="text" id="eRole" class="form-input" value="${s.role || s.position || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Department</label>
            <input type="text" id="eDept" class="form-input" value="${s.department || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="eEmail" class="form-input" value="${s.email || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="tel" id="ePhone" class="form-input" value="${s.phone || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input type="text" id="eAddress" class="form-input" value="${s.address || ''}">
        </div>
      </form>
    `;

    createModal(`✏️ Edit — ${s.name}`, content, [
      { label: 'Cancel', class: 'btn-ghost', onclick: 'closeModal(this)' },
      { label: '💾 Save Changes', class: 'btn-primary', onclick: "document.getElementById('editStaffForm').requestSubmit()" }
    ]);
  },

  async saveEdit(event, id) {
    event.preventDefault();
    
    const email = document.getElementById('eEmail').value.trim();
    const phone = document.getElementById('ePhone').value.trim();

    // Validate email and phone if provided
    if (typeof validationManager !== 'undefined' && (email || phone)) {
      const validationData = {};
      if (email) validationData.email = email;
      if (phone) validationData.phone = phone;

      const validation = await validationManager.validateUserInput(validationData, { 
        checkUniqueness: true, 
        excludeTable: 'staff',
        excludeId: id
      });

      if (!validation.isValid) {
        validation.errors.forEach(err => showToast(err.message, 'error'));
        return;
      }
    }

    await dataManager.update('staff', id, {
      name: document.getElementById('eName').value.trim(),
      role: document.getElementById('eRole').value.trim(),
      position: document.getElementById('eRole').value.trim(),
      department: document.getElementById('eDept').value.trim(),
      email: email,
      phone: phone,
      address: document.getElementById('eAddress').value.trim()
    });
    document.querySelector('.modal-backdrop')?.remove();
    showToast('Staff record updated!', 'success');
    this.refresh();
  },

  async toggleStatus(id) {
    const s = this.getAllStaff().find(m => m.id === id);
    if (!s) return;
    const newStatus = (s.status || 'active') === 'active' ? 'inactive' : 'active';
    await dataManager.update('staff', id, { status: newStatus });
    showToast(`Staff ${newStatus === 'active' ? 'activated' : 'deactivated'}`, newStatus === 'active' ? 'success' : 'warning');
    this.refresh();
  },

  async deleteStaff(id) {
    const s = this.getAllStaff().find(m => m.id === id);
    if (!s) return;
    if (confirm(`Permanently delete "${s.name}"? This cannot be undone.`)) {
      await dataManager.delete('staff', id);
      showToast('Staff member deleted.', 'success');
      this.refresh();
    }
  }
};

window.staffManagementModule = staffManagementModule;
