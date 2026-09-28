// ============================================
// INVENTORY
// ============================================
// Items, requests to buy, items on loan, and the stock history.
//
// The figures:
//   in store  = quantity - on loan (allocated)
//   low       = none in store, or in store at or below a minimum above 0
//   value     = quantity x unit cost (items on loan still belong to the school)
//   restock   = the unit cost becomes the average of the stock held and the
//               stock received, weighted by quantity, so value = what was paid
//
// Quantity only changes through Adjust stock, a stock count, a request being
// received, or an item returned as lost, and each writes a history line.
//
// Column notes (data-manager whitelist): requests have no supplier or
// requested_date column, so the supplier goes into notes and the date is
// created_at; assignments keep the return condition in condition_in and the
// return note appended to notes.
// ============================================

const inventoryModule = {
  _container: null,
  _tab: 'items',
  _f: { q: '', cat: 'all', low: false },
  _hist: { from: '', to: '', type: 'all', q: '' },

  CATEGORIES: [
    { value: 'textbooks',     label: 'Textbooks' },
    { value: 'furniture',     label: 'Furniture' },
    { value: 'lab-equipment', label: 'Lab equipment' },
    { value: 'electronics',   label: 'Electronics' },
    { value: 'stationery',    label: 'Stationery' },
    { value: 'sports',        label: 'Sports' },
    { value: 'other',         label: 'Other' },
  ],

  async init(container) {
    this._container = container;
    await dataManager.waitForReady();
    this.render();
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = (e) => {
      if (['inventory', 'inventoryRequests', 'inventoryAssignments', 'inventoryHistory'].includes(e.detail?.collection)) this.render();
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  // ── Helpers and figures ───────────────────────────────────

  _esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  },

  money(n) {
    return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
  },

  date(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  who() {
    const s = window.authManager?.getSession?.() || {};
    return { id: s.userId || s.supabaseId || 'unknown', name: s.fullName || 'Admin' };
  },

  catLabel(v) {
    return this.CATEGORIES.find(c => c.value === v)?.label || (v ? String(v) : 'Other');
  },

  catOptions(selected = '') {
    return this.CATEGORIES.map(c => `<option value="${c.value}" ${selected === c.value ? 'selected' : ''}>${c.label}</option>`).join('');
  },

  qty(i)       { return this.num(i.quantity); },
  onLoan(i)    { return this.num(i.allocated); },
  inStore(i)   { return Math.max(0, this.qty(i) - this.onLoan(i)); },
  minStock(i)  { return this.num(i.minStock ?? i.min_stock); },
  unitCost(i)  { return this.num(i.unitCost ?? i.unit_cost ?? i.unitPrice ?? i.unit_price); },
  value(i)     { return this.qty(i) * this.unitCost(i); },
  isOut(i)     { return this.inStore(i) === 0; },
  isLow(i)     { return this.isOut(i) || (this.minStock(i) > 0 && this.inStore(i) <= this.minStock(i)); },
  unit(i)      { return i.unit || ''; },

  /** Unit cost after receiving `addQty` at `addCost`: the quantity-weighted average. */
  averageCost(oldQty, oldCost, addQty, addCost) {
    const total = oldQty + addQty;
    if (total <= 0) return addCost || oldCost || 0;
    return Math.round(((oldQty * oldCost + addQty * addCost) / total) * 100) / 100;
  },

  isOverdue(a, now = new Date()) {
    const due = a.expectedReturnDate || a.expected_return_date;
    if (a.status !== 'active' || !due) return false;
    return new Date(String(due).slice(0, 10) + 'T23:59:59') < now;
  },

  items()       { return dataManager.getAll('inventory') || []; },
  requests()    { return dataManager.getAll('inventoryRequests') || []; },
  assignments() { return dataManager.getAll('inventoryAssignments') || []; },

  figures() {
    const items = this.items();
    const active = this.assignments().filter(a => a.status === 'active');
    return {
      items,
      value: items.reduce((a, i) => a + this.value(i), 0),
      low: items.filter(i => this.isLow(i)),
      out: items.filter(i => this.isOut(i)),
      pending: this.requests().filter(r => r.status === 'pending'),
      approved: this.requests().filter(r => r.status === 'approved'),
      active,
      overdue: active.filter(a => this.isOverdue(a))
    };
  },

  /** Save quantity/allocated together with the matching `available` column. */
  async _saveStock(item, changes) {
    const next = { ...item, ...changes };
    next.available = Math.max(0, this.num(next.quantity) - this.num(next.allocated));
    return dataManager.update('inventory', item.id, next);
  },

  async _log(type, item, quantity, details = {}) {
    await dataManager.logInventoryTransaction(type, item.id, item.name, quantity, this.who().name, details);
  },

  // ── Page ─────────────────────────────────────────────────

  switchTab(tab) {
    this._tab = tab;
    this.render();
  },

  render() {
    if (!this._container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'inventory') return;
    const f = this.figures();
    const kpi = (label, value, sub, onclick) => `
      <button type="button" class="ui-card ui-kpi" onclick="${onclick}">
        <span class="ui-kpi-label">${label}</span><span class="ui-kpi-value">${value}</span><span class="ui-kpi-sub">${sub}</span>
      </button>`;
    const tabs = [
      ['items', 'Items'],
      ['requests', `Requests${f.pending.length ? ` (${f.pending.length})` : ''}`],
      ['loans', `On loan${f.active.length ? ` (${f.active.length})` : ''}`],
      ['history', 'History']
    ];

    this._container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Inventory</h1>
            <p class="ui-page-sub">${f.items.length} item${f.items.length === 1 ? '' : 's'} · ${this.money(f.value)} in stock</p>
          </div>
          <div class="ui-actions">
            <button type="button" class="ui-btn" onclick="inventoryModule.importCSV()">Import CSV</button>
            <button type="button" class="ui-btn" onclick="inventoryModule.exportInventory()">Export</button>
            <button type="button" class="ui-btn" onclick="inventoryModule.showRequestModal()">Request an item</button>
            <button type="button" class="ui-btn" onclick="inventoryModule.showAssignModal()">Lend an item</button>
            <button type="button" class="ui-btn ui-btn-primary" onclick="inventoryModule.showAddItemModal()">Add item</button>
          </div>
        </div>

        <div class="ui-grid-4">
          ${kpi('Stock value', this.money(f.value), 'quantity × unit cost', "inventoryModule._f = { q: '', cat: 'all', low: false }; inventoryModule.switchTab('items')")}
          ${kpi('Low or out', f.low.length, f.out.length ? `${f.out.length} out of stock` : 'at or below minimum', "inventoryModule._f = { q: '', cat: 'all', low: true }; inventoryModule.switchTab('items')")}
          ${kpi('Requests waiting', f.pending.length, f.approved.length ? `${f.approved.length} approved, not received` : 'to approve or reject', "inventoryModule.switchTab('requests')")}
          ${kpi('On loan', f.active.length, f.overdue.length ? `${f.overdue.length} overdue` : 'none overdue', "inventoryModule.switchTab('loans')")}
        </div>

        <div role="tablist" aria-label="Inventory" class="sr-tabs">
          ${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${this._tab === id}" class="sr-tab${this._tab === id ? ' is-on' : ''}" onclick="inventoryModule.switchTab('${id}')">${label}</button>`).join('')}
        </div>

        <div id="inv-tab-content">${this.renderTabContent()}</div>
      </div>`;
  },

  renderTabContent() {
    switch (this._tab) {
      case 'requests': return this.requestsHTML();
      case 'loans':    return this.loansHTML();
      case 'history':  return this.historyHTML();
      default:         return this.itemsHTML();
    }
  },

  _redrawTab(focusId) {
    const box = document.getElementById('inv-tab-content');
    if (box) box.innerHTML = this.renderTabContent();
    if (focusId) { const i = document.getElementById(focusId); if (i) { i.focus(); i.setSelectionRange?.(i.value.length, i.value.length); } }
  },

  // ── Items ────────────────────────────────────────────────

  setFilter(field, value) {
    this._f[field] = value;
    this._redrawTab(field === 'q' ? 'inv-q' : null);
  },

  itemsHTML() {
    const all = this.items();
    const q = this._f.q.trim().toLowerCase();
    const rows = all
      .filter(i => this._f.cat === 'all' || (i.category || 'other') === this._f.cat)
      .filter(i => !this._f.low || this.isLow(i))
      .filter(i => !q || [i.name, i.location, i.supplier, this.catLabel(i.category)].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => (this.isLow(b) - this.isLow(a)) || String(a.name || '').localeCompare(String(b.name || '')));
    const shownValue = rows.reduce((a, i) => a + this.value(i), 0);

    return `
      <div class="ui-card sd-filters">
        <label class="sd-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
          <input id="inv-q" type="search" aria-label="Search items" placeholder="Search by name, place or supplier" value="${this._esc(this._f.q)}" oninput="inventoryModule.setFilter('q', this.value)">
        </label>
        <select class="sd-select" aria-label="Category" onchange="inventoryModule.setFilter('cat', this.value)">
          <option value="all">All categories</option>${this.catOptions(this._f.cat)}
        </select>
        <select class="sd-select" aria-label="Stock" onchange="inventoryModule.setFilter('low', this.value === 'low')">
          <option value="all">All stock levels</option>
          <option value="low" ${this._f.low ? 'selected' : ''}>Low or out only</option>
        </select>
        <button type="button" class="ui-btn" onclick="inventoryModule.showStockCountModal()">Stock count</button>
      </div>

      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head">
          <h2 class="ui-card-title">${rows.length} of ${all.length} item${all.length === 1 ? '' : 's'}</h2>
          <span class="ui-card-note">${this.money(shownValue)}</span>
        </div>
        ${rows.length ? `
          <table class="pc-table sr-table fp-table inv-table fp-clickable">
            <thead><tr><th>Item</th><th>In store</th><th>On loan</th><th>Unit cost</th><th>Value</th><th>Stock</th></tr></thead>
            <tbody>${rows.map(i => `
              <tr tabindex="0" onclick="inventoryModule.viewItemDetails('${this._esc(i.id)}')" onkeydown="if(event.key==='Enter')inventoryModule.viewItemDetails('${this._esc(i.id)}')">
                <td><strong>${this._esc(i.name || 'Unnamed')}</strong><span class="ui-row-meta">${this._esc([this.catLabel(i.category), i.location].filter(Boolean).join(' · '))}</span></td>
                <td>${this.inStore(i)} ${this._esc(this.unit(i))}</td>
                <td>${this.onLoan(i) || '—'}</td>
                <td>${this.money(this.unitCost(i))}</td>
                <td>${this.money(this.value(i))}</td>
                <td>${this.isOut(i) ? '<span class="ui-chip is-warn">Out</span>' : this.isLow(i) ? '<span class="ui-chip is-warn">Low</span>' : '<span class="ui-chip is-good">OK</span>'}</td>
              </tr>`).join('')}</tbody>
          </table>`
        : `<p class="ui-empty">${all.length ? 'No item matches.' : 'No items yet. Use "Add item" or "Import CSV".'}</p>`}
      </section>`;
  },

  viewItemDetails(itemId) {
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    const loans = this.assignments().filter(a => (a.itemId || a.item_id) === itemId && a.status === 'active');
    const id = this._esc(itemId);
    const u = this._esc(this.unit(item));
    createModal(this._esc(item.name || 'Item'), `
      <div class="fp-owes">
        <div><span class="ui-row-meta">In store</span><strong>${this.inStore(item)} ${u}</strong></div>
        <div><span class="ui-row-meta">On loan</span><strong>${this.onLoan(item)} ${u}</strong></div>
        <div><span class="ui-row-meta">Total held</span><strong>${this.qty(item)} ${u}</strong></div>
        <div><span class="ui-row-meta">Value</span><strong>${this.money(this.value(item))}</strong></div>
      </div>
      <dl class="sr-dl sr-dl-2" style="margin-top:16px;">
        ${[['Category', this.catLabel(item.category)], ['Unit cost', this.money(this.unitCost(item))], ['Minimum in store', `${this.minStock(item)} ${this.unit(item)}`],
           ['Kept at', item.location || '—'], ['Supplier', item.supplier || '—'], ['Added', this.date(item.dateAdded || item.createdAt)]]
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${this._esc(v)}</dd></div>`).join('')}
      </dl>
      ${item.description ? `<p class="ui-card-note" style="margin-top:12px;">${this._esc(item.description)}</p>` : ''}
      ${loans.length ? `
        <h3 class="ui-card-title" style="margin-top:18px;font-size:0.9375rem;">On loan to</h3>
        ${loans.map(a => `<div class="ui-row"><span class="ui-dot ${this.isOverdue(a) ? 'is-urgent' : ''}" aria-hidden="true"></span><div class="ui-row-main"><div class="ui-row-title">${this._esc(a.assigneeName)}</div><div class="ui-row-meta">${this.num(a.quantity)} ${u} · since ${this.date(a.assignedDate || a.createdAt)}${this.isOverdue(a) ? ' · overdue' : ''}</div></div></div>`).join('')}` : ''}
      <div class="ui-actions" style="justify-content:flex-end;margin-top:18px;flex-wrap:wrap;">
        <button type="button" class="ui-btn" onclick="closeModal(this); inventoryModule.deleteItem('${id}')">Delete</button>
        <button type="button" class="ui-btn" onclick="closeModal(this); inventoryModule.showEditItemModal('${id}')">Edit details</button>
        <button type="button" class="ui-btn" onclick="closeModal(this); inventoryModule.showAssignModal('${id}')">Lend</button>
        <button type="button" class="ui-btn ui-btn-primary" onclick="closeModal(this); inventoryModule.showRestockModal('${id}')">Adjust stock</button>
      </div>`, 'large');
  },

  // ── Add, edit, delete ────────────────────────────────────

  _itemForm(item = null) {
    const e = (v) => this._esc(v ?? '');
    return `
      <form class="fp-form" onsubmit="inventoryModule.${item ? `submitEditItem(event, '${e(item.id)}')` : 'submitAddItem(event)'}">
        <div class="fp-grid">
          <label class="form-group"><span class="form-label">Name</span><input type="text" class="form-input" name="name" required value="${e(item?.name)}" placeholder="e.g. Whiteboard markers"></label>
          <label class="form-group"><span class="form-label">Category</span><select class="form-select" name="category" required><option value="">Choose…</option>${this.catOptions(item?.category)}</select></label>
          ${item ? `
            <div class="form-group"><span class="form-label">Quantity held</span><div class="fp-who"><strong>${this.qty(item)} ${e(this.unit(item))}</strong><span class="ui-row-meta">Change it with Adjust stock, so it is recorded.</span></div></div>`
          : `<label class="form-group"><span class="form-label">Quantity</span><input type="number" class="form-input" name="quantity" required min="0" step="1" placeholder="100"></label>`}
          <label class="form-group"><span class="form-label">Unit</span><input type="text" class="form-input" name="unit" required value="${e(item?.unit)}" placeholder="pieces, boxes, packs"></label>
          <label class="form-group"><span class="form-label">Minimum to keep in store</span><input type="number" class="form-input" name="minStock" required min="0" step="1" value="${item ? this.minStock(item) : ''}" placeholder="10"></label>
          <label class="form-group"><span class="form-label">Unit cost (₦)</span><input type="number" class="form-input" name="unitCost" min="0" step="0.01" value="${item ? this.unitCost(item) : ''}" placeholder="500"></label>
          <label class="form-group"><span class="form-label">Kept at</span><input type="text" class="form-input" name="location" value="${e(item?.location)}" placeholder="Store room A"></label>
          <label class="form-group"><span class="form-label">Supplier</span><input type="text" class="form-input" name="supplier" value="${e(item?.supplier)}"></label>
        </div>
        <label class="form-group"><span class="form-label">Notes</span><textarea class="form-textarea" name="description" rows="2">${e(item?.description)}</textarea></label>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary">${item ? 'Save' : 'Add item'}</button>
        </div>
      </form>`;
  },

  showAddItemModal() {
    createModal('Add an item', this._itemForm(), 'large');
  },

  async submitAddItem(event) {
    event.preventDefault();
    const f = new FormData(event.target);
    const quantity = Math.max(0, parseInt(f.get('quantity'), 10) || 0);
    const data = {
      name: String(f.get('name')).trim(),
      category: f.get('category'),
      quantity,
      allocated: 0,
      available: quantity,
      unit: String(f.get('unit')).trim(),
      minStock: Math.max(0, parseInt(f.get('minStock'), 10) || 0),
      unitCost: Math.max(0, this.num(f.get('unitCost'))),
      location: String(f.get('location') || '').trim(),
      supplier: String(f.get('supplier') || '').trim(),
      description: String(f.get('description') || '').trim(),
      dateAdded: new Date().toISOString()
    };
    if (this.items().some(i => String(i.name || '').toLowerCase() === data.name.toLowerCase())) {
      showToast(`"${data.name}" is already listed. Use Adjust stock to add to it.`, 'warning');
      return;
    }
    const item = await dataManager.create('inventory', data);
    if (!item) return;
    await this._log('addition', item, quantity, { unitCost: data.unitCost, supplier: data.supplier });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_ADDED', data.name, `Qty: ${quantity} | Unit cost: ₦${data.unitCost}`);
    closeModal();
    showToast(`${data.name} added`, 'success');
    this.render();
  },

  showEditItemModal(itemId) {
    const item = dataManager.getById('inventory', itemId);
    if (item) createModal(`Edit · ${this._esc(item.name)}`, this._itemForm(item), 'large');
  },

  async submitEditItem(event, itemId) {
    event.preventDefault();
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    const f = new FormData(event.target);
    const updates = {
      ...item,
      name: String(f.get('name')).trim(),
      category: f.get('category'),
      unit: String(f.get('unit')).trim(),
      minStock: Math.max(0, parseInt(f.get('minStock'), 10) || 0),
      unitCost: Math.max(0, this.num(f.get('unitCost'))),
      location: String(f.get('location') || '').trim(),
      supplier: String(f.get('supplier') || '').trim(),
      description: String(f.get('description') || '').trim()
    };
    if (!(await dataManager.update('inventory', itemId, updates))) return;
    const costNote = this.unitCost(item) !== updates.unitCost ? { unitCost: `${this.unitCost(item)} → ${updates.unitCost}` } : {};
    await this._log('edit', updates, 0, { changes: 'Details updated', ...costNote });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_UPDATED', updates.name, 'Details updated');
    closeModal();
    showToast('Saved', 'success');
    this.render();
  },

  deleteItem(itemId) {
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    if (this.onLoan(item) > 0) { showToast(`${item.name} has ${this.onLoan(item)} on loan. Record the returns first.`, 'warning'); return; }
    createModal('Delete item', `
      <p>Delete <strong>${this._esc(item.name)}</strong> (${this.qty(item)} ${this._esc(this.unit(item))}, ${this.money(this.value(item))})? Its history stays.</p>
      <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
        <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
        <button type="button" class="ui-btn ui-btn-primary" onclick="inventoryModule._confirmDelete('${this._esc(itemId)}')">Delete</button>
      </div>`);
  },

  async _confirmDelete(itemId) {
    const item = dataManager.getById('inventory', itemId);
    closeModal();
    if (!item) return;
    await dataManager.delete('inventory', itemId);
    await this._log('delete', item, this.qty(item), { value: this.value(item) });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_DELETED', item.name, `Qty was: ${this.qty(item)}`);
    showToast(`${item.name} deleted`, 'success');
    this.render();
  },

  // ── Stock adjustments ────────────────────────────────────

  showRestockModal(itemId) {
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    const u = this._esc(this.unit(item));
    createModal(`Adjust stock · ${this._esc(item.name)}`, `
      <form class="fp-form" onsubmit="inventoryModule.submitRestock(event, '${this._esc(itemId)}')">
        <div class="fp-owes">
          <div><span class="ui-row-meta">Held</span><strong>${this.qty(item)} ${u}</strong></div>
          <div><span class="ui-row-meta">In store</span><strong>${this.inStore(item)} ${u}</strong></div>
        </div>
        <div class="fp-grid">
          <label class="form-group"><span class="form-label">What happened</span>
            <select class="form-select" name="adjustType" required>
              <option value="restock">Received more</option>
              <option value="writeoff">Used up, lost or damaged</option>
              <option value="correction">Correct the count to an exact number</option>
            </select></label>
          <label class="form-group"><span class="form-label">Quantity</span><input type="number" class="form-input" name="quantity" required min="0" step="1"></label>
          <label class="form-group"><span class="form-label">Unit cost paid (₦, when receiving)</span><input type="number" class="form-input" name="unitCost" min="0" step="0.01" placeholder="${this.unitCost(item)}"></label>
          <label class="form-group"><span class="form-label">Supplier</span><input type="text" class="form-input" name="supplier" value="${this._esc(item.supplier || '')}"></label>
        </div>
        <label class="form-group"><span class="form-label">Reason</span><textarea class="form-textarea" name="reason" required rows="2"></textarea></label>
        <p class="ui-card-note">When receiving, the unit cost becomes the average of what is held and what came in.</p>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary">Save</button>
        </div>
      </form>`);
  },

  async submitRestock(event, itemId) {
    event.preventDefault();
    const item = dataManager.getById('inventory', itemId);
    if (!item) return;
    const f = new FormData(event.target);
    const type = f.get('adjustType');
    const n = Math.max(0, parseInt(f.get('quantity'), 10) || 0);
    const reason = String(f.get('reason') || '').trim();
    const supplier = String(f.get('supplier') || '').trim() || item.supplier || '';
    const held = this.qty(item), loan = this.onLoan(item), cost = this.unitCost(item);

    let quantity = held, unitCost = cost, change;
    if (type === 'restock') {
      if (!n) { showToast('Enter how many came in', 'warning'); return; }
      const paid = f.get('unitCost') === '' ? cost : this.num(f.get('unitCost'));
      quantity = held + n;
      unitCost = this.averageCost(held, cost, n, paid);
      change = n;
    } else if (type === 'writeoff') {
      if (!n) { showToast('Enter how many to take off', 'warning'); return; }
      if (n > this.inStore(item)) { showToast(`Only ${this.inStore(item)} ${this.unit(item)} are in store. Items on loan are written off when returned as lost.`, 'warning'); return; }
      quantity = held - n;
      change = -n;
    } else {
      if (n < loan) { showToast(`${loan} are on loan, so the count cannot be below ${loan}.`, 'warning'); return; }
      quantity = n;
      change = n - held;
    }
    if (!(await this._saveStock(item, { quantity, unitCost, supplier }))) return;
    await this._log(type === 'restock' ? 'restock' : 'adjustment', item, Math.abs(change), { adjustType: type, change, from: held, to: quantity, unitCost, reason });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_STOCK_ADJUSTED', item.name, `${type}: ${held} → ${quantity} | ${reason}`);
    closeModal();
    showToast(`${item.name}: ${held} → ${quantity} ${this.unit(item)}`, 'success');
    this.render();
  },

  showStockCountModal() {
    const items = [...this.items()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (!items.length) { showToast('No items to count', 'info'); return; }
    createModal('Stock count', `
      <form onsubmit="inventoryModule.submitStockCount(event)">
        <p class="ui-card-note" style="margin-bottom:12px;">Enter what is physically held (in store plus on loan). Leave an item blank to skip it.</p>
        <div class="inv-count">
          <table class="pc-table sr-table fp-table">
            <thead><tr><th>Item</th><th>Recorded</th><th>Counted</th><th>Difference</th></tr></thead>
            <tbody>${items.map(i => `
              <tr>
                <td>${this._esc(i.name)} <span class="ui-row-meta">${this._esc(this.unit(i))}</span></td>
                <td>${this.qty(i)}</td>
                <td><input type="number" min="0" step="1" class="fp-in fp-amt" style="width:90px;" name="count_${this._esc(i.id)}" aria-label="Counted ${this._esc(i.name)}" oninput="inventoryModule._liveVariance('${this._esc(i.id)}', this.value, ${this.qty(i)})"></td>
                <td id="scount-var-${this._esc(i.id)}">—</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary">Save the count</button>
        </div>
      </form>`, 'large');
  },

  _liveVariance(itemId, value, recorded) {
    const cell = document.getElementById(`scount-var-${itemId}`);
    if (!cell) return;
    const n = parseInt(value, 10);
    cell.textContent = isNaN(n) ? '—' : (n - recorded > 0 ? '+' : '') + (n - recorded);
  },

  async submitStockCount(event) {
    event.preventDefault();
    let changed = 0;
    const skipped = [];
    for (const item of this.items()) {
      const input = event.target.querySelector(`[name="count_${CSS.escape(item.id)}"]`);
      if (!input || input.value === '') continue;
      const counted = parseInt(input.value, 10);
      if (isNaN(counted) || counted === this.qty(item)) continue;
      if (counted < this.onLoan(item)) { skipped.push(item.name); continue; }
      const from = this.qty(item);
      await this._saveStock(item, { quantity: counted });
      await this._log('stock-count', item, Math.abs(counted - from), { systemQty: from, countedQty: counted, variance: counted - from });
      if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_STOCK_COUNT', item.name, `${from} → ${counted}`);
      changed++;
    }
    closeModal();
    if (skipped.length) showToast(`Not changed (count below what is on loan): ${skipped.join(', ')}`, 'warning');
    showToast(changed ? `${changed} item${changed === 1 ? '' : 's'} corrected` : 'Every count matched', changed ? 'success' : 'info');
    this.render();
  },

  // ── Requests ─────────────────────────────────────────────

  requestsHTML() {
    const all = this.requests();
    const by = (s) => all.filter(r => r.status === s).sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
    const section = (title, list, empty) => `
      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head"><h2 class="ui-card-title">${title}</h2><span class="ui-card-note">${list.length}</span></div>
        ${list.length ? list.map(r => this.requestRow(r)).join('') : `<p class="ui-empty">${empty}</p>`}
      </section>`;
    const done = [...by('fulfilled'), ...by('rejected')].slice(0, 20);
    return `
      <div class="ui-actions" style="margin-top:16px;"><button type="button" class="ui-btn" onclick="inventoryModule.showRequestModal()">Request an item</button></div>
      ${section('Waiting for a decision', by('pending'), 'No requests waiting.')}
      ${section('Approved, not yet received', by('approved'), 'Nothing on order.')}
      ${done.length ? section('Recently closed', done, '') : ''}`;
  },

  requestRow(r) {
    const e = (v) => this._esc(v);
    const id = e(r.id);
    const est = this.num(r.estimatedCost);
    const inStock = this.items().find(i => String(i.name || '').toLowerCase() === String(r.itemName || '').toLowerCase());
    const tone = r.priority === 'urgent' ? 'is-urgent' : r.priority === 'high' ? 'is-warn' : '';
    const label = { pending: 'Waiting', approved: 'Approved', fulfilled: 'Received', rejected: 'Rejected' }[r.status] || r.status;
    return `
      <div class="ui-row inv-req">
        <span class="ui-dot ${tone}" aria-hidden="true"></span>
        <div class="ui-row-main">
          <div class="ui-row-title">${e(r.itemName)} · ${this.num(r.quantity)}${est ? ` · about ${this.money(est)}` : ''}</div>
          <div class="ui-row-meta">${e(r.priority || 'medium')} priority · ${e(r.requestedByName || 'someone')} · ${this.date(r.requestedDate || r.createdAt || r.created_at)}${inStock ? ` · ${this.inStore(inStock)} already in store` : ''}</div>
          ${r.justification ? `<div class="ui-row-meta">${e(r.justification)}</div>` : ''}
          ${r.notes ? `<div class="ui-row-meta">${e(r.notes)}</div>` : ''}
          ${r.status === 'rejected' && r.reviewNotes ? `<div class="ui-row-meta">Reason: ${e(r.reviewNotes)}</div>` : ''}
        </div>
        ${r.status === 'pending' ? `
          <div class="ui-actions">
            <button type="button" class="ui-btn ui-btn-sm" onclick="inventoryModule.editRequest('${id}')">Edit</button>
            <button type="button" class="ui-btn ui-btn-sm" onclick="inventoryModule.rejectRequest('${id}')">Reject</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" onclick="inventoryModule.approveRequest('${id}')">Approve</button>
          </div>`
        : r.status === 'approved' ? `<button type="button" class="ui-btn ui-btn-sm ui-btn-primary" onclick="inventoryModule.fulfillRequest('${id}')">Mark received</button>`
        : `<span class="ui-chip ${r.status === 'fulfilled' ? 'is-good' : ''}">${e(label)}</span>`}
      </div>`;
  },

  _requestForm(r = null) {
    const e = (v) => this._esc(v ?? '');
    return `
      <form class="fp-form" onsubmit="inventoryModule.${r ? `submitEditRequest(event, '${e(r.id)}')` : 'submitRequest(event)'}">
        <label class="form-group"><span class="form-label">Item</span><input type="text" class="form-input" name="itemName" required value="${e(r?.itemName)}" list="inv-names"></label>
        <datalist id="inv-names">${this.items().map(i => `<option value="${e(i.name)}">`).join('')}</datalist>
        <div class="fp-grid">
          <label class="form-group"><span class="form-label">Category</span><select class="form-select" name="category" required><option value="">Choose…</option>${this.catOptions(r?.category)}</select></label>
          <label class="form-group"><span class="form-label">Priority</span><select class="form-select" name="priority">${['low', 'medium', 'high', 'urgent'].map(p => `<option value="${p}" ${(r?.priority || 'medium') === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
          <label class="form-group"><span class="form-label">Quantity</span><input type="number" class="form-input" name="quantity" required min="1" step="1" value="${e(r?.quantity)}"></label>
          <label class="form-group"><span class="form-label">Estimated total cost (₦)</span><input type="number" class="form-input" name="estimatedCost" required min="0" value="${r ? this.num(r.estimatedCost) : ''}"></label>
        </div>
        <label class="form-group"><span class="form-label">Preferred supplier</span><input type="text" class="form-input" name="supplier" value="${e(String(r?.notes || '').replace(/^Preferred supplier: /, ''))}"></label>
        <label class="form-group"><span class="form-label">Why it is needed</span><textarea class="form-textarea" name="justification" required rows="3">${e(r?.justification)}</textarea></label>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary">${r ? 'Save' : 'Send request'}</button>
        </div>
      </form>`;
  },

  _readRequest(f) {
    const supplier = String(f.get('supplier') || '').trim();
    return {
      itemName: String(f.get('itemName')).trim(),
      category: f.get('category'),
      priority: f.get('priority') || 'medium',
      quantity: Math.max(1, parseInt(f.get('quantity'), 10) || 1),
      estimatedCost: Math.max(0, this.num(f.get('estimatedCost'))),
      justification: String(f.get('justification') || '').trim(),
      notes: supplier ? `Preferred supplier: ${supplier}` : ''
    };
  },

  showRequestModal() {
    createModal('Request an item', this._requestForm(), 'large');
  },

  async submitRequest(event) {
    event.preventDefault();
    const me = this.who();
    const data = { ...this._readRequest(new FormData(event.target)), requestedBy: me.id, requestedByName: me.name, status: 'pending' };
    if (!(await dataManager.create('inventoryRequests', data))) return;
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_REQUEST_CREATED', data.itemName, `Qty: ${data.quantity} | Priority: ${data.priority}`);
    closeModal();
    showToast('Request sent', 'success');
    this._tab = 'requests';
    this.render();
  },

  editRequest(requestId) {
    const r = dataManager.getById('inventoryRequests', requestId);
    if (r) createModal('Edit request', this._requestForm(r), 'large');
  },

  async submitEditRequest(event, requestId) {
    event.preventDefault();
    const r = dataManager.getById('inventoryRequests', requestId);
    if (!r) return;
    await dataManager.update('inventoryRequests', requestId, { ...r, ...this._readRequest(new FormData(event.target)) });
    closeModal();
    showToast('Request saved', 'success');
    this.render();
  },

  async approveRequest(requestId) {
    const r = dataManager.getById('inventoryRequests', requestId);
    if (!r) return;
    await dataManager.update('inventoryRequests', requestId, { ...r, status: 'approved', reviewedBy: this.who().id, reviewedDate: new Date().toISOString(), reviewNotes: 'Approved' });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_REQUEST_APPROVED', r.itemName, `By: ${r.requestedByName} | Qty: ${r.quantity}`);
    showToast('Approved. Use "Mark received" when it arrives.', 'success');
    this.render();
  },

  rejectRequest(requestId) {
    const r = dataManager.getById('inventoryRequests', requestId);
    if (!r) return;
    createModal('Reject request', `
      <p>Reject the request for <strong>${this._esc(r.itemName)}</strong>?</p>
      <label class="form-group" style="margin-top:12px;"><span class="form-label">Reason</span><textarea class="form-textarea" id="reject-reason" rows="3"></textarea></label>
      <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
        <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
        <button type="button" class="ui-btn ui-btn-primary" onclick="inventoryModule._confirmReject('${this._esc(requestId)}')">Reject</button>
      </div>`);
  },

  async _confirmReject(requestId) {
    const reason = document.getElementById('reject-reason')?.value?.trim();
    if (!reason) { showToast('Give a reason', 'warning'); return; }
    const r = dataManager.getById('inventoryRequests', requestId);
    closeModal();
    if (!r) return;
    await dataManager.update('inventoryRequests', requestId, { ...r, status: 'rejected', reviewedBy: this.who().id, reviewedDate: new Date().toISOString(), reviewNotes: reason });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_REQUEST_REJECTED', r.itemName, `Reason: ${reason}`);
    showToast('Request rejected', 'info');
    this.render();
  },

  fulfillRequest(requestId) {
    const r = dataManager.getById('inventoryRequests', requestId);
    if (!r) return;
    const e = (v) => this._esc(v ?? '');
    const existing = this.items().find(i => String(i.name || '').toLowerCase() === String(r.itemName || '').toLowerCase());
    const each = this.num(r.quantity) ? Math.round((this.num(r.estimatedCost) / this.num(r.quantity)) * 100) / 100 : 0;
    createModal(`Received · ${e(r.itemName)}`, `
      <form class="fp-form" onsubmit="inventoryModule.submitFulfillRequest(event, '${e(requestId)}')">
        <p class="ui-card-note">${existing ? `Adds to the ${this.qty(existing)} ${e(this.unit(existing))} already held.` : 'Creates a new item.'}</p>
        <div class="fp-grid">
          <label class="form-group"><span class="form-label">Quantity received</span><input type="number" class="form-input" name="quantity" required min="1" step="1" value="${this.num(r.quantity)}"></label>
          <label class="form-group"><span class="form-label">Unit cost paid (₦)</span><input type="number" class="form-input" name="unitCost" min="0" step="0.01" value="${each}"></label>
          <label class="form-group"><span class="form-label">Supplier</span><input type="text" class="form-input" name="supplier" value="${e(String(r.notes || '').replace(/^Preferred supplier: /, ''))}"></label>
          <label class="form-group"><span class="form-label">Kept at</span><input type="text" class="form-input" name="location" value="${e(existing?.location)}"></label>
          ${existing ? '' : `
            <label class="form-group"><span class="form-label">Unit</span><input type="text" class="form-input" name="unit" required value="pieces"></label>
            <label class="form-group"><span class="form-label">Minimum to keep in store</span><input type="number" class="form-input" name="minStock" min="0" value="5"></label>`}
        </div>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary">Add to stock</button>
        </div>
      </form>`, 'large');
  },

  async submitFulfillRequest(event, requestId) {
    event.preventDefault();
    const r = dataManager.getById('inventoryRequests', requestId);
    if (!r) return;
    const f = new FormData(event.target);
    const n = Math.max(1, parseInt(f.get('quantity'), 10) || 1);
    const paid = Math.max(0, this.num(f.get('unitCost')));
    const supplier = String(f.get('supplier') || '').trim();
    const location = String(f.get('location') || '').trim();
    const existing = this.items().find(i => String(i.name || '').toLowerCase() === String(r.itemName || '').toLowerCase());

    if (existing) {
      const held = this.qty(existing);
      const unitCost = this.averageCost(held, this.unitCost(existing), n, paid || this.unitCost(existing));
      await this._saveStock(existing, { quantity: held + n, unitCost, supplier: supplier || existing.supplier, location: location || existing.location });
      await this._log('restock', existing, n, { source: 'request', from: held, to: held + n, unitCost, supplier });
    } else {
      const item = await dataManager.create('inventory', {
        name: r.itemName, category: r.category || 'other', quantity: n, allocated: 0, available: n,
        unit: String(f.get('unit') || 'pieces').trim(), minStock: Math.max(0, parseInt(f.get('minStock'), 10) || 0),
        unitCost: paid, supplier, location, description: r.justification || '', dateAdded: new Date().toISOString()
      });
      if (!item) return;
      await this._log('addition', item, n, { source: 'request', unitCost: paid, supplier });
    }
    await dataManager.update('inventoryRequests', requestId, { ...r, status: 'fulfilled' });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_REQUEST_FULFILLED', r.itemName, `Qty: ${n} | Unit cost: ₦${paid}`);
    closeModal();
    showToast(`${n} ${r.itemName} added to stock`, 'success');
    this.render();
  },

  // ── Loans ────────────────────────────────────────────────

  loansHTML() {
    const all = this.assignments();
    const active = all.filter(a => a.status === 'active').sort((a, b) => (this.isOverdue(b) - this.isOverdue(a)) || new Date(a.expectedReturnDate || '9999') - new Date(b.expectedReturnDate || '9999'));
    const returned = all.filter(a => a.status === 'returned').sort((a, b) => new Date(b.returnedDate || 0) - new Date(a.returnedDate || 0)).slice(0, 20);
    const row = (a) => {
      const id = this._esc(a.id);
      const due = a.expectedReturnDate || a.expected_return_date;
      const back = a.conditionIn || a.condition_in;
      return `
        <div class="ui-row">
          <span class="ui-dot ${this.isOverdue(a) ? 'is-urgent' : a.status === 'active' ? 'is-info' : ''}" aria-hidden="true"></span>
          <div class="ui-row-main">
            <div class="ui-row-title">${this._esc(a.itemName)} · ${this.num(a.quantity)} to ${this._esc(a.assigneeName)}</div>
            <div class="ui-row-meta">${this._esc(a.assigneeType || '')} · lent ${this.date(a.assignedDate || a.createdAt)}${a.status === 'active'
              ? (due ? ` · due ${this.date(due)}${this.isOverdue(a) ? ' · overdue' : ''}` : ' · no return date')
              : ` · returned ${this.date(a.returnedDate || a.returned_date)}${back ? ` · ${this._esc(back)}` : ''}`}</div>
            ${a.notes ? `<div class="ui-row-meta">${this._esc(a.notes)}</div>` : ''}
          </div>
          ${a.status === 'active' ? `<button type="button" class="ui-btn ui-btn-sm" onclick="inventoryModule.returnItem('${id}')">Record return</button>` : ''}
        </div>`;
    };
    return `
      <div class="ui-actions" style="margin-top:16px;"><button type="button" class="ui-btn" onclick="inventoryModule.showAssignModal()">Lend an item</button></div>
      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head"><h2 class="ui-card-title">On loan now</h2><span class="ui-card-note">${active.length}</span></div>
        ${active.length ? active.map(row).join('') : '<p class="ui-empty">Nothing is on loan.</p>'}
      </section>
      ${returned.length ? `
        <section class="ui-card" style="margin-top:16px;">
          <div class="ui-card-head"><h2 class="ui-card-title">Recently returned</h2></div>
          ${returned.map(row).join('')}
        </section>` : ''}`;
  },

  _assigneeOptions(type) {
    const e = (v) => this._esc(v ?? '');
    const active = (s) => String(s.status || 'active').toLowerCase() === 'active';
    if (type === 'student') {
      return (dataManager.getAll('students') || []).filter(active).sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(s => `<option value="${e(s.id)}" data-name="${e(s.name)}">${e(s.name)} · ${e([s.grade, s.section].filter(Boolean).join(' '))}</option>`).join('');
    }
    if (type === 'classroom') {
      return (window.schoolConfig?.getAllGrades() || []).flatMap(g => (g.sections || ['A']).map(sec => {
        const label = `${g.name} ${sec}`;
        return `<option value="classroom-${e(g.name)}-${e(sec)}" data-name="${e(label)}">${e(label)}</option>`;
      })).join('');
    }
    return (dataManager.getAll('staff') || []).filter(active).sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(s => `<option value="${e(s.id)}" data-name="${e(s.name)}">${e(s.name)}</option>`).join('');
  },

  showAssignModal(preSelectItemId) {
    const items = this.items().filter(i => this.inStore(i) > 0 || i.id === preSelectItemId).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!items.length) { showToast('Nothing is in store to lend', 'info'); return; }
    createModal('Lend an item', `
      <form id="assign-form" class="fp-form" onsubmit="inventoryModule.submitAssignment(event)">
        <label class="form-group"><span class="form-label">Item</span>
          <select class="form-select" name="itemId" required onchange="inventoryModule.updateAvailableQty(this.value)">
            <option value="">Choose…</option>
            ${items.map(i => `<option value="${this._esc(i.id)}" ${preSelectItemId === i.id ? 'selected' : ''}>${this._esc(i.name)} (${this.inStore(i)} in store)</option>`).join('')}
          </select></label>
        <div class="fp-grid">
          <label class="form-group"><span class="form-label">Lend to</span>
            <select class="form-select" name="assigneeType" onchange="inventoryModule.toggleAssigneeType(this.value)">
              <option value="staff">A staff member</option><option value="student">A pupil</option><option value="classroom">A classroom</option>
            </select></label>
          <label class="form-group"><span class="form-label">Who</span>
            <select class="form-select" name="assigneeId" id="assignee-select" required><option value="">Choose…</option>${this._assigneeOptions('staff')}</select></label>
          <label class="form-group"><span class="form-label">Quantity</span><input type="number" class="form-input" name="quantity" id="assign-quantity" required min="1" step="1" value="1"><span class="ui-row-meta" id="available-qty-help"></span></label>
          <label class="form-group"><span class="form-label">Condition going out</span>
            <select class="form-select" name="condition"><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option></select></label>
          <label class="form-group"><span class="form-label">Due back</span><input type="date" class="form-input" name="expectedReturnDate"></label>
        </div>
        <label class="form-group"><span class="form-label">Notes</span><textarea class="form-textarea" name="notes" rows="2"></textarea></label>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary">Lend</button>
        </div>
      </form>`, 'large');
    if (preSelectItemId) this.updateAvailableQty(preSelectItemId);
  },

  toggleAssigneeType(type) {
    const select = document.getElementById('assignee-select');
    if (select) select.innerHTML = `<option value="">Choose…</option>${this._assigneeOptions(type)}`;
  },

  updateAvailableQty(itemId) {
    const item = itemId && dataManager.getById('inventory', itemId);
    if (!item) return;
    const help = document.getElementById('available-qty-help');
    const qty = document.getElementById('assign-quantity');
    if (help) help.textContent = `${this.inStore(item)} ${this.unit(item)} in store`;
    if (qty) qty.max = this.inStore(item);
  },

  async submitAssignment(event) {
    event.preventDefault();
    const f = new FormData(event.target);
    const item = dataManager.getById('inventory', f.get('itemId'));
    if (!item) { showToast('Choose an item', 'warning'); return; }
    const n = Math.max(1, parseInt(f.get('quantity'), 10) || 1);
    if (n > this.inStore(item)) { showToast(`Only ${this.inStore(item)} ${this.unit(item)} in store`, 'warning'); return; }
    const assigneeId = f.get('assigneeId');
    const opt = [...(document.getElementById('assignee-select')?.options || [])].find(o => o.value === assigneeId);
    const me = this.who();
    const data = {
      itemId: item.id, itemName: item.name, assignedTo: assigneeId, assigneeType: f.get('assigneeType'),
      assigneeName: opt?.dataset?.name || assigneeId, quantity: n, assignedDate: new Date().toISOString(),
      assignedBy: me.id, assignedByName: me.name, expectedReturnDate: f.get('expectedReturnDate') || null,
      status: 'active', condition: f.get('condition'), conditionOut: f.get('condition'), notes: String(f.get('notes') || '').trim()
    };
    if (!(await dataManager.create('inventoryAssignments', data))) return;
    await this._saveStock(item, { allocated: this.onLoan(item) + n });
    await this._log('assignment', item, n, { assigneeName: data.assigneeName, assigneeType: data.assigneeType });
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_ASSIGNED', item.name, `To: ${data.assigneeName} | Qty: ${n}`);
    closeModal();
    showToast(`${n} ${item.name} lent to ${data.assigneeName}`, 'success');
    this._tab = 'loans';
    this.render();
  },

  returnItem(assignmentId) {
    const a = dataManager.getById('inventoryAssignments', assignmentId);
    if (!a || a.status !== 'active') return;
    createModal('Record a return', `
      <p>${this._esc(a.itemName)} · ${this.num(a.quantity)} from <strong>${this._esc(a.assigneeName)}</strong></p>
      <label class="form-group" style="margin-top:12px;"><span class="form-label">Condition</span>
        <select class="form-select" id="return-condition">
          <option value="good">Good</option><option value="fair">Fair, some wear</option><option value="damaged">Damaged</option>
          <option value="lost">Lost, not returned</option>
        </select></label>
      <label class="form-group"><span class="form-label">Notes</span><textarea class="form-textarea" id="return-notes" rows="2"></textarea></label>
      <p class="ui-card-note">"Lost" takes the items off the stock held; the others go back into the store.</p>
      <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
        <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
        <button type="button" class="ui-btn ui-btn-primary" onclick="inventoryModule._confirmReturn('${this._esc(assignmentId)}')">Save</button>
      </div>`);
  },

  /** What a return does to the item: every unit leaves "on loan"; lost ones also leave "held". */
  returnEffect(item, loanQty, condition) {
    const n = this.num(loanQty);
    return {
      allocated: Math.max(0, this.onLoan(item) - n),
      quantity: condition === 'lost' ? Math.max(0, this.qty(item) - n) : this.qty(item)
    };
  },

  async _confirmReturn(assignmentId) {
    const condition = document.getElementById('return-condition')?.value || 'good';
    const note = document.getElementById('return-notes')?.value?.trim() || '';
    const a = dataManager.getById('inventoryAssignments', assignmentId);
    closeModal();
    if (!a || a.status !== 'active') return;
    await dataManager.update('inventoryAssignments', assignmentId, {
      ...a, status: 'returned', returnedDate: new Date().toISOString(), conditionIn: condition,
      notes: [a.notes, note ? `Returned: ${note}` : ''].filter(Boolean).join(' · ')
    });
    const item = dataManager.getById('inventory', a.itemId || a.item_id);
    if (item) {
      await this._saveStock(item, this.returnEffect(item, a.quantity, condition));
      await this._log('return', item, this.num(a.quantity), { assigneeName: a.assigneeName, returnCondition: condition, notes: note });
    }
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_ITEM_RETURNED', a.itemName, `From: ${a.assigneeName} | ${condition}`);
    showToast(condition === 'lost' ? `${a.quantity} ${a.itemName} written off as lost` : 'Return recorded', 'success');
    this.render();
  },

  // ── History ──────────────────────────────────────────────

  TX_LABELS: { addition: 'Added', restock: 'Received', assignment: 'Lent', return: 'Returned', 'stock-count': 'Stock count', adjustment: 'Adjusted', edit: 'Edited', delete: 'Deleted' },

  _filteredHistory() {
    const h = this._hist, q = h.q.trim().toLowerCase();
    return (dataManager.getAll('inventoryHistory') || [])
      .filter(x => !h.from || new Date(x.timestamp) >= new Date(h.from))
      .filter(x => !h.to || new Date(x.timestamp) <= new Date(h.to + 'T23:59:59'))
      .filter(x => h.type === 'all' || x.type === h.type)
      .filter(x => !q || [x.itemName, x.userName].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  setHist(field, value) {
    this._hist[field] = value;
    this._redrawTab(field === 'q' ? 'inv-hq' : null);
  },

  historyHTML() {
    const rows = this._filteredHistory();
    const h = this._hist;
    return `
      <div class="ui-card sd-filters" style="margin-top:16px;">
        <label class="sd-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
          <input id="inv-hq" type="search" aria-label="Search history" placeholder="Item or person" value="${this._esc(h.q)}" oninput="inventoryModule.setHist('q', this.value)">
        </label>
        <select class="sd-select" aria-label="Kind" onchange="inventoryModule.setHist('type', this.value)">
          <option value="all">Everything</option>
          ${Object.entries(this.TX_LABELS).map(([k, l]) => `<option value="${k}" ${h.type === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <input type="date" class="sd-select" aria-label="From" value="${this._esc(h.from)}" onchange="inventoryModule.setHist('from', this.value)">
        <input type="date" class="sd-select" aria-label="To" value="${this._esc(h.to)}" onchange="inventoryModule.setHist('to', this.value)">
        <button type="button" class="ui-btn" onclick="inventoryModule.exportHistory('excel')">Export</button>
      </div>
      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head"><h2 class="ui-card-title">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</h2></div>
        ${rows.length ? rows.slice(0, 200).map(x => `
          <div class="ui-row">
            <div class="ui-row-main">
              <div class="ui-row-title">${this._esc(x.itemName || '—')}</div>
              <div class="ui-row-meta">${this._esc(this._txDescription(x))}</div>
            </div>
            <span class="ui-row-meta" style="white-space:nowrap;">${this.date(x.timestamp)}</span>
          </div>`).join('') : '<p class="ui-empty">Nothing matches.</p>'}
        ${rows.length > 200 ? `<p class="ui-card-note">Showing the latest 200. Export for the rest.</p>` : ''}
      </section>`;
  },

  _txDescription(tx) {
    const who = tx.userName || 'System';
    const d = tx.details || {};
    const n = tx.quantity;
    switch (tx.type) {
      case 'addition':    return `${n} added by ${who}`;
      case 'restock':     return `${n} received by ${who}${d.to != null ? ` (${d.from} → ${d.to})` : ''}`;
      case 'assignment':  return `${n} lent to ${d.assigneeName || 'someone'} by ${who}`;
      case 'return':      return `${n} returned by ${d.assigneeName || 'someone'}${d.returnCondition ? `, ${d.returnCondition}` : ''}`;
      case 'stock-count': return `Counted by ${who}: ${d.systemQty} recorded, ${d.countedQty} found (${d.variance > 0 ? '+' : ''}${d.variance})`;
      case 'adjustment':  return d.to != null
        ? `${d.adjustType === 'writeoff' ? 'Written off' : 'Corrected'} by ${who}: ${d.from} → ${d.to}${d.reason ? ` · ${d.reason}` : ''}`
        : `${d.adjustType || 'Adjustment'} of ${n} by ${who}${d.reason ? ` · ${d.reason}` : ''}`;
      case 'edit':        return `Details changed by ${who}`;
      case 'delete':      return `Deleted by ${who}`;
      default:            return `${tx.type || 'Change'} by ${who}`;
    }
  },

  // ── Export and import ────────────────────────────────────

  async _xlsx() {
    if (typeof XLSX === 'undefined') await window.loadLib('xlsx');
  },

  /** Stops a spreadsheet treating a cell as a formula. */
  _cell(v) {
    return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  },

  async exportInventory() {
    const items = this.items();
    if (!items.length) { showToast('No items to export', 'info'); return; }
    try { await this._xlsx(); } catch (_) { showToast('Could not load the spreadsheet library', 'error'); return; }
    const rows = items.map(i => ({
      Name: this._cell(i.name), Category: this.catLabel(i.category), Held: this.qty(i), 'On loan': this.onLoan(i), 'In store': this.inStore(i),
      Unit: this._cell(i.unit || ''), Minimum: this.minStock(i), 'Unit cost (NGN)': this.unitCost(i), 'Value (NGN)': this.value(i),
      'Kept at': this._cell(i.location || ''), Supplier: this._cell(i.supplier || ''), Notes: this._cell(i.description || '')
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Inventory');
    XLSX.writeFile(wb, `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  async exportHistory() {
    const rows = this._filteredHistory();
    if (!rows.length) { showToast('Nothing to export', 'info'); return; }
    try { await this._xlsx(); } catch (_) { showToast('Could not load the spreadsheet library', 'error'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(x => ({
      Date: this.date(x.timestamp), Kind: this.TX_LABELS[x.type] || x.type, Item: this._cell(x.itemName), Quantity: x.quantity, By: this._cell(x.userName), What: this._cell(this._txDescription(x))
    }))), 'History');
    XLSX.writeFile(wb, `inventory_history_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  /** Splits CSV text into rows of cells, honouring quotes ("a, b" and "" for a quote). */
  parseCSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell.trim()); cell = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell.trim());
    if (row.some(c => c !== '')) rows.push(row);
    return rows;
  },

  importCSV() {
    createModal('Import items from CSV', `
      <p class="ui-card-note">Columns: <code>name, category, quantity, unit, minStock, unitCost, location, supplier, description</code>.
      A name already listed updates that item's details; a different quantity is recorded as a stock count.</p>
      <label class="form-group" style="margin-top:12px;"><span class="form-label">CSV file</span><input type="file" class="form-input" id="csv-import-file" accept=".csv,text/csv" onchange="inventoryModule._previewCSV(this)"></label>
      <div id="csv-preview"></div>
      <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
        <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
        <button type="button" class="ui-btn ui-btn-primary" onclick="inventoryModule._processCSVImport()">Import</button>
      </div>`);
  },

  async _previewCSV(input) {
    const file = input.files?.[0];
    const box = document.getElementById('csv-preview');
    if (!file || !box) return;
    const rows = this.parseCSV(await file.text());
    box.innerHTML = rows.length > 1
      ? `<p class="ui-card-note">${rows.length - 1} row${rows.length === 2 ? '' : 's'}. First: ${this._esc(rows[1].slice(0, 4).join(' · '))}</p>`
      : '<p class="ui-card-note">The file has no rows under the header.</p>';
  },

  async _processCSVImport() {
    const file = document.getElementById('csv-import-file')?.files?.[0];
    if (!file) { showToast('Choose a CSV file', 'warning'); return; }
    const rows = this.parseCSV(await file.text());
    if (rows.length < 2) { showToast('The file has no rows', 'warning'); return; }
    const heads = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
    const valid = this.CATEGORIES.map(c => c.value);
    let created = 0, updated = 0, skipped = 0;

    for (const values of rows.slice(1)) {
      const r = {};
      heads.forEach((h, k) => { r[h] = values[k] ?? ''; });
      if (!r.name) { skipped++; continue; }
      const details = {
        name: r.name,
        category: valid.includes(r.category) ? r.category : 'other',
        unit: r.unit || 'pieces',
        minStock: Math.max(0, parseInt(r.minstock, 10) || 0),
        unitCost: Math.max(0, this.num(r.unitcost)),
        location: r.location || '',
        supplier: r.supplier || '',
        description: r.description || ''
      };
      const quantity = Math.max(0, parseInt(r.quantity, 10) || 0);
      const match = this.items().find(i => String(i.name || '').toLowerCase() === r.name.toLowerCase());
      if (match) {
        const from = this.qty(match);
        const to = r.quantity === '' ? from : Math.max(quantity, this.onLoan(match));
        await this._saveStock(match, { ...details, quantity: to });
        if (to !== from) await this._log('stock-count', match, Math.abs(to - from), { systemQty: from, countedQty: to, variance: to - from, source: 'CSV import' });
        updated++;
      } else {
        const item = await dataManager.create('inventory', { ...details, quantity, allocated: 0, available: quantity, dateAdded: new Date().toISOString() });
        if (item) { await this._log('addition', item, quantity, { source: 'CSV import' }); created++; } else skipped++;
      }
    }
    if (typeof writeAuditLog === 'function') writeAuditLog('INVENTORY_CSV_IMPORTED', file.name, `Created: ${created} | Updated: ${updated} | Skipped: ${skipped}`);
    closeModal();
    showToast(`Imported: ${created} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}`, 'success');
    this.render();
  }
};

window.inventoryModule = inventoryModule;
