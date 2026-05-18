// ============================================
// INVENTORY MANAGEMENT MODULE - ENHANCED
// With Requests, Approvals, and Assignments
// ============================================

const inventoryModule = {
  async init(container) {
    this.container = container;
    this.currentTab = 'registry';
    this.currentFilter = 'all';
    await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['inventory', 'inventoryRequests', 'inventoryAssignments'].includes(e.detail.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  render() {
    const inventory = dataManager.getAll('inventory');
    const requests = dataManager.getAll('inventoryRequests');
    const assignments = dataManager.getAll('inventoryAssignments');
    const stats = dataManager.getStats();

    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const activeAssignments = assignments.filter(a => a.status === 'active').length;

    this.container.innerHTML = `
      <div class="animate-fadeIn">
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="page-title" style="margin-bottom: var(--space-2);">Inventory Management</h2>
            <p class="page-description">Track assets, manage requests, and assignments</p>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-success" onclick="inventoryModule.showAddItemModal()">
              ➕ Add Item
            </button>
            <button class="btn btn-secondary" onclick="inventoryModule.showRequestModal()">
              📝 Request Item
            </button>
            <button class="btn btn-primary" onclick="inventoryModule.showAssignModal()">
              📤 Assign Item
            </button>
          </div>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
          ${this.createClickableStatCard('Total Items', inventory.length, null, 'primary', 'registry')}
          ${this.createClickableStatCard('Pending Requests', pendingRequests, null, 'warning', 'requests')}
          ${this.createClickableStatCard('Active Assignments', activeAssignments, null, 'info', 'assignments')}
          ${this.createClickableStatCard('Low Stock', stats.lowStockItems, null, 'danger', 'registry')}
          ${this.createClickableStatCard('Total Value', this.calculateTotalValue(inventory), null, 'success', null)}
        </div>

        <!-- Tabs -->
        <div style="border-bottom: 1px solid var(--border-primary); margin-bottom: var(--space-6);">
          <div style="display: flex; gap: var(--space-4); flex-wrap: wrap;">
            <button class="profile-tab ${this.currentTab === 'registry' ? 'active' : ''}" 
                    onclick="inventoryModule.switchTab('registry')">
              📋 Items Registry
            </button>
            <button class="profile-tab ${this.currentTab === 'inventory' ? 'active' : ''}" 
                    onclick="inventoryModule.switchTab('inventory')">
              📦 Stock View
            </button>
            <button class="profile-tab ${this.currentTab === 'requests' ? 'active' : ''}" 
                    onclick="inventoryModule.switchTab('requests')">
              📝 Requests ${pendingRequests > 0 ? `<span style="background: var(--color-danger); color: white; padding: 2px 8px; border-radius: var(--radius-full); font-size: var(--font-size-xs); margin-left: var(--space-2);">${pendingRequests}</span>` : ''}
            </button>
            <button class="profile-tab ${this.currentTab === 'assignments' ? 'active' : ''}" 
                    onclick="inventoryModule.switchTab('assignments')">
              👥 Assignments
            </button>
            <button class="profile-tab ${this.currentTab === 'history' ? 'active' : ''}" 
                    onclick="inventoryModule.switchTab('history')">
              📊 Usage History
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="inventory-tab-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
  },

  renderTabContent() {
    switch (this.currentTab) {
      case 'registry':
        return this.renderRegistryTab();
      case 'inventory':
        return this.renderInventoryTab();
      case 'requests':
        return this.renderRequestsTab();
      case 'assignments':
        return this.renderAssignmentsTab();
      case 'history':
        return this.renderHistoryTab();
      default:
        return this.renderRegistryTab();
    }
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  createClickableStatCard(label, value, change, type = 'primary', targetTab = null) {
    const isClickable = targetTab !== null;
    const cursorStyle = isClickable ? 'cursor: pointer;' : '';
    const clickHandler = isClickable ? `onclick="inventoryModule.switchTab('${targetTab}')"` : '';
    const hoverEffects = isClickable ? `
      onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-xl)'"
      onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-md)'"
    ` : '';

    return `
      <div class="stat-card ${type} animate-slideUp" 
           style="${cursorStyle} transition: all var(--transition-base);"
           ${clickHandler}
           ${hoverEffects}
           ${isClickable ? `title="Click to view ${label}"` : ''}>
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        ${change ? `<div class="stat-change ${change > 0 ? 'positive' : 'negative'}">
          ${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%
        </div>` : ''}
        ${isClickable ? `<div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: var(--space-2);">Click to view →</div>` : ''}
      </div>
    `;
  },

  calculateTotalValue(inventory) {
    const total = inventory.reduce((sum, item) => sum + ((item.unitCost || 0) * item.quantity), 0);
    return formatCurrency(total);
  },

  // ========== ITEMS REGISTRY TAB ==========
  renderRegistryTab() {
    const inventory = dataManager.getAll('inventory');

    return `
      <div class="card mb-6">
        <div class="flex justify-between items-center mb-4">
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin: 0;">All Items</h3>
          <button class="btn btn-success" onclick="inventoryModule.showAddItemModal()">
            ➕ Add New Item
          </button>
        </div>
        
        <!-- Category Filters -->
        <div class="flex flex-wrap gap-3 mb-4">
          <button class="btn btn-ghost btn-sm ${this.currentFilter === 'all' ? 'active' : ''}" onclick="inventoryModule.filterRegistry('all')">All Items</button>
          <button class="btn btn-ghost btn-sm ${this.currentFilter === 'textbooks' ? 'active' : ''}" onclick="inventoryModule.filterRegistry('textbooks')">📚 Textbooks</button>
          <button class="btn btn-ghost btn-sm ${this.currentFilter === 'furniture' ? 'active' : ''}" onclick="inventoryModule.filterRegistry('furniture')">🪑 Furniture</button>
          <button class="btn btn-ghost btn-sm ${this.currentFilter === 'lab-equipment' ? 'active' : ''}" onclick="inventoryModule.filterRegistry('lab-equipment')">🔬 Lab Equipment</button>
          <button class="btn btn-ghost btn-sm ${this.currentFilter === 'electronics' ? 'active' : ''}" onclick="inventoryModule.filterRegistry('electronics')">💻 Electronics</button>
          <button class="btn btn-ghost btn-sm ${this.currentFilter === 'stationery' ? 'active' : ''}" onclick="inventoryModule.filterRegistry('stationery')">✏️ Stationery</button>
        </div>
      </div>

      ${this.renderRegistryTable(inventory)}
    `;
  },

  filterRegistry(category) {
    this.currentFilter = category;
    this.render();
  },

  renderRegistryTable(items) {
    let filteredItems = items;
    if (this.currentFilter !== 'all') {
      filteredItems = items.filter(item => item.category === this.currentFilter);
    }

    if (filteredItems.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <h3 class="empty-state-title">No Items Found</h3>
          <p class="empty-state-description">Add items to start tracking inventory</p>
          <button class="btn btn-primary mt-4" onclick="inventoryModule.showAddItemModal()">
            ➕ Add First Item
          </button>
        </div>
      `;
    }

    return `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Category</th>
              <th>Total Qty</th>
              <th>Allocated</th>
              <th>Available</th>
              <th>Unit Cost</th>
              <th>Total Value</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredItems.map(item => {
      const available = item.quantity - item.allocated;
      const isLowStock = available <= item.minStock;
      const totalValue = (item.unitCost || 0) * item.quantity;
      return `
                <tr>
                  <td style="font-weight: var(--font-weight-semibold);">${item.name}</td>
                  <td>${createBadge(item.category.replace('-', ' '), 'info')}</td>
                  <td>${item.quantity} ${item.unit}</td>
                  <td>${item.allocated} ${item.unit}</td>
                  <td style="color: ${isLowStock ? 'var(--color-danger)' : 'var(--color-success)'}; font-weight: var(--font-weight-semibold);">
                    ${available} ${item.unit}
                  </td>
                  <td>${formatCurrency(item.unitCost || 0)}</td>
                  <td style="font-weight: var(--font-weight-semibold);">${formatCurrency(totalValue)}</td>
                  <td>${createBadge(isLowStock ? 'Low Stock' : 'In Stock', isLowStock ? 'danger' : 'success')}</td>
                  <td>
                    <div class="table-actions">
                      <button class="table-action-btn" onclick="inventoryModule.viewItemDetails('${item.id}')" title="View Details">👁️</button>
                      <button class="table-action-btn" onclick="inventoryModule.showEditItemModal('${item.id}')" title="Edit">✏️</button>
                      <button class="table-action-btn" onclick="inventoryModule.deleteItem('${item.id}')" title="Delete">🗑️</button>
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ========== HISTORY TAB ==========
  renderHistoryTab() {
    const history = dataManager.getAll('inventoryHistory') || [];
    const inventory = dataManager.getAll('inventory');

    // Initialize filters if not set
    if (!this.historyFilters) {
      this.historyFilters = {
        dateFrom: '',
        dateTo: '',
        category: 'all',
        type: 'all',
        searchTerm: ''
      };
    }

    // Filter history
    let filteredHistory = history;

    if (this.historyFilters.dateFrom) {
      filteredHistory = filteredHistory.filter(h => new Date(h.timestamp) >= new Date(this.historyFilters.dateFrom));
    }
    if (this.historyFilters.dateTo) {
      filteredHistory = filteredHistory.filter(h => new Date(h.timestamp) <= new Date(this.historyFilters.dateTo));
    }
    if (this.historyFilters.type !== 'all') {
      filteredHistory = filteredHistory.filter(h => h.type === this.historyFilters.type);
    }
    if (this.historyFilters.searchTerm) {
      const term = this.historyFilters.searchTerm.toLowerCase();
      filteredHistory = filteredHistory.filter(h =>
        h.itemName.toLowerCase().includes(term) ||
        h.userName.toLowerCase().includes(term)
      );
    }

    // Sort by timestamp (newest first)
    filteredHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Calculate statistics
    const stats = this.calculateHistoryStats(filteredHistory);

    return `
      <!-- Filters Card -->
      <div class="card mb-6">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
          Usage History & Analytics
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div class="form-group">
            <label class="form-label">From Date</label>
            <input type="date" class="form-input" id="history-date-from" value="${this.historyFilters.dateFrom}" 
                   onchange="inventoryModule.updateHistoryFilter('dateFrom', this.value)">
          </div>
          
          <div class="form-group">
            <label class="form-label">To Date</label>
            <input type="date" class="form-input" id="history-date-to" value="${this.historyFilters.dateTo}"
                   onchange="inventoryModule.updateHistoryFilter('dateTo', this.value)">
          </div>
          
          <div class="form-group">
            <label class="form-label">Transaction Type</label>
            <select class="form-select" id="history-type" onchange="inventoryModule.updateHistoryFilter('type', this.value)">
              <option value="all" ${this.historyFilters.type === 'all' ? 'selected' : ''}>All Types</option>
              <option value="addition" ${this.historyFilters.type === 'addition' ? 'selected' : ''}>Item Added</option>
              <option value="assignment" ${this.historyFilters.type === 'assignment' ? 'selected' : ''}>Assignment</option>
              <option value="return" ${this.historyFilters.type === 'return' ? 'selected' : ''}>Return</option>
              <option value="request" ${this.historyFilters.type === 'request' ? 'selected' : ''}>Request</option>
              <option value="edit" ${this.historyFilters.type === 'edit' ? 'selected' : ''}>Edit</option>
              <option value="delete" ${this.historyFilters.type === 'delete' ? 'selected' : ''}>Delete</option>
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Search</label>
            <input type="text" class="form-input" placeholder="Item or user..." id="history-search"
                   value="${this.historyFilters.searchTerm}"
                   oninput="inventoryModule.updateHistoryFilter('searchTerm', this.value)">
          </div>
        </div>

        <div class="flex gap-3">
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule.clearHistoryFilters()">Clear Filters</button>
          <button class="btn btn-primary btn-sm" onclick="inventoryModule.exportHistory('excel')">📊 Export to Excel</button>
          <button class="btn btn-secondary btn-sm" onclick="inventoryModule.exportHistory('pdf')">📄 Export to PDF</button>
        </div>
      </div>

      <!-- Statistics Dashboard -->
      ${stats.totalTransactions > 0 ? `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="card" style="text-align: center; padding: var(--space-4);">
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">Total Transactions</p>
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-primary);">${stats.totalTransactions}</p>
          </div>
          <div class="card" style="text-align: center; padding: var(--space-4);">
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">Assignments</p>
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-info);">${stats.assignments}</p>
          </div>
          <div class="card" style="text-align: center; padding: var(--space-4);">
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">Returns</p>
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-success);">${stats.returns}</p>
          </div>
          <div class="card" style="text-align: center; padding: var(--space-4);">
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">Most Active Item</p>
            <p style="font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); color: var(--text-primary);">${stats.mostActiveItem || 'N/A'}</p>
          </div>
        </div>
      ` : ''}

      <!-- History Timeline -->
      <div class="card">
        <h4 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
          Transaction History (${filteredHistory.length})
        </h4>
        
        ${filteredHistory.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <h3 class="empty-state-title">No Transactions Found</h3>
            <p class="empty-state-description">No history matches your filters</p>
          </div>
        ` : `
          <div style="max-height: 600px; overflow-y: auto;">
            ${filteredHistory.map(h => this.renderHistoryItem(h)).join('')}
          </div>
        `}
      </div>
    `;
  },

  renderHistoryItem(transaction) {
    const typeIcons = {
      addition: '➕',
      assignment: '📤',
      return: '↩️',
      request: '📝',
      edit: '✏️',
      delete: '🗑️',
      adjustment: '🔧'
    };

    const typeColors = {
      addition: 'success',
      assignment: 'info',
      return: 'success',
      request: 'warning',
      edit: 'primary',
      delete: 'danger',
      adjustment: 'warning'
    };

    const icon = typeIcons[transaction.type] || '📋';
    const color = typeColors[transaction.type] || 'primary';

    return `
      <div style="padding: var(--space-4); border-bottom: 1px solid var(--border-primary); display: flex; gap: var(--space-4); align-items: start;">
        <div style="font-size: var(--font-size-2xl);">${icon}</div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-2);">
            <div>
              <p style="font-weight: var(--font-weight-semibold); color: var(--text-primary); margin-bottom: var(--space-1);">
                ${transaction.itemName}
              </p>
              <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
                ${this.getTransactionDescription(transaction)}
              </p>
            </div>
            <div style="text-align: right;">
              ${createBadge(transaction.type.replace('-', ' '), color)}
              <p style="color: var(--text-tertiary); font-size: var(--font-size-xs); margin-top: var(--space-1);">
                ${formatDate(transaction.timestamp)}
              </p>
            </div>
          </div>
          ${transaction.details && Object.keys(transaction.details).length > 0 ? `
            <p style="color: var(--text-tertiary); font-size: var(--font-size-sm); font-style: italic;">
              ${JSON.stringify(transaction.details)}
            </p>
          ` : ''}
        </div>
      </div>
    `;
  },

  getTransactionDescription(transaction) {
    switch (transaction.type) {
      case 'addition':
        return `${transaction.quantity} units added by ${transaction.userName}`;
      case 'assignment':
        return `${transaction.quantity} units assigned to ${transaction.details.assigneeName || 'user'}`;
      case 'return':
        return `${transaction.quantity} units returned by ${transaction.details.assigneeName || 'user'}`;
      case 'request':
        return `Request for ${transaction.quantity} units by ${transaction.userName}`;
      case 'edit':
        return `Item details updated by ${transaction.userName}`;
      case 'delete':
        return `Item removed from inventory by ${transaction.userName}`;
      default:
        return `Transaction by ${transaction.userName}`;
    }
  },

  calculateHistoryStats(history) {
    const stats = {
      totalTransactions: history.length,
      assignments: history.filter(h => h.type === 'assignment').length,
      returns: history.filter(h => h.type === 'return').length,
      mostActiveItem: null
    };

    // Find most active item
    const itemCounts = {};
    history.forEach(h => {
      itemCounts[h.itemName] = (itemCounts[h.itemName] || 0) + 1;
    });

    let maxCount = 0;
    for (const [item, count] of Object.entries(itemCounts)) {
      if (count > maxCount) {
        maxCount = count;
        stats.mostActiveItem = item;
      }
    }

    return stats;
  },

  updateHistoryFilter(filterName, value) {
    this.historyFilters[filterName] = value;
    this.render();
  },

  clearHistoryFilters() {
    this.historyFilters = {
      dateFrom: '',
      dateTo: '',
      category: 'all',
      type: 'all',
      searchTerm: ''
    };
    this.render();
  },

  exportHistory(format) {
    const history = dataManager.getAll('inventoryHistory') || [];

    if (format === 'excel') {
      this.exportHistoryToExcel(history);
    } else if (format === 'pdf') {
      this.exportHistoryToPDF(history);
    }
  },

  async exportHistoryToExcel(history) {
    if (typeof XLSX === 'undefined') {
      showToast('Loading Excel library…', 'info');
      try { await window.loadLib('xlsx'); } catch {
        showToast('Failed to load Excel library.', 'error'); return;
      }
    }
    // Prepare data for export
    const data = history.map(h => ({
      'Date': formatDate(h.timestamp),
      'Type': h.type,
      'Item': h.itemName,
      'Quantity': h.quantity,
      'User': h.userName,
      'Details': JSON.stringify(h.details)
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory History');

    // Download
    XLSX.writeFile(wb, `inventory_history_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('History exported to Excel successfully!', 'success');
  },

  async exportHistoryToPDF(history) {
    if (typeof window.jspdf === 'undefined') {
      showToast('Loading PDF library…', 'info');
      try { await window.loadLib('jspdf'); } catch {
        showToast('Failed to load PDF library.', 'error'); return;
      }
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Inventory Usage History', 14, 20);

    doc.setFontSize(10);
    doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 14, 30);
    doc.text(`Total Transactions: ${history.length}`, 14, 36);

    let y = 50;
    history.slice(0, 50).forEach((h, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(10);
      doc.text(`${formatDate(h.timestamp)} - ${h.type}`, 14, y);
      doc.text(`${h.itemName} (${h.quantity} units)`, 14, y + 5);
      doc.text(`By: ${h.userName}`, 14, y + 10);
      y += 20;
    });

    doc.save(`inventory_history_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('History exported to PDF successfully!', 'success');
  },

  // ========== INVENTORY TAB ==========
  renderInventoryTab() {
    const inventory = dataManager.getAll('inventory');

    return `
      <!-- Category Filters -->
      <div class="card mb-6">
        <div class="flex flex-wrap gap-3">
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule.filterByCategory('all')" id="cat-all">All Items</button>
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule.filterByCategory('textbooks')" id="cat-textbooks">📚 Textbooks</button>
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule.filterByCategory('furniture')" id="cat-furniture">🪑 Furniture</button>
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule.filterByCategory('lab-equipment')" id="cat-lab-equipment">🔬 Lab Equipment</button>
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule.filterByCategory('electronics')" id="cat-electronics">💻 Electronics</button>
          <button class="btn btn-ghost btn-sm" onclick="inventoryModule.filterByCategory('stationery')" id="cat-stationery">✏️ Stationery</button>
        </div>
      </div>

      <!-- Inventory Table -->
      <div id="inventory-container">
        ${this.renderInventoryTable(inventory)}
      </div>

      <script>
        // Activate first filter
        setTimeout(() => {
          const btn = document.getElementById('cat-all');
          if (btn) {
            btn.style.background = 'var(--gradient-primary)';
            btn.style.color = 'white';
          }
        }, 100);
      </script>
    `;
  },

  renderInventoryTable(items) {
    if (items.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <h3 class="empty-state-title">No Inventory Items</h3>
          <p class="empty-state-description">Add items to start tracking inventory</p>
        </div>
      `;
    }

    return `
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
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
      const available = item.quantity - item.allocated;
      const isLowStock = available <= item.minStock;
      return `
                <tr>
                  <td style="font-weight: var(--font-weight-semibold);">${item.name}</td>
                  <td>${createBadge(item.category.replace('-', ' '), 'info')}</td>
                  <td>${item.quantity} ${item.unit}</td>
                  <td>${item.allocated} ${item.unit}</td>
                  <td style="color: ${isLowStock ? 'var(--color-danger)' : 'var(--color-success)'}; font-weight: var(--font-weight-semibold);">
                    ${available} ${item.unit}
                  </td>
                  <td>${item.minStock} ${item.unit}</td>
                  <td>${createBadge(isLowStock ? 'Low Stock' : 'In Stock', isLowStock ? 'danger' : 'success')}</td>
                  <td>
                    <div class="table-actions">
                      <button class="table-action-btn" onclick="inventoryModule.viewItemDetails('${item.id}')" title="View Details">👁️</button>
                      <button class="table-action-btn" onclick="inventoryModule.assignItemQuick('${item.id}')" title="Assign">📤</button>
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  filterByCategory(category) {
    // Reset all filters
    ['all', 'textbooks', 'furniture', 'lab-equipment', 'electronics', 'stationery'].forEach(cat => {
      const btn = document.getElementById(`cat-${cat}`);
      if (btn) {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      }
    });

    // Activate selected filter
    const activeBtn = document.getElementById(`cat-${category}`);
    if (activeBtn) {
      activeBtn.style.background = 'var(--gradient-primary)';
      activeBtn.style.color = 'white';
    }

    // Filter items
    let items = dataManager.getAll('inventory');
    if (category !== 'all') {
      items = items.filter(item => item.category === category);
    }

    // Update table
    document.getElementById('inventory-container').innerHTML = this.renderInventoryTable(items);
  },

  // ========== REQUESTS TAB ==========
  renderRequestsTab() {
    const requests = dataManager.getAll('inventoryRequests');

    // Group by status
    const pending = requests.filter(r => r.status === 'pending');
    const approved = requests.filter(r => r.status === 'approved');
    const rejected = requests.filter(r => r.status === 'rejected');

    return `
      <div>
        <!-- Pending Requests -->
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
          Pending Requests (${pending.length})
        </h3>
        ${pending.length === 0 ? `
          <div class="card mb-6" style="text-align: center; padding: var(--space-8);">
            <p style="color: var(--text-secondary);">No pending requests</p>
          </div>
        ` : `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            ${pending.map(req => this.renderRequestCard(req)).join('')}
          </div>
        `}

        <!-- Approved Requests -->
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
          Approved Requests (${approved.length})
        </h3>
        ${approved.length === 0 ? `
          <div class="card mb-6" style="text-align: center; padding: var(--space-8);">
            <p style="color: var(--text-secondary);">No approved requests</p>
          </div>
        ` : `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            ${approved.map(req => this.renderRequestCard(req)).join('')}
          </div>
        `}

        <!-- Rejected Requests -->
        ${rejected.length > 0 ? `
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
            Rejected Requests (${rejected.length})
          </h3>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            ${rejected.map(req => this.renderRequestCard(req)).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  renderRequestCard(request) {
    const statusColors = {
      pending: 'warning',
      approved: 'success',
      rejected: 'danger'
    };

    const priorityColors = {
      urgent: 'danger',
      high: 'warning',
      medium: 'info',
      low: 'success'
    };

    return `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-4);">
          <div>
            <h4 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--text-primary); margin-bottom: var(--space-2);">
              ${request.itemName}
            </h4>
            <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
              ${createBadge(request.status, statusColors[request.status])}
              ${createBadge(request.priority, priorityColors[request.priority])}
              ${createBadge(request.category.replace('-', ' '), 'info')}
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">Quantity</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">${request.quantity} units</p>
          </div>
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">Est. Cost</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">${formatCurrency(request.estimatedCost)}</p>
          </div>
        </div>

        <div style="margin-bottom: var(--space-4);">
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Justification</p>
          <p style="color: var(--text-primary); font-size: var(--font-size-sm);">${request.justification}</p>
        </div>

        <div style="margin-bottom: var(--space-4);">
          <p style="color: var(--text-tertiary); font-size: var(--font-size-xs);">
            Requested by ${request.requestedByName} • ${timeAgo(request.requestedDate)}
          </p>
          ${request.reviewedBy ? `
            <p style="color: var(--text-tertiary); font-size: var(--font-size-xs); margin-top: var(--space-1);">
              Reviewed ${timeAgo(request.reviewedDate)}
              ${request.reviewNotes ? `• ${request.reviewNotes}` : ''}
            </p>
          ` : ''}
        </div>

        ${request.status === 'pending' ? `
          <div style="display: flex; gap: var(--space-2);">
            <button class="btn btn-primary btn-sm" onclick="inventoryModule.approveRequest('${request.id}')" style="flex: 1;">
              ✓ Approve
            </button>
            <button class="btn btn-ghost btn-sm" onclick="inventoryModule.editRequest('${request.id}')">
              ✏️ Edit
            </button>
            <button class="btn btn-danger btn-sm" onclick="inventoryModule.rejectRequest('${request.id}')">
              ✗ Reject
            </button>
          </div>
        ` : ''}
      </div>
    `;
  },

  // ========== ASSIGNMENTS TAB ==========
  renderAssignmentsTab() {
    const assignments = dataManager.getAll('inventoryAssignments');
    const active = assignments.filter(a => a.status === 'active');
    const returned = assignments.filter(a => a.status === 'returned');

    return `
      <div>
        <!-- Active Assignments -->
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
          Active Assignments (${active.length})
        </h3>
        ${active.length === 0 ? `
          <div class="card mb-6" style="text-align: center; padding: var(--space-8);">
            <p style="color: var(--text-secondary);">No active assignments</p>
          </div>
        ` : `
          <div class="table-container mb-8">
            ${this.renderAssignmentsTable(active)}
          </div>
        `}

        <!-- Returned Assignments -->
        ${returned.length > 0 ? `
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4); color: var(--text-primary);">
            Returned Assignments (${returned.length})
          </h3>
          <div class="table-container">
            ${this.renderAssignmentsTable(returned)}
          </div>
        ` : ''}
      </div>
    `;
  },

  renderAssignmentsTable(assignments) {
    return `
      <table class="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Assigned To</th>
            <th>Type</th>
            <th>Quantity</th>
            <th>Assigned Date</th>
            <th>Condition</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${assignments.map(assignment => `
            <tr>
              <td style="font-weight: var(--font-weight-semibold);">${assignment.itemName}</td>
              <td>${assignment.assigneeName}</td>
              <td>${createBadge(assignment.assigneeType, assignment.assigneeType === 'staff' ? 'primary' : 'info')}</td>
              <td>${assignment.quantity}</td>
              <td>${formatDate(assignment.assignedDate)}</td>
              <td>${createBadge(assignment.condition, assignment.condition === 'good' ? 'success' : 'warning')}</td>
              <td>${createBadge(assignment.status, assignment.status === 'active' ? 'success' : 'info')}</td>
              <td>
                <div class="table-actions">
                  <button class="table-action-btn" onclick="inventoryModule.viewAssignment('${assignment.id}')" title="View Details">👁️</button>
                  ${assignment.status === 'active' ? `
                    <button class="table-action-btn" onclick="inventoryModule.returnItem('${assignment.id}')" title="Mark as Returned">↩️</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  // ========== ITEM MANAGEMENT MODALS ==========

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
              <option value="textbooks">Textbooks</option>
              <option value="furniture">Furniture</option>
              <option value="lab-equipment">Lab Equipment</option>
              <option value="electronics">Electronics</option>
              <option value="stationery">Stationery</option>
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
            <input type="text" class="form-input" name="unit" required placeholder="pieces, boxes, etc.">
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
            <label class="form-label">Location/Storage</label>
            <input type="text" class="form-input" name="location" placeholder="Store Room A">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" name="description" rows="3" placeholder="Item description, specifications, etc."></textarea>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Add Item</button>
        </div>
      </form>
    `;

    createModal('Add New Item', content);
  },

  async submitAddItem(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const itemData = {
      name: formData.get('name'),
      category: formData.get('category'),
      quantity: parseInt(formData.get('quantity')),
      unit: formData.get('unit'),
      minStock: parseInt(formData.get('minStock')),
      unitCost: parseFloat(formData.get('unitCost')) || 0,
      location: formData.get('location') || '',
      description: formData.get('description') || '',
      allocated: 0,
      dateAdded: new Date().toISOString()
    };

    const newItem = await dataManager.create('inventory', itemData);
    if (!newItem) return;

    // Log transaction
    const session = authManager?.getSession();
    await dataManager.logInventoryTransaction(
      'addition',
      newItem.id,
      newItem.name,
      newItem.quantity,
      session?.fullName || 'Admin',
      { unitCost: newItem.unitCost, category: newItem.category }
    );

    showToast('Item added successfully!', 'success');

    closeModal();
    this.render();
  },

  showEditItemModal(itemId) {
    const item = dataManager.getById('inventory', itemId);

    const content = `
      <form id="edit-item-form" onsubmit="inventoryModule.submitEditItem(event, '${itemId}')">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Item Name *</label>
            <input type="text" class="form-input" name="name" required value="${item.name}">
          </div>

          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-select" name="category" required>
              <option value="textbooks" ${item.category === 'textbooks' ? 'selected' : ''}>Textbooks</option>
              <option value="furniture" ${item.category === 'furniture' ? 'selected' : ''}>Furniture</option>
              <option value="lab-equipment" ${item.category === 'lab-equipment' ? 'selected' : ''}>Lab Equipment</option>
              <option value="electronics" ${item.category === 'electronics' ? 'selected' : ''}>Electronics</option>
              <option value="stationery" ${item.category === 'stationery' ? 'selected' : ''}>Stationery</option>
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
            <input type="text" class="form-input" name="unit" required value="${item.unit}">
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
            <label class="form-label">Location/Storage</label>
            <input type="text" class="form-input" name="location" value="${item.location || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" name="description" rows="3">${item.description || ''}</textarea>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Save Changes</button>
        </div>
      </form>
    `;

    createModal('Edit Item', content);
  },

  async submitEditItem(event, itemId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const item = dataManager.getById('inventory', itemId);

    const updates = {
      name: formData.get('name'),
      category: formData.get('category'),
      quantity: parseInt(formData.get('quantity')),
      unit: formData.get('unit'),
      minStock: parseInt(formData.get('minStock')),
      unitCost: parseFloat(formData.get('unitCost')) || 0,
      location: formData.get('location') || '',
      description: formData.get('description') || ''
    };

    const result = await dataManager.update('inventory', itemId, { ...item, ...updates });
    if (!result) return;

    // Log transaction
    const session = authManager?.getSession();
    await dataManager.logInventoryTransaction(
      'edit',
      itemId,
      updates.name,
      updates.quantity,
      session?.fullName || 'Admin',
      { changes: 'Item details updated' }
    );

    showToast('Item updated successfully!', 'success');

    closeModal();
    this.render();
  },

  async deleteItem(itemId) {
    const item = dataManager.getById('inventory', itemId);

    if (item.allocated > 0) {
      showToast('Cannot delete item with active assignments', 'danger');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) {
      return;
    }

    await dataManager.delete('inventory', itemId);
    showToast('Item deleted successfully', 'success');
    this.render();
  },

  // ========== MODALS & ACTIONS ==========

  showRequestModal() {
    const content = `
      <form id="request-form" onsubmit="inventoryModule.submitRequest(event)">
        <div class="form-group">
          <label class="form-label">Item Name</label>
          <input type="text" class="form-input" name="itemName" required placeholder="e.g., Whiteboard Markers">
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" name="category" required>
              <option value="">Select Category</option>
              <option value="textbooks">Textbooks</option>
              <option value="furniture">Furniture</option>
              <option value="lab-equipment">Lab Equipment</option>
              <option value="electronics">Electronics</option>
              <option value="stationery">Stationery</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-select" name="priority" required>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="number" class="form-input" name="quantity" required min="1" placeholder="50">
          </div>

          <div class="form-group">
            <label class="form-label">Estimated Cost (₦)</label>
            <input type="number" class="form-input" name="estimatedCost" required min="0" placeholder="25000">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Justification</label>
          <textarea class="form-textarea" name="justification" required placeholder="Explain why this item is needed..." rows="4"></textarea>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Submit Request</button>
        </div>
      </form>
    `;

    createModal('Request Inventory Item', content);
  },

  async submitRequest(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const session = authManager?.getSession();
    const requestData = {
      itemName: formData.get('itemName'),
      category: formData.get('category'),
      quantity: parseInt(formData.get('quantity')),
      estimatedCost: parseInt(formData.get('estimatedCost')),
      justification: formData.get('justification'),
      requestedBy: session?.userId || session?.supabaseId || 'unknown',
      requestedByName: session?.fullName || 'Current User',
      requestedDate: new Date().toISOString(),
      status: 'pending',
      reviewedBy: null,
      reviewedDate: null,
      reviewNotes: null,
      priority: formData.get('priority')
    };

    const result = await dataManager.create('inventoryRequests', requestData);
    if (!result) return;
    showToast('Request submitted successfully!', 'success');

    // Close modal and switch to requests tab
    closeModal();
    this.currentTab = 'requests';
    this.render();
  },

  showAssignModal() {
    const inventory = dataManager.getAll('inventory');
    const staff = dataManager.getAll('staff');

    const content = `
      <form id="assign-form" onsubmit="inventoryModule.submitAssignment(event)">
        <div class="form-group">
          <label class="form-label">Select Item</label>
          <select class="form-select" name="itemId" required onchange="inventoryModule.updateAvailableQty(this.value)">
            <option value="">Choose an item</option>
            ${inventory.map(item => {
      const available = item.quantity - item.allocated;
      return `<option value="${item.id}" data-available="${available}" data-name="${item.name}">${item.name} (${available} available)</option>`;
    }).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Assign To</label>
          <div style="display: flex; gap: var(--space-4); margin-bottom: var(--space-3);">
            <label class="form-checkbox">
              <input type="radio" name="assigneeType" value="staff" checked onchange="inventoryModule.toggleAssigneeType('staff')">
              <span>Staff Member</span>
            </label>
            <label class="form-checkbox">
              <input type="radio" name="assigneeType" value="classroom" onchange="inventoryModule.toggleAssigneeType('classroom')">
              <span>Classroom</span>
            </label>
          </div>

          <select class="form-select" name="assigneeId" id="assignee-select" required>
            <option value="">Select staff member</option>
            ${staff.map(s => `<option value="${s.id}" data-name="${s.name}">${s.name} - ${s.subject}</option>`).join('')}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="number" class="form-input" name="quantity" required min="1" value="1" id="assign-quantity">
            <p class="form-help" id="available-qty-help">Available: -</p>
          </div>

          <div class="form-group">
            <label class="form-label">Condition</label>
            <select class="form-select" name="condition" required>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Expected Return Date (Optional)</label>
          <input type="date" class="form-input" name="expectedReturnDate">
        </div>

        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" name="notes" placeholder="Purpose, location, special instructions..." rows="3"></textarea>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Assign Item</button>
        </div>
      </form>
    `;

    createModal('Assign Inventory Item', content);
  },

  toggleAssigneeType(type) {
    const select = document.getElementById('assignee-select');
    const staff = dataManager.getAll('staff');

    if (type === 'staff') {
      select.innerHTML = `
        <option value="">Select staff member</option>
        ${staff.map(s => `<option value="${s.id}" data-name="${s.name}">${s.name} - ${s.subject}</option>`).join('')}
      `;
    } else {
      // Classroom options — generated from schoolConfig
      const classes = dataManager.getAll('classes') || [];
      if (classes.length > 0) {
        select.innerHTML = `<option value="">Select classroom</option>` +
          classes.map(c => `<option value="classroom-${c.grade}-${c.section}" data-name="${c.grade}-${c.section}">${c.grade}-${c.section} (${c.room || 'No room'})</option>`).join('');
      } else {
        // Fallback to schoolConfig grades
        const allGrades = schoolConfig.getAllGrades();
        select.innerHTML = `<option value="">Select classroom</option>` +
          allGrades.flatMap(g => (g.sections || ['A']).map(s =>
            `<option value="classroom-${g.code}-${s}" data-name="${g.name}-${s}">${g.name}-${s}</option>`
          )).join('');
      }
    }
  },

  updateAvailableQty(itemId) {
    if (!itemId) return;

    const item = dataManager.getById('inventory', itemId);
    const available = item.quantity - item.allocated;

    const helpText = document.getElementById('available-qty-help');
    const qtyInput = document.getElementById('assign-quantity');

    if (helpText) {
      helpText.textContent = `Available: ${available} ${item.unit}`;
      helpText.style.color = available > 0 ? 'var(--color-success)' : 'var(--color-danger)';
    }

    if (qtyInput) {
      qtyInput.max = available;
    }
  },

  async submitAssignment(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const itemId = formData.get('itemId');
    const item = dataManager.getById('inventory', itemId);
    const assigneeId = formData.get('assigneeId');
    const assigneeType = formData.get('assigneeType');
    const assigneeSelect = document.querySelector(`#assignee-select option[value="${assigneeId}"]`);
    const assigneeName = assigneeSelect.dataset.name;

    const assignmentData = {
      itemId: itemId,
      itemName: item.name,
      assignedTo: assigneeId,
      assigneeType: assigneeType,
      assigneeName: assigneeName,
      quantity: parseInt(formData.get('quantity')),
      assignedDate: new Date().toISOString(),
      assignedBy: 'admin-1',
      assignedByName: 'Admin User',
      expectedReturnDate: formData.get('expectedReturnDate') || null,
      returnedDate: null,
      status: 'active',
      condition: formData.get('condition'),
      notes: formData.get('notes') || ''
    };

    // Update item allocated quantity
    item.allocated += assignmentData.quantity;
    await dataManager.update('inventory', item.id, item);

    // Create assignment
    const newAssignment = await dataManager.create('inventoryAssignments', assignmentData);
    if (!newAssignment) return;

    // Log transaction
    await dataManager.logInventoryTransaction(
      'assignment',
      itemId,
      item.name,
      assignmentData.quantity,
      session?.fullName || 'Admin',
      { assigneeName: assigneeName, assigneeType: assigneeType }
    );

    showToast('Item assigned successfully!', 'success');

    // Close modal and switch to assignments tab
    closeModal();
    this.currentTab = 'assignments';
    this.render();
  },

  // Request Actions
  async approveRequest(requestId) {
    const request = dataManager.getById('inventoryRequests', requestId);
    const session = authManager?.getSession();
    request.status = 'approved';
    request.reviewedBy = session?.userId || 'admin';
    request.reviewedDate = new Date().toISOString();
    request.reviewNotes = 'Approved';

    await dataManager.update('inventoryRequests', requestId, request);
    showToast('Request approved!', 'success');
    this.render();
  },

  async rejectRequest(requestId) {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    const request = dataManager.getById('inventoryRequests', requestId);
    const session = authManager?.getSession();
    request.status = 'rejected';
    request.reviewedBy = session?.userId || 'admin';
    request.reviewedDate = new Date().toISOString();
    request.reviewNotes = reason;

    await dataManager.update('inventoryRequests', requestId, request);
    showToast('Request rejected', 'info');
    this.render();
  },

  editRequest(requestId) {
    const request = dataManager.getById('inventoryRequests', requestId);
    if (!request) return;

    const content = `
      <form id="edit-request-form" onsubmit="inventoryModule.submitEditRequest(event, '${requestId}')">
        <div class="form-group">
          <label class="form-label">Item Name</label>
          <input type="text" class="form-input" name="itemName" required value="${request.itemName}">
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" name="category" required>
              <option value="textbooks" ${request.category === 'textbooks' ? 'selected' : ''}>Textbooks</option>
              <option value="furniture" ${request.category === 'furniture' ? 'selected' : ''}>Furniture</option>
              <option value="lab-equipment" ${request.category === 'lab-equipment' ? 'selected' : ''}>Lab Equipment</option>
              <option value="electronics" ${request.category === 'electronics' ? 'selected' : ''}>Electronics</option>
              <option value="stationery" ${request.category === 'stationery' ? 'selected' : ''}>Stationery</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-select" name="priority" required>
              <option value="low" ${request.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${request.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${request.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="urgent" ${request.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="number" class="form-input" name="quantity" required min="1" value="${request.quantity}">
          </div>
          <div class="form-group">
            <label class="form-label">Estimated Cost (₦)</label>
            <input type="number" class="form-input" name="estimatedCost" required min="0" value="${request.estimatedCost}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Justification</label>
          <textarea class="form-textarea" name="justification" required rows="4">${request.justification}</textarea>
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
    const formData = new FormData(event.target);
    const updates = {
      itemName: formData.get('itemName'),
      category: formData.get('category'),
      quantity: parseInt(formData.get('quantity')),
      estimatedCost: parseInt(formData.get('estimatedCost')),
      justification: formData.get('justification'),
      priority: formData.get('priority')
    };

    await dataManager.update('inventoryRequests', requestId, updates);
    showToast('Request updated successfully!', 'success');
    closeModal();
    this.render();
  },

  // Assignment Actions
  async returnItem(assignmentId) {
    const assignment = dataManager.getById('inventoryAssignments', assignmentId);
    if (!assignment) { showToast('Assignment not found.', 'error'); return; }
    if (assignment.status === 'returned') { showToast('Item has already been returned.', 'warning'); return; }

    if (!confirm('Mark this item as returned?')) return;

    assignment.status = 'returned';
    assignment.returnedDate = new Date().toISOString();

    // Update item allocated quantity — guard against going negative
    const item = dataManager.getById('inventory', assignment.itemId);
    if (item) {
      item.allocated = Math.max(0, (item.allocated || 0) - (assignment.quantity || 0));
      await dataManager.update('inventory', item.id, item);
    }

    await dataManager.update('inventoryAssignments', assignmentId, assignment);

    const performedBy = authManager?.getSession?.()?.fullName || authManager?.getSession?.()?.name || 'Admin';

    // Log transaction
    await dataManager.logInventoryTransaction(
      'return',
      assignment.itemId,
      assignment.itemName,
      assignment.quantity,
      performedBy,
      { assigneeName: assignment.assigneeName, returnedDate: assignment.returnedDate }
    );

    showToast('Item marked as returned!', 'success');
    this.render();
  },

  viewAssignment(assignmentId) {
    const assignment = dataManager.getById('inventoryAssignments', assignmentId);

    const content = `
      <div style="display: grid; gap: var(--space-4);">
        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Item</p>
          <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">${assignment.itemName}</p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Assigned To</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">${assignment.assigneeName}</p>
            <p style="color: var(--text-tertiary); font-size: var(--font-size-xs);">${assignment.assigneeType === 'staff' ? 'Staff Member' : 'Classroom'}</p>
          </div>

          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Quantity</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold);">${assignment.quantity}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Assigned Date</p>
            <p style="color: var(--text-primary);">${formatDate(assignment.assignedDate)}</p>
          </div>

          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Condition</p>
            ${createBadge(assignment.condition, assignment.condition === 'good' ? 'success' : 'warning')}
          </div>
        </div>

        ${assignment.notes ? `
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Notes</p>
            <p style="color: var(--text-primary);">${assignment.notes}</p>
          </div>
        ` : ''}

        <div>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Status</p>
          ${createBadge(assignment.status, assignment.status === 'active' ? 'success' : 'info')}
        </div>

        ${assignment.status === 'returned' ? `
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Returned Date</p>
            <p style="color: var(--text-primary);">${formatDate(assignment.returnedDate)}</p>
          </div>
        ` : ''}
      </div>
    `;

    createModal('Assignment Details', content);
  },

  viewItemDetails(itemId) {
    const item = dataManager.getById('inventory', itemId);
    const assignments = dataManager.getAll('inventoryAssignments').filter(a => a.itemId === itemId && a.status === 'active');

    const content = `
      <div style="display: grid; gap: var(--space-4);">
        <div>
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); color: var(--text-primary); margin-bottom: var(--space-2);">
            ${item.name}
          </h3>
          ${createBadge(item.category.replace('-', ' '), 'info')}
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Total Quantity</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">${item.quantity} ${item.unit}</p>
          </div>

          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Allocated</p>
            <p style="color: var(--text-primary); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">${item.allocated} ${item.unit}</p>
          </div>

          <div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Available</p>
            <p style="color: var(--color-success); font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">${item.quantity - item.allocated} ${item.unit}</p>
          </div>
        </div>

        ${assignments.length > 0 ? `
          <div>
            <h4 style="font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); color: var(--text-primary); margin-bottom: var(--space-3);">
              Current Assignments (${assignments.length})
            </h4>
            <div style="display: flex; flex-direction: column; gap: var(--space-2);">
              ${assignments.map(a => `
                <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-lg);">
                  <p style="color: var(--text-primary); font-weight: var(--font-weight-medium);">${a.assigneeName}</p>
                  <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">${a.quantity} ${item.unit} • ${a.assigneeType === 'staff' ? 'Staff' : 'Classroom'}</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    createModal('Item Details', content);
  },

  assignItemQuick(itemId) {
    this.showAssignModal();
    // Pre-select the item
    setTimeout(() => {
      const select = document.querySelector('select[name="itemId"]');
      if (select) {
        select.value = itemId;
        this.updateAvailableQty(itemId);
      }
    }, 100);
  }
};

window.inventoryModule = inventoryModule;
