// ============================================
// FEES & PAYMENTS MODULE - COMPREHENSIVE
// ============================================

const feesPaymentsModule = {
  currentTab: 'overview',
  get paystackPublicKey() { return AppConfig.paystack.publicKey; },

  async init(container) {
    this.container = container;
    await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['payments', 'enhancedPayments', 'feeItems', 'students'].includes(e.detail.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  // Helper: is this payment a bank deposit pending admin verification?
  _isPendingVerification(payment) {
    return payment && payment.status === 'pending'
      && (payment.paymentMethod === 'bank-deposit' || payment.payment_method === 'bank-deposit');
  },

  // Helper: is this a rejected bank deposit?
  _isRejected(payment) {
    return payment && payment.status === 'overdue'
      && (payment.rejectionReason || payment.rejection_reason);
  },

  // ── Direct Supabase CRUD (awaited, error-checked, only valid columns) ──
  async _insertPayment(data) {
    const row = {
      student_id: data.student_id || null,
      student_name: data.student_name || '',
      student_roll_no: data.student_roll_no || '',
      grade: data.grade || '',
      section: data.section || '',
      fee_type: data.fee_type || 'tuition',
      amount: data.amount,
      payment_method: data.payment_method || null,
      payment_date: data.payment_date || null,
      transaction_ref: data.transaction_ref || null,
      notes: data.notes || null,
      receipt_no: data.receipt_no || null,
      receipt_url: data.receipt_url || null,
      term: data.term || null,
      academic_year: data.academic_year || '2025-2026',
      status: data.status || 'pending',
      recorded_by: data.recorded_by || null
    };
    const { data: result, error } = await supabaseClient.from('fees_payments').insert(row).select();
    if (error) { console.error('[Fees] Insert payment failed:', error); showToast('Failed to save payment: ' + error.message, 'error'); return null; }
    return result?.[0] || result;
  },

  async _updatePayment(id, data) {
    const allowed = ['student_id', 'student_name', 'student_roll_no', 'grade', 'section', 'fee_type', 'amount', 'payment_method', 'payment_date', 'transaction_ref', 'notes', 'receipt_no', 'term', 'academic_year', 'status', 'recorded_by', 'receipt_url', 'verified_by', 'verified_at', 'rejection_reason'];
    const row = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (data[k] !== undefined) row[k] = data[k]; });
    const { error } = await supabaseClient.from('fees_payments').update(row).eq('id', id);
    if (error) { console.error('[Fees] Update payment failed:', error); showToast('Failed to update: ' + error.message, 'error'); return false; }
    return true;
  },

  async _deletePayment(id) {
    const { error } = await supabaseClient.from('fees_payments').delete().eq('id', id);
    if (error) { console.error('[Fees] Delete payment failed:', error); showToast('Failed to delete: ' + error.message, 'error'); return false; }
    return true;
  },

  async _updateStudentFees(studentId) {
    // FIX BUG #8: Ensure we have fresh payment data before calculating status
    // This prevents race conditions where cache might be stale
    await dataManager.refresh('payments');
    
    const allPayments = dataManager.getAll('payments') || [];
    const studentPayments = allPayments.filter(p => (p.studentId || p.student_id) === studentId);
    // Exclude pending-verification and rejected deposits from fee status calculation
    const relevantPayments = studentPayments.filter(p => !this._isPendingVerification(p) && !this._isRejected(p));
    let newFeeStatus = 'pending';
    if (relevantPayments.length > 0) {
      const allPaid = relevantPayments.every(p => p.status === 'paid');
      const hasOverdue = relevantPayments.some(p => p.status === 'overdue');
      const hasPartial = relevantPayments.some(p => p.status === 'partial');
      if (allPaid) newFeeStatus = 'paid';
      else if (hasOverdue) newFeeStatus = 'overdue';
      else if (hasPartial) newFeeStatus = 'partial';
    }
    
    // Use dataManager.update instead of direct Supabase call to handle field validation
    const updated = await dataManager.update('students', studentId, { fees: newFeeStatus });
    if (!updated) {
      console.warn('[Fees] Update student fees status failed');
    }
  },

  _getRecordedBy() {
    try {
      const session = JSON.parse(localStorage.getItem('sb_session') || '{}');
      return session.supabaseId || null;
    } catch { return null; }
  },

  async _refreshAndRender() {
    await Promise.all([
      dataManager.refresh('payments'),
      dataManager.refresh('students'),
      dataManager.refresh('feeItems')
    ]);
    this.render();
  },

  render() {
    const payments = dataManager.getAll('payments') || [];
    const stats = this.calculateStats(payments);
    const pendingVerifications = payments.filter(p => this._isPendingVerification(p));

    // Use fee-item-based outstanding balance when bills have been assigned,
    // otherwise fall back to payment-record-based pending (for legacy data)
    const t = this._computeBreakdownTotals();
    const displayPending = t.totalExpected > 0 ? t.totalUnpaid : stats.totalPending;
    const pendingStudentCount = (dataManager.getAll('students') || [])
      .filter(s => s.status === 'active' && (s.fees === 'pending' || s.fees === 'overdue' || s.fees === 'partial')).length;

    this.container.innerHTML = `
      <div class="animate-fadeIn">
        <!-- Header Section -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-8);">
          <div>
            <h2 class="page-title" style="margin-bottom: var(--space-2); display: flex; align-items: center; gap: var(--space-3);">
              💰 Fees & Payments
            </h2>
            <p class="page-description">Comprehensive payment tracking and financial management</p>
          </div>
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="feesPaymentsModule.openAssignFeesModal()" style="display: flex; align-items: center; gap: var(--space-2); background: linear-gradient(135deg, #4338ca, #7c3aed);">
              <span>📋</span> Assign Fees for Term
            </button>
            <button class="btn btn-ghost" onclick="feesPaymentsModule.bulkAssignFee()" style="display: flex; align-items: center; gap: var(--space-2);">
              <span>👥</span> Bulk Assign Fee
            </button>
            <button class="btn btn-secondary" onclick="feesPaymentsModule.exportPayments()" style="display: flex; align-items: center; gap: var(--space-2);">
              <span>📥</span> Export
            </button>
            <button class="btn btn-primary" onclick="feesPaymentsModule.recordPayment()" style="display: flex; align-items: center; gap: var(--space-2);">
              <span>➕</span> New Payment
            </button>
          </div>
        </div>

        <!-- Enhanced Financial Stats with Gradients -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" style="margin-bottom: var(--space-8);">
          ${pendingVerifications.length > 0 ? `
          <div style="grid-column: 1 / -1; background: linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(254,225,64,0.1) 100%); border: 2px solid var(--color-warning); border-radius: var(--radius-lg); padding: var(--space-5); margin-bottom: var(--space-4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
              <h3 style="margin: 0; font-size: var(--font-size-lg); font-weight: 700; color: var(--text-primary);">⏳ Pending Bank Deposit Verifications</h3>
              <span style="background: var(--color-warning); color: white; padding: 4px 12px; border-radius: var(--radius-full); font-size: var(--font-size-sm); font-weight: 700;">${pendingVerifications.length} pending</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              ${pendingVerifications.map(p => {
      const receiptUrl = p.receiptUrl || p.receipt_url || '';
      const isImage = receiptUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
      return '<div style="display:flex;gap:12px;padding:12px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-primary);align-items:center;flex-wrap:wrap;">'
        + '<div style="flex-shrink:0;width:56px;height:56px;border-radius:8px;overflow:hidden;background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;border:1px solid var(--border-primary);">'
        + (isImage ? '<img src="' + receiptUrl + '" alt="Receipt" style="width:100%;height:100%;object-fit:cover;">' : '<span style="font-size:1.5rem;">📄</span>')
        + '</div>'
        + '<div style="flex:1;min-width:160px;">'
        + '<p style="font-weight:700;margin-bottom:2px;color:var(--text-primary);">' + (p.studentName || 'Unknown') + '</p>'
        + '<p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:2px;">' + (p.feeType || 'Fee Payment') + ' &bull; Bank Deposit</p>'
        + '<p style="font-size:0.75rem;color:var(--text-tertiary);">Ref: ' + (p.transactionRef || '-') + ' &bull; ' + (p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '') + '</p>'
        + '</div>'
        + '<div style="text-align:right;min-width:90px;">'
        + '<p style="font-size:1.2rem;font-weight:700;color:var(--color-success);margin-bottom:2px;">₦' + (parseFloat(p.amount) || 0).toLocaleString() + '</p>'
        + '<p style="font-size:0.75rem;color:var(--text-tertiary);">Receipt #' + (p.receiptNo || '-') + '</p>'
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-shrink:0;">'
        + (receiptUrl ? '<a href="' + receiptUrl + '" target="_blank" class="btn btn-secondary btn-sm" style="padding:6px 10px;">📎 View</a>' : '')
        + '<button class="btn btn-primary btn-sm" onclick="feesPaymentsModule.verifyPayment(\'' + p.id + '\')" style="padding:6px 12px;">✅ Approve</button>'
        + '<button class="btn btn-sm" onclick="feesPaymentsModule.rejectPayment(\'' + p.id + '\')" style="padding:6px 12px;background:var(--color-danger);color:white;border:none;border-radius:6px;cursor:pointer;">❌ Reject</button>'
        + '</div>'
        + '</div>';
    }).join('')}
            </div>
          </div>
          ` : ''}
          ${this.createGradientStatCard('Total Collected', formatCurrency(stats.totalCollected), '💵', 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', stats.paidTransactions + ' paid transactions')}
          ${this.createGradientStatCard('Pending Payments', formatCurrency(displayPending), '⏳', 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', pendingStudentCount + ' student' + (pendingStudentCount !== 1 ? 's' : '') + ' owing')}
          ${this.createGradientStatCard('This Month', formatCurrency(stats.thisMonth), '📅', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', new Date().toLocaleDateString('en-US', { month: 'long' }))}
          ${this.createGradientStatCard('Pending Approval', String(pendingVerifications.length), '🏦', 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', 'Bank deposits to verify')}
        </div>

        <!-- Tabs -->
        <div style="border-bottom: 1px solid var(--border-primary); margin-bottom: var(--space-6);">
          <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
            <button class="profile-tab ${this.currentTab === 'overview' ? 'active' : ''}" onclick="feesPaymentsModule.switchTab('overview', event)">
              📊 Overview
            </button>
            <button class="profile-tab ${this.currentTab === 'breakdown' ? 'active' : ''}" onclick="feesPaymentsModule.switchTab('breakdown', event)">
              📋 Fee Breakdown
            </button>
            <button class="profile-tab ${this.currentTab === 'payments' ? 'active' : ''}" onclick="feesPaymentsModule.switchTab('payments', event)">
              💰 Payment Records
            </button>
            <button class="profile-tab ${this.currentTab === 'pending' ? 'active' : ''}" onclick="feesPaymentsModule.switchTab('pending', event)">
              ⏳ Pending Payments
            </button>
            <button class="profile-tab ${this.currentTab === 'reports' ? 'active' : ''}" onclick="feesPaymentsModule.switchTab('reports', event)">
              📈 Reports
            </button>
            <button class="profile-tab ${this.currentTab === 'fee-structure' ? 'active' : ''}" onclick="feesPaymentsModule.switchTab('fee-structure', event)">
              🏗️ Fee Structure
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="fees-tab-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
  },

  switchTab(tabName, e) {
    this.currentTab = tabName;
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) {
      contentDiv.innerHTML = this.renderTabContent();
    }

    // Update active tab styling
    document.querySelectorAll('.profile-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    if (e && e.target) {
      e.target.classList.add('active');
    }
  },

  renderTabContent() {
    switch (this.currentTab) {
      case 'overview':
        return this.renderOverviewTab();
      case 'breakdown':
        return this.renderBreakdownTab();
      case 'payments':
        return this.renderPaymentsTab();
      case 'pending':
        return this.renderPendingTab();
      case 'reports':
        return this.renderReportsTab();
      case 'fee-structure':
        return this.renderFeeStructureTab();
      default:
        return this.renderOverviewTab();
    }
  },

  _computeBreakdownTotals() {
    const allStudents   = dataManager.getAll('students') || [];
    const activeStudents = allStudents.filter(s => s.status === 'active');
    const feeItems      = dataManager.getAll('feeItems') || [];
    const payments      = dataManager.getAll('payments') || [];

    // What has been formally billed (fee item records)
    const totalExpected = feeItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    // What has been marked paid against specific fee item bills
    const totalPaidOnItems = feeItems.reduce((s, i) => s + parseFloat(i.amount_paid || 0), 0);
    // Cross-check: actual payment transactions with status=paid (excludes pending bank deposits)
    const totalPaidTransactions = payments
      .filter(p => p.status === 'paid' && !this._isPendingVerification(p))
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

    // Use the higher of the two paid figures as the most complete picture
    const totalPaid   = Math.max(totalPaidOnItems, totalPaidTransactions);
    const totalUnpaid = Math.max(0, totalExpected - totalPaid);
    const rate        = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;

    // Students breakdown
    const billedIds     = new Set(feeItems.map(i => i.student_id || i.studentId).filter(Boolean));
    const billedCount   = activeStudents.filter(s => billedIds.has(s.id)).length;
    const unbilledCount = activeStudents.length - billedCount;

    return {
      totalExpected,
      totalPaid,
      totalUnpaid,
      rate,
      billedCount,
      unbilledCount,
      totalStudents: activeStudents.length
    };
  },

  calculateStats(payments) {
    const amt = (p) => parseFloat(p.amount) || 0;
    // Only count genuinely paid payments (exclude pending-verification and rejected deposits)
    const paidPayments = payments.filter(p => p.status === 'paid');
    const totalCollected = paidPayments.reduce((sum, p) => sum + amt(p), 0);
    // Pending = unpaid but NOT bank-deposit-awaiting-verification and NOT rejected
    const totalPending = payments.filter(p =>
      (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
      && !this._isPendingVerification(p)
      && !this._isRejected(p)
    ).reduce((sum, p) => sum + amt(p), 0);

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const thisMonth = paidPayments.filter(p => {
      const pDate = p.paymentDate || p.payment_date;
      if (!pDate) return false;
      const paymentDate = new Date(pDate);
      return paymentDate.getMonth() === currentMonth &&
        paymentDate.getFullYear() === currentYear;
    }).reduce((sum, p) => sum + amt(p), 0);

    return {
      totalCollected,
      totalPending,
      thisMonth,
      paidTransactions: paidPayments.length,
      totalTransactions: payments.length
    };
  },

  renderOverviewTab() {
    const payments = dataManager.getAll('payments') || [];
    const recentPayments = payments.slice(-10).reverse();
    const stats = this.calculateStats(payments);
    const collectionRate = stats.totalCollected > 0 ? Math.round((stats.totalCollected / (stats.totalCollected + stats.totalPending)) * 100) : 0;

    return `
      <!-- Quick Stats Row -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="card" style="background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); border: 1px solid var(--border-primary);">
          <div class="card-body" style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--space-3);">💰</div>
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">Collection Rate</div>
            <div style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-primary);">${collectionRate}%</div>
            <div style="margin-top: var(--space-3); height: 6px; background: var(--bg-tertiary); border-radius: var(--radius-full);">
              <div style="width: ${collectionRate}%; height: 100%; background: var(--gradient-primary); border-radius: var(--radius-full); transition: width 0.5s ease;"></div>
            </div>
          </div>
        </div>
        
        <div class="card" style="background: linear-gradient(135deg, #43e97b15 0%, #38f9d715 100%); border: 1px solid var(--border-primary);">
          <div class="card-body" style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--space-3);">📈</div>
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">Average Payment</div>
            <div style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-success);">
              ${stats.totalTransactions > 0 ? formatCurrency(stats.totalCollected / stats.totalTransactions) : '₦0'}
            </div>
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-top: var(--space-2);">Per transaction</div>
          </div>
        </div>
        
        <div class="card" style="background: linear-gradient(135deg, #4facfe15 0%, #00f2fe15 100%); border: 1px solid var(--border-primary);">
          <div class="card-body" style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--space-3);">🎯</div>
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">Payment Methods</div>
            <div style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-info);">
              ${this.getUniquePaymentMethods(payments)}
            </div>
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-top: var(--space-2);">Active methods</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Recent Transactions - Takes 2 columns -->
        <div class="lg:col-span-2">
          <div class="card" style="height: 100%;">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
              <h3 class="card-title">💳 Recent Transactions</h3>
              <button class="btn btn-sm btn-ghost" onclick="feesPaymentsModule.switchTab('payments')" style="font-size: var(--font-size-sm);">View All →</button>
            </div>
            <div class="card-body">
              ${this.renderPaymentList(recentPayments)}
            </div>
          </div>
        </div>

        <!-- Monthly Trend -->
        <div>
          <div class="card" style="height: 100%;">
            <div class="card-header">
              <h3 class="card-title">📊 Monthly Trend</h3>
            </div>
            <div class="card-body">
              ${this.renderMonthlyChart()}
            </div>
          </div>
        </div>
      </div>

      <!-- Payment Methods Distribution -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">💳 Payment Methods Distribution</h3>
        </div>
        <div class="card-body">
          ${this.renderPaymentMethodsChart()}
        </div>
      </div>
    `;
  },

  _paymentsSearch: '',
  _paymentsFilterType: '',
  _paymentsFilterMethod: '',
  _paymentsPage: 1,
  _pendingPage: 1,
  _pageSize: 15,

  renderPaymentsTab() {
    const payments = dataManager.getAll('payments') || [];
    let filtered = payments.filter(p => p.status === 'paid');

    // Apply search
    if (this._paymentsSearch) {
      const q = this._paymentsSearch.toLowerCase();
      filtered = filtered.filter(p =>
        (p.studentName || '').toLowerCase().includes(q) ||
        (p.receiptNo || '').toLowerCase().includes(q) ||
        (p.studentRollNo || '').toLowerCase().includes(q)
      );
    }
    // Apply fee type filter
    if (this._paymentsFilterType) {
      filtered = filtered.filter(p => p.feeType === this._paymentsFilterType);
    }
    // Apply payment method filter
    if (this._paymentsFilterMethod) {
      filtered = filtered.filter(p => p.paymentMethod === this._paymentsFilterMethod);
    }

    // Get unique fee types and methods for filter dropdowns
    const allPaid = payments.filter(p => p.status === 'paid');
    const feeTypes = [...new Set(allPaid.map(p => p.feeType).filter(Boolean))];
    const methods = [...new Set(allPaid.map(p => p.paymentMethod).filter(Boolean))];

    // Paginate
    const start = (this._paymentsPage - 1) * this._pageSize;
    const paginated = filtered.slice(start, start + this._pageSize);

    return `
      <div class="card">
        <div class="card-header" style="flex-direction: column; align-items: stretch; gap: var(--space-4);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title">All Payment Records (${filtered.length})</h3>
            <button class="btn btn-secondary btn-sm" onclick="feesPaymentsModule.exportPayments()">
              📥 Export
            </button>
          </div>
          <!-- Search & Filters -->
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
            <div style="flex: 2; min-width: 200px;">
              <input type="text" class="form-input" placeholder="🔍 Search by name, receipt no, or roll no..."
                value="${this._paymentsSearch}"
                oninput="feesPaymentsModule.filterPayments('search', this.value)"
                style="font-size: var(--font-size-sm);">
            </div>
            <div style="flex: 1; min-width: 140px;">
              <select class="form-select" onchange="feesPaymentsModule.filterPayments('type', this.value)"
                style="font-size: var(--font-size-sm);">
                <option value="">All Fee Types</option>
                ${feeTypes.map(t => `<option value="${t}" ${this._paymentsFilterType === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div style="flex: 1; min-width: 140px;">
              <select class="form-select" onchange="feesPaymentsModule.filterPayments('method', this.value)"
                style="font-size: var(--font-size-sm);">
                <option value="">All Methods</option>
                ${methods.map(m => `<option value="${m}" ${this._paymentsFilterMethod === m ? 'selected' : ''} style="text-transform: capitalize;">${m.replace('-', ' ')}</option>`).join('')}
              </select>
            </div>
            ${(this._paymentsSearch || this._paymentsFilterType || this._paymentsFilterMethod) ? `
              <button class="btn btn-ghost btn-sm" onclick="feesPaymentsModule.clearPaymentsFilters()" style="white-space: nowrap;">
                ✕ Clear
              </button>
            ` : ''}
          </div>
        </div>
        <div class="card-body">
          ${this.renderPaymentTable(paginated)}
          ${this.renderPagination(filtered.length, this._paymentsPage, 'feesPaymentsModule.goToPaymentsPage')}
        </div>
      </div>
    `;
  },

  goToPaymentsPage(page) {
    this._paymentsPage = page;
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderPaymentsTab();
  },

  goToPendingPage(page) {
    this._pendingPage = page;
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderPendingTab();
  },

  renderPagination(totalItems, currentPage, onClickFn) {
    const totalPages = Math.ceil(totalItems / this._pageSize);
    if (totalPages <= 1) return '';

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border-primary);">
        <span style="font-size: var(--font-size-sm); color: var(--text-secondary);">
          Showing ${((currentPage - 1) * this._pageSize) + 1}–${Math.min(currentPage * this._pageSize, totalItems)} of ${totalItems}
        </span>
        <div style="display: flex; gap: var(--space-1);">
          <button class="btn btn-ghost btn-sm" ${currentPage <= 1 ? 'disabled' : ''}
            onclick="${onClickFn}(${currentPage - 1})" style="padding: var(--space-2) var(--space-3);">
            ‹
          </button>
          ${pages.map(p => p === '...' ? `<span style="padding: var(--space-2); color: var(--text-secondary);">…</span>` : `
            <button class="btn ${p === currentPage ? 'btn-primary' : 'btn-ghost'} btn-sm"
              onclick="${onClickFn}(${p})" style="padding: var(--space-2) var(--space-3); min-width: 36px;">
              ${p}
            </button>
          `).join('')}
          <button class="btn btn-ghost btn-sm" ${currentPage >= totalPages ? 'disabled' : ''}
            onclick="${onClickFn}(${currentPage + 1})" style="padding: var(--space-2) var(--space-3);">
            ›
          </button>
        </div>
      </div>
    `;
  },

  filterPayments(filterType, value) {
    if (filterType === 'search') this._paymentsSearch = value;
    else if (filterType === 'type') this._paymentsFilterType = value;
    else if (filterType === 'method') this._paymentsFilterMethod = value;
    this._paymentsPage = 1;

    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) {
      contentDiv.innerHTML = this.renderPaymentsTab();
    }
  },

  clearPaymentsFilters() {
    this._paymentsSearch = '';
    this._paymentsFilterType = '';
    this._paymentsFilterMethod = '';
    this._paymentsPage = 1;

    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) {
      contentDiv.innerHTML = this.renderPaymentsTab();
    }
  },

  renderPendingTab() {
    const students = dataManager.getAll('students') || [];
    const payments = dataManager.getAll('payments') || [];

    // Get students with pending payments
    const pendingStudents = students.filter(s => s.status === 'active' && (s.fees === 'pending' || s.fees === 'overdue' || s.fees === 'partial'));

    // Paginate
    const start = (this._pendingPage - 1) * this._pageSize;
    const paginated = pendingStudents.slice(start, start + this._pageSize);

    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Students with Outstanding Payments (${pendingStudents.length})</h3>
        </div>
        <div class="card-body">
          ${this.renderPendingPaymentsTable(paginated)}
          ${this.renderPagination(pendingStudents.length, this._pendingPage, 'feesPaymentsModule.goToPendingPage')}
        </div>
      </div>
    `;
  },

  renderReportsTab() {
    const payments = dataManager.getAll('payments') || [];
    const stats = this.calculateStats(payments);
    const t = this._computeBreakdownTotals();
    const rateColor = t.rate >= 75 ? '#10b981' : t.rate >= 40 ? '#f59e0b' : '#ef4444';

    // Calculate by payment method
    const byMethod = {};
    payments.filter(p => p.status === 'paid').forEach(p => {
      const method = p.paymentMethod || 'unknown';
      if (!byMethod[method]) byMethod[method] = 0;
      byMethod[method] += parseFloat(p.amount) || 0;
    });

    // Calculate by fee type
    const byType = {};
    payments.filter(p => p.status === 'paid').forEach(p => {
      const type = p.feeType || 'Other';
      if (!byType[type]) byType[type] = 0;
      byType[type] += parseFloat(p.amount) || 0;
    });

    return `
      <!-- Fee Totals Summary Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:var(--space-6);">
        <div style="padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
          <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Total Billed</div>
          <div style="font-size:1.4rem;font-weight:800;color:#0f172a;">&#x20A6;${t.totalExpected.toLocaleString()}</div>
          <div style="font-size:0.72rem;color:#94a3b8;margin-top:3px;">${t.billedCount}/${t.totalStudents} students billed</div>
        </div>
        <div style="padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
          <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Total Collected</div>
          <div style="font-size:1.4rem;font-weight:800;color:#065f46;">&#x20A6;${t.totalPaid.toLocaleString()}</div>
          <div style="font-size:0.72rem;color:#6ee7b7;margin-top:3px;">${t.rate}% collected</div>
        </div>
        <div style="padding:16px 20px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
          <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Outstanding Balance</div>
          <div style="font-size:1.4rem;font-weight:800;color:#9a3412;">&#x20A6;${t.totalUnpaid.toLocaleString()}</div>
          <div style="font-size:0.72rem;color:#fdba74;margin-top:3px;">Fees yet to be collected</div>
        </div>
        <div style="padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Collection Rate</div>
          <div style="font-size:1.4rem;font-weight:800;color:${rateColor};margin-bottom:8px;">${t.rate}%</div>
          <div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${t.rate}%;background:${rateColor};border-radius:99px;"></div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Collection by Payment Method</h3>
          </div>
          <div class="card-body">
            <div class="space-y-3">
              ${Object.entries(byMethod).map(([method, amount]) => {
      const percentage = ((amount / stats.totalCollected) * 100).toFixed(1);
      return `
                  <div>
                    <div class="flex justify-between mb-1">
                      <span style="text-transform: capitalize;">${method}</span>
                      <span style="font-weight: var(--font-weight-semibold);">${formatCurrency(amount)}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: var(--bg-tertiary); border-radius: var(--radius-full);">
                      <div style="width: ${percentage}%; height: 100%; background: var(--gradient-primary); border-radius: var(--radius-full);"></div>
                    </div>
                  </div>
                `;
    }).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Collection by Fee Type</h3>
          </div>
          <div class="card-body">
            <div class="space-y-3">
              ${Object.entries(byType).map(([type, amount]) => {
      const percentage = ((amount / stats.totalCollected) * 100).toFixed(1);
      return `
                  <div>
                    <div class="flex justify-between mb-1">
                      <span>${type}</span>
                      <span style="font-weight: var(--font-weight-semibold);">${formatCurrency(amount)}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: var(--bg-tertiary); border-radius: var(--radius-full);">
                      <div style="width: ${percentage}%; height: 100%; background: var(--gradient-success); border-radius: var(--radius-full);"></div>
                    </div>
                  </div>
                `;
    }).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Summary Statistics</h3>
        </div>
        <div class="card-body">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p style="color: var(--text-secondary); margin-bottom: var(--space-2);">Total Collected</p>
              <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-success);">
                ${formatCurrency(stats.totalCollected)}
              </p>
            </div>
            <div>
              <p style="color: var(--text-secondary); margin-bottom: var(--space-2);">Total Pending</p>
              <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-warning);">
                ${formatCurrency(stats.totalPending)}
              </p>
            </div>
            <div>
              <p style="color: var(--text-secondary); margin-bottom: var(--space-2);">Collection Rate</p>
              <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--text-primary);">
                ${stats.totalCollected > 0 ? Math.round((stats.totalCollected / (stats.totalCollected + stats.totalPending)) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderFeeStructureTab() {
    const grades = Object.keys(window.feeStructure?.feeItems || {});
    const academicYear = window.feeStructure?.academicYear || (window.CURRENT_ACADEMIC_YEAR || '2025/2026');

    if (grades.length === 0) {
      return `<div class="card"><div class="card-body text-center py-5">
        <div style="font-size:3rem;opacity:0.3;margin-bottom:1rem;">🏗️</div>
        <h4>No fee structure defined</h4>
        <p class="text-secondary">Fee structure will appear here once configured.</p>
      </div></div>`;
    }

    const gradeCards = grades.map(grade => {
      const items = (window.feeStructure?.feeItems?.[grade] || []).map((item, idx) => `
        <tr style="border-bottom:1px solid var(--border-primary);">
          <td style="padding:0.5rem 0.5rem;">
            <input type="text" class="form-input" style="font-size:0.82rem;padding:0.3rem 0.5rem;"
              data-grade="${grade}" data-idx="${idx}" data-field="name"
              value="${item.name}" onchange="feesPaymentsModule._feeStructureFieldChange(this)">
          </td>
          <td style="padding:0.5rem 0.5rem;">
            <div style="display:flex;align-items:center;gap:0.25rem;">
              <span style="font-size:0.82rem;color:var(--text-secondary);">₦</span>
              <input type="number" class="form-input" style="font-size:0.82rem;padding:0.3rem 0.5rem;width:110px;"
                min="0" data-grade="${grade}" data-idx="${idx}" data-field="amount"
                value="${item.amount}" onchange="feesPaymentsModule._feeStructureFieldChange(this)">
            </div>
          </td>
          <td style="padding:0.5rem 0.5rem;">
            <select class="form-select" style="font-size:0.82rem;padding:0.3rem 0.5rem;"
              data-grade="${grade}" data-idx="${idx}" data-field="type"
              onchange="feesPaymentsModule._feeStructureFieldChange(this)">
              <option value="once"    ${item.type === 'once'    ? 'selected' : ''}>Once</option>
              <option value="termly"  ${item.type === 'termly'  ? 'selected' : ''}>Termly</option>
              <option value="monthly" ${item.type === 'monthly' ? 'selected' : ''}>Monthly</option>
            </select>
          </td>
          <td style="padding:0.5rem 0.5rem;text-align:right;">
            <button class="btn btn-sm btn-danger" style="padding:0.2rem 0.5rem;font-size:0.78rem;"
              onclick="feesPaymentsModule.removeFeeItem('${grade}', ${idx})">✕</button>
          </td>
        </tr>
      `).join('');

      const total = (window.feeStructure?.feeItems?.[grade] || []).reduce((s, i) => s + i.amount, 0);

      return `
        <div class="card" style="margin-bottom:var(--space-5);" id="feecard-${grade.replace(/\s/g,'-')}">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-4) var(--space-5);border-bottom:1px solid var(--border-primary);">
            <div>
              <span style="font-weight:700;font-size:var(--font-size-base);">${grade}</span>
              <span style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-left:0.75rem;">
                ${(window.feeStructure?.feeItems?.[grade] || []).length} items &nbsp;·&nbsp; Total: <strong>₦${total.toLocaleString()}</strong>
              </span>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <button class="btn btn-sm btn-ghost" style="font-size:0.8rem;"
                onclick="feesPaymentsModule.addFeeItem('${grade}')">+ Add Item</button>
              <button class="btn btn-sm btn-danger" style="font-size:0.8rem;"
                onclick="feesPaymentsModule.deleteGrade('${grade}')">🗑 Delete Grade</button>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead style="background:var(--bg-secondary);font-size:0.78rem;color:var(--text-secondary);">
                <tr>
                  <th style="padding:0.4rem 0.5rem;text-align:left;font-weight:600;">Item Name</th>
                  <th style="padding:0.4rem 0.5rem;text-align:left;font-weight:600;">Amount (₦)</th>
                  <th style="padding:0.4rem 0.5rem;text-align:left;font-weight:600;">Type</th>
                  <th style="padding:0.4rem 0.5rem;text-align:right;font-weight:600;">Remove</th>
                </tr>
              </thead>
              <tbody id="feerows-${grade.replace(/\s/g,'-')}">${items}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div>
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-6);flex-wrap:wrap;gap:var(--space-3);">
          <div>
            <h3 style="font-weight:700;font-size:var(--font-size-xl);margin-bottom:0.25rem;">🏗️ Fee Structure Editor</h3>
            <p style="font-size:var(--font-size-sm);color:var(--text-secondary);">
              Academic Year: <strong>${academicYear}</strong> &nbsp;·&nbsp; Edit fee items per grade then click Save.
            </p>
          </div>
          <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;">
            <button class="btn btn-ghost" onclick="feesPaymentsModule.resetFeeStructureToDefaults()">↺ Reset to Defaults</button>
            <button class="btn btn-secondary" onclick="(function(){ const n=prompt('Enter new grade name (e.g. JSS 4):'); if(n) feesPaymentsModule.addGrade(n); })()">+ Add Grade</button>
            <button class="btn btn-primary" onclick="feesPaymentsModule.saveFeeStructure()"
              style="background:linear-gradient(135deg,#059669,#10b981);">
              💾 Save Fee Structure
            </button>
          </div>
        </div>

        <!-- Info banner -->
        <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-6);font-size:var(--font-size-sm);color:var(--text-secondary);">
          ℹ️ Changes here update the fee structure used for all grades. When a student is admitted or their grade changes, these fee items are automatically applied to their account.
          Grades with <strong>no fee items will be blocked from student admission</strong>. Delete any grade that is not in use.
        </div>

        ${gradeCards}

        <div style="display:flex;justify-content:flex-end;padding-top:var(--space-4);">
          <button class="btn btn-primary" onclick="feesPaymentsModule.saveFeeStructure()"
            style="background:linear-gradient(135deg,#059669,#10b981);">
            💾 Save Fee Structure
          </button>
        </div>
      </div>
    `;
  },

  _feeStructureFieldChange(el) {
    const grade = el.dataset.grade;
    const idx   = parseInt(el.dataset.idx, 10);
    const field = el.dataset.field;
    if (!window.feeStructure?.feeItems?.[grade]?.[idx]) return;
    window.feeStructure.feeItems[grade][idx][field] = field === 'amount'
      ? parseFloat(el.value) || 0
      : el.value;
    // Update the grade total badge inline
    const total = window.feeStructure.feeItems[grade].reduce((s, i) => s + i.amount, 0);
    const card  = document.getElementById(`feecard-${grade.replace(/\s/g,'-')}`);
    if (card) {
      const badge = card.querySelector('strong');
      if (badge && badge.textContent.includes('₦')) badge.textContent = '₦' + total.toLocaleString();
    }
  },

  addFeeItem(grade) {
    if (!window.feeStructure?.feeItems) return;
    if (!window.feeStructure.feeItems[grade]) window.feeStructure.feeItems[grade] = [];
    window.feeStructure.feeItems[grade].push({
      id:   'item_' + Date.now(),
      name: 'New Item',
      amount: 0,
      type: 'once',
      required: false
    });
    // Re-render just the fee structure tab
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
  },

  removeFeeItem(grade, idx) {
    if (!window.feeStructure?.feeItems?.[grade]) return;
    window.feeStructure.feeItems[grade].splice(idx, 1);
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
  },

  deleteGrade(grade) {
    if (!window.feeStructure?.feeItems?.[grade]) return;
    if (!confirm(`Delete the entire fee structure for "${grade}"? Students in this grade will no longer have fee items auto-assigned until a structure is re-created.`)) return;
    delete window.feeStructure.feeItems[grade];
    // Also remove from gradeAliases so it is hidden everywhere
    if (window.feeStructure.gradeAliases?.[grade]) delete window.feeStructure.gradeAliases[grade];
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
    showToast(`Grade "${grade}" removed. Click Save to persist.`, 'warning');
  },

  addGrade(gradeName) {
    if (!gradeName || !window.feeStructure?.feeItems) return;
    const name = gradeName.trim();
    if (!name) return;
    if (window.feeStructure.feeItems[name]) { showToast('Grade already exists', 'warning'); return; }
    window.feeStructure.feeItems[name] = [];
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
    showToast(`Grade "${name}" added. Add fee items then Save.`, 'success');
  },

  async saveFeeStructure() {
    if (!window.feeStructure) { showToast('Fee structure not loaded', 'error'); return; }
    if (!window.supabaseClient) { showToast('Not connected to database', 'error'); return; }

    try {
      // Read existing settings row
      const { data: row } = await supabaseClient.from('school_settings').select('id, settings_json').limit(1).single();
      let existing = {};
      if (row?.settings_json) {
        existing = typeof row.settings_json === 'string' ? JSON.parse(row.settings_json) : row.settings_json;
      }

      // Embed updated feeItems into settings_json
      existing.feeStructure = {
        academicYear: window.feeStructure.academicYear,
        feeItems: window.feeStructure.feeItems
      };

      if (row) {
        const { error } = await supabaseClient.from('school_settings')
          .update({ settings_json: existing, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from('school_settings')
          .insert({ settings_json: existing });
        if (error) throw error;
      }

      showToast('Fee structure saved successfully!', 'success');
    } catch (err) {
      console.error('[FeesModule] saveFeeStructure error:', err);
      showToast('Failed to save fee structure: ' + err.message, 'error');
    }
  },

  resetFeeStructureToDefaults() {
    if (!confirm('Reset all fee items to the built-in defaults? Any unsaved edits will be lost.')) return;
    location.reload();
  },

  renderPaymentList(payments) {
    if (payments.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">💰</div>
          <h3 class="empty-state-title">No Payments Yet</h3>
          <p class="empty-state-description">Payment records will appear here</p>
        </div>
      `;
    }

    return `
      <div class="space-y-2">
        ${payments.map(payment => `
          <div class="flex justify-between items-center" style="padding: var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md); cursor: pointer;"
               onclick="feesPaymentsModule.viewPaymentDetails('${payment.id}')"
               onmouseover="this.style.background='var(--bg-tertiary)'"
               onmouseout="this.style.background='var(--bg-secondary)'">
            <div>
              <p style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-1);">
                ${payment.studentName}
              </p>
              <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
                ${payment.feeType} • ${formatDate(payment.paymentDate)}
              </p>
            </div>
            <div style="text-align: right;">
              <p style="font-weight: var(--font-weight-bold); color: var(--color-success); margin-bottom: var(--space-1);">
                ${formatCurrency(parseFloat(payment.amount) || 0)}
              </p>
              <p style="font-size: var(--font-size-sm); color: var(--text-secondary); text-transform: capitalize;">
                ${payment.paymentMethod?.replace(/-/g, ' ') || ''}
              </p>
              ${this._isPendingVerification(payment) ? '<span class="badge badge-warning" style="font-size: 10px;">⏳ Pending</span>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderPaymentTable(payments) {
    if (payments.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">💰</div>
          <h3 class="empty-state-title">No Payment Records</h3>
          <p class="empty-state-description">Payment records will appear here</p>
        </div>
      `;
    }

    return `
      <div style="overflow-x: auto;">
        <table class="table">
          <thead>
            <tr>
              <th>Receipt No</th>
              <th>Date</th>
              <th>Student</th>
              <th>Fee Type</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map(payment => `
              <tr>
                <td style="font-family: monospace; font-weight: var(--font-weight-semibold);">${payment.receiptNo}</td>
                <td>${formatDate(payment.paymentDate)}</td>
                <td style="font-weight: var(--font-weight-semibold);">${payment.studentName}</td>
                <td>${payment.feeType}</td>
                <td style="color: var(--color-success); font-weight: var(--font-weight-bold);">${formatCurrency(parseFloat(payment.amount) || 0)}</td>
                <td style="text-transform: capitalize;">${payment.paymentMethod}</td>
                <td style="font-family: monospace; font-size: var(--font-size-sm);">${payment.transactionRef || '-'}</td>
                <td>${this._isPendingVerification(payment)
        ? createBadge('Pending', 'warning')
        : this._isRejected(payment)
          ? createBadge('Rejected', 'danger')
          : payment.status === 'paid'
            ? createBadge('Paid', 'success')
            : createBadge(payment.status, 'info')}</td>
                <td>
                  <div class="table-actions">
                    <button class="table-action-btn" onclick="feesPaymentsModule.viewPaymentDetails('${payment.id}')" title="View Details">👁️</button>
                    ${payment.status === 'paid' && !this._isRejected(payment) ? `<button class="table-action-btn" onclick="feesPaymentsModule.generateReceipt('${payment.id}')" title="Generate Receipt">🧾</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderPendingPaymentsTable(students) {
    if (students.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <h3 class="empty-state-title">All Payments Up to Date</h3>
          <p class="empty-state-description">No pending payments at this time</p>
        </div>
      `;
    }

    const statusColors = { pending: 'warning', overdue: 'danger', partial: 'info' };
    const statusLabels = { pending: 'Pending', overdue: 'Overdue', partial: 'Partial' };

    return `
      <div style="overflow-x: auto;">
        <table class="table">
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Student Name</th>
              <th>Grade</th>
              <th>Section</th>
              <th style="text-align:right;">Outstanding</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(student => {
              const allFeeItems = dataManager.getAll('feeItems') || [];
              const studentItems = allFeeItems.filter(fi => (fi.student_id || fi.studentId) === student.id);
              let outstanding = 0;
              if (studentItems.length > 0) {
                const billed = studentItems.reduce((s, fi) => s + parseFloat(fi.amount || 0), 0);
                const paid   = studentItems.reduce((s, fi) => s + parseFloat(fi.amount_paid || 0), 0);
                outstanding = Math.max(0, billed - paid);
              } else {
                // No fee bills yet — check payment records
                const allPayments = dataManager.getAll('payments') || [];
                outstanding = allPayments
                  .filter(p => (p.studentId || p.student_id) === student.id && p.status !== 'paid')
                  .reduce((s, p) => s + parseFloat(p.amount || 0), 0);
              }
              return `
              <tr>
                <td>${student.rollNo || student.roll_no || '-'}</td>
                <td style="font-weight: var(--font-weight-semibold);">${student.name}</td>
                <td>${student.grade ? 'Grade ' + student.grade : '-'}</td>
                <td>${student.section ? 'Section ' + student.section : '-'}</td>
                <td style="text-align:right; font-weight:700; color:${outstanding > 0 ? 'var(--color-danger)' : 'var(--text-secondary)'};">${outstanding > 0 ? formatCurrency(outstanding) : '—'}</td>
                <td>${createBadge(statusLabels[student.fees] || 'Pending', statusColors[student.fees] || 'warning')}</td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="feesPaymentsModule.recordPaymentForStudent('${student.id}')">
                    💵 Record Payment
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderMonthlyChart() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const payments = dataManager.getAll('payments') || [];
    const currentYear = new Date().getFullYear();

    // Calculate monthly totals for current year
    const monthlyData = months.map((month, index) => {
      const monthPayments = payments.filter(p => {
        const pDate = p.paymentDate || p.payment_date;
        if (!pDate) return false;
        const date = new Date(pDate);
        return date.getMonth() === index && date.getFullYear() === currentYear && p.status === 'paid';
      });
      return monthPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    });

    const maxAmount = Math.max(...monthlyData, 1);

    return `
      <div style="
        display: flex; 
        align-items: flex-end; 
        justify-content: space-between; 
        height: 220px; 
        gap: 4px;
        padding: 12px 8px;
        position: relative;
      ">
        ${months.map((month, i) => {
          const height = (monthlyData[i] / maxAmount) * 100;
          const amount = monthlyData[i];
          return `
            <div style="
              flex: 1; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              gap: 8px;
              min-width: 0;
            ">
              <div style="
                position: relative;
                width: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-end;
                height: 180px;
              ">
                ${amount > 0 ? `
                  <div style="
                    position: absolute;
                    bottom: 100%;
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                    white-space: nowrap;
                    margin-bottom: 4px;
                    font-weight: 600;
                  ">₦${(amount / 1000).toFixed(0)}k</div>
                ` : ''}
                <div style="
                  width: 100%;
                  max-width: 32px;
                  height: ${Math.max(height, 0)}%;
                  background: ${amount > 0 ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)' : 'var(--bg-tertiary)'};
                  border-radius: 4px 4px 2px 2px;
                  min-height: ${amount > 0 ? '8px' : '4px'};
                  transition: all 0.3s ease;
                  box-shadow: ${amount > 0 ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none'};
                " 
                onmouseover="this.style.transform='scaleY(1.05)'; this.style.boxShadow='0 4px 8px rgba(16, 185, 129, 0.3)';"
                onmouseout="this.style.transform='scaleY(1)'; this.style.boxShadow='${amount > 0 ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none'}';"
                ></div>
              </div>
              <span style="
                font-size: 0.75rem;
                color: var(--text-secondary);
                font-weight: 500;
                text-align: center;
              ">${month}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderPaymentMethodsChart() {
    const payments = dataManager.getAll('payments') || [];
    const paidPayments = payments.filter(p => p.status === 'paid');

    // Dynamically count all payment methods
    const methods = {};
    paidPayments.forEach(p => {
      const method = p.paymentMethod || 'unknown';
      methods[method] = (methods[method] || 0) + 1;
    });

    const total = Object.values(methods).reduce((sum, count) => sum + count, 0);

    const methodIcons = {
      'bank-deposit': '🏦', 'bank-transfer': '🏦', 'paystack': '💳',
      'cheque': '📝', 'mobile-money': '📱', 'cash': '💵', 'unknown': '❓'
    };

    const entries = Object.entries(methods);
    if (entries.length === 0) {
      return `<div class="empty-state"><div class="empty-state-icon">💳</div><h3 class="empty-state-title">No Payment Data</h3><p class="empty-state-description">Payment method distribution will appear here</p></div>`;
    }

    return `
      <div class="grid grid-cols-2 md:grid-cols-${Math.min(entries.length, 4)} gap-4">
        ${entries.map(([method, count]) => {
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
      const icon = methodIcons[method] || '💳';
      return `
            <div class="card" style="background: var(--bg-secondary); text-align: center;">
              <div class="card-body">
                <p style="font-size: var(--font-size-3xl); margin-bottom: var(--space-2);">
                  ${icon}
                </p>
                <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); margin-bottom: var(--space-1);">
                  ${count}
                </p>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); text-transform: capitalize; margin-bottom: var(--space-1);">
                  ${method.replace('-', ' ')}
                </p>
                <p style="color: var(--color-primary); font-weight: var(--font-weight-semibold);">
                  ${percentage}%
                </p>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  },

  // ============================================
  // BULK FEE ASSIGNMENT
  // ============================================

  bulkAssignFee() {
    const classes = dataManager.getAll('classes') || [];
    const grades = [...new Set(classes.map(c => c.grade))].sort();

    const classOptions = classes.map(c =>
      `<option value="${c.grade}|${c.section}">Grade ${c.grade} – Section ${c.section}</option>`
    ).join('');

    const feeTypes = ['Tuition Fee', 'Exam Fee', 'Library Fee', 'Sports Fee', 'Lab Fee', 'Transport Fee', 'Hostel Fee', 'Other'];

    const content = `
      <form id="bulk-fee-form" onsubmit="feesPaymentsModule.handleBulkAssignFee(event)">
        <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-5);"
          >Assign a fee to all active students in a selected class at once.</p>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Target Class</label>
            <select class="form-select" name="classFilter">
              <option value="all">All Classes (Entire School)</option>
              ${grades.map(g => `<optgroup label="Grade ${g}">
                ${classes.filter(c => c.grade === g).map(c =>
      `<option value="${c.grade}|${c.section}">Grade ${c.grade} – Section ${c.section}</option>`
    ).join('')}
              </optgroup>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Fee Type *</label>
            <select class="form-select" name="feeType" required>
              <option value="">Select...</option>
              ${feeTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Amount (&#8358;) *</label>
            <input type="number" class="form-input" name="amount" required min="1" step="0.01" placeholder="0.00">
          </div>

          <div class="form-group">
            <label class="form-label">Payment Date *</label>
            <input type="date" class="form-input" name="paymentDate" required value="${new Date().toISOString().split('T')[0]}">
          </div>

          <div class="form-group">
            <label class="form-label">Term *</label>
            <select class="form-select" name="term" required>
              ${schoolConfig.termOptionsHTML()}
            </select>
          </div>

          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Notes</label>
            <input type="text" class="form-input" name="notes" placeholder="e.g., 2025/2026 First Term Tuition">
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">👥 Assign to All</button>
        </div>
      </form>
    `;
    createModal('Bulk Assign Fee', content);
  },

  async handleBulkAssignFee(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const classFilter = fd.get('classFilter');
    const feeType = fd.get('feeType');
    const amount = parseFloat(fd.get('amount'));
    const paymentDate = fd.get('paymentDate');
    const term = fd.get('term');
    const notes = fd.get('notes') || '';
    const academicYear = window.CURRENT_ACADEMIC_YEAR || '2025-2026';
    const recordedBy = this._getRecordedBy();

    let students = dataManager.getAll('students').filter(s => s.status === 'active');
    if (classFilter !== 'all') {
      const [grade, section] = classFilter.split('|');
      students = students.filter(s => s.grade === grade && s.section === section);
    }

    if (students.length === 0) {
      showToast('No active students found for the selected class.', 'warning');
      return;
    }

    if (!confirm(`Assign ${feeType} (\u20a6${amount.toLocaleString()}) to ${students.length} student(s)?\nThis will create ${students.length} payment records.`)) return;

    // Disable button during processing
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing...'; }

    // Fire all RPC calls in parallel (each is self-contained and transactional)
    const results = await Promise.allSettled(
      students.map(student =>
        supabaseClient.rpc('record_fee_payment', {
          p_data: {
            student_id:      student.id,
            student_name:    student.name,
            student_roll_no: student.rollNo || student.roll_no || '',
            grade:           student.grade  || '',
            section:         student.section || '',
            fee_type:        feeType,
            amount,
            payment_method:  'bulk-assign',
            payment_date:    paymentDate,
            transaction_ref: null,
            notes:           notes || `Bulk assigned \u2014 ${term} ${academicYear}`,
            receipt_no:      this.generateReceiptNo(),
            term,
            academic_year:   academicYear,
            recorded_by:     recordedBy
          }
        })
      )
    );

    let created = 0;
    let failed  = 0;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && !result.value.error && result.value.data?.success) {
        created++;
      } else {
        const errMsg = result.reason?.message || result.value?.error?.message || result.value?.data?.error || 'unknown';
        console.warn('[BulkAssign] Failed for student:', students[i].id, '\u2014', errMsg);
        failed++;
      }
    });

    document.querySelector('.modal-backdrop')?.remove();
    if (created > 0) {
      showToast(`${feeType} assigned to ${created} student${created !== 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''}`, 'success');
    } else {
      showToast('All assignments failed. Check console for details.', 'error');
    }
    await this._refreshAndRender();
  },

  // ============================================
  // PAYMENT ACTIONS
  // ============================================

  recordPayment() {
    const students = dataManager.getAll('students') || [];
    const activeStudents = students.filter(s => s.status === 'active');

    const content = `
      <form id="record-payment-form" onsubmit="event.preventDefault(); feesPaymentsModule.handleRecordPayment(event)">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Student *</label>
            <select class="form-select" name="studentId" required id="student-select" 
              onchange="feesPaymentsModule.updateFeeTypeOptions(this.value)">
              <option value="">Select Student</option>
              ${activeStudents.map(s => `
                <option value="${s.id}" data-grade="${s.grade}">${s.name}${s.rollNo ? ' (' + s.rollNo + ')' : ''} - Grade ${s.grade}-${s.section}</option>
              `).join('')}
            </select>
          </div>

          <div id="unpaid-fees-summary" style="grid-column: span 2;"></div>

          <div class="form-group">
            <label class="form-label">Fee Type *</label>
            <select class="form-select" name="feeType" required id="fee-type-select"
              onchange="feesPaymentsModule.populateFeeAmount()">
              <option value="">Select Fee Type</option>
            </select>
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;" id="amount-hint-fee-type">
              💡 Select a student first to see available fee types
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">Amount (₦) *</label>
            <input type="number" class="form-input" name="amount" required min="1" step="0.01" 
              placeholder="0.00" id="amount-input">
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;" id="amount-hint">
              💡 Amount will auto-fill based on fee type
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">Payment Method *</label>
            <select class="form-select" name="paymentMethod" required id="payment-method-select" onchange="feesPaymentsModule.togglePaymentFields(this.value)">
              <option value="">Select Method</option>
              <option value="bank-deposit">🏦 Bank Transfer (Upload Receipt)</option>
              <option value="paystack">💳 Pay Online (Paystack)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Payment Date *</label>
            <input type="date" class="form-input" name="paymentDate" required value="${new Date().toISOString().split('T')[0]}">
          </div>

          <div class="form-group">
            <label class="form-label">Term *</label>
            <select class="form-select" name="term" required>
              ${schoolConfig.termOptionsHTML()}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Academic Year *</label>
            <select class="form-select" name="academicYear" required>
              <option value="${window.CURRENT_ACADEMIC_YEAR || '2025-2026'}" selected>${window.CURRENT_ACADEMIC_YEAR || '2025-2026'}</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2026-2027">2026-2027</option>
            </select>
          </div>

          <div id="bank-deposit-details" style="display: none; grid-column: span 2; padding: var(--space-4); background: var(--bg-tertiary); border-radius: var(--radius-md); border-left: 4px solid var(--color-primary);">
            <h4 style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-3);">🏦 School Bank Details</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); font-size: var(--font-size-sm);">
              <div><strong>Bank:</strong> First Bank of Nigeria</div>
              <div><strong>Account No:</strong> 0123456789</div>
              <div><strong>Account Name:</strong> TBD Academy</div>
              <div><strong>Sort Code:</strong> 011151003</div>
            </div>
          </div>

          <div class="form-group" id="transaction-ref-group" style="display: none;">
            <label class="form-label">Transaction Reference / Teller No. *</label>
            <input type="text" class="form-input" name="transactionRef" placeholder="Enter deposit reference or teller number" required>
          </div>

          <div class="form-group" id="receipt-upload-group" style="display: none;">
            <label class="form-label">Upload Payment Receipt *</label>
            <input type="file" class="form-input" name="receiptFile" accept=".jpg,.jpeg,.png,.pdf" id="receipt-file-input">
            <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: var(--space-1);">
              Accepted: JPG, PNG, PDF (max 5MB). Bank deposit receipts require admin verification.
            </p>
          </div>

          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Notes</label>
            <textarea class="form-input" name="notes" rows="2" placeholder="Optional notes"></textarea>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1" id="submit-payment-btn">💾 Record Payment</button>
        </div>
      </form>
    `;

    createModal('Record Payment', content);
  },

  recordPaymentForStudent(studentId) {
    const student = dataManager.getById('students', studentId);
    if (!student) return;

    const content = `
      <form id="record-payment-form" onsubmit="event.preventDefault(); feesPaymentsModule.handleRecordPayment(event)">
        <input type="hidden" name="studentId" value="${studentId}">

        <div class="mb-4" style="padding: var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md);">
          <p style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-1);">${student.name}</p>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            ${student.rollNo ? 'Roll No: ' + student.rollNo + ' • ' : ''}Grade ${student.grade}-${student.section}
          </p>
        </div>

        <div id="unpaid-fees-summary" style="margin-bottom: 0.75rem;"></div>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Fee Type *</label>
            <select class="form-select" name="feeType" required id="fee-type-select"
              onchange="feesPaymentsModule.populateFeeAmount()">
              <option value="">Loading fee types…</option>
            </select>
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;" id="amount-hint">
              💡 Loading outstanding fees for this student…
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">Amount (₦) *</label>
            <input type="number" class="form-input" name="amount" required min="1" step="0.01" 
              placeholder="0.00" id="amount-input">
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;" id="amount-hint">
              💡 You can modify the amount if needed
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">Payment Method *</label>
            <select class="form-select" name="paymentMethod" required id="payment-method-select" onchange="feesPaymentsModule.togglePaymentFields(this.value)">
              <option value="">Select Method</option>
              <option value="bank-deposit">🏦 Bank Transfer (Upload Receipt)</option>
              <option value="paystack">💳 Pay Online (Paystack)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Payment Date *</label>
            <input type="date" class="form-input" name="paymentDate" required value="${new Date().toISOString().split('T')[0]}">
          </div>

          <div class="form-group">
            <label class="form-label">Term *</label>
            <select class="form-select" name="term" required>
              ${schoolConfig.termOptionsHTML()}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Academic Year *</label>
            <select class="form-select" name="academicYear" required>
              <option value="${window.CURRENT_ACADEMIC_YEAR || '2025-2026'}" selected>${window.CURRENT_ACADEMIC_YEAR || '2025-2026'}</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2026-2027">2026-2027</option>
            </select>
          </div>

          <div id="bank-deposit-details" style="display: none; grid-column: span 2; padding: var(--space-4); background: var(--bg-tertiary); border-radius: var(--radius-md); border-left: 4px solid var(--color-primary);">
            <h4 style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-3);">🏦 School Bank Details</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); font-size: var(--font-size-sm);">
              <div><strong>Bank:</strong> First Bank of Nigeria</div>
              <div><strong>Account No:</strong> 0123456789</div>
              <div><strong>Account Name:</strong> TBD Academy</div>
              <div><strong>Sort Code:</strong> 011151003</div>
            </div>
          </div>

          <div class="form-group" id="transaction-ref-group" style="display: none; grid-column: span 2;">
            <label class="form-label">Transaction Reference / Teller No. *</label>
            <input type="text" class="form-input" name="transactionRef" placeholder="Enter deposit reference or teller number" required>
          </div>

          <div class="form-group" id="receipt-upload-group" style="display: none; grid-column: span 2;">
            <label class="form-label">Upload Payment Receipt *</label>
            <input type="file" class="form-input" name="receiptFile" accept=".jpg,.jpeg,.png,.pdf" id="receipt-file-input">
            <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: var(--space-1);">
              Accepted: JPG, PNG, PDF (max 5MB). Bank deposit receipts require admin verification.
            </p>
          </div>

          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Notes</label>
            <textarea class="form-input" name="notes" rows="2" placeholder="Optional notes"></textarea>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1" id="submit-payment-btn">💾 Record Payment</button>
        </div>
      </form>
    `;

    createModal(`Record Payment - ${student.name}`, content);
    // Populate fee types and outstanding summary after modal renders
    setTimeout(() => this.updateFeeTypeOptions(studentId), 50);
  },

  updateFeeTypeOptions(studentId) {
    const feeTypeSelect = document.getElementById('fee-type-select');
    const amountInput   = document.getElementById('amount-input');
    const amountHint    = document.getElementById('amount-hint') || document.getElementById('amount-hint-fee-type');
    const summaryEl     = document.getElementById('unpaid-fees-summary');

    if (!feeTypeSelect) return;

    feeTypeSelect.innerHTML = '<option value="">Select Fee Type</option>';
    if (amountInput) amountInput.value = '';
    if (summaryEl) summaryEl.innerHTML = '';

    if (!studentId) {
      if (amountHint) amountHint.textContent = '💡 Select a student first to see available fee types';
      return;
    }

    const student = dataManager.getById('students', studentId);
    if (!student) return;

    // ── ALL payments for this student (to detect paid vs never-assigned) ──
    const allPayments = dataManager.getAll('enhancedPayments') || [];
    const allStudentPayments = allPayments.filter(p =>
      (p.student_id || p.studentId) === studentId
    );

    // ── Priority 1: fees_payments – actual outstanding bills ──
    const unpaidBills = allStudentPayments.filter(p => {
      const status = (p.status || '').toLowerCase();
      return status === 'pending' || status === 'partial' || status === 'overdue';
    });

    // ── Priority 2: fee_items table – item-level ledger ──
    const allFeeItems    = dataManager.getAll('feeItems') || [];
    const unpaidFeeItems = allFeeItems.filter(item => {
      const sid    = item.student_id || item.studentId;
      const status = (item.status || '').toLowerCase();
      return sid === studentId && (status === 'pending' || status === 'partial');
    });

    // ── Priority 3: static fee structure fallback ──
    const gradeFees = window.feeStructure?.getFeeItems?.(student.grade)
      || window.feeStructure?.feeItems?.[student.grade]
      || [];

    // Current term for paid-fee exclusion in fallback
    const currentTerm = (window.schoolConfig?.getCurrentTerm?.()?.name
      || schoolConfig?.getCurrentTerm?.()?.name || '').toLowerCase();

    if (unpaidBills.length > 0) {
      // Use fees_payments unpaid records as primary source
      // FIX #4: Deduplicate fee types
      const addedFeeTypes = new Set();

      unpaidBills.forEach(bill => {
        const feeType = bill.fee_type || bill.feeType || 'Fee';
        if (addedFeeTypes.has(feeType)) return;  // Skip if already added

        const amount  = parseFloat(bill.amount) || 0;
        const termStr = bill.term ? ` [${bill.term}]` : '';
        const option  = document.createElement('option');
        option.value  = feeType;
        option.setAttribute('data-amount', amount);
        option.setAttribute('data-payment-id', bill.id);
        option.textContent = `${feeType}${termStr} — ₦${amount.toLocaleString()} (${bill.status})`;
        feeTypeSelect.appendChild(option);

        addedFeeTypes.add(feeType);  // Mark as added
      });
      const total = unpaidBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
      if (amountHint) amountHint.textContent =
        `⚠️ ${unpaidBills.length} outstanding bill(s) — Total: ₦${total.toLocaleString()}`;

    } else if (unpaidFeeItems.length > 0) {
      // Use fee_items ledger
      // FIX #4: Deduplicate fee items
      const addedItemNames = new Set();

      unpaidFeeItems.forEach(item => {
        const itemName  = item.item_name || item.itemName || 'Fee';
        if (addedItemNames.has(itemName)) return;  // Skip if already added

        const amount    = parseFloat(item.amount || 0);
        const paid      = parseFloat(item.amount_paid || item.amountPaid || 0);
        const balance   = amount - paid;
        if (balance > 0) {
          const option = document.createElement('option');
          option.value = itemName;
          option.setAttribute('data-amount', balance);
          option.setAttribute('data-fee-item-id', item.id);
          option.textContent = `${itemName} — Balance: ₦${balance.toLocaleString()}`;
          feeTypeSelect.appendChild(option);

          addedItemNames.add(itemName);  // Mark as added
        }
      });
      if (amountHint) amountHint.textContent =
        `⚠️ ${unpaidFeeItems.length} unpaid item(s) from fee ledger`;

    } else if (gradeFees.length > 0) {
      // Fallback to fee structure — exclude fee types already paid this term
      // FIX #5: Add grade normalization
      const normalizedGrade = window.feeStructure?.normalizeGrade?.(student.grade);
      const actualGradeFees = normalizedGrade
        ? window.feeStructure?.getFeeItems?.(normalizedGrade) || []
        : [];

      if (actualGradeFees.length === 0) {
        if (amountHint) amountHint.textContent =
          '💡 No fee structure for this grade. Use "Other" for a custom amount.';
      } else {
        const paidThisTerm = new Set(
          allStudentPayments
            .filter(p => {
              const status = (p.status || '').toLowerCase();
              const term   = (p.term   || '').toLowerCase();
              return status === 'paid' && (!currentTerm || term === currentTerm);
            })
            .map(p => (p.fee_type || p.feeType || '').toLowerCase())
        );

        const unpaidStructureFees = actualGradeFees.filter(
          fee => !paidThisTerm.has(fee.name.toLowerCase())
        );

        if (unpaidStructureFees.length === 0) {
          // Every fee structure item is already paid this term
          if (amountHint) amountHint.textContent =
            `✅ All fee structure items are already paid for this term.`;
        } else {
          unpaidStructureFees.forEach(fee => {
            const option = document.createElement('option');
            option.value = fee.name;
            option.setAttribute('data-amount', fee.amount);
            option.textContent = `${fee.name} — ₦${fee.amount.toLocaleString()} (fee structure)`;
            feeTypeSelect.appendChild(option);
          });
          if (amountHint) amountHint.textContent =
            `💡 No bills assigned yet. Showing unpaid fee structure for Grade ${student.grade}.`;
        }
      }
    } else {
      if (amountHint) amountHint.textContent =
        '💡 No fee structure for this grade. Use "Other" for a custom amount.';
    }
    const otherOpt = document.createElement('option');
    otherOpt.value = 'Other';
    otherOpt.setAttribute('data-amount', '0');
    otherOpt.textContent = 'Other (Custom Amount)';
    feeTypeSelect.appendChild(otherOpt);

    // Render the outstanding-fees summary panel
    this._renderUnpaidFeesSummary(student, summaryEl, unpaidBills, unpaidFeeItems, allStudentPayments);
  },

  _renderUnpaidFeesSummary(student, container, unpaidBills, unpaidFeeItems, allStudentPayments = []) {
    if (!container) return;

    const hasBills = unpaidBills.length > 0;
    const hasItems = unpaidFeeItems.length > 0;

    if (!hasBills && !hasItems) {
      if (allStudentPayments.length > 0) {
        // Student HAS payment records and none are outstanding — truly all paid
        container.innerHTML = `
          <div style="padding:0.6rem 0.85rem;background:#dcfce7;border-radius:0.4rem;
            border-left:4px solid #22c55e;font-size:0.82rem;color:#166534;margin-bottom:0.25rem;">
            ✅ All fee bills for <strong>${student.name}</strong> have been paid.
            Any new payment will use the fee structure as reference.
          </div>`;
      } else {
        // No payment records at all — fees haven't been assigned yet
        container.innerHTML = `
          <div style="padding:0.6rem 0.85rem;background:#f0f9ff;border-radius:0.4rem;
            border-left:4px solid #0ea5e9;font-size:0.82rem;color:#0c4a6e;margin-bottom:0.25rem;">
            ℹ️ No fee bills have been assigned to <strong>${student.name}</strong> yet.
            Fee structure items are shown below as reference.
          </div>`;
      }
      return;
    }

    const source  = hasBills ? unpaidBills : unpaidFeeItems;
    const total   = hasBills
      ? unpaidBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0)
      : unpaidFeeItems.reduce((s, i) => {
          const a = parseFloat(i.amount || 0), p = parseFloat(i.amount_paid || i.amountPaid || 0);
          return s + Math.max(0, a - p);
        }, 0);

    const statusStyle = s => ({
      pending: 'background:#ffedd5;color:#9a3412',
      partial: 'background:#fef9c3;color:#854d0e',
      overdue: 'background:#fee2e2;color:#991b1b',
    }[s] || 'background:#e2e8f0;color:#475569');

    const rows = source.map(item => {
      if (hasBills) {
        const b = item;
        const amt = parseFloat(b.amount) || 0;
        return `<tr>
          <td style="padding:0.35rem 0.5rem;font-weight:600;">${b.fee_type || b.feeType || '-'}</td>
          <td style="padding:0.35rem 0.5rem;color:#6b7280;">${b.term || '-'}</td>
          <td style="padding:0.35rem 0.5rem;text-align:right;font-weight:600;">₦${amt.toLocaleString()}</td>
          <td style="padding:0.35rem 0.5rem;text-align:center;">
            <span style="font-size:0.68rem;padding:0.1rem 0.4rem;border-radius:999px;
              font-weight:700;${statusStyle(b.status)};">${b.status}</span>
          </td></tr>`;
      } else {
        const amt  = parseFloat(item.amount || 0);
        const paid = parseFloat(item.amount_paid || item.amountPaid || 0);
        const bal  = amt - paid;
        return `<tr>
          <td style="padding:0.35rem 0.5rem;font-weight:600;">${item.item_name || item.itemName || '-'}</td>
          <td style="padding:0.35rem 0.5rem;color:#6b7280;">${item.item_type || '-'}</td>
          <td style="padding:0.35rem 0.5rem;text-align:right;font-weight:600;">₦${bal.toLocaleString()}</td>
          <td style="padding:0.35rem 0.5rem;text-align:center;">
            <span style="font-size:0.68rem;padding:0.1rem 0.4rem;border-radius:999px;
              font-weight:700;${statusStyle(item.status)};">${item.status}</span>
          </td></tr>`;
      }
    }).join('');

    container.innerHTML = `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:0.5rem;
        padding:0.75rem;font-size:0.82rem;margin-bottom:0.25rem;">
        <div style="font-weight:700;color:#9a3412;margin-bottom:0.5rem;">
          ⚠️ Outstanding Fees — ${student.name} (Grade ${student.grade || '-'})
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="font-size:0.73rem;color:#6b7280;border-bottom:1px solid #fed7aa;">
              <th style="padding:0.25rem 0.5rem;text-align:left;">Fee Type</th>
              <th style="padding:0.25rem 0.5rem;text-align:left;">Term / Type</th>
              <th style="padding:0.25rem 0.5rem;text-align:right;">Amount</th>
              <th style="padding:0.25rem 0.5rem;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="border-top:1px solid #fed7aa;font-weight:700;">
              <td colspan="2" style="padding:0.35rem 0.5rem;">Total Outstanding</td>
              <td style="padding:0.35rem 0.5rem;text-align:right;color:#9a3412;">
                ₦${total.toLocaleString()}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  populateFeeAmount() {
    const feeTypeSelect = document.getElementById('fee-type-select');
    const amountInput   = document.getElementById('amount-input');
    const amountHint    = document.getElementById('amount-hint') || document.getElementById('amount-hint-fee-type');
    const submitBtn     = document.getElementById('submit-payment-btn');

    if (!feeTypeSelect || !amountInput) return;

    const selectedOption = feeTypeSelect.options[feeTypeSelect.selectedIndex];
    const feeType        = selectedOption?.value || '';
    const feeAmount      = selectedOption?.getAttribute('data-amount');

    // Remove any previous paid-warning banner
    document.getElementById('fee-paid-warning')?.remove();

    // Reset submit button state
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '💾 Record Payment'; }

    if (!feeType || feeType === '') {
      amountInput.value = '';
      return;
    }

    // ── Background paid-check ──
    // Resolve studentId from hidden field or student select
    const form      = feeTypeSelect.closest('form');
    const studentId = form?.querySelector('[name="studentId"]')?.value || '';
    const termEl    = form?.querySelector('[name="term"]');
    const selectedTerm = (termEl?.value || '').toLowerCase();
    const currentTerm  = (window.schoolConfig?.getCurrentTerm?.()?.name
      || schoolConfig?.getCurrentTerm?.()?.name || '').toLowerCase();
    const activeTerm = selectedTerm || currentTerm;

    if (studentId && feeType !== 'Other') {
      const allPayments = dataManager.getAll('enhancedPayments') || [];
      const typeLower   = feeType.toLowerCase();

      const alreadyPaid = allPayments.find(p => {
        const sid    = (p.student_id || p.studentId || '');
        const pType  = (p.fee_type  || p.feeType  || '').toLowerCase();
        const pTerm  = (p.term || '').toLowerCase();
        const status = (p.status || '').toLowerCase();
        const termMatch = !activeTerm || pTerm === activeTerm;
        return sid === studentId && pType === typeLower && status === 'paid' && termMatch;
      });

      const pendingDeposit = !alreadyPaid && allPayments.find(p => {
        const sid    = (p.student_id || p.studentId || '');
        const pType  = (p.fee_type  || p.feeType  || '').toLowerCase();
        const pTerm  = (p.term || '').toLowerCase();
        const status = (p.status || '').toLowerCase();
        const method = (p.payment_method || p.paymentMethod || '').toLowerCase();
        const termMatch = !activeTerm || pTerm === activeTerm;
        return sid === studentId && pType === typeLower && status === 'pending' && method === 'bank-deposit' && termMatch;
      });

      const conflict = alreadyPaid || pendingDeposit;
      if (conflict) {
        const isPaid    = !!alreadyPaid;
        const receipt   = conflict.receipt_no || conflict.receiptNo || 'N/A';
        const termLabel = conflict.term ? ` for <strong>${conflict.term}</strong>` : ' this term';
        const msg = isPaid
          ? `🚫 <strong>${feeType}</strong> has already been paid${termLabel} (Receipt: ${receipt}). Please select a different fee type.`
          : `⏳ A bank deposit for <strong>${feeType}</strong>${termLabel} is awaiting admin approval (Receipt: ${receipt}). No new payment can start until it is approved or rejected.`;
        const borderColor = isPaid ? '#ef4444' : '#f59e0b';
        const bgColor     = isPaid ? '#fee2e2' : '#fff7ed';
        const borderStrip = isPaid ? '#ef4444' : '#f59e0b';
        const textColor   = isPaid ? '#991b1b' : '#92400e';

        const warningHtml = `
          <div id="fee-paid-warning" style="grid-column:span 2;padding:0.65rem 0.9rem;
            background:${bgColor};border:1px solid ${borderColor};border-radius:0.4rem;
            border-left:4px solid ${borderStrip};font-size:0.83rem;color:${textColor};font-weight:600;">
            ${msg}
          </div>`;

        const feeGroup = feeTypeSelect.closest('.form-group');
        if (feeGroup) feeGroup.insertAdjacentHTML('afterend', warningHtml);

        amountInput.value = '';
        if (amountHint) amountHint.textContent = isPaid ? '⛔ This fee is already paid — choose another.' : '⏳ Pending approval — cannot start a new transaction.';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = isPaid ? '🚫 Fee Already Paid' : '⏳ Awaiting Approval';
        }
        return;
      }
    }

    // Not paid — fill amount normally
    if (feeAmount && parseFloat(feeAmount) > 0) {
      // FIX #7: Ensure positive amount
      const numAmount = Math.max(0.01, parseFloat(feeAmount));
      amountInput.value = numAmount;
      if (amountHint) {
        amountHint.innerHTML = `✅ Official fee: ₦${numAmount.toLocaleString()} <span style="color:var(--text-tertiary);">(You can modify if needed)</span>`;
      }
    } else {
      amountInput.value = '';
      if (amountHint) amountHint.textContent = '💡 Enter custom amount';
    }

    amountInput.focus();
  },

  togglePaymentFields(method) {
    const bankDetails = document.getElementById('bank-deposit-details');
    const refGroup = document.getElementById('transaction-ref-group');
    const receiptGroup = document.getElementById('receipt-upload-group');
    const isBankDeposit = method === 'bank-deposit';

    if (bankDetails) bankDetails.style.display = isBankDeposit ? 'block' : 'none';
    if (refGroup) refGroup.style.display = isBankDeposit ? 'block' : 'none';
    if (receiptGroup) receiptGroup.style.display = isBankDeposit ? 'block' : 'none';

    const receiptInput = document.getElementById('receipt-file-input');
    if (receiptInput) receiptInput.required = isBankDeposit;
    const refInput = refGroup?.querySelector('input[name="transactionRef"]');
    if (refInput) refInput.required = isBankDeposit;
  },

  async handleRecordPayment(event) {
    event.preventDefault();
    const btn = document.getElementById('submit-payment-btn');
    try {
      const formData = new FormData(event.target);
      const paymentMethod = formData.get('paymentMethod');

      // FIX #7: Add amount validation
      const amount = parseFloat(formData.get('amount')) || 0;
      if (!amount || amount <= 0) {
        showToast('Payment amount must be greater than 0', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
        return;
      }
      if (amount > 999999999) {
        showToast('Payment amount is too large', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
        return;
      }

      // Guard: block duplicate payments before any processing begins
      const studentId = formData.get('studentId');
      const feeType   = formData.get('feeType');
      const term      = formData.get('term') || schoolConfig.getCurrentTerm().name;
      const dupCheck  = this._checkDuplicatePayment(studentId, feeType, term);
      if (dupCheck.blocked) {
        showToast(dupCheck.reason, 'warning');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
        return;
      }

      // Disable submit button to prevent double-click
      if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

      // If Paystack, initiate online payment
      if (paymentMethod === 'paystack') {
        // Check CDN loaded before attempting to open iframe
        if (typeof PaystackPop === 'undefined') {
          showToast('Online payment is not available. Please check your internet connection and try again.', 'error');
          if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
          return;
        }
        // Note: initiatePaystackPayment opens a popup and returns immediately.
        // Button stays disabled until user completes or cancels payment.
        this.initiatePaystackPayment(formData, btn);
        return;
      }

      // For bank deposit, upload receipt file first
      if (paymentMethod === 'bank-deposit') {
        const fileInput = document.getElementById('receipt-file-input');
        const file = fileInput?.files?.[0];
        if (!file) {
          showToast('Please upload a payment receipt for bank deposit', 'error');
          if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          showToast('Receipt file must be under 5MB', 'error');
          if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
          return;
        }
        try {
          const ext = file.name.split('.').pop();
          const path = `receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { data, error } = await supabaseClient.storage.from('documents').upload(path, file, { cacheControl: '3600', upsert: false });
          if (error) throw error;
          const { data: urlData } = supabaseClient.storage.from('documents').getPublicUrl(path);
          formData.set('receiptUrl', urlData?.publicUrl || path);
        } catch (err) {
          console.error('Receipt upload failed:', err);
          showToast('Failed to upload receipt: ' + err.message, 'error');
          if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
          return;
        }
      }

      // Record payment
      await this.savePayment(formData);
    } catch (err) {
      console.error('handleRecordPayment error:', err);
      showToast('Payment failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
    }
  },

  async initiatePaystackPayment(formData, btn) {
    // Lazy-load Paystack SDK only when the user actually pays (saves ~50KB on every page load)
    if (typeof PaystackPop === 'undefined') {
      try {
        await window.loadLib('paystack');
      } catch {
        showToast('Could not load payment gateway — check your internet connection.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
        return;
      }
    }

    const student = dataManager.getById('students', formData.get('studentId'));
    if (!student) {
      showToast('Student not found. Cannot initiate payment.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
      return;
    }

    const amount = Math.round(parseFloat(formData.get('amount')) * 100); // Convert to kobo (Math.round prevents float precision errors)
    if (!amount || amount <= 0) {
      showToast('Invalid payment amount.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
      return;
    }

    // Use real email for Paystack; internal @tbd.internal addresses won't work
    const studentEmail = (student.email && !student.email.endsWith('@tbd.internal'))
      ? student.email
      : `${(student.rollNo || student.roll_no || student.id).toString().toLowerCase().replace(/\s+/g, '-')}@tbdacademy.edu.ng`;

    const key = this.paystackPublicKey;
    if (!key || key === 'pk_test_xxxxxxxxxxxx' || key.length < 10) {
      showToast('Paystack not configured — add PAYSTACK_PUBLIC_KEY to your Vercel environment variables.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
      return;
    }

    const ref = 'PAY-' + Date.now() + '-' + Math.floor(Math.random() * 100000);

    const handler = PaystackPop.setup({
      key,
      email: studentEmail,
      amount,
      currency: 'NGN',
      ref,
      metadata: {
        custom_fields: [
          { display_name: 'Student Name', variable_name: 'student_name', value: student.name },
          { display_name: 'Fee Type', variable_name: 'fee_type', value: formData.get('feeType') || '' }
        ]
      },
      callback: (response) => {
        // Paystack confirmed payment — show blocking overlay while saving
        // (Paystack callback is synchronous; we show UI feedback and save async)
        const overlay = document.createElement('div');
        overlay.id = 'paystack-saving-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
        overlay.innerHTML = '<div style="background:#fff;padding:32px 40px;border-radius:12px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);"><div style="font-size:1.5rem;margin-bottom:12px;">💾</div><p style="font-weight:600;margin-bottom:4px;">Recording Payment…</p><p style="color:#666;font-size:0.875rem;">Please do not close this page.</p></div>';
        document.body.appendChild(overlay);

        formData.set('transactionRef', response.reference);
        formData.set('paystackRef', response.reference);

        this.savePayment(formData, true)
          .then(() => {
            showToast('Payment recorded successfully!', 'success');
          })
          .catch((err) => {
            console.error('savePayment error after Paystack callback:', err);
            showToast('Payment received (Ref: ' + response.reference + ') but record save failed — contact admin.', 'error');
          })
          .finally(() => {
            document.getElementById('paystack-saving-overlay')?.remove();
            if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
          });
      },
      onClose: () => {
        showToast('Payment cancelled.', 'warning');
        // Re-enable button so admin can try again
        if (btn) { btn.disabled = false; btn.textContent = '💾 Record Payment'; }
      }
    });

    handler.openIframe();
  },

  async savePayment(formData, isPaystack = false) {
    const studentId = formData.get('studentId');
    const student = dataManager.getById('students', studentId);
    if (!student) { showToast('Student not found', 'error'); return; }

    const paymentMethod = formData.get('paymentMethod');
    const isBankDeposit = paymentMethod === 'bank-deposit';

    // ── BEGIN: Build the atomic payload ───────────────────────────────────
    const payload = {
      student_id:      studentId,
      student_name:    student.name,
      student_roll_no: student.rollNo || student.roll_no || '',
      grade:           student.grade  || '',
      section:         student.section || '',
      fee_type:        formData.get('feeType'),
      amount:          parseFloat(formData.get('amount')),
      payment_method:  paymentMethod,
      payment_date:    formData.get('paymentDate'),
      transaction_ref: formData.get('transactionRef') || null,
      notes:           formData.get('notes') || null,
      receipt_no:      this.generateReceiptNo(),
      receipt_url:     formData.get('receiptUrl') || null,
      term:            formData.get('term') || schoolConfig.getCurrentTerm().name,
      academic_year:   formData.get('academicYear') || window.CURRENT_ACADEMIC_YEAR || '2025-2026',
      recorded_by:     this._getRecordedBy()
    };

    // ── EXECUTE → CHECK → COMMIT / ROLLBACK (handled server-side by RPC) ─
    const { data: rpc, error: rpcErr } = await supabaseClient.rpc('record_fee_payment', { p_data: payload });
    if (rpcErr) {
      console.error('[Fees] record_fee_payment RPC error:', rpcErr);
      showToast('Payment failed: ' + rpcErr.message, 'error');
      return;
    }
    if (!rpc?.success) {
      const raw = rpc?.error || 'Payment could not be recorded.';
      showToast(raw.replace(/^[A-Z_]+:/, '').trim(), 'error');
      return;
    }

    // ── COMMIT: Update UI ─────────────────────────────────────────────────
    document.querySelector('.modal-backdrop')?.remove();
    if (isBankDeposit) {
      showToast('Bank deposit recorded! Awaiting admin verification before fees are confirmed.', 'info');
      if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_RECORDED', student.name || studentId, `Bank deposit \u20a6${(payload.amount||0).toLocaleString()} \u2014 pending verification`);
    } else if (!isPaystack) {
      showToast('Payment recorded successfully!', 'success');
      if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_RECORDED', student.name || studentId, `\u20a6${(payload.amount||0).toLocaleString()} via ${paymentMethod}`);
    }
    await this._refreshAndRender();
  },

  /**
   * Returns { blocked: true, reason, existing } if a payment for the same
   * student + fee type + term is already paid OR pending bank-deposit approval.
   * Returns { blocked: false } if the slot is free.
   */
  _checkDuplicatePayment(studentId, feeType, term) {
    const allPayments = dataManager.getAll('payments') || [];
    const typeLower   = (feeType || '').toLowerCase().trim();
    const termLower   = (term || '').toLowerCase().trim();

    const existing = allPayments.find(p => {
      const pSid    = (p.student_id || p.studentId || '');
      const pType   = (p.fee_type  || p.feeType   || '').toLowerCase().trim();
      const pTerm   = (p.term      || '').toLowerCase().trim();
      const pStatus = (p.status    || '').toLowerCase();
      const pMethod = (p.payment_method || p.paymentMethod || '').toLowerCase();

      if (pSid !== studentId) return false;
      if (pType !== typeLower) return false;
      if (termLower && pTerm && pTerm !== termLower) return false;

      if (pStatus === 'paid') return true;
      if (pStatus === 'pending' && pMethod === 'bank-deposit') return true;
      return false;
    });

    if (!existing) return { blocked: false };

    const pStatus = (existing.status || '').toLowerCase();
    const pMethod = (existing.payment_method || existing.paymentMethod || '').toLowerCase();
    const receipt  = existing.receipt_no || existing.receiptNo || 'N/A';
    const termText = existing.term ? ` for ${existing.term}` : '';

    if (pStatus === 'paid') {
      return {
        blocked: true,
        existing,
        reason: `"${feeType}"${termText} has already been paid (Receipt: ${receipt}). ` +
                `Void the existing payment first if a correction is needed.`
      };
    }
    return {
      blocked: true,
      existing,
      reason: `A bank deposit for "${feeType}"${termText} is already awaiting admin approval ` +
              `(Receipt: ${receipt}). No new transaction can be started until it is approved or rejected.`
    };
  },

  generateReceiptNo() {
    const now = Date.now();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const seq = (now % 100000).toString().padStart(5, '0');
    return `RCP${year}${month}-${seq}`;
  },

  viewPaymentDetails(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) return;

    const isPending = this._isPendingVerification(payment);
    const isRejected = this._isRejected(payment);
    const statusBadge = isPending
      ? '<span class="badge badge-warning" style="font-size: var(--font-size-sm);">⏳ Pending Verification</span>'
      : payment.status === 'paid'
        ? '<span class="badge badge-success" style="font-size: var(--font-size-sm);">✅ Verified & Paid</span>'
        : isRejected
          ? '<span class="badge badge-danger" style="font-size: var(--font-size-sm);">❌ Rejected</span>'
          : `<span class="badge badge-info" style="font-size: var(--font-size-sm);">${payment.status}</span>`;

    const receiptSection = payment.receiptUrl ? `
        <div class="card mb-4">
          <div class="card-header">
            <h4 class="card-title">📎 Uploaded Receipt</h4>
          </div>
          <div class="card-body" style="text-align: center;">
            ${payment.receiptUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        ? `<img src="${payment.receiptUrl}" alt="Payment Receipt" style="max-width: 100%; max-height: 400px; border-radius: var(--radius-md); border: 1px solid var(--border-primary);">`
        : `<a href="${payment.receiptUrl}" target="_blank" class="btn btn-secondary">📄 View Receipt Document</a>`
      }
          </div>
        </div>
    ` : '';

    const verificationSection = payment.verifiedBy ? `
        <div class="card mb-4" style="border-left: 4px solid var(--color-success);">
          <div class="card-body">
            <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">
              Verified by <strong>${payment.verifiedBy}</strong> on ${formatDate(payment.verifiedAt)}
            </p>
          </div>
        </div>
    ` : '';

    const rejectionSection = isRejected ? `
        <div class="card mb-4" style="border-left: 4px solid var(--color-danger);">
          <div class="card-body">
            <p style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-danger); margin-bottom: var(--space-2);">❌ Rejection Reason:</p>
            <p style="font-size: var(--font-size-sm); color: var(--text-secondary); font-style: italic;">${payment.rejectionReason || payment.rejection_reason || 'No reason provided'}</p>
          </div>
        </div>
    ` : '';

    const verifyButtons = isPending ? `
        <div class="flex gap-3 mb-4" style="padding: var(--space-4); background: var(--color-warning-bg); border-radius: var(--radius-md);">
          <button class="btn btn-primary flex-1" onclick="feesPaymentsModule.verifyPayment('${payment.id}')">
            ✅ Approve Payment
          </button>
          <button class="btn btn-ghost flex-1" style="color: var(--color-danger); border-color: var(--color-danger);" onclick="feesPaymentsModule.rejectPayment('${payment.id}')">
            ❌ Reject Payment
          </button>
        </div>
    ` : '';

    const content = `
      <div style="max-height: 70vh; overflow-y: auto;">
        <div class="mb-6" style="text-align: center; padding: var(--space-6); background: var(--bg-secondary); border-radius: var(--radius-md);">
          <h3 style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); margin-bottom: var(--space-2);">
            Receipt #${payment.receiptNo}
          </h3>
          <p style="color: var(--text-secondary); margin-bottom: var(--space-2);">${formatDate(payment.paymentDate)}</p>
          ${statusBadge}
        </div>

        ${verifyButtons}

        <div class="card mb-4">
          <div class="card-header">
            <h4 class="card-title">Student Information</h4>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Name</p>
                <p style="font-weight: var(--font-weight-semibold);">${payment.studentName}</p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Roll Number</p>
                <p style="font-weight: var(--font-weight-semibold);">${payment.studentRollNo || '—'}</p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Grade</p>
                <p style="font-weight: var(--font-weight-semibold);">Grade ${payment.grade}</p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Section</p>
                <p style="font-weight: var(--font-weight-semibold);">Section ${payment.section}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header">
            <h4 class="card-title">Payment Details</h4>
          </div>
          <div class="card-body">
            <div class="space-y-3">
              <div class="flex justify-between">
                <span style="color: var(--text-secondary);">Fee Type</span>
                <span style="font-weight: var(--font-weight-semibold);">${payment.feeType}</span>
              </div>
              <div class="flex justify-between">
                <span style="color: var(--text-secondary);">Amount</span>
                <span style="font-weight: var(--font-weight-bold); color: var(--color-success); font-size: var(--font-size-xl);">
                  ${formatCurrency(parseFloat(payment.amount) || 0)}
                </span>
              </div>
              <div class="flex justify-between">
                <span style="color: var(--text-secondary);">Payment Method</span>
                <span style="font-weight: var(--font-weight-semibold); text-transform: capitalize;">
                  ${(payment.paymentMethod || '').replace(/-/g, ' ')}
                </span>
              </div>
              ${payment.transactionRef ? `
                <div class="flex justify-between">
                  <span style="color: var(--text-secondary);">Transaction Reference</span>
                  <span style="font-family: monospace; font-weight: var(--font-weight-semibold);">
                    ${payment.transactionRef}
                  </span>
                </div>
              ` : ''}
              ${payment.notes ? `
                <div>
                  <p style="color: var(--text-secondary); margin-bottom: var(--space-1);">Notes</p>
                  <p style="font-style: italic;">${payment.notes}</p>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        ${receiptSection}
        ${verificationSection}
        ${rejectionSection}

        <div class="flex gap-3">
          ${payment.status === 'paid' ? `
            <button class="btn btn-primary flex-1" onclick="feesPaymentsModule.generateReceipt('${payment.id}')">
              🧾 Generate PDF Receipt
            </button>
          ` : ''}
          <button class="btn btn-ghost flex-1" style="color: var(--color-danger); border-color: var(--color-danger);" onclick="feesPaymentsModule.voidPayment('${payment.id}')">
            🗑️ Void Payment
          </button>
          <button class="btn btn-secondary flex-1" onclick="closeModal(this)">
            Close
          </button>
        </div>
      </div>
    `;

    createModal('Payment Details', content, 'large');
  },

  async verifyPayment(paymentId) {
    let payment = dataManager.getById('payments', paymentId);
    if (!payment) {
      const { data } = await supabaseClient.from('fees_payments').select('*').eq('id', paymentId).single();
      payment = data;
    }
    if (!payment) { showToast('Payment record not found', 'error'); return; }
    const studentName = payment.studentName || payment.student_name || 'Unknown';
    const amount = parseFloat(payment.amount) || 0;
    if (!confirm(`Approve bank deposit of ${formatCurrency(amount)} from ${studentName}?\n\nThis will mark the fee as PAID.`)) return;

    // ── BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK via RPC ───────────────
    const { data: rpc, error: rpcErr } = await supabaseClient.rpc('verify_fee_payment', {
      p_payment_id:  paymentId,
      p_verified_by: this._getRecordedBy()
    });
    if (rpcErr || !rpc?.success) {
      const msg = rpc?.error || rpcErr?.message || 'Failed to approve payment.';
      showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
      return;
    }

    document.querySelector('.modal-backdrop')?.remove();
    showToast('Payment verified and approved!', 'success');
    if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_VERIFIED', studentName, `\u20a6${amount.toLocaleString()} approved`);
    await this._refreshAndRender();
  },

  async rejectPayment(paymentId) {
    let payment = dataManager.getById('payments', paymentId);
    if (!payment) {
      const { data } = await supabaseClient.from('fees_payments').select('*').eq('id', paymentId).single();
      payment = data;
    }
    if (!payment) { showToast('Payment record not found', 'error'); return; }
    const studentName = payment.studentName || payment.student_name || 'Unknown';
    const reason = prompt(`Reject bank deposit from ${studentName}?\n\nPlease provide a reason:`);
    if (reason === null) return; // cancelled

    // ── BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK via RPC ───────────────
    const { data: rpc, error: rpcErr } = await supabaseClient.rpc('reject_fee_payment', {
      p_payment_id:  paymentId,
      p_verified_by: this._getRecordedBy(),
      p_reason:      reason || 'No reason provided'
    });
    if (rpcErr || !rpc?.success) {
      const msg = rpc?.error || rpcErr?.message || 'Failed to reject payment.';
      showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
      return;
    }

    document.querySelector('.modal-backdrop')?.remove();
    showToast('Payment rejected. Student will be notified.', 'warning');
    if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_REJECTED', studentName, reason || 'No reason provided');
    await this._refreshAndRender();
  },

  async voidPayment(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) return;

    const confirmed = confirm(`Are you sure you want to void payment ${payment.receiptNo}?\n\nAmount: ${formatCurrency(parseFloat(payment.amount) || 0)}\nStudent: ${payment.studentName}\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    // ── BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK via RPC ───────────────
    const { data: rpc, error: rpcErr } = await supabaseClient.rpc('void_fee_payment', {
      p_payment_id: paymentId
    });
    if (rpcErr || !rpc?.success) {
      const msg = rpc?.error || rpcErr?.message || 'Failed to void payment.';
      showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
      return;
    }

    document.querySelector('.modal-backdrop')?.remove();
    showToast(`Payment ${payment.receiptNo} has been voided`, 'success');
    await this._refreshAndRender();
  },

  generateReceipt(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) { showToast('Payment record not found.', 'error'); return; }

    const receiptData = buildReceiptData({
      receipt_no:      payment.receiptNo,
      student_name:    payment.studentName,
      grade:           payment.grade,
      section:         payment.section,
      student_roll_no: payment.studentRollNo,
      items:           [{ name: payment.feeType || 'Fee Payment', amount: parseFloat(payment.amount) || 0 }],
      amount:          parseFloat(payment.amount) || 0,
      payment_method:  payment.paymentMethod,
      payment_date:    payment.paymentDate,
      transaction_ref: payment.transactionRef,
      term:            payment.term,
      academic_year:   payment.academicYear || payment.academic_year,
      status:          payment.status || 'paid',
    });

    showReceiptModal(receiptData);
  },

  exportPayments() {
    const payments = dataManager.getAll('payments') || [];

    if (payments.length === 0) {
      showToast('No payments to export', 'warning');
      return;
    }

    // Prepare CSV data
    const headers = ['Receipt No', 'Date', 'Student Name', 'Roll No', 'Grade', 'Fee Type', 'Amount', 'Payment Method', 'Transaction Ref', 'Status'];

    const rows = payments.map(p => [
      p.receiptNo,
      p.paymentDate,
      p.studentName,
      p.studentRollNo,
      p.grade,
      p.feeType,
      p.amount,
      p.paymentMethod,
      p.transactionRef || '',
      p.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `payments_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${payments.length} payment records`, 'success');
  },

  // ============================================
  // HELPER METHODS
  // ============================================

  createGradientStatCard(label, value, icon, gradient, subtitle) {
    return `
      <div style="
        background: ${gradient};
        color: white;
        padding: var(--space-6);
        border-radius: var(--radius-lg);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
        cursor: pointer;
      "
      onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 16px rgba(0, 0, 0, 0.2)';"
      onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px rgba(0, 0, 0, 0.1)';">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-4);">
          <div style="font-size: 2.5rem; opacity: 0.9;">${icon}</div>
        </div>
        <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: var(--space-2); font-weight: 500;">${label}</div>
        <div style="font-size: 2rem; font-weight: 700; margin-bottom: var(--space-2);">${value}</div>
        <div style="font-size: 0.875rem; opacity: 0.8;">${subtitle}</div>
        <div style="
          position: absolute;
          bottom: -20px;
          right: -20px;
          font-size: 6rem;
          opacity: 0.1;
        ">${icon}</div>
      </div>
    `;
  },

  getUniquePaymentMethods(payments) {
    const methods = new Set(payments.filter(p => p.status === 'paid').map(p => p.paymentMethod));
    return methods.size;
  },

  // ============================================
  // FEE BREAKDOWN TAB
  // ============================================

  renderBreakdownTab() {
    const students = dataManager.getAll('students') || [];
    const feeItems = dataManager.getAll('feeItems') || [];

    // Group fee items by student
    const studentFeeMap = {};
    feeItems.forEach(item => {
      const studentId = item.student_id || item.studentId;
      if (!studentFeeMap[studentId]) {
        studentFeeMap[studentId] = [];
      }
      studentFeeMap[studentId].push(item);
    });

    // Calculate summary for each student
    const studentSummaries = students.map(student => {
      const items = studentFeeMap[student.id] || [];
      const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
      const totalPaid = items.reduce((sum, item) => sum + parseFloat(item.amount_paid || 0), 0);
      const totalBalance = totalAmount - totalPaid;
      const percentagePaid = totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0;

      return {
        student,
        items,
        totalAmount,
        totalPaid,
        totalBalance,
        percentagePaid,
        hasItems: items.length > 0
      };
    }).filter(s => s.hasItems);

    const currentTerm = schoolConfig.getCurrentTerm()?.name || 'N/A';
    const academicYear = window.CURRENT_ACADEMIC_YEAR || '2025-2026';

    return `
      <div class="fee-breakdown-tab">
        <!-- Auto-Assign Banner -->
        <div style="display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#4338ca18,#7c3aed18);border:1px solid #6366f140;border-radius:var(--radius-lg);padding:var(--space-5) var(--space-6);margin-bottom:var(--space-6);flex-wrap:wrap;gap:var(--space-4);">
          <div>
            <div style="font-weight:700;font-size:var(--font-size-base);margin-bottom:var(--space-1);">📋 Fee Structure Auto-Assignment</div>
            <div style="font-size:var(--font-size-sm);color:var(--text-secondary);">
              Current term: <strong>${currentTerm}</strong> &nbsp;·&nbsp; Academic year: <strong>${academicYear}</strong> &nbsp;·&nbsp;
              ${studentSummaries.length} student${studentSummaries.length !== 1 ? 's' : ''} have fee records
            </div>
          </div>
          <button class="btn btn-primary" onclick="feesPaymentsModule.openAssignFeesModal()"
            style="display:flex;align-items:center;gap:0.5rem;background:linear-gradient(135deg,#4338ca,#7c3aed);white-space:nowrap;">
            🚀 Assign Fees for Term
          </button>
        </div>

        <!-- Fee Totals Summary -->
        ${(() => {
          const t = this._computeBreakdownTotals();
          const rateColor = t.rate >= 75 ? '#10b981' : t.rate >= 40 ? '#f59e0b' : '#ef4444';
          return `
          <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:var(--space-6);">
            <!-- 3-column totals row -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:#fff;">
              <!-- Total Expected -->
              <div style="padding:20px 24px;border-right:1px solid #e2e8f0;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                  <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:1rem;">&#x1F4B0;</div>
                  <span style="font-size:0.78rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Total Billed</span>
                </div>
                <div style="font-size:1.75rem;font-weight:800;color:#0f172a;line-height:1;">&#x20A6;${t.totalExpected.toLocaleString()}</div>
                <div style="font-size:0.78rem;color:#94a3b8;margin-top:6px;">${t.billedCount} of ${t.totalStudents} student${t.totalStudents !== 1 ? 's' : ''} assigned fees</div>
              </div>
              <!-- Total Collected -->
              <div style="padding:20px 24px;border-right:1px solid #e2e8f0;background:#f0fdf4;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                  <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;font-size:1rem;">&#x2705;</div>
                  <span style="font-size:0.78rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Total Collected</span>
                </div>
                <div style="font-size:1.75rem;font-weight:800;color:#065f46;line-height:1;">&#x20A6;${t.totalPaid.toLocaleString()}</div>
                <div style="font-size:0.78rem;color:#6ee7b7;margin-top:6px;">${t.rate}% of billed fees collected</div>
              </div>
              <!-- Outstanding Balance -->
              <div style="padding:20px 24px;background:#fff7ed;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                  <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#f97316,#ef4444);display:flex;align-items:center;justify-content:center;font-size:1rem;">&#x23F3;</div>
                  <span style="font-size:0.78rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Outstanding Balance</span>
                </div>
                <div style="font-size:1.75rem;font-weight:800;color:#9a3412;line-height:1;">&#x20A6;${t.totalUnpaid.toLocaleString()}</div>
                <div style="font-size:0.78rem;color:#fdba74;margin-top:6px;">Fees yet to be collected from students</div>
              </div>
            </div>
            <!-- Collection rate progress bar -->
            <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:0.78rem;font-weight:600;color:#475569;">Collection Rate</span>
                <span style="font-size:0.82rem;font-weight:800;color:${rateColor};">${t.rate}%</span>
              </div>
              <div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${t.rate}%;background:${rateColor};border-radius:99px;transition:width 0.4s ease;"></div>
              </div>
              ${t.unbilledCount > 0 ? `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:0.8rem;color:#92400e;">
                <span>&#x26A0;&#xFE0F; ${t.unbilledCount} active student${t.unbilledCount !== 1 ? 's' : ''} have not yet been assigned fees</span>
                <button onclick="feesPaymentsModule.openAssignFeesModal()" style="border:none;background:#f59e0b;color:white;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;white-space:nowrap;">Assign Now</button>
              </div>` : ''}
            </div>
          </div>
          `;
        })()}

        <!-- Search and Filter -->
        <div class="card mb-4">
          <div class="card-body">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input type="text" id="studentSearchInput" class="form-control" placeholder="🔍 Search by student name or roll number..." 
                oninput="feesPaymentsModule.filterStudentBreakdown()">
              <select id="gradeFilterSelect" class="form-control" onchange="feesPaymentsModule.filterStudentBreakdown()">
                <option value="">All Grades</option>
                ${[...new Set(students.map(s => s.grade))].sort().map(grade => 
                  `<option value="${grade}">${grade}</option>`
                ).join('')}
              </select>
              <select id="statusFilterSelect" class="form-control" onchange="feesPaymentsModule.filterStudentBreakdown()">
                <option value="">All Status</option>
                <option value="paid">Fully Paid</option>
                <option value="partial">Partially Paid</option>
                <option value="pending">Not Paid</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Student Fee Breakdown List -->
        <div id="studentBreakdownList">
          ${studentSummaries.length === 0 ? `
            <div class="card">
              <div class="card-body text-center py-5">
                <div style="font-size: 4rem; opacity: 0.3; margin-bottom: 16px;">📋</div>
                <h4 class="mb-2">No Fee Items Found</h4>
                <p class="text-secondary mb-4">Fee items will appear here once students are assigned their grade-specific fees for a term.</p>
                <button class="btn btn-primary" onclick="feesPaymentsModule.openAssignFeesModal()"
                  style="background:linear-gradient(135deg,#4338ca,#7c3aed);">
                  🚀 Assign Fees for Term
                </button>
              </div>
            </div>
          ` : studentSummaries.map(summary => this.renderStudentFeeCard(summary)).join('')}
        </div>
      </div>
    `;
  },

  renderStudentFeeCard(summary) {
    const { student, items, totalAmount, totalPaid, totalBalance, percentagePaid } = summary;
    const statusClass = percentagePaid === 100 ? 'success' : percentagePaid > 0 ? 'warning' : 'danger';
    const statusText = percentagePaid === 100 ? 'Fully Paid' : percentagePaid > 0 ? 'Partially Paid' : 'Not Paid';

    return `
      <div class="card mb-4 student-fee-card" data-student-name="${student.name?.toLowerCase()}" data-roll-no="${student.roll_no?.toLowerCase()}" data-grade="${student.grade}" data-status="${statusText.toLowerCase().replace(' ', '')}">
        <div class="card-header" style="background: var(--bg-secondary); cursor: pointer;" onclick="feesPaymentsModule.toggleStudentFeeDetails('${student.id}')">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                ${student.photo || '👤'}
              </div>
              <div>
                <h5 class="mb-1" style="font-weight: 700;">${student.name}</h5>
                <div class="text-sm text-secondary">
                  ${student.roll_no} • ${student.grade} ${student.section ? `- ${student.section}` : ''}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div class="text-right">
                <div class="text-sm text-secondary mb-1">Total Fees</div>
                <div class="font-bold">₦${totalAmount.toLocaleString()}</div>
              </div>
              <div class="text-right">
                <div class="text-sm text-secondary mb-1">Paid</div>
                <div class="font-bold text-success">₦${totalPaid.toLocaleString()}</div>
              </div>
              <div class="text-right">
                <div class="text-sm text-secondary mb-1">Balance</div>
                <div class="font-bold text-danger">₦${totalBalance.toLocaleString()}</div>
              </div>
              <div>
                <span class="badge badge-${statusClass}">${statusText}</span>
                <div class="text-sm mt-1">${percentagePaid}% Complete</div>
              </div>
              <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); feesPaymentsModule.toggleStudentFeeDetails('${student.id}')">
                <span id="toggle-icon-${student.id}">▼</span>
              </button>
            </div>
          </div>
          <div class="mt-3">
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-${statusClass}" style="width: ${percentagePaid}%"></div>
            </div>
          </div>
        </div>
        <div id="fee-details-${student.id}" style="display: none;">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead style="background: var(--bg-tertiary);">
                  <tr>
                    <th>Fee Item</th>
                    <th>Type</th>
                    <th class="text-right">Amount</th>
                    <th class="text-right">Paid</th>
                    <th class="text-right">Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(item => {
                    const balance = parseFloat(item.amount) - parseFloat(item.amount_paid || 0);
                    const itemStatusBadge = item.status === 'paid' ? 'badge-success' : 
                                           item.status === 'partial' ? 'badge-warning' : 'badge-secondary';
                    return `
                      <tr>
                        <td><strong>${item.item_name}</strong></td>
                        <td><span class="badge badge-light">${item.item_type}</span></td>
                        <td class="text-right">₦${parseFloat(item.amount).toLocaleString()}</td>
                        <td class="text-right text-success">₦${parseFloat(item.amount_paid || 0).toLocaleString()}</td>
                        <td class="text-right ${balance > 0 ? 'text-danger' : 'text-success'}">₦${balance.toLocaleString()}</td>
                        <td><span class="badge ${itemStatusBadge}">${item.status}</span></td>
                        <td>
                          ${item.status !== 'paid' ? `
                            <button class="btn btn-sm btn-primary" onclick="feesPaymentsModule.recordPaymentForItem('${student.id}', '${item.id}', '${item.item_name}', ${balance})">
                              Pay
                            </button>
                          ` : '<span class="text-success">✓ Paid</span>'}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
                <tfoot style="background: var(--bg-tertiary); font-weight: 700;">
                  <tr>
                    <td colspan="2"><strong>TOTAL</strong></td>
                    <td class="text-right"><strong>₦${totalAmount.toLocaleString()}</strong></td>
                    <td class="text-right text-success"><strong>₦${totalPaid.toLocaleString()}</strong></td>
                    <td class="text-right text-danger"><strong>₦${totalBalance.toLocaleString()}</strong></td>
                    <td colspan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  toggleStudentFeeDetails(studentId) {
    const detailsDiv = document.getElementById(`fee-details-${studentId}`);
    const icon = document.getElementById(`toggle-icon-${studentId}`);
    
    if (detailsDiv) {
      const isHidden = detailsDiv.style.display === 'none';
      detailsDiv.style.display = isHidden ? 'block' : 'none';
      if (icon) icon.textContent = isHidden ? '▲' : '▼';
    }
  },

  filterStudentBreakdown() {
    const searchInput = document.getElementById('studentSearchInput')?.value.toLowerCase() || '';
    const gradeFilter = document.getElementById('gradeFilterSelect')?.value || '';
    const statusFilter = document.getElementById('statusFilterSelect')?.value || '';

    const cards = document.querySelectorAll('.student-fee-card');
    
    cards.forEach(card => {
      const studentName = card.dataset.studentName || '';
      const rollNo = card.dataset.rollNo || '';
      const grade = card.dataset.grade || '';
      const status = card.dataset.status || '';

      const matchesSearch = !searchInput || studentName.includes(searchInput) || rollNo.includes(searchInput);
      const matchesGrade = !gradeFilter || grade === gradeFilter;
      const matchesStatus = !statusFilter || status === statusFilter.toLowerCase().replace(' ', '');

      card.style.display = (matchesSearch && matchesGrade && matchesStatus) ? 'block' : 'none';
    });
  },

  openAssignFeesModal() {
    const students    = dataManager.getAll('students').filter(s => s.status === 'active');
    const currentTerm = schoolConfig.getCurrentTerm()?.name || '';
    const academicYear = window.CURRENT_ACADEMIC_YEAR || schoolConfig.getCurrentAcademicYear?.()?.replace('/', '-') || '2025-2026';

    // Grade preview summary
    const gradeGroups = {};
    students.forEach(s => {
      const g = s.grade || 'Unknown';
      if (!gradeGroups[g]) gradeGroups[g] = { count: 0, total: 0, hasStructure: false };
      gradeGroups[g].count++;
      const items = window.feeStructure?.getFeeItems?.(g) || [];
      if (items.length > 0) {
        gradeGroups[g].hasStructure = true;
        gradeGroups[g].total = items.reduce((s, i) => s + i.amount, 0);
        gradeGroups[g].itemCount = items.length;
      }
    });

    const previewRows = Object.entries(gradeGroups).sort(([a],[b]) => a.localeCompare(b)).map(([grade, info]) => `
      <tr style="border-bottom:1px solid var(--border-primary);">
        <td style="padding:0.5rem 0.75rem;font-weight:600;">${grade}</td>
        <td style="padding:0.5rem 0.75rem;text-align:center;">${info.count}</td>
        <td style="padding:0.5rem 0.75rem;text-align:center;">${info.hasStructure ? info.itemCount + ' items' : '<span style="color:var(--text-tertiary);">No structure</span>'}</td>
        <td style="padding:0.5rem 0.75rem;text-align:right;font-weight:600;">${info.hasStructure ? '₦' + info.total.toLocaleString() : '—'}</td>
        <td style="padding:0.5rem 0.75rem;text-align:right;color:var(--color-primary);font-weight:700;">${info.hasStructure ? '₦' + (info.total * info.count).toLocaleString() : '—'}</td>
      </tr>
    `).join('');

    const totalStudents    = students.filter(s => gradeGroups[s.grade]?.hasStructure).length;
    const grandTotal       = Object.values(gradeGroups).reduce((s, g) => s + (g.hasStructure ? g.total * g.count : 0), 0);

    const content = `
      <form id="assign-fees-form">
        <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-5);border-left:4px solid var(--color-primary);">
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin:0;">
            This will create individual fee bill records (one per fee item) for every active student based on their grade's fee structure.
            Existing bills for the same student + term are automatically skipped.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4" style="margin-bottom:var(--space-5);">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Academic Term *</label>
            <select class="form-select" name="term" id="assign-term-select" required
              onchange="feesPaymentsModule._updateAssignPreview()">
              ${schoolConfig.termOptionsHTML(currentTerm)}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Academic Year *</label>
            <input type="text" class="form-input" name="academicYear" value="${academicYear}" required placeholder="e.g. 2025-2026">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Apply to Grade (optional)</label>
            <select class="form-select" name="gradeFilter" onchange="feesPaymentsModule._updateAssignPreview()">
              <option value="">All Grades</option>
              ${Object.keys(gradeGroups).sort().map(g => `<option value="${g}">${g}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">If Already Assigned</label>
            <select class="form-select" name="skipExisting">
              <option value="1" selected>Skip (do not duplicate)</option>
              <option value="0">Overwrite (re-assign even if exists)</option>
            </select>
          </div>
        </div>

        <!-- Grade Preview Table -->
        <div style="margin-bottom:var(--space-5);">
          <p style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:var(--space-2);">Grade Assignment Preview:</p>
          <div style="border:1px solid var(--border-primary);border-radius:var(--radius-md);overflow:auto;max-height:35vh;">
            <table style="width:100%;border-collapse:collapse;">
              <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                <tr style="font-size:0.78rem;color:var(--text-secondary);">
                  <th style="padding:0.5rem 0.75rem;text-align:left;">Grade</th>
                  <th style="padding:0.5rem 0.75rem;text-align:center;">Students</th>
                  <th style="padding:0.5rem 0.75rem;text-align:center;">Fee Items</th>
                  <th style="padding:0.5rem 0.75rem;text-align:right;">Per Student</th>
                  <th style="padding:0.5rem 0.75rem;text-align:right;">Grade Total</th>
                </tr>
              </thead>
              <tbody id="assign-preview-tbody">${previewRows}</tbody>
              <tfoot style="background:var(--bg-tertiary);font-weight:700;">
                <tr>
                  <td style="padding:0.5rem 0.75rem;">TOTAL</td>
                  <td style="padding:0.5rem 0.75rem;text-align:center;" id="assign-total-students">${totalStudents}</td>
                  <td style="padding:0.5rem 0.75rem;text-align:center;">—</td>
                  <td style="padding:0.5rem 0.75rem;text-align:right;">—</td>
                  <td style="padding:0.5rem 0.75rem;text-align:right;color:var(--color-primary);" id="assign-grand-total">₦${grandTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Progress area (hidden until running) -->
        <div id="assign-progress-area" style="display:none;margin-bottom:var(--space-4);">
          <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:0.3rem;">
            <span>Assigning fees…</span>
            <span id="assign-progress-text">0 / 0</span>
          </div>
          <div style="height:8px;background:var(--bg-tertiary);border-radius:999px;overflow:hidden;">
            <div id="assign-progress-bar" style="height:100%;background:var(--color-primary);border-radius:999px;transition:width 0.3s;width:0%;"></div>
          </div>
        </div>

        <div class="flex gap-3">
          <button type="button" class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1" id="assign-fees-btn">
            🚀 Assign Fees for Term
          </button>
        </div>
      </form>
    `;

    const modal = createModal('📋 Assign Fees for Term', content, 'large');
    const form = modal.querySelector('#assign-fees-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleAssignFeesForTerm(e); });
  },

  _updateAssignPreview() {
    const gradeFilterEl = document.querySelector('[name="gradeFilter"]');
    const gradeFilter   = gradeFilterEl ? gradeFilterEl.value : '';
    const students      = dataManager.getAll('students').filter(s => s.status === 'active');
    const tbody         = document.getElementById('assign-preview-tbody');
    const totalStudentsEl = document.getElementById('assign-total-students');
    const grandTotalEl    = document.getElementById('assign-grand-total');
    if (!tbody) return;

    const filtered = gradeFilter ? students.filter(s => s.grade === gradeFilter) : students;
    const gradeGroups = {};
    filtered.forEach(s => {
      const g = s.grade || 'Unknown';
      if (!gradeGroups[g]) gradeGroups[g] = { count: 0 };
      gradeGroups[g].count++;
      const items = window.feeStructure?.getFeeItems?.(g) || [];
      gradeGroups[g].hasStructure = items.length > 0;
      gradeGroups[g].total       = items.reduce((sum, i) => sum + i.amount, 0);
      gradeGroups[g].itemCount   = items.length;
    });

    tbody.innerHTML = Object.entries(gradeGroups).sort(([a],[b]) => a.localeCompare(b)).map(([grade, info]) => `
      <tr style="border-bottom:1px solid var(--border-primary);">
        <td style="padding:0.5rem 0.75rem;font-weight:600;">${grade}</td>
        <td style="padding:0.5rem 0.75rem;text-align:center;">${info.count}</td>
        <td style="padding:0.5rem 0.75rem;text-align:center;">${info.hasStructure ? info.itemCount + ' items' : '<span style="color:var(--text-tertiary);">No structure</span>'}</td>
        <td style="padding:0.5rem 0.75rem;text-align:right;font-weight:600;">${info.hasStructure ? '₦' + info.total.toLocaleString() : '—'}</td>
        <td style="padding:0.5rem 0.75rem;text-align:right;color:var(--color-primary);font-weight:700;">${info.hasStructure ? '₦' + (info.total * info.count).toLocaleString() : '—'}</td>
      </tr>
    `).join('');

    const totalStudents = filtered.filter(s => gradeGroups[s.grade]?.hasStructure).length;
    const grandTotal    = Object.values(gradeGroups).reduce((s, g) => s + (g.hasStructure ? g.total * g.count : 0), 0);
    if (totalStudentsEl) totalStudentsEl.textContent = totalStudents;
    if (grandTotalEl)    grandTotalEl.textContent    = '₦' + grandTotal.toLocaleString();
  },

  async handleAssignFeesForTerm(event) {
    event.preventDefault();
    const fd          = new FormData(event.target);
    const term        = fd.get('term');
    const academicYear = fd.get('academicYear') || window.CURRENT_ACADEMIC_YEAR || '2025-2026';
    const gradeFilter = fd.get('gradeFilter') || '';
    const skipExisting = fd.get('skipExisting') !== '0'; // default: skip

    let students = dataManager.getAll('students').filter(s => s.status === 'active');
    if (gradeFilter) students = students.filter(s => s.grade === gradeFilter);

    // Only include students whose grade has a fee structure
    // FIX #5: Add grade normalization before lookup
    const eligible = students.filter(s => {
      const normalizedGrade = window.feeStructure?.normalizeGrade?.(s.grade);
      if (!normalizedGrade) return false;  // Grade not recognized

      const items = window.feeStructure?.getFeeItems?.(normalizedGrade) || [];
      return items.length > 0;
    });

    if (eligible.length === 0) {
      showToast('No eligible students found. Check that grades have a fee structure defined.', 'warning');
      return;
    }

    const btn = event.target.querySelector('#assign-fees-btn');
    const progressArea = document.getElementById('assign-progress-area');
    const progressBar  = document.getElementById('assign-progress-bar');
    const progressText = document.getElementById('assign-progress-text');

    if (btn)          { btn.disabled = true; btn.textContent = 'Assigning…'; }
    if (progressArea) progressArea.style.display = 'block';

    let assigned = 0, skipped = 0, failed = 0;

    for (let i = 0; i < eligible.length; i++) {
      const student = eligible[i];

      // Normalize academic year format to match feeStructure ('2025/2026' vs '2025-2026')
      const yearForDB = academicYear.replace('-', '/');

      const result = await feeManager.initializeFeeItems(
        student.id,
        student.grade,
        yearForDB,
        term,
        skipExisting
      );

      if (result.success) {
        if (result.existing) skipped++;
        else                 assigned += (result.count || 0);
      } else {
        failed++;
        console.warn('[AssignFees] Failed for', student.name, ':', result.error);
      }

      // Update progress bar
      const pct = Math.round(((i + 1) / eligible.length) * 100);
      if (progressBar)  progressBar.style.width  = pct + '%';
      if (progressText) progressText.textContent = `${i + 1} / ${eligible.length}`;
    }

    document.querySelector('.modal-backdrop')?.remove();
    await dataManager.refresh('feeItems');

    const msg = [
      assigned > 0 ? `✅ ${assigned} fee records created` : null,
      skipped  > 0 ? `⏭️ ${skipped} students already had fees (skipped)` : null,
      failed   > 0 ? `❌ ${failed} failed` : null,
    ].filter(Boolean).join(' · ');

    showToast(msg || 'No changes made.', assigned > 0 ? 'success' : 'warning');
    this.currentTab = 'breakdown';
    await this._refreshAndRender();
  },

  async initializeAllStudentFees() {
    // Legacy wrapper — now opens the proper modal
    this.openAssignFeesModal();
  },

  async recordPaymentForItem(studentId, itemId, itemName, balance) {
    const student = dataManager.getById('students', studentId);
    if (!student) {
      showToast('Student not found', 'error');
      return;
    }

    // Create modal for payment
    const modal = createModal(
      `Pay Fee Item: ${itemName}`,
      `
        <form id="payItemForm" onsubmit="feesPaymentsModule.submitItemPayment(event, '${studentId}', '${itemId}', ${balance})">
          <div class="form-group mb-4">
            <label class="form-label">Student</label>
            <input type="text" class="form-control" value="${student.name}" readonly>
          </div>
          <div class="form-group mb-4">
            <label class="form-label">Fee Item</label>
            <input type="text" class="form-control" value="${itemName}" readonly>
          </div>
          <div class="form-group mb-4">
            <label class="form-label">Balance Due</label>
            <input type="text" class="form-control" value="₦${balance.toLocaleString()}" readonly>
          </div>
          <div class="form-group mb-4">
            <label class="form-label">Amount to Pay *</label>
            <input type="number" id="itemPaymentAmount" class="form-control" min="1" max="${balance}" value="${balance}" required>
            <small class="text-secondary">Maximum: ₦${balance.toLocaleString()}</small>
          </div>
          <div class="form-group mb-4">
            <label class="form-label">Payment Method *</label>
            <select id="itemPaymentMethod" class="form-control" required>
              <option value="">Select method</option>
              <option value="bank-deposit">🏦 Bank Transfer (Upload Receipt)</option>
              <option value="paystack">💳 Pay Online (Paystack)</option>
            </select>
          </div>
          <div class="form-group mb-4">
            <label class="form-label">Transaction Reference</label>
            <input type="text" id="itemTransactionRef" class="form-control" placeholder="Optional">
          </div>
          <div class="form-group mb-4">
            <label class="form-label">Notes</label>
            <textarea id="itemPaymentNotes" class="form-control" rows="2" placeholder="Optional notes"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onclick="closeModal(this)">Cancel</button>
            <button type="submit" class="btn btn-primary">Record Payment</button>
          </div>
        </form>
      `,
      []
    );
  },

  async submitItemPayment(event, studentId, itemId, maxBalance) {
    event.preventDefault();

    const amount = parseFloat(document.getElementById('itemPaymentAmount').value);
    const paymentMethod = document.getElementById('itemPaymentMethod').value;
    const transactionRef = document.getElementById('itemTransactionRef').value;
    const notes = document.getElementById('itemPaymentNotes').value;

    if (amount > maxBalance) {
      showToast(`Amount cannot exceed balance of ₦${maxBalance.toLocaleString()}`, 'error');
      return;
    }

    const student = dataManager.getById('students', studentId);

    // ── BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK via RPC ───────────────
    const { data: rpc, error: rpcErr } = await supabaseClient.rpc('record_fee_payment', {
      p_data: {
        student_id:      studentId,
        student_name:    student.name,
        student_roll_no: student.roll_no || '',
        grade:           student.grade,
        section:         student.section || '',
        fee_type:        'fee_item',
        amount,
        payment_method:  paymentMethod,
        payment_date:    new Date().toISOString().split('T')[0],
        transaction_ref: transactionRef || null,
        notes:           notes || null,
        receipt_no:      'RCP-' + Date.now(),
        term:            schoolConfig?.getCurrentTerm()?.name || 'First Term',
        academic_year:   '2025-2026',
        recorded_by:     this._getRecordedBy()
      }
    });

    if (rpcErr || !rpc?.success) {
      const msg = rpc?.error || rpcErr?.message || 'Payment could not be recorded.';
      showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
      return;
    }

    // Refresh data
    await Promise.all([
      dataManager.refresh('payments'),
      dataManager.refresh('feeItems')
    ]);

    closeModal(event.target);
    this.render();
    showToast('Payment recorded successfully!', 'success');
  }
};

window.feesPaymentsModule = feesPaymentsModule;
