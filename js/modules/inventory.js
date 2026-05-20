// ============================================
// INVENTORY MANAGEMENT MODULE
// Stages 1-4: bug fixes, search, overdue,
// restock, procurement, CSV import, stock count
// ============================================

const inventoryModule = {
  _container: null,
  _tab: 'registry',
  _filter: 'all',
  _search: '',
  _historyFilters: null,

  CATEGORIES: [
    { value: 'textbooks',     label: 'Textbooks',     icon: '📚' },
    { value: 'furniture',     label: 'Furniture',      icon: '🪑' },
    { value: 'lab-equipment', label: 'Lab Equipment',  icon: '🔬' },
    { value: 'electronics',   label: 'Electronics',    icon: '💻' },
    { value: 'stationery',    label: 'Stationery',     icon: '✏️' },
    { value: 'sports',        label: 'Sports',         icon: '⚽' },
    { value: 'other',         label: 'Other',          icon: '📦' },
  ],

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  },

  _categoryOptions(selected = '') {
    return this.CATEGORIES.map(c =>
      `<option value="${c.value}" ${selected === c.value ? 'selected' : ''}>${c.icon} ${c.label}</option>`
    ).join('');
  },

  async init(container) {
    this._container = container;
    this._tab = 'registry';
    this._filter = 'all';
    this._search = '';
    this._historyFilters = null;
    await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['inventory', 'inventoryRequests', 'inventoryAssignments', 'inventoryHistory'].includes(e.detail?.collection)) {
        this.render();
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  render() {
    if (!this._container) return;
    const inventory    = dataManager.getAll('inventory');
    const requests     = dataManager.getAll('inventoryRequests');
    const assignments  = dataManager.getAll('inventoryAssignments');
    const now          = new Date();

    const pendingReqs   = requests.filter(r => r.status === 'pending').length;
    const activeAssign  = assignments.filter(a => a.status === 'active').length;
    const overdueAssign = assignments.filter(a => a.status === 'active' && a.expectedReturnDate && new Date(a.expectedReturnDate) < now).length;
    const lowStockCount = inventory.filter(i => (i.quantity - i.allocated) <= i.minStock).length;
    const totalValue    = inventory.reduce((sum, i) => sum + ((i.unitCost || 0) * i.quantity), 0);

    this._container.innerHTML = `
      <div class="animate-fadeIn">
        <div class="flex justify-between items-start mb-6" style="flex-wrap:wrap;gap:var(--space-3);">
          <div>
            <h2 class="page-title" style="margin-bottom:var(--space-2);">Inventory Management</h2>
            <p class="page-description">Track assets, manage requests and assignments</p>
          </div>
          <div class="flex gap-3" style="flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="inventoryModule.importCSV()">⬆️ Import CSV</button>
            <button class="btn btn-ghost btn-sm" onclick="inventoryModule.exportInventory()">📊 Export</button>
            <button class="btn btn-secondary" onclick="inventoryModule.showRequestModal()">📝 Request Item</button>
            <button class="btn btn-primary" onclick="inventoryModule.showAssignModal()">📤 Assign Item</button>
            <button class="btn btn-success" onclick="inventoryModule.showAddItemModal()">➕ Add Item</button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          ${this._statCard('Total Items', inventory.length, 'primary', 'registry')}
          ${this._statCard('Low Stock', lowStockCount, lowStockCount > 0 ? 'danger' : 'success', 'registry', 'low-stock')}
          ${this._statCard('Pending Requests', pendingReqs, pendingReqs > 0 ? 'warning' : 'primary', 'requests')}
          ${this._statCard(overdueAssign > 0 ? `Active / ${overdueAssign} Overdue` : 'Active Assignments', activeAssign, overdueAssign > 0 ? 'danger' : 'info', 'assignments')}
          ${this._statCard('Total Value', '₦' + totalValue.toLocaleString(), 'success', null)}
        </div>

        <div style="border-bottom:1px solid var(--border-primary);margin-bottom:var(--space-6);">
          <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;">
            ${this._tabBtn('registry', '📋 Registry')}
            ${this._tabBtn('requests', `📝 Requests${pendingReqs > 0 ? ` <span style="background:var(--color-danger);color:white;padding:1px 7px;border-radius:999px;font-size:0.7rem;">${pendingReqs}</span>` : ''}`)}
            ${this._tabBtn('assignments', `👥 Assignments${overdueAssign > 0 ? ` <span style="background:var(--color-danger);color:white;padding:1px 7px;border-radius:999px;font-size:0.7rem;">${overdueAssign}</span>` : ''}`)}
            ${this._tabBtn('history', '📊 History')}
          </div>
        </div>

        <div id="inv-tab-content">${this.renderTabContent()}</div>
      </div>
    `;
  },

  _tabBtn(tab, label) {
    return `<button class="profile-tab ${this._tab === tab ? 'active' : ''}" onclick="inventoryModule.switchTab('${tab}')">${label}</button>`;
  },

  _statCard(label, value, type, tab, subFilter) {
    const click  = tab ? `onclick="inventoryModule._goToTab('${tab}','${subFilter || ''}')"` : '';
    const hover  = tab ? `onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''"` : '';
    return `<div class="stat-card ${type}" style="cursor:${tab ? 'pointer' : 'default'};transition:transform 0.2s;" ${click} ${hover}>
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${tab ? `<div style="font-size:0.7rem;color:var(--text-tertiary);margin-top:4px;">Click to view →</div>` : ''}
    </div>`;
  },

  _goToTab(tab, subFilter) {
    this._tab = tab;
    if (subFilter) this._filter = subFilter;
    this.render();
  },

  renderTabContent() {
    switch (this._tab) {
      case 'registry':    return this.renderRegistryTab();
      case 'requests':    return this.renderRequestsTab();
      case 'assignments': return this.renderAssignmentsTab();
      case 'history':     return this.renderHistoryTab();
      default:            return this.renderRegistryTab();
    }
  },

  switchTab(tab) {
    this._tab = tab;
    this.render();
  },

  // ── REGISTRY TAB ──────────────────────────────────────────────────────────

  renderRegistryTab() {
    const all = dataManager.getAll('inventory');
    const e   = this._esc.bind(this);
    const now = new Date();

    let items = all;
    if (this._filter === 'low-stock') {
      items = all.filter(i => (i.quantity - i.allocated) <= i.minStock);
    } else if (this._filter !== 'all') {
      items = all.filter(i => i.category === this._filter);
    }
    if (this._search) {
      const q = this._search.toLowerCase();
      items = items.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.location || '').toLowerCase().includes(q) ||
        (i.supplier || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );
    }

    const chipDefs = [{ value: 'all', label: 'All', icon: '📋' }, { value: 'low-stock', label: 'Low Stock', icon: '⚠️' }, ...this.CATEGORIES];

    return `
      <div class="card mb-4">
        <div class="flex justify-between items-center mb-4" style="flex-wrap:wrap;gap:var(--space-3);">
          <h3 style="margin:0;font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);">Items Registry</h3>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="inventoryModule.showStockCountModal()">🔢 Stock Count</button>
            <button class="btn btn-success btn-sm" onclick="inventoryModule.showAddItemModal()">➕ Add Item</button>
          </div>
        </div>

        <div class="flex gap-3 mb-4" style="flex-wrap:wrap;">
          <input type="text" class="form-input" placeholder="Search name, location, supplier…"
            value="${e(this._search)}" style="flex:1;min-width:200px;"
            oninput="inventoryModule._search=this.value;document.getElementById('inv-tab-content').innerHTML=inventoryModule.renderRegistryTab()">
          ${this._search || this._filter !== 'all' ? `<button class="btn btn-ghost btn-sm" onclick="inventoryModule._search='';inventoryModule._filter='all';inventoryModule.render()">✕ Clear</button>` : ''}
        </div>

        <div class="flex flex-wrap gap-2">
          ${chipDefs.map(c => `
            <button class="btn btn-ghost btn-sm ${this._filter === c.value ? 'active' : ''}"
              onclick="inventoryModule._filter='${c.value}';document.getElementById('inv-tab-content').innerHTML=inventoryModule.renderRegistryTab()">
              ${c.icon} ${c.label}
            </button>`).join('')}
        </div>
      </div>

      ${items.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <h3 class="empty-state-title">No Items Found</h3>
          <p class="empty-state-description">${this._search || this._filter !== 'all' ? 'Try adjusting your search or filter.' : 'Add items to start tracking inventory.'}</p>
          ${!this._search && this._filter === 'all' ? `<button class="btn btn-primary mt-4" onclick="inventoryModule.showAddItemModal()">➕ Add First Item</button>` : ''}
        </div>
      ` : `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Total Qty</th>
                <th>Allocated</th>
                <th>Available</th>
                <th>Min Stock</th>
                <th>Unit Cost</th>
                <th>Total Value</th>
                <th>Location</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => {
                const avail = item.quantity - item.allocated;
                const isLow = avail <= item.minStock;
                const cat   = this.CATEGORIES.find(c => c.value === item.category);
                return `
                  <tr style="${isLow ? 'background:rgba(239,68,68,0.03)' : ''}">
                    <td style="font-weight:var(--font-weight-semibold);">${e(item.name)}</td>
                    <td>${createBadge((cat ? cat.icon + ' ' : '') + (cat ? cat.label : e(item.category)), 'info')}</td>
                    <td>${item.quantity} ${e(item.unit)}</td>
                    <td>${item.allocated} ${e(item.unit)}</td>
                    <td style="color:${isLow ? 'var(--color-danger)' : 'var(--color-success)'};font-weight:var(--font-weight-semibold);">${avail} ${e(item.unit)}</td>
                    <td>${item.minStock} ${e(item.unit)}</td>
                    <td>${formatCurrency(item.unitCost || 0)}</td>
                    <td style="font-weight:var(--font-weight-semibold);">${formatCurrency((item.unitCost || 0) * item.quantity)}</td>
                    <td>${e(item.location || '—')}</td>
                    <td>${e(item.supplier || '—')}</td>
                    <td>${createBadge(isLow ? 'Low Stock' : 'In Stock', isLow ? 'danger' : 'success')}</td>
                    <td>
                      <div class="table-actions">
                        <button class="table-action-btn" onclick="inventoryModule.viewItemDetails('${item.id}')" title="View Details">👁️</button>
                        <button class="table-action-btn" onclick="inventoryModule.showRestockModal('${item.id}')" title="Restock / Adjust">📥</button>
                        <button class="table-action-btn" onclick="inventoryModule.showEditItemModal('${item.id}')" title="Edit">✏️</button>
                        <button class="table-action-btn" onclick="inventoryModule.deleteItem('${item.id}')" title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:var(--space-3);font-size:0.8rem;color:var(--text-tertiary);">
          Showing ${items.length} of ${all.length} items
        </div>
      `}
    `;
  },

  // ── REQUESTS TAB ──────────────────────────────────────────────────────────

  renderRequestsTab() {
    const requests = dataManager.getAll('inventoryRequests');
    const pending  = requests.filter(r => r.status === 'pending');
    const approved = requests.filter(r => r.status === 'approved');
    const fulfilled= requests.filter(r => r.status === 'fulfilled');
    const rejected = requests.filter(r => r.status === 'rejected');
    return `<div>
      ${this._reqSection('Pending Requests', pending)}
      ${this._reqSection('Approved — Awaiting Fulfillment', approved)}
      ${fulfilled.length > 0 ? this._reqSection('Fulfilled', fulfilled) : ''}
      ${rejected.length > 0 ? this._reqSection('Rejected', rejected) : ''}
    </div>`;
  },

  _reqSection(title, items) {
    return `
      <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4);color:var(--text-primary);">${title} (${items.length})</h3>
      ${items.length === 0
        ? `<div class="card mb-6" style="text-align:center;padding:var(--space-8);"><p style="color:var(--text-secondary);">None</p></div>`
        : `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">${items.map(r => this.renderRequestCard(r)).join('')}</div>`
      }
    `;
  },

  renderRequestCard(req) {
    const e = this._esc.bind(this);
    const statusColors   = { pending: 'warning', approved: 'success', rejected: 'danger', fulfilled: 'primary' };
    const priorityColors = { urgent: 'danger', high: 'warning', medium: 'info', low: 'success' };
    const cat     = this.CATEGORIES.find(c => c.value === req.category);
    const existing = dataManager.getAll('inventory').find(i => (i.name || '').toLowerCase() === (req.itemName || '').toLowerCase());

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:var(--space-4);">
          <div>
            <h4 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);color:var(--text-primary);margin-bottom:var(--space-2);">${e(req.itemName)}</h4>
            <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
              ${createBadge(req.status, statusColors[req.status] || 'info')}
              ${createBadge(req.priority || 'medium', priorityColors[req.priority] || 'info')}
              ${createBadge((cat ? cat.icon + ' ' : '') + (cat ? cat.label : e(req.category)), 'info')}
              ${existing ? `<span style="font-size:0.72rem;color:#d97706;background:rgba(217,119,6,0.1);padding:2px 8px;border-radius:999px;border:1px solid rgba(217,119,6,0.3);">⚠️ Already in stock</span>` : ''}
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-3);">
          <div><p style="color:var(--text-secondary);font-size:var(--font-size-sm);">Quantity</p><p style="font-weight:var(--font-weight-semibold);">${req.quantity} units</p></div>
          <div><p style="color:var(--text-secondary);font-size:var(--font-size-sm);">Est. Cost</p><p style="font-weight:var(--font-weight-semibold);">${formatCurrency(req.estimatedCost)}</p></div>
          ${req.supplier ? `<div style="grid-column:1/-1;"><p style="color:var(--text-secondary);font-size:var(--font-size-sm);">Supplier</p><p style="font-weight:var(--font-weight-semibold);">${e(req.supplier)}</p></div>` : ''}
        </div>

        <div style="margin-bottom:var(--space-3);">
          <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-1);">Justification</p>
          <p style="color:var(--text-primary);font-size:var(--font-size-sm);">${e(req.justification)}</p>
        </div>

        <p style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-bottom:var(--space-3);">
          Requested by ${e(req.requestedByName)} · ${timeAgo(req.requestedDate)}
          ${req.reviewedBy ? ` · Reviewed ${timeAgo(req.reviewedDate)}${req.reviewNotes ? ` · ${e(req.reviewNotes)}` : ''}` : ''}
        </p>

        ${req.status === 'pending' ? `
          <div style="display:flex;gap:var(--space-2);">
            <button class="btn btn-primary btn-sm" onclick="inventoryModule.approveRequest('${req.id}')" style="flex:1;">✓ Approve</button>
            <button class="btn btn-ghost btn-sm" onclick="inventoryModule.editRequest('${req.id}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="inventoryModule.rejectRequest('${req.id}')">✗ Reject</button>
          </div>
        ` : req.status === 'approved' ? `
          <button class="btn btn-success btn-sm" style="width:100%;" onclick="inventoryModule.fulfillRequest('${req.id}')">📥 Add to Inventory</button>
        ` : ''}
      </div>
    `;
  },

  // ── ASSIGNMENTS TAB ───────────────────────────────────────────────────────

  renderAssignmentsTab() {
    const assignments = dataManager.getAll('inventoryAssignments');
    const now      = new Date();
    const active   = assignments.filter(a => a.status === 'active');
    const overdue  = active.filter(a => a.expectedReturnDate && new Date(a.expectedReturnDate) < now);
    const onTime   = active.filter(a => !a.expectedReturnDate || new Date(a.expectedReturnDate) >= now);
    const returned = assignments.filter(a => a.status === 'returned');

    return `<div>
      ${overdue.length > 0 ? `
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-lg);padding:var(--space-4);margin-bottom:var(--space-6);display:flex;gap:var(--space-3);align-items:center;">
          <span style="font-size:1.5rem;">⚠️</span>
          <div>
            <strong style="color:#dc2626;">${overdue.length} overdue assignment${overdue.length > 1 ? 's' : ''}</strong>
            <p style="margin:4px 0 0;font-size:0.85rem;color:var(--text-secondary);">These items are past their expected return date.</p>
          </div>
        </div>
        <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4);color:#dc2626;">⚠️ Overdue (${overdue.length})</h3>
        <div class="table-container mb-8">${this.renderAssignmentsTable(overdue)}</div>
      ` : ''}

      <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4);color:var(--text-primary);">Active Assignments (${onTime.length})</h3>
      ${onTime.length === 0
        ? `<div class="card mb-6" style="text-align:center;padding:var(--space-8);"><p style="color:var(--text-secondary);">No active assignments</p></div>`
        : `<div class="table-container mb-8">${this.renderAssignmentsTable(onTime)}</div>`
      }

      ${returned.length > 0 ? `
        <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4);color:var(--text-primary);">Returned (${returned.length})</h3>
        <div class="table-container">${this.renderAssignmentsTable(returned)}</div>
      ` : ''}
    </div>`;
  },

  renderAssignmentsTable(assignments) {
    const e   = this._esc.bind(this);
    const now = new Date();
    return `
      <table class="table">
        <thead>
          <tr>
            <th>Item</th><th>Assigned To</th><th>Type</th><th>Qty</th>
            <th>Assigned</th><th>Expected Return</th><th>Condition</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${assignments.map(a => {
            const isOverdue = a.status === 'active' && a.expectedReturnDate && new Date(a.expectedReturnDate) < now;
            return `
              <tr style="${isOverdue ? 'background:rgba(239,68,68,0.05)' : ''}">
                <td style="font-weight:var(--font-weight-semibold);">${e(a.itemName)}</td>
                <td>${e(a.assigneeName)}</td>
                <td>${createBadge(a.assigneeType, a.assigneeType === 'staff' ? 'primary' : a.assigneeType === 'student' ? 'success' : 'info')}</td>
                <td>${a.quantity}</td>
                <td>${formatDate(a.assignedDate)}</td>
                <td style="${isOverdue ? 'color:#dc2626;font-weight:700;' : ''}">
                  ${a.expectedReturnDate ? formatDate(a.expectedReturnDate) + (isOverdue ? ' ⚠️' : '') : '—'}
                </td>
                <td>${createBadge(a.condition || 'good', a.condition === 'good' ? 'success' : a.condition === 'damaged' ? 'danger' : 'warning')}</td>
                <td>${createBadge(isOverdue ? 'Overdue' : a.status, isOverdue ? 'danger' : a.status === 'active' ? 'success' : 'info')}</td>
                <td>
                  <div class="table-actions">
                    <button class="table-action-btn" onclick="inventoryModule.viewAssignment('${a.id}')" title="View">👁️</button>
                    ${a.status === 'active' ? `<button class="table-action-btn" onclick="inventoryModule.returnItem('${a.id}')" title="Return">↩️</button>` : ''}
                  </div>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  // ── HISTORY TAB ───────────────────────────────────────────────────────────

  renderHistoryTab() {
    const history = dataManager.getAll('inventoryHistory') || [];
    if (!this._historyFilters) {
      this._historyFilters = { dateFrom: '', dateTo: '', type: 'all', searchTerm: '' };
    }

    let filtered = history;
    if (this._historyFilters.dateFrom) filtered = filtered.filter(h => new Date(h.timestamp) >= new Date(this._historyFilters.dateFrom));
    if (this._historyFilters.dateTo)   filtered = filtered.filter(h => new Date(h.timestamp) <= new Date(this._historyFilters.dateTo + 'T23:59:59'));
    if (this._historyFilters.type !== 'all') filtered = filtered.filter(h => h.type === this._historyFilters.type);
    if (this._historyFilters.searchTerm) {
      const q = this._historyFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(h => (h.itemName || '').toLowerCase().includes(q) || (h.userName || '').toLowerCase().includes(q));
    }
    filtered = [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const txTypes = ['all', 'addition', 'restock', 'assignment', 'return', 'stock-count', 'adjustment', 'edit', 'delete'];

    return `
      <div class="card mb-6">
        <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4);">Usage History & Analytics</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div class="form-group">
            <label class="form-label">From</label>
            <input type="date" class="form-input" value="${this._historyFilters.dateFrom}" onchange="inventoryModule._historyFilters.dateFrom=this.value;inventoryModule.render()">
          </div>
          <div class="form-group">
            <label class="form-label">To</label>
            <input type="date" class="form-input" value="${this._historyFilters.dateTo}" onchange="inventoryModule._historyFilters.dateTo=this.value;inventoryModule.render()">
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" onchange="inventoryModule._historyFilters.type=this.value;inventoryModule.render()">
              ${txTypes.map(t => `<option value="${t}" ${this._historyFilters.type === t ? 'selected' : ''}>${t === 'all' ? 'All Types' : t.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Search</label>
            <input type="text" class="form-input" placeholder="Item or user…" value="${this._historyFilters.searchTerm}" oninput="inventoryModule._historyFilters.searchTerm=this.value;inventoryModule.render()">
          </div>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule._historyFilters=null;inventoryModule.render()">Clear Filters</button>
          <button class="btn btn-primary btn-sm" onclick="inventoryModule.exportHistory('excel')">📊 Export Excel</button>
          <button class="btn btn-secondary btn-sm" onclick="inventoryModule.exportHistory('pdf')">📄 Export PDF</button>
        </div>
      </div>

      <div class="card">
        <h4 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4);">
          Transactions (${filtered.length})
        </h4>
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <h3 class="empty-state-title">No Transactions</h3>
            <p class="empty-state-description">No history matches your filters</p>
          </div>
        ` : `<div style="max-height:600px;overflow-y:auto;">${filtered.map(h => this.renderHistoryItem(h)).join('')}</div>`}
      </div>
    `;
  },

  renderHistoryItem(tx) {
    const e = this._esc.bind(this);
    const cfgMap = {
      addition:      { icon: '➕', color: 'success' },
      restock:       { icon: '📥', color: 'success' },
      assignment:    { icon: '📤', color: 'info'    },
      return:        { icon: '↩️', color: 'success' },
      request:       { icon: '📝', color: 'warning' },
      'stock-count': { icon: '🔢', color: 'primary' },
      adjustment:    { icon: '🔧', color: 'warning' },
      edit:          { icon: '✏️', color: 'primary' },
      delete:        { icon: '🗑️', color: 'danger'  },
    };
    const cfg = cfgMap[tx.type] || { icon: '📋', color: 'primary' };
    const detailStr = tx.details && typeof tx.details === 'object'
      ? Object.entries(tx.details).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ')
      : '';

    return `
      <div style="padding:var(--space-4);border-bottom:1px solid var(--border-primary);display:flex;gap:var(--space-4);align-items:start;">
        <div style="font-size:1.5rem;flex-shrink:0;">${cfg.icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:var(--space-1);flex-wrap:wrap;gap:var(--space-2);">
            <div>
              <p style="font-weight:var(--font-weight-semibold);color:var(--text-primary);margin-bottom:2px;">${e(tx.itemName || '—')}</p>
              <p style="color:var(--text-secondary);font-size:var(--font-size-sm);">${e(this._txDescription(tx))}</p>
              ${detailStr ? `<p style="color:var(--text-tertiary);font-size:0.75rem;margin-top:2px;">${e(detailStr)}</p>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;">
              ${createBadge(tx.type.replace(/-/g, ' '), cfg.color)}
              <p style="color:var(--text-tertiary);font-size:0.7rem;margin-top:4px;white-space:nowrap;">${formatDate(tx.timestamp)}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _txDescription(tx) {
    const who = tx.userName || 'System';
    switch (tx.type) {
      case 'addition':    return `${tx.quantity} units added by ${who}`;
      case 'restock':     return `${tx.quantity} units restocked by ${who}`;
      case 'assignment':  return `${tx.quantity} units assigned to ${tx.details?.assigneeName || 'user'} by ${who}`;
      case 'return':      return `${tx.quantity} units returned by ${tx.details?.assigneeName || 'user'}`;
      case 'request':     return `Request for ${tx.quantity} units by ${who}`;
      case 'stock-count': return `Physical count: system ${tx.details?.systemQty} → counted ${tx.details?.countedQty} (variance: ${tx.details?.variance > 0 ? '+' : ''}${tx.details?.variance})`;
      case 'adjustment':  return `${tx.details?.adjustType || 'adjustment'} of ${tx.quantity} units by ${who}`;
      case 'edit':        return `Item details updated by ${who}`;
      case 'delete':      return `Item removed by ${who}`;
      default:            return `Transaction by ${who}`;
    }
  },

  // ── ADD ITEM ──────────────────────────────────────────────────────────────

  showAddItemModal() {
    const content = `
      <form id="add-item-form" onsubmit="inventoryModule.submitAddItem(event)">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Item Name *</label>
            <input type="text" class="form-input" name="name" required placeholder="e.g., Whiteboard Markers">
          </div>
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-select" name="category" required>
              <option value="">Select Category</option>
              ${this._categoryOptions()}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" class="form-input" name="quantity" required min="0" placeholder="100">
          </div>
          <div class="form-group">
            <label class="form-label">Unit *</label>
            <input type="text" class="form-input" name="unit" required placeholder="pieces, boxes…">
          </div>
          <div class="form-group">
            <label class="form-label">Min Stock Level *</label>
            <input type="number" class="form-input" name="minStock" required min="0" placeholder="10">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Unit Cost (₦)</label>
            <input type="number" class="form-input" name="unitCost" min="0" step="0.01" placeholder="500">
          </div>
          <div class="form-group">
            <label class="form-label">Location / Storage</label>
            <input type="text" class="form-input" name="location" placeholder="Store Room A">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Supplier / Vendor</label>
          <input type="text" class="form-input" name="supplier" placeholder="e.g., XYZ Supplies Ltd">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" name="description" rows="2" placeholder="Specifications, notes…"></textarea>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Add Item</button>
        </div>
      </form>
    `;
    createModal('Add New Item', content);
  },

  async submitAddItem(event) {
    event.preventDefault();
    const f       = new FormData(event.target);
    const session = authManager?.getSession();
    const itemData = {
      name:        f.get('name'),
      category:    f.get('category'),
      quantity:    parseInt(f.get('quantity')),
      unit:        f.get('unit'),
      minStock:    parseInt(f.get('minStock')),
      unitCost:    parseFloat(f.get('unitCost')) || 0,
      location:    f.get('location') || '',
      supplier:    f.get('supplier') || '',
      description: f.get('description') || '',
      allocated:   0,
      dateAdded:   new Date().toISOString(),
    };
    const newItem = await dataManager.create('inventory', itemData);
    if (!newItem) return;
    await dataManager.logInventoryTransaction('addition', newItem.id, newItem.name, newItem.quantity, session?.fullName || 'Admin', { unitCost: newItem.unitCost, category: newItem.category, supplier: newItem.supplier });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_ADDED', newItem.name, `Category: ${newItem.category} | Qty: ${newItem.quantity} | Cost: ₦${(newItem.unitCost || 0).toLocaleString()}`);
    showToast('Item added successfully!', 'success');
    closeModal();
    this.render();
  },

  // ── EDIT ITEM ─────────────────────────────────────────────────────────────

  showEditItemModal(itemId) {
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    const e = this._esc.bind(this);
    const content = `
      <form id="edit-item-form" onsubmit="inventoryModule.submitEditItem(event,'${itemId}')">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Item Name *</label>
            <input type="text" class="form-input" name="name" required value="${e(item.name)}">
          </div>
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-select" name="category" required>
              ${this._categoryOptions(item.category)}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" class="form-input" name="quantity" required min="${item.allocated}" value="${item.quantity}">
            <p class="form-help">Min: ${item.allocated} (currently allocated)</p>
          </div>
          <div class="form-group">
            <label class="form-label">Unit *</label>
            <input type="text" class="form-input" name="unit" required value="${e(item.unit)}">
          </div>
          <div class="form-group">
            <label class="form-label">Min Stock Level *</label>
            <input type="number" class="form-input" name="minStock" required min="0" value="${item.minStock}">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Unit Cost (₦)</label>
            <input type="number" class="form-input" name="unitCost" min="0" step="0.01" value="${item.unitCost || 0}">
          </div>
          <div class="form-group">
            <label class="form-label">Location / Storage</label>
            <input type="text" class="form-input" name="location" value="${e(item.location || '')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Supplier / Vendor</label>
          <input type="text" class="form-input" name="supplier" value="${e(item.supplier || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" name="description" rows="2">${e(item.description || '')}</textarea>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Save Changes</button>
        </div>
      </form>
    `;
    createModal('Edit Item', content);
  },

  async submitEditItem(event, itemId) {
    event.preventDefault();
    const f       = new FormData(event.target);
    const session = authManager?.getSession();
    const item    = dataManager.getById('inventory', itemId);
    const updates = {
      ...item,
      name:        f.get('name'),
      category:    f.get('category'),
      quantity:    parseInt(f.get('quantity')),
      unit:        f.get('unit'),
      minStock:    parseInt(f.get('minStock')),
      unitCost:    parseFloat(f.get('unitCost')) || 0,
      location:    f.get('location') || '',
      supplier:    f.get('supplier') || '',
      description: f.get('description') || '',
    };
    const result = await dataManager.update('inventory', itemId, updates);
    if (!result) return;
    await dataManager.logInventoryTransaction('edit', itemId, updates.name, updates.quantity, session?.fullName || 'Admin', { changes: 'Item details updated' });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_UPDATED', updates.name, `Category: ${updates.category} | Qty: ${updates.quantity}`);
    showToast('Item updated successfully!', 'success');
    closeModal();
    this.render();
  },

  // ── DELETE ITEM ───────────────────────────────────────────────────────────

  deleteItem(itemId) {
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    if (item.allocated > 0) { showToast('Cannot delete item with active assignments', 'danger'); return; }
    createModal('Confirm Delete', `
      <p>Are you sure you want to delete <strong>${this._esc(item.name)}</strong>?</p>
      <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:var(--space-2);">This action cannot be undone.</p>
      <div class="flex gap-3 mt-6">
        <button class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger flex-1" onclick="inventoryModule._confirmDelete('${itemId}')">Delete</button>
      </div>
    `);
  },

  async _confirmDelete(itemId) {
    const item = dataManager.getById('inventory', itemId);
    closeModal();
    await dataManager.delete('inventory', itemId);
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_DELETED', item.name, `Category: ${item.category} | Qty was: ${item.quantity}`);
    showToast('Item deleted', 'success');
    this.render();
  },

  // ── RESTOCK / STOCK ADJUSTMENT ────────────────────────────────────────────

  showRestockModal(itemId) {
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    const e = this._esc.bind(this);
    const content = `
      <form id="restock-form" onsubmit="inventoryModule.submitRestock(event,'${itemId}')">
        <div style="background:var(--bg-secondary);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
          <p style="font-weight:var(--font-weight-semibold);font-size:var(--font-size-lg);margin-bottom:var(--space-1);">${e(item.name)}</p>
          <div style="display:flex;gap:var(--space-4);font-size:0.85rem;color:var(--text-secondary);flex-wrap:wrap;">
            <span>Stock: <strong>${item.quantity} ${e(item.unit)}</strong></span>
            <span>Allocated: <strong>${item.allocated} ${e(item.unit)}</strong></span>
            <span>Available: <strong>${item.quantity - item.allocated} ${e(item.unit)}</strong></span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Adjustment Type *</label>
            <select class="form-select" name="adjustType" required>
              <option value="restock">➕ Restock (Add units)</option>
              <option value="writeoff">➖ Write-off / Loss</option>
              <option value="correction">🔧 Correction (Set exact qty)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" class="form-input" name="quantity" required min="1" placeholder="e.g., 50">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Unit Cost (₦) <span style="font-size:0.75rem;color:var(--text-tertiary);">restock only</span></label>
            <input type="number" class="form-input" name="unitCost" min="0" step="0.01" value="${item.unitCost || 0}">
          </div>
          <div class="form-group">
            <label class="form-label">Supplier</label>
            <input type="text" class="form-input" name="supplier" value="${e(item.supplier || '')}" placeholder="Vendor name">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Reason / Notes *</label>
          <textarea class="form-textarea" name="reason" required rows="2" placeholder="e.g., Received from supplier, annual restock…"></textarea>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Apply Adjustment</button>
        </div>
      </form>
    `;
    createModal('Stock Adjustment — ' + this._esc(item.name), content);
  },

  async submitRestock(event, itemId) {
    event.preventDefault();
    const f          = new FormData(event.target);
    const session    = authManager?.getSession();
    const item       = dataManager.getById('inventory', itemId);
    const adjustType = f.get('adjustType');
    const qty        = parseInt(f.get('quantity'));
    const newUnitCost= parseFloat(f.get('unitCost')) || item.unitCost || 0;
    const supplier   = f.get('supplier') || item.supplier || '';
    const reason     = f.get('reason');

    let newQty;
    if (adjustType === 'restock') {
      newQty = item.quantity + qty;
    } else if (adjustType === 'writeoff') {
      const avail = item.quantity - item.allocated;
      if (qty > avail) { showToast(`Cannot write off more than available (${avail} ${item.unit})`, 'danger'); return; }
      newQty = item.quantity - qty;
    } else {
      // correction: qty is the new absolute quantity
      if (qty < item.allocated) { showToast(`Cannot set qty below allocated count (${item.allocated})`, 'danger'); return; }
      newQty = qty;
    }

    const updates = { ...item, quantity: newQty, unitCost: newUnitCost, supplier };
    const result  = await dataManager.update('inventory', itemId, updates);
    if (!result) return;

    await dataManager.logInventoryTransaction('adjustment', itemId, item.name, qty, session?.fullName || 'Admin', { adjustType, reason, supplier });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_STOCK_ADJUSTED', item.name, `Type: ${adjustType} | Qty: ${adjustType === 'restock' ? '+' : ''}${qty} | Reason: ${reason}`);
    showToast('Stock adjusted successfully!', 'success');
    closeModal();
    this.render();
  },

  // ── PHYSICAL STOCK COUNT ──────────────────────────────────────────────────

  showStockCountModal() {
    const inventory = dataManager.getAll('inventory');
    if (inventory.length === 0) { showToast('No items to count', 'info'); return; }
    const e = this._esc.bind(this);

    const rows = inventory.map(item => `
      <tr id="scount-row-${item.id}">
        <td style="font-weight:600;">${e(item.name)}</td>
        <td style="color:var(--text-secondary);">${e(item.unit)}</td>
        <td style="color:var(--text-secondary);" data-sys="${item.quantity}">${item.quantity}</td>
        <td>
          <input type="number" min="0" class="form-input" style="width:90px;padding:4px 8px;"
            name="count_${item.id}" placeholder="${item.quantity}"
            oninput="inventoryModule._liveVariance('${item.id}',this.value,${item.quantity})">
        </td>
        <td id="scount-var-${item.id}" style="font-size:0.8rem;color:var(--text-tertiary);">—</td>
      </tr>
    `).join('');

    createModal('Physical Stock Count', `
      <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:var(--space-4);">
        Enter the physically counted quantity for each item. Leave blank to skip.
      </p>
      <form id="stock-count-form" onsubmit="inventoryModule.submitStockCount(event)">
        <div style="max-height:400px;overflow-y:auto;">
          <table class="table">
            <thead>
              <tr><th>Item</th><th>Unit</th><th>System Qty</th><th>Counted Qty</th><th>Variance</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-success flex-1">Apply Corrections</button>
        </div>
      </form>
    `);
  },

  _liveVariance(itemId, value, systemQty) {
    const cell = document.getElementById(`scount-var-${itemId}`);
    if (!cell) return;
    const counted = parseInt(value);
    if (isNaN(counted)) { cell.textContent = '—'; cell.style.color = 'var(--text-tertiary)'; return; }
    const v = counted - systemQty;
    cell.textContent = (v > 0 ? '+' : '') + v;
    cell.style.color = v === 0 ? 'var(--color-success)' : v > 0 ? 'var(--color-info)' : 'var(--color-danger)';
  },

  async submitStockCount(event) {
    event.preventDefault();
    const session   = authManager?.getSession();
    const inventory = dataManager.getAll('inventory');
    const form      = event.target;
    let corrections = 0;

    for (const item of inventory) {
      const input = form.querySelector(`[name="count_${item.id}"]`);
      if (!input || input.value === '') continue;
      const counted = parseInt(input.value);
      if (isNaN(counted) || counted === item.quantity) continue;
      if (counted < item.allocated) {
        showToast(`Skipped ${item.name}: counted qty (${counted}) is below allocated (${item.allocated})`, 'warning');
        continue;
      }
      const variance = counted - item.quantity;
      await dataManager.update('inventory', item.id, { ...item, quantity: counted });
      await dataManager.logInventoryTransaction('stock-count', item.id, item.name, Math.abs(variance), session?.fullName || 'Admin', { systemQty: item.quantity, countedQty: counted, variance });
      if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_STOCK_COUNT', item.name, `System: ${item.quantity} → Counted: ${counted} (variance: ${variance > 0 ? '+' : ''}${variance})`);
      corrections++;
    }

    closeModal();
    showToast(corrections > 0 ? `Stock count applied: ${corrections} item${corrections > 1 ? 's' : ''} corrected` : 'No corrections needed — all counts match', corrections > 0 ? 'success' : 'info');
    this.render();
  },

  // ── REQUEST ACTIONS ───────────────────────────────────────────────────────

  showRequestModal() {
    const content = `
      <form id="request-form" onsubmit="inventoryModule.submitRequest(event)">
        <div class="form-group">
          <label class="form-label">Item Name *</label>
          <input type="text" class="form-input" name="itemName" required placeholder="e.g., Whiteboard Markers">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-select" name="category" required>
              <option value="">Select Category</option>
              ${this._categoryOptions()}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority *</label>
            <select class="form-select" name="priority" required>
              <option value="medium" selected>Medium</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" class="form-input" name="quantity" required min="1" placeholder="50">
          </div>
          <div class="form-group">
            <label class="form-label">Estimated Cost (₦) *</label>
            <input type="number" class="form-input" name="estimatedCost" required min="0" placeholder="25000">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Preferred Supplier</label>
          <input type="text" class="form-input" name="supplier" placeholder="e.g., XYZ Supplies Ltd">
        </div>
        <div class="form-group">
          <label class="form-label">Justification *</label>
          <textarea class="form-textarea" name="justification" required placeholder="Explain why this item is needed…" rows="3"></textarea>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Submit Request</button>
        </div>
      </form>
    `;
    createModal('Request Inventory Item', content);
  },

  async submitRequest(event) {
    event.preventDefault();
    const f       = new FormData(event.target);
    const session = authManager?.getSession();
    const reqData = {
      itemName:        f.get('itemName'),
      category:        f.get('category'),
      quantity:        parseInt(f.get('quantity')),
      estimatedCost:   parseInt(f.get('estimatedCost')),
      supplier:        f.get('supplier') || '',
      justification:   f.get('justification'),
      priority:        f.get('priority'),
      requestedBy:     session?.userId || session?.supabaseId || 'unknown',
      requestedByName: session?.fullName || 'Current User',
      requestedDate:   new Date().toISOString(),
      status:          'pending',
      reviewedBy:      null,
      reviewedDate:    null,
      reviewNotes:     null,
    };
    const result = await dataManager.create('inventoryRequests', reqData);
    if (!result) return;
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_REQUEST_CREATED', reqData.itemName, `Qty: ${reqData.quantity} | Priority: ${reqData.priority}`);
    showToast('Request submitted successfully!', 'success');
    closeModal();
    this._tab = 'requests';
    this.render();
  },

  async approveRequest(requestId) {
    const req     = dataManager.getById('inventoryRequests', requestId);
    const session = authManager?.getSession();
    await dataManager.update('inventoryRequests', requestId, {
      ...req,
      status:       'approved',
      reviewedBy:   session?.userId || 'admin',
      reviewedDate: new Date().toISOString(),
      reviewNotes:  'Approved',
    });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_REQUEST_APPROVED', req.itemName, `Requested by: ${req.requestedByName} | Qty: ${req.quantity}`);
    showToast('Request approved! Click "Add to Inventory" to fulfil it.', 'success');
    this.render();
  },

  rejectRequest(requestId) {
    const req = dataManager.getById('inventoryRequests', requestId);
    if (!req) return;
    createModal('Reject Request', `
      <p>Rejecting request for <strong>${this._esc(req.itemName)}</strong>.</p>
      <div class="form-group mt-4">
        <label class="form-label">Reason for rejection *</label>
        <textarea class="form-textarea" id="reject-reason" rows="3" placeholder="Explain why this request is being rejected…"></textarea>
      </div>
      <div class="flex gap-3 mt-6">
        <button class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger flex-1" onclick="inventoryModule._confirmReject('${requestId}')">Reject</button>
      </div>
    `);
  },

  async _confirmReject(requestId) {
    const reason = document.getElementById('reject-reason')?.value?.trim();
    if (!reason) { showToast('Please enter a rejection reason', 'warning'); return; }
    const req     = dataManager.getById('inventoryRequests', requestId);
    const session = authManager?.getSession();
    closeModal();
    await dataManager.update('inventoryRequests', requestId, {
      ...req,
      status:       'rejected',
      reviewedBy:   session?.userId || 'admin',
      reviewedDate: new Date().toISOString(),
      reviewNotes:  reason,
    });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_REQUEST_REJECTED', req.itemName, `Reason: ${reason}`);
    showToast('Request rejected', 'info');
    this.render();
  },

  fulfillRequest(requestId) {
    const req      = dataManager.getById('inventoryRequests', requestId);
    if (!req) return;
    const e        = this._esc.bind(this);
    const existing = dataManager.getAll('inventory').find(i => (i.name || '').toLowerCase() === (req.itemName || '').toLowerCase());

    createModal('Add to Inventory', `
      ${existing
        ? `<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-4);font-size:0.85rem;color:#92400e;">⚠️ <strong>${e(existing.name)}</strong> already exists (${existing.quantity} ${e(existing.unit)}). Received units will be added to current stock.</div>`
        : `<p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:var(--space-4);">Creating new inventory item: <strong>${e(req.itemName)}</strong></p>`
      }
      <form id="fulfill-form" onsubmit="inventoryModule.submitFulfillRequest(event,'${requestId}')">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity Received *</label>
            <input type="number" class="form-input" name="quantity" required min="1" value="${req.quantity}">
          </div>
          <div class="form-group">
            <label class="form-label">Unit Cost (₦)</label>
            <input type="number" class="form-input" name="unitCost" min="0" step="0.01" value="${req.quantity > 0 ? (req.estimatedCost / req.quantity).toFixed(2) : 0}">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Supplier</label>
            <input type="text" class="form-input" name="supplier" value="${e(req.supplier || '')}" placeholder="Vendor name">
          </div>
          <div class="form-group">
            <label class="form-label">Location / Storage</label>
            <input type="text" class="form-input" name="location" value="${existing ? e(existing.location || '') : ''}" placeholder="Store Room A">
          </div>
        </div>
        ${!existing ? `
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label class="form-label">Unit *</label>
              <input type="text" class="form-input" name="unit" required value="pieces" placeholder="pieces, boxes…">
            </div>
            <div class="form-group">
              <label class="form-label">Min Stock Level</label>
              <input type="number" class="form-input" name="minStock" min="0" value="5">
            </div>
          </div>
        ` : `<input type="hidden" name="unit" value="${e(existing.unit)}"><input type="hidden" name="minStock" value="${existing.minStock}">`}
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-success flex-1">📥 Add to Inventory</button>
        </div>
      </form>
    `);
  },

  async submitFulfillRequest(event, requestId) {
    event.preventDefault();
    const f       = new FormData(event.target);
    const session = authManager?.getSession();
    const req     = dataManager.getById('inventoryRequests', requestId);
    const qty     = parseInt(f.get('quantity'));
    const unitCost= parseFloat(f.get('unitCost')) || 0;
    const supplier= f.get('supplier') || '';
    const location= f.get('location') || '';

    const existing = dataManager.getAll('inventory').find(i => (i.name || '').toLowerCase() === (req.itemName || '').toLowerCase());

    if (existing) {
      await dataManager.update('inventory', existing.id, {
        ...existing,
        quantity: existing.quantity + qty,
        unitCost: unitCost || existing.unitCost,
        supplier: supplier || existing.supplier,
        location: location || existing.location,
      });
      await dataManager.logInventoryTransaction('restock', existing.id, existing.name, qty, session?.fullName || 'Admin', { source: 'request', requestId, supplier });
    } else {
      const newItem = await dataManager.create('inventory', {
        name:        req.itemName,
        category:    req.category,
        quantity:    qty,
        unit:        f.get('unit') || 'pieces',
        minStock:    parseInt(f.get('minStock')) || 5,
        unitCost,
        supplier,
        location,
        description: req.justification || '',
        allocated:   0,
        dateAdded:   new Date().toISOString(),
      });
      if (!newItem) return;
      await dataManager.logInventoryTransaction('addition', newItem.id, newItem.name, qty, session?.fullName || 'Admin', { source: 'request', requestId, supplier });
      if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_ADDED', newItem.name, `Via approved request | Qty: ${qty}`);
    }

    await dataManager.update('inventoryRequests', requestId, { ...req, status: 'fulfilled' });
    closeModal();
    showToast(`${req.itemName} added to inventory!`, 'success');
    this.render();
  },

  editRequest(requestId) {
    const req = dataManager.getById('inventoryRequests', requestId);
    if (!req) return;
    const e = this._esc.bind(this);
    const content = `
      <form id="edit-request-form" onsubmit="inventoryModule.submitEditRequest(event,'${requestId}')">
        <div class="form-group">
          <label class="form-label">Item Name *</label>
          <input type="text" class="form-input" name="itemName" required value="${e(req.itemName)}">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-select" name="category" required>
              ${this._categoryOptions(req.category)}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority *</label>
            <select class="form-select" name="priority" required>
              ${['low','medium','high','urgent'].map(p => `<option value="${p}" ${req.priority === p ? 'selected' : ''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" class="form-input" name="quantity" required min="1" value="${req.quantity}">
          </div>
          <div class="form-group">
            <label class="form-label">Estimated Cost (₦) *</label>
            <input type="number" class="form-input" name="estimatedCost" required min="0" value="${req.estimatedCost}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Preferred Supplier</label>
          <input type="text" class="form-input" name="supplier" value="${e(req.supplier || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Justification *</label>
          <textarea class="form-textarea" name="justification" required rows="3">${e(req.justification)}</textarea>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Save Changes</button>
        </div>
      </form>
    `;
    createModal('Edit Request', content);
  },

  async submitEditRequest(event, requestId) {
    event.preventDefault();
    const f   = new FormData(event.target);
    const req = dataManager.getById('inventoryRequests', requestId);
    await dataManager.update('inventoryRequests', requestId, {
      ...req,
      itemName:      f.get('itemName'),
      category:      f.get('category'),
      quantity:      parseInt(f.get('quantity')),
      estimatedCost: parseInt(f.get('estimatedCost')),
      justification: f.get('justification'),
      priority:      f.get('priority'),
      supplier:      f.get('supplier') || '',
    });
    showToast('Request updated!', 'success');
    closeModal();
    this.render();
  },

  // ── ASSIGNMENT ACTIONS ────────────────────────────────────────────────────

  showAssignModal(preSelectItemId) {
    const inventory = dataManager.getAll('inventory');
    const staff     = dataManager.getAll('staff');
    const e         = this._esc.bind(this);

    const content = `
      <form id="assign-form" onsubmit="inventoryModule.submitAssignment(event)">
        <div class="form-group">
          <label class="form-label">Select Item *</label>
          <select class="form-select" name="itemId" required onchange="inventoryModule.updateAvailableQty(this.value)">
            <option value="">Choose an item</option>
            ${inventory.map(item => {
              const avail = item.quantity - item.allocated;
              return `<option value="${item.id}" data-available="${avail}" data-name="${e(item.name)}" ${preSelectItemId === item.id ? 'selected' : ''}>${e(item.name)} (${avail} available)</option>`;
            }).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Assign To *</label>
          <div style="display:flex;gap:var(--space-4);margin-bottom:var(--space-3);flex-wrap:wrap;">
            <label class="form-checkbox"><input type="radio" name="assigneeType" value="staff" checked onchange="inventoryModule.toggleAssigneeType('staff')"><span>Staff</span></label>
            <label class="form-checkbox"><input type="radio" name="assigneeType" value="student" onchange="inventoryModule.toggleAssigneeType('student')"><span>Student</span></label>
            <label class="form-checkbox"><input type="radio" name="assigneeType" value="classroom" onchange="inventoryModule.toggleAssigneeType('classroom')"><span>Classroom</span></label>
          </div>
          <select class="form-select" name="assigneeId" id="assignee-select" required>
            <option value="">Select staff member</option>
            ${staff.map(s => `<option value="${s.id}" data-name="${e(s.name)}">${e(s.name)} — ${e(s.subject || s.role || '')}</option>`).join('')}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" class="form-input" name="quantity" required min="1" value="1" id="assign-quantity">
            <p class="form-help" id="available-qty-help" style="color:var(--text-tertiary);">Select an item first</p>
          </div>
          <div class="form-group">
            <label class="form-label">Condition *</label>
            <select class="form-select" name="condition" required>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Expected Return Date</label>
          <input type="date" class="form-input" name="expectedReturnDate">
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" name="notes" rows="2" placeholder="Purpose, location, instructions…"></textarea>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Assign Item</button>
        </div>
      </form>
    `;
    createModal('Assign Inventory Item', content);
    if (preSelectItemId) {
      Promise.resolve().then(() => this.updateAvailableQty(preSelectItemId));
    }
  },

  toggleAssigneeType(type) {
    const select = document.getElementById('assignee-select');
    if (!select) return;
    const e = this._esc.bind(this);
    if (type === 'staff') {
      const staff = dataManager.getAll('staff');
      select.innerHTML = `<option value="">Select staff member</option>` +
        staff.map(s => `<option value="${s.id}" data-name="${e(s.name)}">${e(s.name)} — ${e(s.subject || s.role || '')}</option>`).join('');
    } else if (type === 'student') {
      const students = dataManager.getAll('students');
      select.innerHTML = `<option value="">Select student</option>` +
        students.map(s => `<option value="${s.id}" data-name="${e(s.name || s.fullName)}">${e(s.name || s.fullName)} — ${e(s.grade || '')}</option>`).join('');
    } else {
      const classes = dataManager.getAll('classes') || [];
      if (classes.length > 0) {
        select.innerHTML = `<option value="">Select classroom</option>` +
          classes.map(c => `<option value="classroom-${c.grade}-${c.section}" data-name="${e(c.grade)}-${e(c.section)}">${e(c.grade)}-${e(c.section)} (${e(c.room || 'No room')})</option>`).join('');
      } else {
        const allGrades = window.schoolConfig?.getAllGrades() || [];
        select.innerHTML = `<option value="">Select classroom</option>` +
          allGrades.flatMap(g => (g.sections || ['A']).map(s =>
            `<option value="classroom-${g.code}-${s}" data-name="${e(g.name)}-${s}">${e(g.name)}-${s}</option>`
          )).join('');
      }
    }
  },

  updateAvailableQty(itemId) {
    if (!itemId) return;
    const item  = dataManager.getById('inventory', itemId);
    if (!item) return;
    const avail = item.quantity - item.allocated;
    const help  = document.getElementById('available-qty-help');
    const qty   = document.getElementById('assign-quantity');
    if (help) { help.textContent = `Available: ${avail} ${item.unit}`; help.style.color = avail > 0 ? 'var(--color-success)' : 'var(--color-danger)'; }
    if (qty) qty.max = avail;
  },

  async submitAssignment(event) {
    event.preventDefault();
    const f       = new FormData(event.target);
    const session = authManager?.getSession(); // FIXED: declare session locally
    const itemId  = f.get('itemId');
    const qty     = parseInt(f.get('quantity'));
    const item    = dataManager.getById('inventory', itemId);
    if (!item) { showToast('Item not found', 'error'); return; }

    const avail = item.quantity - item.allocated;
    if (qty > avail) { showToast(`Only ${avail} ${item.unit} available`, 'danger'); return; }

    const assigneeId     = f.get('assigneeId');
    const assigneeType   = f.get('assigneeType');
    const assigneeSelect = document.querySelector(`#assignee-select option[value="${assigneeId}"]`);
    const assigneeName   = assigneeSelect?.dataset?.name || assigneeId;

    const assignmentData = {
      itemId,
      itemName:           item.name,
      assignedTo:         assigneeId,
      assigneeType,
      assigneeName,
      quantity:           qty,
      assignedDate:       new Date().toISOString(),
      assignedBy:         session?.userId || session?.supabaseId || 'unknown',
      assignedByName:     session?.fullName || 'Admin',
      expectedReturnDate: f.get('expectedReturnDate') || null,
      returnedDate:       null,
      status:             'active',
      condition:          f.get('condition'),
      returnCondition:    null,
      returnNotes:        null,
      notes:              f.get('notes') || '',
    };

    // ATOMIC: create assignment first, then update allocated
    const newAssignment = await dataManager.create('inventoryAssignments', assignmentData);
    if (!newAssignment) return;
    await dataManager.update('inventory', itemId, { ...item, allocated: item.allocated + qty });
    await dataManager.logInventoryTransaction('assignment', itemId, item.name, qty, session?.fullName || 'Admin', { assigneeName, assigneeType });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_ASSIGNED', item.name, `To: ${assigneeName} (${assigneeType}) | Qty: ${qty}`);
    showToast('Item assigned successfully!', 'success');
    closeModal();
    this._tab = 'assignments';
    this.render();
  },

  returnItem(assignmentId) {
    const a = dataManager.getById('inventoryAssignments', assignmentId);
    if (!a) { showToast('Assignment not found', 'error'); return; }
    if (a.status === 'returned') { showToast('Already returned', 'warning'); return; }
    const e = this._esc.bind(this);
    createModal('Return Item', `
      <p>Returning <strong>${e(a.itemName)}</strong> from <strong>${e(a.assigneeName)}</strong>.</p>
      <div class="form-group mt-4">
        <label class="form-label">Return Condition *</label>
        <select class="form-select" id="return-condition">
          <option value="good">Good — no damage</option>
          <option value="fair">Fair — minor wear</option>
          <option value="damaged">Damaged</option>
          <option value="lost">Lost / Missing</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="return-notes" rows="2" placeholder="Any notes about the return…"></textarea>
      </div>
      <div class="flex gap-3 mt-6">
        <button class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="inventoryModule._confirmReturn('${assignmentId}')">Confirm Return</button>
      </div>
    `);
  },

  async _confirmReturn(assignmentId) {
    const condition = document.getElementById('return-condition')?.value || 'good';
    const notes     = document.getElementById('return-notes')?.value || '';
    const a         = dataManager.getById('inventoryAssignments', assignmentId);
    const session   = authManager?.getSession();
    closeModal();

    await dataManager.update('inventoryAssignments', assignmentId, {
      ...a,
      status:          'returned',
      returnedDate:    new Date().toISOString(),
      returnCondition: condition,
      returnNotes:     notes,
    });

    const item = dataManager.getById('inventory', a.itemId);
    if (item) {
      await dataManager.update('inventory', item.id, { ...item, allocated: Math.max(0, (item.allocated || 0) - (a.quantity || 0)) });
    }

    await dataManager.logInventoryTransaction('return', a.itemId, a.itemName, a.quantity, session?.fullName || 'Admin', { assigneeName: a.assigneeName, returnCondition: condition, notes });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_RETURNED', a.itemName, `From: ${a.assigneeName} | Condition: ${condition}`);
    showToast('Item returned successfully!', 'success');
    this.render();
  },

  // ── VIEW MODALS ───────────────────────────────────────────────────────────

  viewItemDetails(itemId) {
    const item  = dataManager.getById('inventory', itemId);
    if (!item) return;
    const actives = dataManager.getAll('inventoryAssignments').filter(a => a.itemId === itemId && a.status === 'active');
    const e   = this._esc.bind(this);
    const cat = this.CATEGORIES.find(c => c.value === item.category);

    const metaRows = [
      ['Unit Cost',   formatCurrency(item.unitCost || 0)],
      ['Total Value', formatCurrency((item.unitCost || 0) * item.quantity)],
      ['Min Stock',   `${item.minStock} ${e(item.unit)}`],
      ['Location',    e(item.location || '—')],
      ['Supplier',    e(item.supplier || '—')],
      ['Date Added',  formatDate(item.dateAdded || '')],
    ];

    const content = `
      <div style="display:grid;gap:var(--space-4);">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <h3 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">${e(item.name)}</h3>
            ${createBadge((cat ? cat.icon + ' ' : '') + (cat ? cat.label : e(item.category)), 'info')}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="closeModal();inventoryModule.showEditItemModal('${item.id}')">✏️ Edit</button>
        </div>

        <div class="grid grid-cols-3 gap-4">
          ${[['Total Stock', `${item.quantity} ${e(item.unit)}`], ['Allocated', `${item.allocated} ${e(item.unit)}`], ['Available', `${item.quantity - item.allocated} ${e(item.unit)}`]]
            .map(([l, v]) => `<div style="background:var(--bg-secondary);border-radius:var(--radius-md);padding:var(--space-3);text-align:center;"><p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:4px;">${l}</p><p style="font-size:1.2rem;font-weight:700;">${v}</p></div>`).join('')}
        </div>

        <div class="grid grid-cols-2 gap-3">
          ${metaRows.map(([l, v]) => `<div><p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:2px;">${l}</p><p style="font-weight:600;">${v}</p></div>`).join('')}
        </div>

        ${item.description ? `<div><p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:4px;">Description</p><p>${e(item.description)}</p></div>` : ''}

        ${actives.length > 0 ? `
          <div>
            <h4 style="font-size:var(--font-size-md);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-3);">Active Assignments (${actives.length})</h4>
            ${actives.map(a => `
              <div style="padding:var(--space-3);background:var(--bg-tertiary);border-radius:var(--radius-md);margin-bottom:var(--space-2);">
                <p style="font-weight:600;">${e(a.assigneeName)}</p>
                <p style="font-size:0.8rem;color:var(--text-secondary);">${a.quantity} ${e(item.unit)} · ${e(a.assigneeType)} · ${formatDate(a.assignedDate)}</p>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="flex gap-3">
          <button class="btn btn-secondary flex-1" onclick="closeModal();inventoryModule.showRestockModal('${item.id}')">📥 Adjust Stock</button>
          <button class="btn btn-primary flex-1" onclick="closeModal();inventoryModule.showAssignModal('${item.id}')">📤 Assign</button>
        </div>
      </div>
    `;
    createModal('Item Details', content);
  },

  viewAssignment(assignmentId) {
    const a = dataManager.getById('inventoryAssignments', assignmentId);
    if (!a) return;
    const e   = this._esc.bind(this);
    const now = new Date();
    const isOverdue = a.status === 'active' && a.expectedReturnDate && new Date(a.expectedReturnDate) < now;

    const rows = [
      ['Assigned To',  e(a.assigneeName)],
      ['Type',         a.assigneeType === 'staff' ? 'Staff Member' : a.assigneeType === 'student' ? 'Student' : 'Classroom'],
      ['Quantity',     String(a.quantity)],
      ['Condition',    e(a.condition || '—')],
      ['Assigned Date',formatDate(a.assignedDate)],
      ['Expected Return', a.expectedReturnDate ? formatDate(a.expectedReturnDate) + (isOverdue ? ' ⚠️ Overdue' : '') : 'Not specified'],
      ['Assigned By',  e(a.assignedByName || '—')],
      ...(a.status === 'returned' ? [['Returned Date', formatDate(a.returnedDate)], ['Return Condition', e(a.returnCondition || '—')]] : []),
    ];

    const content = `
      <div style="display:grid;gap:var(--space-4);">
        <div>
          <p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:4px;">Item</p>
          <p style="font-size:1.25rem;font-weight:700;">${e(a.itemName)}</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          ${rows.map(([l, v]) => `<div style="${isOverdue && l === 'Expected Return' ? 'grid-column:1/-1' : ''}"><p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:2px;">${l}</p><p style="font-weight:600;${isOverdue && l === 'Expected Return' ? 'color:#dc2626;' : ''}">${v}</p></div>`).join('')}
        </div>
        ${a.notes ? `<div><p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:4px;">Notes</p><p>${e(a.notes)}</p></div>` : ''}
        ${a.returnNotes ? `<div><p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:4px;">Return Notes</p><p>${e(a.returnNotes)}</p></div>` : ''}
        <div>
          <p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:4px;">Status</p>
          ${createBadge(isOverdue ? 'Overdue' : a.status, isOverdue ? 'danger' : a.status === 'active' ? 'success' : 'info')}
        </div>
      </div>
    `;
    createModal('Assignment Details', content);
  },

  assignItemQuick(itemId) {
    this.showAssignModal(itemId);
  },

  // ── EXPORT & IMPORT ───────────────────────────────────────────────────────

  async exportInventory() {
    const inventory = dataManager.getAll('inventory');
    if (inventory.length === 0) { showToast('No items to export', 'info'); return; }
    if (typeof XLSX === 'undefined') {
      showToast('Loading Excel library…', 'info');
      try { await window.loadLib('xlsx'); } catch { showToast('Failed to load Excel library', 'error'); return; }
    }
    const data = inventory.map(item => ({
      'Name':           item.name,
      'Category':       item.category,
      'Total Qty':      item.quantity,
      'Allocated':      item.allocated,
      'Available':      item.quantity - item.allocated,
      'Unit':           item.unit,
      'Min Stock':      item.minStock,
      'Unit Cost (₦)':  item.unitCost || 0,
      'Total Value (₦)':(item.unitCost || 0) * item.quantity,
      'Location':       item.location || '',
      'Supplier':       item.supplier || '',
      'Description':    item.description || '',
      'Date Added':     formatDate(item.dateAdded || ''),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Inventory exported!', 'success');
  },

  importCSV() {
    createModal('Import Inventory from CSV', `
      <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:var(--space-3);">
        CSV columns: <code>name, category, quantity, unit, minStock, unitCost, location, supplier, description</code>
      </p>
      <p style="color:#92400e;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-md);padding:var(--space-3);font-size:0.82rem;margin-bottom:var(--space-4);">
        ⚠️ Items with the same name will be updated; new names will be created.
      </p>
      <div class="form-group">
        <label class="form-label">CSV File *</label>
        <input type="file" class="form-input" id="csv-import-file" accept=".csv" style="padding:8px;"
          onchange="inventoryModule._previewCSV(this)">
      </div>
      <div id="csv-preview"></div>
      <div class="flex gap-3 mt-6">
        <button class="btn btn-ghost flex-1" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="inventoryModule._processCSVImport()">Import</button>
      </div>
    `);
  },

  _previewCSV(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').slice(0, 6).join('\n');
      const preview = document.getElementById('csv-preview');
      if (preview) {
        preview.innerHTML = `<p style="font-size:0.75rem;color:var(--text-tertiary);margin:var(--space-3) 0 4px;">Preview (first 5 rows):</p>
          <pre style="font-size:0.72rem;background:var(--bg-secondary);padding:var(--space-3);border-radius:var(--radius-md);overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${this._esc(lines)}</pre>`;
      }
    };
    reader.readAsText(file);
  },

  async _processCSVImport() {
    const fileInput = document.getElementById('csv-import-file');
    const file = fileInput?.files?.[0];
    if (!file) { showToast('Please select a CSV file', 'warning'); return; }

    const session  = authManager?.getSession();
    const text     = await file.text();
    const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { showToast('CSV appears empty', 'warning'); return; }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const existing = dataManager.getAll('inventory');
    let created = 0, updated = 0, errors = 0;
    const validCats = this.CATEGORIES.map(c => c.value);

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row    = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      if (!row.name || !row.category) { errors++; continue; }

      const itemData = {
        name:        row.name,
        category:    validCats.includes(row.category) ? row.category : 'other',
        quantity:    parseInt(row.quantity) || 0,
        unit:        row.unit || 'pieces',
        minStock:    parseInt(row.minstock || '5') || 5,
        unitCost:    parseFloat(row.unitcost || '0') || 0,
        location:    row.location || '',
        supplier:    row.supplier || '',
        description: row.description || '',
      };

      const match = existing.find(e => (e.name || '').toLowerCase() === itemData.name.toLowerCase());
      if (match) {
        await dataManager.update('inventory', match.id, { ...match, ...itemData });
        updated++;
      } else {
        await dataManager.create('inventory', { ...itemData, allocated: 0, dateAdded: new Date().toISOString() });
        created++;
      }
    }

    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_CSV_IMPORTED', file.name, `Created: ${created} | Updated: ${updated} | Errors: ${errors}`);
    closeModal();
    showToast(`Import complete: ${created} created, ${updated} updated${errors > 0 ? `, ${errors} skipped` : ''}`, 'success');
    this.render();
  },

  async exportHistory(format) {
    const history = dataManager.getAll('inventoryHistory') || [];
    if (format === 'excel') await this._exportHistoryExcel(history);
    else await this._exportHistoryPDF(history);
  },

  async _exportHistoryExcel(history) {
    if (typeof XLSX === 'undefined') {
      showToast('Loading Excel library…', 'info');
      try { await window.loadLib('xlsx'); } catch { showToast('Failed to load Excel library', 'error'); return; }
    }
    const data = history.map(h => ({
      'Date':    formatDate(h.timestamp),
      'Type':    h.type,
      'Item':    h.itemName,
      'Qty':     h.quantity,
      'User':    h.userName,
      'Details': h.details && typeof h.details === 'object' ? Object.entries(h.details).map(([k,v]) => `${k}: ${v}`).join('; ') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'History');
    XLSX.writeFile(wb, `inventory_history_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('History exported!', 'success');
  },

  async _exportHistoryPDF(history) {
    if (typeof window.jspdf === 'undefined') {
      showToast('Loading PDF library…', 'info');
      try { await window.loadLib('jspdf'); } catch { showToast('Failed to load PDF library', 'error'); return; }
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('Inventory History', 14, 20);
    doc.setFontSize(10); doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 14, 30);
    doc.text(`Total transactions: ${history.length}`, 14, 36);
    let y = 50;
    history.slice(0, 60).forEach(h => {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(`${formatDate(h.timestamp)}  [${h.type}]  ${h.itemName}  (${h.quantity})  by ${h.userName}`, 14, y);
      y += 7;
    });
    doc.save(`inventory_history_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF exported!', 'success');
  },
};

window.inventoryModule = inventoryModule;
