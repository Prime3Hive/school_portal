// ============================================
// STUDENT FEES MODULE
// Source of truth: feeStructure for student's grade
// Payments aggregated per item from fees_payments table
// ============================================

const studentFeesModule = {
  currentSession: null,
  studentData: null,

  async init(container) {
    this.currentSession = authManager.getSession();
    if (!container) container = document.getElementById('main-content');
    this._container = container;

    await dataManager.waitForReady();
    this.loadStudentData();
    container.innerHTML = this.render();

    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = (e) => {
      if (['payments', 'students', 'enhancedPayments', 'feeItems'].includes(e.detail.collection)) {
        this.loadStudentData();
        this._container.innerHTML = this.render();
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  loadStudentData() {
    const schoolId   = this.currentSession?.userId;
    const supabaseId = this.currentSession?.supabaseId;

    const students = dataManager.getAll('students') || [];
    const student  = students.find(s => s.authId === supabaseId || s.auth_id === supabaseId)
      || students.find(s => s.id === supabaseId)
      || students.find(s => s.id === schoolId);

    if (!student) {
      console.error('[StudentFees] Student not found:', { schoolId, supabaseId });
      this.studentData = { error: 'Student record not found. Please contact the administrator.', feeSchedule: [], paymentHistory: [], totals: { total: 0, paid: 0, balance: 0, progress: 0 } };
      return;
    }
    // All payment records for this student
    const allPayments = dataManager.getAll('enhancedPayments') || [];
    const studentPayments = allPayments
      .filter(p => (p.student_id || p.studentId) === student.id)
      .map(p => ({
        ...p,
        amount:      parseFloat(p.amount) || 0,
        feeTypeName: (p.fee_type || p.feeType || '').trim(),
        status:      p.status || 'pending',
        dateStr:     p.payment_date || p.paymentDate || p.created_at || null,
      }));

    // Fee schedule: primary source is fee_items (per-student assignments updated by feeManager)
    const allFeeItems    = dataManager.getAll('feeItems') || [];
    const studentFeeItems = allFeeItems.filter(item =>
      (item.student_id || item.studentId) === student.id
    );

    let feeSchedule   = [];
    let hasFeeStructure = false;

    if (studentFeeItems.length > 0) {
      // ── Primary path: fee_items rows already have amount_paid + status ──
      hasFeeStructure = true;

      // Cross-reference helper: match payment records to a fee item by name
      const _paymentsForItem = (itemName) => studentPayments.filter(p => {
        const pt = (p.feeTypeName || '').toLowerCase().trim();
        const nm = itemName.toLowerCase().trim();
        return pt === nm
          || pt.includes(nm.split(' ')[0])
          || nm.includes(pt.split(' ')[0]);
      });

      feeSchedule = studentFeeItems.map(item => {
        const itemName   = item.item_name || item.itemName || 'Fee';
        const amount     = parseFloat(item.amount || 0);
        const amountPaid = parseFloat(item.amount_paid || item.amountPaid || 0);
        const balance    = Math.max(0, amount - amountPaid);
        let status = 'not-paid';
        if (item.status === 'paid' || (amount > 0 && amountPaid >= amount)) status = 'paid';
        else if (item.status === 'partial' || amountPaid > 0) status = 'partial';

        // Enrich with matched payment records (receipt, date, history)
        const matchingPayments = _paymentsForItem(itemName);
        const paidPayments = matchingPayments.filter(p => p.status === 'paid');
        const lastPaid = [...paidPayments].sort((a, b) =>
          new Date(b.dateStr || 0) - new Date(a.dateStr || 0)
        )[0];

        return {
          id:          item.id,
          name:        itemName,
          amount,
          type:        item.item_type || item.itemType || 'tuition',
          required:    true,
          status,
          amountPaid,
          balance,
          term:        item.term || null,
          academicYear: item.academic_year || null,
          receiptNo:   lastPaid?.receipt_no || lastPaid?.receiptNo || null,
          paymentDate: lastPaid?.dateStr || null,
          payments:    matchingPayments,
        };
      });
    } else {
      // ── Fallback: static feeStructure for students not yet assigned fee items ──
      const gradeFeeItems = (typeof feeStructure !== 'undefined')
        ? feeStructure.getFeeItems(student.grade || '')
        : [];
      hasFeeStructure = gradeFeeItems.length > 0;

      const _paymentsFor = (item) => studentPayments.filter(p => {
        const pt = p.feeTypeName.toLowerCase();
        const nm = item.name.toLowerCase();
        const id = item.id.toLowerCase().replace(/_/g, ' ');
        return pt === nm
          || pt.includes(id)
          || nm.includes(pt.split(' ')[0])
          || pt.includes(nm.split(' ')[0]);
      });

      feeSchedule = gradeFeeItems.map(item => {
        const matching     = _paymentsFor(item);
        const paidPayments = matching.filter(p => p.status === 'paid');
        const totalPaid    = paidPayments.reduce((s, p) => s + p.amount, 0);
        const balance      = Math.max(0, item.amount - totalPaid);
        let status = 'not-paid';
        if (totalPaid >= item.amount) status = 'paid';
        else if (totalPaid > 0)       status = 'partial';
        const lastPaid = [...paidPayments].sort((a, b) =>
          new Date(b.dateStr || 0) - new Date(a.dateStr || 0)
        )[0];
        return {
          id:          item.id,
          name:        item.name,
          amount:      item.amount,
          type:        item.type,
          required:    item.required,
          status,
          amountPaid:  Math.min(totalPaid, item.amount),
          balance,
          receiptNo:   lastPaid?.receipt_no || lastPaid?.receiptNo || null,
          paymentDate: lastPaid?.dateStr || null,
          payments:    matching,
        };
      });
    }

    // ── Overlay pending/rejected bank-deposit payments onto fee schedule ──
    // A pending payment means the fee item shows "Awaiting Verification";
    // a rejected payment reverts it to unpaid and shows the rejection reason.
    studentPayments.forEach(p => {
      const method = (p.payment_method || p.paymentMethod || '').toLowerCase();
      if (method !== 'bank-deposit') return;
      const pName = (p.feeTypeName || '').toLowerCase().trim();
      const target = feeSchedule.find(i => {
        const n = i.name.toLowerCase();
        return n === pName
          || n.includes(pName.split(' ')[0])
          || pName.includes(n.split(' ')[0]);
      });
      if (!target || target.status === 'paid') return;
      if (p.status === 'pending') {
        // Latest pending wins
        if (!target.pendingPayment ||
            new Date(p.dateStr || 0) >= new Date(target.pendingPayment.dateStr || 0)) {
          target.status = 'pending-verification';
          target.pendingPayment = p;
        }
      } else if (p.status === 'overdue' && (p.rejection_reason || p.rejectionReason)) {
        if (target.status !== 'pending-verification') {
          target.status = 'rejected';
          target.rejectedPayment = p;
        }
      }
    });

    // Grand totals derived from the fee schedule
    const grandTotal   = feeSchedule.reduce((s, i) => s + i.amount, 0);
    const grandPaid    = feeSchedule.reduce((s, i) => s + i.amountPaid, 0);
    const grandBalance = grandTotal - grandPaid;

    this.studentData = {
      student,
      feeSchedule,
      paymentHistory: studentPayments,
      hasFeeStructure,
      totals: {
        total:    grandTotal,
        paid:     grandPaid,
        balance:  grandBalance,
        progress: grandTotal > 0 ? (grandPaid / grandTotal) * 100 : 0,
      },
    };
  },

  render() {
    if (!this.studentData) return '<div class="module-container"><p>Loading...</p></div>';
    const { student, error, feeSchedule, paymentHistory, totals, hasFeeStructure } = this.studentData;

    if (error || !student) {
      return `
        <div class="module-container">
          <div class="card" style="text-align:center;padding:3rem;">
            <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
            <h3 style="color:var(--color-danger);margin:0 0 0.5rem;">${error || 'Unable to load student information.'}</h3>
            <button class="btn btn-primary" onclick="window.location.reload()" style="margin-top:1rem;">Reload Page</button>
          </div>
        </div>`;
    }

    const { total, paid, balance, progress } = totals;
    const academicYear = (typeof feeStructure !== 'undefined' && feeStructure.academicYear) || '2025/2026';

    return `
      <div class="module-container">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1.5rem;">
          <div>
            <h1 style="margin:0 0 0.25rem;font-size:1.5rem;font-weight:700;">💰 My School Fees</h1>
            <p style="margin:0;color:var(--text-secondary);font-size:0.875rem;">
              ${student.name} &nbsp;·&nbsp; ${student.grade || '—'} ${student.section ? '· ' + student.section : ''} &nbsp;·&nbsp; ${academicYear}
            </p>
          </div>
          ${balance > 0
            ? `<button class="btn btn-success" onclick="studentFeesModule.showPaymentModal()">💳 Make Payment</button>`
            : `<button class="btn btn-success" disabled style="opacity:0.65;">✅ All Fees Paid</button>`
          }
        </div>

        <!-- Summary Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem;">
          ${this._statCard('Total Fees', '₦' + total.toLocaleString(), '#3b82f6', '📋')}
          ${this._statCard('Amount Paid', '₦' + paid.toLocaleString(), '#22c55e', '✅')}
          ${this._statCard('Outstanding', '₦' + balance.toLocaleString(), balance > 0 ? '#f59e0b' : '#22c55e', '⏳')}
          ${this._statCard('Progress', progress.toFixed(0) + '%', progress >= 100 ? '#22c55e' : '#3b82f6', '📊')}
        </div>

        <!-- Overall Progress Bar -->
        <div class="card" style="padding:1.25rem;margin-bottom:1.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <span style="font-size:0.875rem;color:var(--text-secondary);">Overall Payment Progress</span>
            <strong>${progress.toFixed(1)}%</strong>
          </div>
          <div style="height:12px;background:var(--bg-tertiary);border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(progress, 100)}%;background:${progress >= 100 ? '#22c55e' : '#3b82f6'};transition:width 0.5s;border-radius:999px;"></div>
          </div>
          ${balance > 0
            ? `<p style="margin:0.5rem 0 0;font-size:0.8rem;color:#f59e0b;">⚠️ ₦${balance.toLocaleString()} outstanding. Please pay before the deadline.</p>`
            : `<p style="margin:0.5rem 0 0;font-size:0.8rem;color:#22c55e;">🎉 All fees are fully settled!</p>`
          }
        </div>

        <!-- Fee Schedule (source of truth) -->
        ${hasFeeStructure
          ? this._renderFeeSchedule(feeSchedule)
          : `<div class="card" style="text-align:center;padding:2.5rem;">
               <div style="font-size:2.5rem;margin-bottom:0.75rem;">📋</div>
               <p style="color:var(--text-secondary);margin:0;">Fee structure not yet configured for <strong>${student.grade || 'your grade'}</strong>. Please contact the school administrator.</p>
             </div>`
        }

        <!-- Payment History -->
        ${this._renderPaymentHistory(paymentHistory)}

      </div>`;
  },

  _statCard(label, value, color, icon) {
    return `
      <div class="card" style="padding:1.25rem;text-align:center;">
        <div style="font-size:1.4rem;margin-bottom:0.375rem;">${icon}</div>
        <div style="font-size:1.3rem;font-weight:700;color:${color};">${value}</div>
        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;">${label}</div>
      </div>`;
  },

  _statusStyle(status) {
    const m = {
      paid:                   { cls: 'status-badge-paid',     icon: '✅', label: 'Paid' },
      partial:                { cls: 'status-badge-partial',  icon: '⏳', label: 'Partial' },
      overdue:                { cls: 'status-badge-overdue',  icon: '🔴', label: 'Overdue' },
      pending:                { cls: 'status-badge-awaiting', icon: '⏰', label: 'Pending Verification' },
      'pending-verification': { cls: 'status-badge-awaiting', icon: '🕐', label: 'Awaiting Approval' },
      rejected:               { cls: 'status-badge-rejected', icon: '🚫', label: 'Payment Rejected' },
      'not-paid':             { cls: 'status-badge-overdue',  icon: '❌', label: 'Not Paid' },
      waived:                 { cls: 'status-badge-pending',  icon: '🎓', label: 'Waived' },
    };
    const r = m[status] || { cls: 'status-badge-inactive', icon: '📄', label: status || 'Unknown' };
    r.bg    = r.bg    || '';
    r.color = r.color || '';
    return r;
  },

  _buildFeeItemReceiptData(item) {
    const { student } = this.studentData;
    const lastPmt = (item.payments || []).filter(p => p.status === 'paid').sort((a, b) => new Date(b.dateStr||0) - new Date(a.dateStr||0))[0] || {};
    return buildReceiptData({
      receipt_no:      item.receiptNo || lastPmt.receipt_no || lastPmt.receiptNo,
      student_name:    student.name,
      grade:           student.grade,
      section:         student.section,
      student_roll_no: student.rollNo || student.roll_no,
      items:           [{ name: item.name, amount: item.amountPaid }],
      amount:          item.amountPaid,
      payment_method:  lastPmt.payment_method || lastPmt.paymentMethod || 'paystack',
      payment_date:    item.paymentDate || lastPmt.dateStr,
      transaction_ref: lastPmt.transaction_ref || lastPmt.transactionRef,
      term:            lastPmt.term,
      academic_year:   lastPmt.academic_year || lastPmt.academicYear,
      status:          'paid',
    }, student);
  },

  _renderFeeSchedule(schedule) {
    const paidCount    = schedule.filter(i => i.status === 'paid').length;
    const partialCount = schedule.filter(i => i.status === 'partial').length;
    const notPaidCount = schedule.filter(i => i.status === 'not-paid' || i.status === 'rejected').length;
    const pendingCount = schedule.filter(i => i.status === 'pending-verification').length;
    const totalDue     = schedule.reduce((s, i) => s + i.amount, 0);
    const totalPaid    = schedule.reduce((s, i) => s + i.amountPaid, 0);
    const totalBalance = totalDue - totalPaid;
    const grade        = this.studentData.student.grade || 'Your Grade';
    const acYear       = (typeof feeStructure !== 'undefined' && feeStructure.academicYear) || '2025/2026';

    return `
      <div class="card" style="margin-bottom:1.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
          <h3 style="font-size:0.95rem;font-weight:600;margin:0;">📋 Fee Schedule — ${grade} &nbsp;·&nbsp; ${acYear}</h3>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">
            ${paidCount    > 0 ? `<span class="status-badge status-badge-paid">✅ ${paidCount} Paid</span>` : ''}
            ${partialCount > 0 ? `<span class="status-badge status-badge-partial">⏳ ${partialCount} Partial</span>` : ''}
            ${pendingCount > 0 ? `<span class="status-badge status-badge-awaiting">🕐 ${pendingCount} Awaiting Approval</span>` : ''}
            ${notPaidCount > 0 ? `<span class="status-badge status-badge-overdue">❌ ${notPaidCount} Not Paid</span>` : ''}
            ${paidCount > 0 ? `<button class="btn btn-sm btn-primary" onclick="studentFeesModule.downloadTermReceipt()" style="font-size:0.75rem;padding:0.3rem 0.75rem;white-space:nowrap;">📄 Term Receipt</button>` : ''}
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-tertiary);">
                <th style="padding:0.75rem 1rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border-primary);">Fee Item</th>
                <th style="padding:0.75rem 0.5rem;text-align:right;font-weight:600;border-bottom:2px solid var(--border-primary);">Amount Due</th>
                <th style="padding:0.75rem 0.5rem;text-align:right;font-weight:600;border-bottom:2px solid var(--border-primary);">Paid</th>
                <th style="padding:0.75rem 0.5rem;text-align:right;font-weight:600;border-bottom:2px solid var(--border-primary);">Balance</th>
                <th style="padding:0.75rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Status</th>
                <th style="padding:0.75rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Action</th>
              </tr>
            </thead>
            <tbody>
              ${schedule.map(item => {
                const st = this._statusStyle(item.status);
                const dateStr = item.paymentDate
                  ? new Date(item.paymentDate).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
                  : null;
                return `
                <tr style="border-bottom:1px solid var(--border-primary);">
                  <td style="padding:0.75rem 1rem;">
                    <strong>${item.name}</strong>
                    ${item.receiptNo ? `<div style="font-size:0.7rem;color:var(--text-secondary);">Receipt: ${item.receiptNo}</div>` : ''}
                    ${dateStr && item.status !== 'not-paid' ? `<div style="font-size:0.7rem;color:var(--text-secondary);">Last paid: ${dateStr}</div>` : ''}
                    ${item.status === 'pending-verification' ? `<div style="font-size:0.7rem;color:#c2410c;margin-top:0.2rem;">🕐 Receipt submitted — awaiting admin approval</div>` : ''}
                    ${item.status === 'rejected' ? `<div style="font-size:0.7rem;color:#dc2626;margin-top:0.2rem;">🚫 Rejected: ${item.rejectedPayment?.rejection_reason || item.rejectedPayment?.rejectionReason || 'No reason given'}</div>` : ''}
                  </td>
                  <td style="padding:0.75rem 0.5rem;text-align:right;font-weight:600;">₦${item.amount.toLocaleString()}</td>
                  <td style="padding:0.75rem 0.5rem;text-align:right;color:#22c55e;font-weight:600;">₦${item.amountPaid.toLocaleString()}</td>
                  <td style="padding:0.75rem 0.5rem;text-align:right;font-weight:600;color:${item.balance > 0 ? '#f59e0b' : '#22c55e'};">₦${item.balance.toLocaleString()}</td>
                  <td style="padding:0.75rem 0.5rem;text-align:center;">
                    <span class="status-badge ${st.cls}">${st.icon} ${st.label}</span>
                  </td>
                  <td style="padding:0.5rem;text-align:center;">
                    ${item.status === 'pending-verification'
                      ? `<span style="font-size:0.72rem;color:var(--status-awaiting-text);font-weight:600;white-space:nowrap;">🕐 Under Review</span>`
                      : item.balance > 0
                        ? `<button class="btn btn-sm btn-success" onclick="studentFeesModule.showPaymentModal('${item.id}')" style="font-size:0.75rem;padding:0.3rem 0.75rem;white-space:nowrap;">💳 Pay</button>`
                        : `<span style="display:inline-flex;align-items:center;gap:0.35rem;">
                             <span style="font-size:0.95rem;">✅</span>
                             <button class="btn btn-sm btn-ghost" onclick="studentFeesModule._downloadItemReceipt('${item.id}')" style="font-size:0.7rem;padding:0.25rem 0.55rem;white-space:nowrap;border:1px solid var(--border-primary);" title="Download Receipt">📄 Receipt</button>
                           </span>`
                    }
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:var(--bg-tertiary);font-weight:700;font-size:0.875rem;">
                <td style="padding:0.75rem 1rem;">Total</td>
                <td style="padding:0.75rem 0.5rem;text-align:right;">₦${totalDue.toLocaleString()}</td>
                <td style="padding:0.75rem 0.5rem;text-align:right;color:#22c55e;">₦${totalPaid.toLocaleString()}</td>
                <td style="padding:0.75rem 0.5rem;text-align:right;color:${totalBalance > 0 ? '#f59e0b' : '#22c55e'};">₦${totalBalance.toLocaleString()}</td>
                <td style="padding:0.5rem;text-align:center;"></td>
                <td style="padding:0.5rem;text-align:center;">
                  ${totalBalance > 0
                    ? `<button class="btn btn-sm btn-primary" onclick="studentFeesModule.payAllOutstanding()" style="font-size:0.75rem;padding:0.35rem 0.85rem;white-space:nowrap;background:#6366f1;border-color:#6366f1;">💳 Pay All</button>`
                    : `<span style="font-size:1rem;">✅</span>`
                  }
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  },

  _renderPaymentHistory(payments) {
    if (!payments || payments.length === 0) return '';
    const sorted = [...payments].sort((a, b) => new Date(b.dateStr || 0) - new Date(a.dateStr || 0));
    return `
      <div class="card" style="margin-bottom:1.5rem;">
        <h3 style="font-size:0.95rem;font-weight:600;margin:0 0 1rem;">🧾 Payment History</h3>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead>
              <tr style="background:var(--bg-tertiary);">
                <th style="padding:0.65rem 1rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border-primary);">Date</th>
                <th style="padding:0.65rem 0.5rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border-primary);">Fee Type</th>
                <th style="padding:0.65rem 0.5rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border-primary);">Method</th>
                <th style="padding:0.65rem 0.5rem;text-align:right;font-weight:600;border-bottom:2px solid var(--border-primary);">Amount</th>
                <th style="padding:0.65rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Status</th>
                <th style="padding:0.65rem 0.5rem;text-align:center;font-weight:600;border-bottom:2px solid var(--border-primary);">Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(p => {
                const isBankDeposit = (p.payment_method || p.paymentMethod || '') === 'bank-deposit';
                const isRejected    = p.status === 'overdue' && (p.rejection_reason || p.rejectionReason);
                const displayStatus = isBankDeposit && p.status === 'pending' ? 'pending'
                                    : isRejected ? 'rejected'
                                    : p.status;
                const st = this._statusStyle(displayStatus);
                const d  = p.dateStr ? new Date(p.dateStr).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }) : '—';
                const method = (p.paymentMethod || p.payment_method || 'paystack').replace(/-/g, ' ');
                const receiptUrl = p.receipt_url || p.receiptUrl;
                return `
                <tr style="border-bottom:1px solid var(--border-primary);">
                  <td style="padding:0.65rem 1rem;color:var(--text-secondary);">${d}</td>
                  <td style="padding:0.65rem 0.5rem;">
                    <strong>${p.feeTypeName || '—'}</strong>
                    ${isBankDeposit && p.status === 'pending' ? '<div style="font-size:0.7rem;color:#c2410c;margin-top:0.15rem;">🕐 Awaiting admin approval</div>' : ''}
                    ${isRejected ? `<div style="font-size:0.7rem;color:#dc2626;margin-top:0.15rem;">🚫 Reason: ${p.rejection_reason || p.rejectionReason}</div>` : ''}
                  </td>
                  <td style="padding:0.65rem 0.5rem;color:var(--text-secondary);text-transform:capitalize;">${method}</td>
                  <td style="padding:0.65rem 0.5rem;text-align:right;font-weight:600;">₦${p.amount.toLocaleString()}</td>
                  <td style="padding:0.65rem 0.5rem;text-align:center;">
                    <span class="status-badge ${st.cls}">${st.icon} ${st.label}</span>
                  </td>
                  <td style="padding:0.65rem 0.5rem;text-align:center;">
                    ${p.status === 'paid'
                      ? `<button class="btn btn-sm btn-ghost" onclick="studentFeesModule._downloadPaymentReceipt('${p.id || p.receipt_no || p.receiptNo}')" style="font-size:0.72rem;padding:0.25rem 0.55rem;border:1px solid var(--border-primary);" title="Download Receipt">📄 Receipt</button>`
                      : receiptUrl
                        ? `<a href="${receiptUrl}" target="_blank" rel="noopener" style="font-size:0.75rem;color:var(--color-primary);font-weight:600;">📎 View</a>`
                        : `<span style="color:var(--text-tertiary);font-size:0.75rem;">${p.receipt_no || p.receiptNo || '—'}</span>`
                    }
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  // ── Payment Modal ────────────────────────────────────────────────────────────

  showPaymentModal(preselectedItemId = null) {
    const { feeSchedule, student } = this.studentData;

    // If the student clicked Pay directly on a pending-verification item, block it
    if (preselectedItemId) {
      const target = feeSchedule.find(i => i.id === preselectedItemId);
      if (target && target.status === 'pending-verification') {
        showToast('Your receipt is already submitted and awaiting admin approval. Please wait.', 'info');
        return;
      }
    }

    // Only show items that have a balance AND are not pending admin verification
    const unpaidItems = feeSchedule.filter(i => i.balance > 0 && i.status !== 'pending-verification');

    if (unpaidItems.length === 0) {
      const hasPending = feeSchedule.some(i => i.status === 'pending-verification');
      if (hasPending) {
        showToast('All outstanding fees have receipts submitted and are awaiting admin approval.', 'info');
      } else {
        showToast('All fees are fully paid!', 'success');
      }
      return;
    }

    const preselected = preselectedItemId ? feeSchedule.find(i => i.id === preselectedItemId) : null;
    const bankDetails = (typeof feeStructure !== 'undefined' && feeStructure.bankDetails) || { name: 'Keystone Bank', accountName: 'TBD International Academy', accountNumber: '1013525760' };

    const content = `
      <form id="student-payment-form" onsubmit="event.preventDefault(); studentFeesModule.initiatePayment(event)">
        <div class="form-group">
          <label class="form-label">Fee Item *</label>
          <select class="form-select" name="itemId" required onchange="studentFeesModule._onItemChange(this.value)">
            <option value="">— Select fee item —</option>
            ${unpaidItems.map(i => `
              <option value="${i.id}" data-balance="${i.balance}" ${preselectedItemId === i.id ? 'selected' : ''}>
                ${i.name} — Balance: ₦${i.balance.toLocaleString()}
              </option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Amount to Pay (₦) *</label>
          <input type="number" class="form-input" name="amount" id="student-pay-amount" required
            min="1" step="0.01" placeholder="0.00" value="${preselected ? preselected.balance : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Payment Method *</label>
          <select class="form-select" name="paymentMethod" required onchange="studentFeesModule._onMethodChange(this.value)">
            <option value="paystack">💳 Pay Online (Paystack)</option>
            <option value="bank-deposit">🏦 Bank Deposit / Transfer</option>
          </select>
        </div>
        <div id="bank-deposit-section" style="display:none;">
          <div style="padding:1rem;background:var(--bg-tertiary);border-radius:0.5rem;margin-bottom:1rem;border-left:4px solid #3b82f6;">
            <h4 style="margin:0 0 0.5rem;font-size:0.875rem;font-weight:600;">🏦 Bank Details</h4>
            <div style="font-size:0.82rem;display:grid;grid-template-columns:auto 1fr;gap:0.2rem 0.75rem;">
              <span><strong>Bank:</strong></span><span>${bankDetails.name}</span>
              <span><strong>Account No:</strong></span><span>${bankDetails.accountNumber}</span>
              <span><strong>Account Name:</strong></span><span>${bankDetails.accountName}</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Teller / Transaction Reference *</label>
            <input type="text" class="form-input" name="transactionRef" id="student-txn-ref" placeholder="Enter teller no. or transaction reference">
          </div>
          <div class="form-group">
            <label class="form-label">Upload Receipt *</label>
            <input type="file" class="form-input" name="receiptFile" id="student-receipt-file" accept=".jpg,.jpeg,.png,.pdf">
            <p style="font-size:0.72rem;color:var(--text-tertiary);margin-top:0.25rem;">JPG, PNG or PDF · max 5MB</p>
          </div>
        </div>
        <div style="display:flex;gap:0.75rem;margin-top:1.5rem;">
          <button type="button" class="btn btn-ghost" style="flex:1;" onclick="closeModal(this)">Cancel</button>
          <button type="button" class="btn btn-success" style="flex:1;" id="student-pay-btn"
            onclick="studentFeesModule.initiatePayment()">💳 Pay Now</button>
        </div>
      </form>`;

    createModal('💳 Make Fee Payment', content);
  },

  _onItemChange(itemId) {
    const item = this.studentData?.feeSchedule?.find(i => i.id === itemId);
    const el   = document.getElementById('student-pay-amount');
    if (item && el) el.value = item.balance;
  },

  _onMethodChange(method) {
    const section = document.getElementById('bank-deposit-section');
    const payBtn  = document.getElementById('student-pay-btn');
    const ref     = document.getElementById('student-txn-ref');
    const file    = document.getElementById('student-receipt-file');
    const isBankDeposit = method === 'bank-deposit';
    if (section) section.style.display = isBankDeposit ? 'block' : 'none';
    if (ref)     ref.required  = isBankDeposit;
    if (file)    file.required = isBankDeposit;
    if (payBtn)  payBtn.textContent = isBankDeposit ? '📤 Submit for Verification' : '💳 Pay Now';
  },

  async initiatePayment() {
    const payBtn = document.getElementById('student-pay-btn');
    try {
      const itemId = document.querySelector('#student-payment-form select[name="itemId"]')?.value;
      const method = document.querySelector('#student-payment-form select[name="paymentMethod"]')?.value || 'paystack';
      const amount = parseFloat(document.getElementById('student-pay-amount')?.value);
      const { student } = this.studentData;

      if (!itemId) { showToast('Please select a fee item.', 'error'); return; }
      const item = this.studentData.feeSchedule.find(i => i.id === itemId);
      if (!item)  { showToast('Fee item not found.', 'error'); return; }

      // Guard: re-check balance is still > 0 (prevents double payment)
      if (item.balance <= 0) {
        showToast(`${item.name} is already fully paid.`, 'info');
        document.querySelector('.modal-backdrop')?.remove();
        return;
      }

      // Guard: block new transaction if same fee is already paid or has pending deposit
      const _currentTerm = window.schoolConfig?.getCurrentTerm?.()?.name || '';
      const _nameLower   = item.name.toLowerCase().trim();
      const _termLower   = _currentTerm.toLowerCase().trim();
      const _conflict    = (this.studentData.paymentHistory || []).find(p => {
        const pType   = (p.feeTypeName || p.fee_type || p.feeType || '').toLowerCase().trim();
        const pTerm   = (p.term || '').toLowerCase().trim();
        const pStatus = (p.status || '').toLowerCase();
        const pMethod = (p.payment_method || p.paymentMethod || '').toLowerCase();
        const typeOk  = pType === _nameLower
          || pType.startsWith(_nameLower.split(' ')[0])
          || _nameLower.startsWith(pType.split(' ')[0]);
        const termOk  = !_termLower || !pTerm || pTerm === _termLower;
        if (!typeOk || !termOk) return false;
        return pStatus === 'paid' || (pStatus === 'pending' && pMethod === 'bank-deposit');
      });
      if (_conflict) {
        const _isPaid  = _conflict.status === 'paid';
        const _receipt = _conflict.receipt_no || _conflict.receiptNo || '';
        const _msg = _isPaid
          ? `${item.name} has already been paid${_receipt ? ' (Receipt: ' + _receipt + ')' : ''}. No further payment needed.`
          : `A bank deposit for ${item.name} is already awaiting admin approval. Please wait for it to be approved or rejected before submitting another.`;
        showToast(_msg, _isPaid ? 'info' : 'warning');
        if (payBtn) { payBtn.disabled = false; payBtn.textContent = _isPaid ? '✅ Already Paid' : '⏳ Awaiting Approval'; }
        return;
      }

      if (!amount || amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }
      if (amount > item.balance + 0.01) {
        showToast(`Amount cannot exceed outstanding balance of ₦${item.balance.toLocaleString()}`, 'error');
        return;
      }

      const currentTerm  = window.schoolConfig?.getCurrentTerm?.()?.name || 'Current Term';
      const academicYear = (typeof feeStructure !== 'undefined' ? feeStructure.academicYear : null) || '2025/2026';
      const receiptNo    = this._generateReceiptNo();
      const isItemUUID   = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(item.id);

      const basePayment = {
        studentId:   student.id,
        studentName: student.name,
        grade:       student.grade || '',
        section:     student.section || '',
        feeType:     item.name,
        amount,
        term:        currentTerm,
        academicYear,
        receiptNo,
        paymentDate: new Date().toISOString().split('T')[0],
      };

      // NOTE: fee_items allocation is handled inside the record_fee_payment RPC
      // (SECURITY DEFINER bypasses RLS). Do NOT call feeManager.allocatePayment
      // from student context — it is blocked by the fee_items UPDATE policy.

      if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Processing...'; }

      // ── Bank Deposit ───────────────────────────────────────────────
      if (method === 'bank-deposit') {
        const file   = document.getElementById('student-receipt-file')?.files?.[0];
        const txnRef = document.getElementById('student-txn-ref')?.value?.trim();
        if (!txnRef) { showToast('Please enter the transaction reference / teller number.', 'error'); if (payBtn) { payBtn.disabled = false; payBtn.textContent = '📤 Submit for Verification'; } return; }
        if (!file)   { showToast('Please upload your payment receipt.', 'error');            if (payBtn) { payBtn.disabled = false; payBtn.textContent = '📤 Submit for Verification'; } return; }
        if (file.size > 5 * 1024 * 1024) { showToast('Receipt file must be under 5MB.', 'error'); if (payBtn) { payBtn.disabled = false; payBtn.textContent = '📤 Submit for Verification'; } return; }
        if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Uploading...'; }
        try {
          // Attempt file upload — non-fatal if it fails
          let receiptUrl = null;
          try {
            const ext  = file.name.split('.').pop();
            const path = `receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: upErr } = await supabaseClient.storage.from('documents').upload(path, file, { cacheControl: '3600', upsert: false });
            if (!upErr) {
              const { data: urlData } = supabaseClient.storage.from('documents').getPublicUrl(path);
              receiptUrl = urlData?.publicUrl || path;
            } else {
              console.warn('[StudentFees] Receipt upload failed (non-fatal):', upErr.message);
            }
          } catch (upErr) {
            console.warn('[StudentFees] Receipt upload exception (non-fatal):', upErr.message);
          }

          if (payBtn) payBtn.textContent = 'Saving...';

          // ── BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK via RPC ─────────
          const { data: rpc, error: rpcErr } = await supabaseClient.rpc('record_fee_payment', {
            p_data: {
              student_id:      basePayment.studentId,
              student_name:    basePayment.studentName,
              grade:           basePayment.grade,
              section:         basePayment.section,
              fee_type:        basePayment.feeType,
              amount:          basePayment.amount,
              payment_method:  'bank-deposit',
              payment_date:    basePayment.paymentDate,
              transaction_ref: txnRef,
              receipt_no:      basePayment.receiptNo,
              receipt_url:     receiptUrl || null,
              term:            basePayment.term,
              academic_year:   basePayment.academicYear
            }
          });
          if (rpcErr || !rpc?.success) {
            const msg = rpc?.error || rpcErr?.message || 'Failed to submit payment.';
            showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
            if (payBtn) { payBtn.disabled = false; payBtn.textContent = '📤 Submit for Verification'; }
            return;
          }

          await dataManager.refresh('payments');
          await dataManager.refresh('enhancedPayments');
          document.querySelector('.modal-backdrop')?.remove();
          const uploadNote = receiptUrl ? '' : ' (Receipt upload failed — attach manually to admin)';
          showToast(`✅ Bank deposit submitted! Pending admin verification.${uploadNote}`, receiptUrl ? 'info' : 'warning');
          this._refresh();
        } catch (err) {
          showToast('Submission failed: ' + err.message, 'error');
          if (payBtn) { payBtn.disabled = false; payBtn.textContent = '📤 Submit for Verification'; }
        }
        return;
      }

      // ── Paystack ───────────────────────────────────────────────────
      if (typeof PaystackPop === 'undefined') {
        showToast('Online payment unavailable. Check your internet connection.', 'error');
        if (payBtn) { payBtn.disabled = false; payBtn.textContent = '💳 Pay Now'; }
        return;
      }
      const paystackKey = AppConfig.paystack.publicKey;
      if (!paystackKey || paystackKey === 'pk_test_xxxxxxxxxxxx' || !/^pk_(test|live)_/.test(paystackKey)) {
        showToast('Online payment is not configured. Please contact the school admin.', 'error');
        if (payBtn) { payBtn.disabled = false; payBtn.textContent = '💳 Pay Now'; }
        return;
      }
      if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Opening payment...'; }

      const _psEmail1 = (student.email && !student.email.endsWith('@tbd.internal'))
        ? student.email
        : `${(student.rollNo || student.roll_no || student.id).toString().toLowerCase().replace(/\s+/g, '-')}@tbdacademy.edu.ng`;

      PaystackPop.setup({
        key:      paystackKey,
        email:    _psEmail1,
        amount:   Math.round(amount * 100),
        currency: 'NGN',
        ref:      'TBD-' + Date.now() + '-' + Math.floor(Math.random() * 9999),
        metadata: { custom_fields: [
          { display_name: 'Student',  variable_name: 'student_name', value: student.name },
          { display_name: 'Fee Item', variable_name: 'fee_item',     value: item.name },
          { display_name: 'Grade',    variable_name: 'grade',        value: student.grade || '' },
        ]},
        callback: (response) => {
          const b = document.getElementById('student-pay-btn');
          if (b) { b.disabled = true; b.textContent = 'Saving...'; }
          (async () => {
            try {
              // ── BEGIN / EXECUTE / CHECK / COMMIT → ROLLBACK via RPC ───────
              const { data: rpc, error: rpcErr } = await supabaseClient.rpc('record_fee_payment', {
                p_data: {
                  student_id:      basePayment.studentId,
                  student_name:    basePayment.studentName,
                  grade:           basePayment.grade,
                  section:         basePayment.section,
                  fee_type:        basePayment.feeType,
                  amount:          basePayment.amount,
                  payment_method:  'paystack',
                  payment_date:    basePayment.paymentDate,
                  transaction_ref: response.reference,
                  receipt_no:      basePayment.receiptNo,
                  term:            basePayment.term,
                  academic_year:   basePayment.academicYear
                }
              });
              if (rpcErr || !rpc?.success) {
                const msg = rpc?.error || rpcErr?.message || 'Record save failed.';
                showToast(`Payment received (Ref: ${response.reference}) but ${msg.replace(/^[A-Z_]+:/, '').trim()} — contact admin.`, 'error');
                return;
              }
              const saved = rpc.payment || {};
              document.querySelector('.modal-backdrop')?.remove();
              await dataManager.refresh('payments');
              await dataManager.refresh('enhancedPayments');
              await dataManager.refresh('feeItems');
              await dataManager.refresh('students');
              this._refresh();
              setTimeout(() => this._showReceipt(saved), 350);
            } catch (err) {
              showToast('Error saving payment: ' + err.message, 'error');
            } finally {
              const btn = document.getElementById('student-pay-btn');
              if (btn) { btn.disabled = false; btn.textContent = '💳 Pay Now'; }
            }
          })();
        },
        onClose: () => {
          showToast('Payment cancelled.', 'warning');
          const b = document.getElementById('student-pay-btn');
          if (b) { b.disabled = false; b.textContent = '💳 Pay Now'; }
        }
      }).openIframe();

    } catch (err) {
      console.error('[StudentFees] initiatePayment error:', err);
      showToast('Payment error: ' + (err.message || err), 'error');
      const b = document.getElementById('student-pay-btn');
      if (b) { b.disabled = false; b.textContent = '💳 Pay Now'; }
    }
  },

  // ── Receipt Download Handlers ─────────────────────────────────────────────

  _downloadItemReceipt(itemId) {
    if (!this.studentData) return;
    const item = (this.studentData.feeSchedule || []).find(i => i.id === itemId);
    if (!item) { showToast('Receipt not found.', 'error'); return; }
    const data = this._buildFeeItemReceiptData(item);
    if (!data.receiptNo || data.receiptNo === '—') {
      showToast('No receipt number available for this payment.', 'warning');
      return;
    }
    showReceiptModal(data);
  },

  _downloadPaymentReceipt(paymentIdOrRef) {
    if (!this.studentData) return;
    const payments = this.studentData.paymentHistory || [];
    const p = payments.find(x =>
      x.id === paymentIdOrRef ||
      x.receipt_no === paymentIdOrRef ||
      x.receiptNo  === paymentIdOrRef
    );
    if (!p) { showToast('Payment record not found.', 'error'); return; }
    const { student } = this.studentData;
    const data = buildReceiptData({
      receipt_no:      p.receipt_no  || p.receiptNo,
      student_name:    student.name,
      grade:           student.grade,
      section:         student.section,
      student_roll_no: student.rollNo || student.roll_no,
      items:           [{ name: p.feeTypeName || p.fee_type || p.feeType || 'Fee Payment', amount: p.amount }],
      amount:          p.amount,
      payment_method:  p.payment_method || p.paymentMethod || 'paystack',
      payment_date:    p.dateStr || p.payment_date || p.paymentDate,
      transaction_ref: p.transaction_ref || p.transactionRef,
      term:            p.term,
      academic_year:   p.academic_year || p.academicYear,
      status:          p.status || 'paid',
    }, student);
    showReceiptModal(data);
  },

  // ── Comprehensive Term Receipt ────────────────────────────────────────────

  downloadTermReceipt() {
    if (!this.studentData) return;
    const { student, feeSchedule, totals } = this.studentData;

    if (!feeSchedule || feeSchedule.length === 0) {
      showToast('No fee information available.', 'warning');
      return;
    }
    const paidItems = feeSchedule.filter(i => i.amountPaid > 0);
    if (paidItems.length === 0) {
      showToast('No payments have been recorded yet.', 'warning');
      return;
    }

    // Most recent paid payment record across all items
    const allPaidPayments = paidItems
      .flatMap(i => (i.payments || []).filter(p => p.status === 'paid'))
      .sort((a, b) => new Date(b.dateStr || 0) - new Date(a.dateStr || 0));
    const latestPmt = allPaidPayments[0] || {};

    const term = latestPmt.term
      || (typeof schoolConfig !== 'undefined' ? schoolConfig.getCurrentTerm?.()?.name : '')
      || feeSchedule.find(i => i.term)?.term
      || '—';
    const acYear = latestPmt.academic_year || latestPmt.academicYear
      || (typeof feeStructure !== 'undefined' && feeStructure.academicYear)
      || '2025/2026';

    // Combine receipt numbers for reference
    const receiptNos = [...new Set(paidItems.map(i => i.receiptNo).filter(Boolean))];
    const receiptRef  = receiptNos.length === 1
      ? receiptNos[0]
      : (receiptNos[0] ? receiptNos[0] + '+' : 'TERM-' + new Date().getFullYear());

    const data = buildReceiptData({
      receipt_no:      receiptRef,
      student_name:    student.name,
      grade:           student.grade,
      section:         student.section,
      student_roll_no: student.rollNo || student.roll_no,
      items:           paidItems.map(i => ({ name: i.name, amount: i.amountPaid })),
      amount:          totals.paid,
      payment_method:  latestPmt.payment_method || latestPmt.paymentMethod || 'paystack',
      payment_date:    latestPmt.dateStr || new Date().toISOString().split('T')[0],
      transaction_ref: latestPmt.transaction_ref || latestPmt.transactionRef,
      term,
      academic_year:   acYear,
      status:          totals.balance <= 0 ? 'paid' : 'partial',
    }, student);

    // Extend with full schedule for the comprehensive view
    data.totalDue  = totals.total;
    data.totalPaid = totals.paid;
    data.balance   = totals.balance;
    data.allItems  = feeSchedule.map(i => ({
      name:       i.name,
      amountDue:  i.amount,
      amountPaid: i.amountPaid,
      balance:    i.balance,
      status:     i.status,
    }));

    const html = generateTermReceiptHTML(data);
    const win  = window.open('', '_blank', 'width=820,height=1000,scrollbars=yes,resizable=yes');
    if (!win) {
      showToast('Pop-up blocked — please allow pop-ups and try again.', 'warning');
      return;
    }
    win.document.write(html);
    win.document.close();
  },

  // ── Pay All Outstanding ────────────────────────────────────────────────────

  payAllOutstanding() {
    const { feeSchedule, student } = this.studentData;
    const unpaidItems  = feeSchedule.filter(i => i.balance > 0);
    const totalBalance = unpaidItems.reduce((s, i) => s + i.balance, 0);

    if (totalBalance <= 0) { showToast('All fees are fully paid!', 'success'); return; }

    const bankDetails = (typeof feeStructure !== 'undefined' && feeStructure.bankDetails)
      || { name: 'Keystone Bank', accountName: 'TBD International Academy', accountNumber: '1013525760' };

    const itemList = unpaidItems.map(i =>
      `<li style="font-size:0.82rem;padding:0.2rem 0;"><span style="flex:1;">${i.name}</span> <strong style="color:#f59e0b;">₦${i.balance.toLocaleString()}</strong></li>`
    ).join('');

    const content = `
      <div style="margin-bottom:1rem;">
        <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 0.75rem;">You are about to pay the full outstanding balance for all fee items:</p>
        <ul style="list-style:none;padding:0;margin:0 0 1rem;display:flex;flex-direction:column;gap:0.1rem;background:var(--bg-tertiary);border-radius:0.5rem;padding:0.75rem 1rem;">
          ${itemList}
          <li style="border-top:1px solid var(--border-primary);margin-top:0.5rem;padding-top:0.5rem;font-size:0.88rem;display:flex;justify-content:space-between;">
            <strong>Total Outstanding</strong>
            <strong style="color:#6366f1;">₦${totalBalance.toLocaleString()}</strong>
          </li>
        </ul>
      </div>
      <div class="form-group">
        <label class="form-label">Payment Method *</label>
        <select class="form-select" id="pay-all-method" onchange="studentFeesModule._onPayAllMethodChange(this.value)">
          <option value="paystack">💳 Pay Online (Paystack)</option>
          <option value="bank-deposit">🏦 Bank Deposit / Transfer</option>
        </select>
      </div>
      <div id="pay-all-bank-section" style="display:none;">
        <div style="padding:1rem;background:var(--bg-tertiary);border-radius:0.5rem;margin-bottom:1rem;border-left:4px solid #3b82f6;">
          <h4 style="margin:0 0 0.5rem;font-size:0.875rem;font-weight:600;">🏦 Bank Details</h4>
          <div style="font-size:0.82rem;display:grid;grid-template-columns:auto 1fr;gap:0.2rem 0.75rem;">
            <span><strong>Bank:</strong></span><span>${bankDetails.name}</span>
            <span><strong>Account No:</strong></span><span>${bankDetails.accountNumber}</span>
            <span><strong>Account Name:</strong></span><span>${bankDetails.accountName}</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Teller / Transaction Reference *</label>
          <input type="text" class="form-input" id="pay-all-txn-ref" placeholder="Enter teller no. or transaction reference">
        </div>
        <div class="form-group">
          <label class="form-label">Upload Receipt *</label>
          <input type="file" class="form-input" id="pay-all-receipt-file" accept=".jpg,.jpeg,.png,.pdf">
          <p style="font-size:0.72rem;color:var(--text-tertiary);margin-top:0.25rem;">JPG, PNG or PDF · max 5MB</p>
        </div>
      </div>
      <div style="display:flex;gap:0.75rem;margin-top:1.5rem;">
        <button type="button" class="btn btn-ghost" style="flex:1;" onclick="closeModal(this)">Cancel</button>
        <button type="button" class="btn btn-primary" style="flex:1;background:#6366f1;border-color:#6366f1;" id="pay-all-btn"
          onclick="studentFeesModule._submitPayAll()">💳 Pay ₦${totalBalance.toLocaleString()}</button>
      </div>`;

    createModal('💳 Pay All Outstanding Fees', content);
  },

  _onPayAllMethodChange(method) {
    const section = document.getElementById('pay-all-bank-section');
    const btn     = document.getElementById('pay-all-btn');
    const { feeSchedule } = this.studentData;
    const totalBalance = feeSchedule.filter(i => i.balance > 0).reduce((s, i) => s + i.balance, 0);
    if (section) section.style.display = method === 'bank-deposit' ? 'block' : 'none';
    if (btn) btn.textContent = method === 'bank-deposit'
      ? `📤 Submit for Verification`
      : `💳 Pay ₦${totalBalance.toLocaleString()}`;
  },

  async _submitPayAll() {
    const method = document.getElementById('pay-all-method')?.value || 'paystack';
    const { student, feeSchedule } = this.studentData;
    const unpaidItems  = feeSchedule.filter(i => i.balance > 0);
    const totalBalance = unpaidItems.reduce((s, i) => s + i.balance, 0);
    if (totalBalance <= 0) { showToast('Nothing to pay.', 'info'); return; }

    const btn = document.getElementById('pay-all-btn');
    const currentTerm  = window.schoolConfig?.getCurrentTerm?.()?.name || 'Current Term';
    const academicYear = (typeof feeStructure !== 'undefined' ? feeStructure.academicYear : null) || '2025/2026';

    // Helper: save one payment per unpaid fee item via the record_fee_payment RPC.
    // The RPC is SECURITY DEFINER and calls _allocate_payment_to_fee_items internally,
    // bypassing the fee_items UPDATE RLS that blocks direct student writes.
    const _saveAllPayments = async (txnRef, paymentMethod, status, receiptUrl = null) => {
      const savedRecords = [];
      for (const item of unpaidItems) {
        const receiptNo = this._generateReceiptNo();
        const { data: rpc, error: rpcErr } = await supabaseClient.rpc('record_fee_payment', {
          p_data: {
            student_id:      student.id,
            student_name:    student.name,
            grade:           student.grade || '',
            section:         student.section || '',
            fee_type:        item.name,
            amount:          item.balance,
            payment_method:  paymentMethod,
            payment_date:    new Date().toISOString().split('T')[0],
            transaction_ref: txnRef,
            receipt_no:      receiptNo,
            receipt_url:     receiptUrl || null,
            term:            currentTerm,
            academic_year:   academicYear
          }
        });
        if (rpcErr || !rpc?.success) {
          const msg = (rpc?.error || rpcErr?.message || 'Failed to save').replace(/^[A-Z_]+:/, '').trim();
          console.warn('[StudentFees] _saveAllPayments RPC failed for', item.name, ':', msg);
          continue;
        }
        if (rpc.payment) savedRecords.push(rpc.payment);
      }
      document.querySelector('.modal-backdrop')?.remove();
      await dataManager.refresh('payments');
      await dataManager.refresh('enhancedPayments');
      await dataManager.refresh('feeItems');
      await dataManager.refresh('students');
      this._refresh();
      // Show combined receipt for all items if paid online
      if (status === 'paid' && savedRecords.length > 0) {
        setTimeout(() => this._showPayAllReceipt(savedRecords, totalBalance, txnRef), 350);
      }
    };

    if (method === 'bank-deposit') {
      const file   = document.getElementById('pay-all-receipt-file')?.files?.[0];
      const txnRef = document.getElementById('pay-all-txn-ref')?.value?.trim();
      if (!txnRef) { showToast('Please enter the transaction reference / teller number.', 'error'); return; }
      if (!file)   { showToast('Please upload your payment receipt.', 'error'); return; }
      if (file.size > 5 * 1024 * 1024) { showToast('Receipt file must be under 5MB.', 'error'); return; }

      if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
      try {
        const ext  = file.name.split('.').pop();
        const path = `receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabaseClient.storage.from('documents').upload(path, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabaseClient.storage.from('documents').getPublicUrl(path);
        await _saveAllPayments(txnRef, 'bank-deposit', 'pending', urlData?.publicUrl || path);
        showToast('Bank deposit submitted for all fees! Pending admin verification.', 'info');
      } catch (err) {
        showToast('Upload failed: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📤 Submit for Verification'; }
      }
      return;
    }

    // ── Paystack ──
    if (typeof PaystackPop === 'undefined') {
      showToast('Online payment unavailable. Check your internet connection.', 'error'); return;
    }
    const paystackKey = AppConfig.paystack.publicKey;
    if (!paystackKey || paystackKey === 'pk_test_xxxxxxxxxxxx' || !/^pk_(test|live)_/.test(paystackKey)) {
      showToast('Online payment is not configured. Please contact the school admin.', 'error'); return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Opening payment...'; }

    const _psEmail2 = (student.email && !student.email.endsWith('@tbd.internal'))
      ? student.email
      : `${(student.rollNo || student.roll_no || student.id).toString().toLowerCase().replace(/\s+/g, '-')}@tbdacademy.edu.ng`;

    PaystackPop.setup({
      key:      paystackKey,
      email:    _psEmail2,
      amount:   Math.round(totalBalance * 100),
      currency: 'NGN',
      ref:      'TBD-ALL-' + Date.now() + '-' + Math.floor(Math.random() * 9999),
      metadata: { custom_fields: [
        { display_name: 'Student',  variable_name: 'student_name', value: student.name },
        { display_name: 'Payment',  variable_name: 'fee_item',     value: 'All Outstanding Fees' },
        { display_name: 'Grade',    variable_name: 'grade',        value: student.grade || '' },
      ]},
      callback: (response) => {
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
        (async () => {
          try {
            await _saveAllPayments(response.reference, 'paystack', 'paid');
            showToast('✅ All fees paid successfully!', 'success');
          } catch (err) {
            showToast(`Payment received (Ref: ${response.reference}) but save failed — contact admin.`, 'error');
          }
        })();
      },
      onClose: () => {
        showToast('Payment cancelled.', 'warning');
        if (btn) { btn.disabled = false; btn.textContent = `💳 Pay ₦${totalBalance.toLocaleString()}`; }
      }
    }).openIframe();
  },

  // ── Receipt Generation ───────────────────────────────────────────────

  _generateReceiptNo() {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const seq = (Date.now() % 100000).toString().padStart(5, '0');
    return `RCP${yy}${mm}-${seq}`;
  },

  _showReceipt(payment) {
    if (!payment) return;
    const school   = window.schoolConfig?.name || 'TBD Academy';
    const portal   = window.location.origin + '/login.html';
    const dateStr  = payment.paymentDate
      ? new Date(payment.paymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
    const amount   = parseFloat(payment.amount || 0);
    const feeType  = payment.feeType || payment.fee_type || '—';
    const receiptNo = payment.receiptNo || payment.receipt_no || '—';
    const txnRef   = payment.transactionRef || payment.transaction_ref || '—';
    const method   = (payment.paymentMethod || payment.payment_method || 'paystack').replace(/-/g, ' ');
    const { student } = this.studentData || {};

    const receiptHtml = `
      <div id="receipt-content" style="font-family:sans-serif;max-width:420px;margin:0 auto;">
        <div style="text-align:center;padding:1.25rem 1rem 0.5rem;border-bottom:2px dashed var(--border-primary);">
          <div style="font-size:2rem;margin-bottom:0.25rem;">🏫</div>
          <div style="font-weight:800;font-size:1rem;color:var(--text-primary);">${school}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.15rem;">Payment Receipt</div>
        </div>
        <div style="padding:1rem;background:var(--bg-secondary);border-radius:0.5rem;margin:1rem 0;">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
            <span style="font-size:0.78rem;color:var(--text-secondary);">Receipt No.</span>
            <strong style="font-size:0.78rem;font-family:monospace;">${receiptNo}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
            <span style="font-size:0.78rem;color:var(--text-secondary);">Date</span>
            <span style="font-size:0.78rem;">${dateStr}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:0.78rem;color:var(--text-secondary);">Method</span>
            <span style="font-size:0.78rem;text-transform:capitalize;">${method}</span>
          </div>
          ${txnRef !== '—' ? `<div style="display:flex;justify-content:space-between;margin-top:0.4rem;"><span style="font-size:0.75rem;color:var(--text-secondary);">Txn Ref</span><span style="font-size:0.72rem;font-family:monospace;">${txnRef}</span></div>` : ''}
        </div>
        <div style="padding:0 0.25rem;">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;">
            <span style="font-size:0.8rem;color:var(--text-secondary);">Student</span>
            <span style="font-size:0.8rem;font-weight:600;">${student?.name || payment.studentName || payment.student_name || '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;">
            <span style="font-size:0.8rem;color:var(--text-secondary);">Grade</span>
            <span style="font-size:0.8rem;">${student?.grade || payment.grade || '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;">
            <span style="font-size:0.8rem;color:var(--text-secondary);">Fee Item</span>
            <span style="font-size:0.8rem;font-weight:600;">${feeType}</span>
          </div>
        </div>
        <div style="text-align:center;padding:1rem;margin:1rem 0 0.5rem;background:linear-gradient(135deg,#dcfce7,#bbf7d0);border-radius:0.75rem;">
          <div style="font-size:0.75rem;color:#166534;margin-bottom:0.2rem;">Amount Paid</div>
          <div style="font-size:1.75rem;font-weight:800;color:#15803d;">₦${amount.toLocaleString()}</div>
          <div style="font-size:0.7rem;color:#166534;margin-top:0.2rem;">✅ Payment Confirmed</div>
        </div>
        <p style="font-size:0.68rem;color:var(--text-tertiary);text-align:center;margin:0.5rem 0 0;">Computer-generated receipt &mdash; no signature required</p>
      </div>`;

    const actions = `
      <div style="display:flex;gap:0.75rem;margin-top:1.25rem;">
        <button class="btn btn-ghost" style="flex:1;" onclick="document.querySelector('.modal-backdrop')?.remove()">Close</button>
        <button class="btn btn-primary" style="flex:1;background:#22c55e;border-color:#22c55e;" onclick="studentFeesModule._downloadReceiptPDF(${JSON.stringify(payment).replace(/"/g,'&quot;')})">⬇️ Download PDF</button>
      </div>`;

    createModal('🧾 Payment Receipt', receiptHtml + actions);
  },

  _showPayAllReceipt(payments, totalAmount, txnRef) {
    if (!payments || payments.length === 0) return;
    const school   = window.schoolConfig?.name || 'TBD Academy';
    const dateStr  = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
    const { student } = this.studentData || {};
    const rows     = payments.map(p =>
      `<div style="display:flex;justify-content:space-between;padding:0.3rem 0;border-bottom:1px solid var(--border-primary);">
         <span style="font-size:0.78rem;">${p.feeType || p.fee_type}</span>
         <strong style="font-size:0.78rem;">₦${parseFloat(p.amount || 0).toLocaleString()}</strong>
       </div>`
    ).join('');

    const receiptHtml = `
      <div id="receipt-content" style="font-family:sans-serif;max-width:420px;margin:0 auto;">
        <div style="text-align:center;padding:1.25rem 1rem 0.5rem;border-bottom:2px dashed var(--border-primary);">
          <div style="font-size:2rem;margin-bottom:0.25rem;">🏫</div>
          <div style="font-weight:800;font-size:1rem;color:var(--text-primary);">${school}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.15rem;">Payment Receipt — All Fees</div>
        </div>
        <div style="padding:1rem;background:var(--bg-secondary);border-radius:0.5rem;margin:1rem 0;">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
            <span style="font-size:0.78rem;color:var(--text-secondary);">Date</span>
            <span style="font-size:0.78rem;">${dateStr}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
            <span style="font-size:0.78rem;color:var(--text-secondary);">Student</span>
            <strong style="font-size:0.78rem;">${student?.name || '—'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:0.78rem;color:var(--text-secondary);">Txn Ref</span>
            <span style="font-size:0.72rem;font-family:monospace;">${txnRef || '—'}</span>
          </div>
        </div>
        <div style="padding:0 0.25rem 0.5rem;">${rows}</div>
        <div style="text-align:center;padding:1rem;margin:0.5rem 0;background:linear-gradient(135deg,#dcfce7,#bbf7d0);border-radius:0.75rem;">
          <div style="font-size:0.75rem;color:#166534;margin-bottom:0.2rem;">Total Paid</div>
          <div style="font-size:1.75rem;font-weight:800;color:#15803d;">₦${totalAmount.toLocaleString()}</div>
          <div style="font-size:0.7rem;color:#166534;margin-top:0.2rem;">✅ All Fees Settled</div>
        </div>
        <p style="font-size:0.68rem;color:var(--text-tertiary);text-align:center;margin:0.5rem 0 0;">Computer-generated receipt &mdash; no signature required</p>
      </div>`;

    createModal('🧾 Payment Receipt', receiptHtml + `
      <div style="display:flex;gap:0.75rem;margin-top:1.25rem;">
        <button class="btn btn-ghost" style="flex:1;" onclick="document.querySelector('.modal-backdrop')?.remove()">Close</button>
      </div>`);
  },

  _downloadReceiptPDF(payment) {
    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { showToast('PDF library not loaded.', 'error'); return; }
      const doc    = new jsPDF();
      const school = window.schoolConfig?.name || 'TBD Academy';
      const p      = payment;
      const amount = parseFloat(p.amount || 0);

      doc.setFontSize(16); doc.text(school.toUpperCase(), 105, 18, { align: 'center' });
      doc.setFontSize(10); doc.text(window.schoolConfig?.location || '', 105, 25, { align: 'center' });
      doc.setFontSize(13); doc.text('PAYMENT RECEIPT', 105, 33, { align: 'center' });
      doc.setLineWidth(0.5); doc.line(20, 37, 190, 37);

      doc.setFontSize(10);
      doc.text(`Receipt No : ${p.receiptNo || p.receipt_no}`,  20, 46);
      doc.text(`Date       : ${p.paymentDate || p.payment_date || new Date().toISOString().split('T')[0]}`, 20, 54);
      doc.text(`Method     : ${(p.paymentMethod || p.payment_method || '').replace(/-/g,' ').toUpperCase()}`, 20, 62);
      if (p.transactionRef || p.transaction_ref) {
        doc.text(`Txn Ref    : ${p.transactionRef || p.transaction_ref}`, 20, 70);
      }
      doc.line(20, 75, 190, 75);

      doc.setFontSize(11); doc.text('Student Information', 20, 83);
      doc.setFontSize(10);
      doc.text(`Name       : ${p.studentName || p.student_name}`, 20, 91);
      doc.text(`Grade      : ${p.grade || '—'}  |  Section : ${p.section || '—'}`, 20, 99);
      doc.line(20, 104, 190, 104);

      doc.setFontSize(11); doc.text('Payment Details', 20, 112);
      doc.setFontSize(10);
      doc.text(`Fee Item   : ${p.feeType || p.fee_type}`, 20, 120);
      doc.setFontSize(14); doc.text(`Amount Paid: NGN ${amount.toLocaleString()}`, 20, 130);
      doc.setFontSize(8);
      doc.text('This is a computer-generated receipt and does not require a signature.', 105, 280, { align: 'center' });

      doc.save(`Receipt_${p.receiptNo || p.receipt_no || 'download'}.pdf`);
      showToast('Receipt downloaded!', 'success');
    } catch (err) {
      console.error('[StudentFees] PDF error:', err);
      showToast('Could not generate PDF — please screenshot this receipt.', 'warning');
    }
  },

  _refresh() {
    this.loadStudentData();
    if (this._container) this._container.innerHTML = this.render();
  },

};


// Initialize module
if (typeof window !== 'undefined') {
  window.studentFeesModule = studentFeesModule;
  window.myFeesModule = studentFeesModule; // Alias for navigation
}
