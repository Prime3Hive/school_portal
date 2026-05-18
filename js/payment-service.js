// ============================================
// PAYMENT SERVICE — Consolidated Facade
// ============================================
// Single entry point for all payment operations.
// Orchestrates: verificationManager → allocationManager → eventLogger → reconciliationManager
//
// Usage (replaces calling 4 managers directly):
//   const result = await PaymentService.processPayment(studentId, amount, opts);
//   const report = await PaymentService.reconcile(studentId);
//   const history = await PaymentService.getHistory(paymentId);
// ============================================

const PaymentService = {

  // ── Pre-payment verification ───────────────────────────────────────────────

  /**
   * Verify amount before showing Paystack popup.
   * Delegates to paymentVerificationManager with fallback if unavailable.
   */
  async verifyAmount(studentId, feeType, quotedAmount) {
    if (typeof paymentVerificationManager !== 'undefined') {
      return paymentVerificationManager.verifyPaymentAmount(studentId, feeType, quotedAmount);
    }
    // Lightweight fallback: check against local fee_items cache
    const feeItems = (dataManager?.getAll('feeItems') || [])
      .filter(f => (f.studentId === studentId || f.student_id === studentId) &&
                   ['pending','partial'].includes(f.status));
    const expected = feeItems.reduce((sum, f) => sum + (f.amount || 0), 0);
    if (Math.abs(quotedAmount - expected) > 0.01) {
      return { valid: false, error: 'Amount mismatch', quoted: quotedAmount, expected };
    }
    return { valid: true };
  },

  /**
   * Generate an idempotency key to prevent double-payment.
   */
  generateIdempotencyKey(studentId, amount) {
    if (typeof paymentVerificationManager !== 'undefined') {
      return paymentVerificationManager.generateIdempotencyKey(studentId, amount);
    }
    return `${studentId}-${Math.round(amount * 100)}-${crypto.randomUUID()}`;
  },

  /**
   * Check whether an idempotency key was already used.
   */
  async checkIdempotency(key) {
    if (typeof paymentVerificationManager !== 'undefined') {
      return paymentVerificationManager.checkIdempotency(key);
    }
    return { status: 'not_found' };
  },

  // ── Core payment processing pipeline ──────────────────────────────────────

  /**
   * Full payment processing pipeline:
   *   1. Idempotency guard
   *   2. Amount verification
   *   3. Record payment in DB
   *   4. Atomic fee allocation
   *   5. Audit log event
   *
   * @param {string} studentId
   * @param {number} amount
   * @param {object} opts - { feeType, paymentMethod, transactionRef, receiptNo, term, year, recordedBy, metadata }
   * @returns {Promise<{success, paymentId, allocations, error}>}
   */
  async processPayment(studentId, amount, opts = {}) {
    const { feeType = 'tuition', paymentMethod, transactionRef, receiptNo, term, year, recordedBy, metadata = {} } = opts;

    try {
      // 1. Idempotency check
      if (transactionRef) {
        const idempotencyCheck = await this.checkIdempotency(transactionRef);
        if (idempotencyCheck?.status === 'processed') {
          console.warn(`[PaymentService] Duplicate transaction: ${transactionRef}`);
          return { success: false, error: 'Duplicate transaction reference', duplicate: true, paymentId: idempotencyCheck.payment_id };
        }
      }

      // 2. Amount verification
      const verification = await this.verifyAmount(studentId, feeType, amount);
      if (!verification.valid) {
        console.error('[PaymentService] Amount verification failed:', verification.error);
        return { success: false, error: verification.error, verificationFailed: true };
      }

      // 3. Record payment (via feesPaymentsModule or direct Supabase)
      const student = (dataManager?.getAll('students') || []).find(s => s.id === studentId);
      const paymentData = {
        student_id: studentId,
        student_name: student?.name || student?.fullName || '',
        student_roll_no: student?.rollNo || student?.roll_no || '',
        grade: student?.grade || student?.class || '',
        section: student?.section || '',
        fee_type: feeType,
        amount,
        payment_method: paymentMethod || 'online',
        payment_date: new Date().toISOString(),
        transaction_ref: transactionRef || null,
        receipt_no: receiptNo || `RCP-${Date.now()}`,
        term: term || null,
        academic_year: year || '2025-2026',
        status: 'paid',
        recorded_by: recordedBy || null,
      };

      let paymentId = null;
      if (window.supabaseReady && window.supabaseClient) {
        const { data: inserted, error: insertErr } = await supabaseClient
          .from('fees_payments')
          .insert(paymentData)
          .select()
          .single();
        if (insertErr) throw insertErr;
        paymentId = inserted.id;
        // Refresh local cache
        dataManager?.refresh?.('payments');
      } else {
        // localStorage fallback
        paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        dataManager?.create?.('payments', { id: paymentId, ...paymentData });
      }

      // 4. Atomic allocation (only if allocationManager is available and Supabase is online)
      let allocations = [];
      if (typeof paymentAllocationManager !== 'undefined' && window.supabaseReady) {
        const allocationResult = await paymentAllocationManager.allocatePaymentAtomic(paymentId, studentId, amount);
        if (allocationResult.success) {
          allocations = allocationResult.allocations || [];
        } else {
          console.warn('[PaymentService] Allocation warning:', allocationResult.error);
        }
      }

      // 5. Audit log
      await this.log(paymentId, 'CREATED', null, { ...paymentData, id: paymentId }, { allocations: allocations.length, ...metadata });

      return { success: true, paymentId, allocations };

    } catch (err) {
      console.error('[PaymentService] processPayment error:', err);
      await this.log(null, 'FAILED', null, { studentId, amount }, { error: err.message });
      return { success: false, error: err.message };
    }
  },

  /**
   * Verify a bank-deposit payment (admin action).
   */
  async verifyBankDeposit(paymentId, adminId, action, rejectionReason = null) {
    try {
      const old = await this._fetchPayment(paymentId);
      const update = action === 'approve'
        ? { status: 'paid', verified_by: adminId, verified_at: new Date().toISOString() }
        : { status: 'overdue', rejection_reason: rejectionReason, verified_by: adminId, verified_at: new Date().toISOString() };

      if (window.supabaseReady) {
        const { error } = await supabaseClient.from('fees_payments').update(update).eq('id', paymentId);
        if (error) throw error;
      }
      dataManager?.refresh?.('payments');

      const eventType = action === 'approve' ? 'VERIFIED' : 'REJECTED';
      await this.log(paymentId, eventType, old, { ...old, ...update }, { adminId, action, rejectionReason });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Void / reverse a payment and clean up allocations.
   */
  async voidPayment(paymentId, reason, adminId) {
    try {
      const old = await this._fetchPayment(paymentId);

      if (typeof paymentAllocationManager !== 'undefined' && window.supabaseReady) {
        await paymentAllocationManager.reverseAllocations(paymentId);
      }

      if (window.supabaseReady) {
        await supabaseClient.from('fees_payments').update({
          status: 'voided',
          notes: `Voided by ${adminId}: ${reason}`,
          updated_at: new Date().toISOString(),
        }).eq('id', paymentId);
      }
      dataManager?.refresh?.('payments');
      await this.log(paymentId, 'VOIDED', old, { ...old, status: 'voided' }, { reason, adminId });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── Reconciliation ─────────────────────────────────────────────────────────

  /**
   * Run reconciliation for a student (or all students if no id given).
   */
  async reconcile(studentId = null, academicYear = null) {
    if (typeof paymentReconciliationManager !== 'undefined') {
      if (studentId) {
        return paymentReconciliationManager.detectDiscrepancies(studentId, academicYear);
      }
      return paymentReconciliationManager.generateReconciliationReport(academicYear);
    }
    // Lightweight fallback using local cache
    const payments = (dataManager?.getAll('payments') || [])
      .filter(p => p.status === 'paid' && (!studentId || p.student_id === studentId || p.studentId === studentId));
    const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
    return { studentId, totalPaymentsRecorded: total, discrepancy: 0, allocationsReconciled: true, fallback: true };
  },

  /**
   * Get unallocated payments for admin attention.
   */
  async getUnallocated() {
    if (typeof paymentReconciliationManager !== 'undefined') {
      return paymentReconciliationManager.detectUnallocatedPayments?.() || { payments: [] };
    }
    return { payments: [] };
  },

  // ── Audit / History ────────────────────────────────────────────────────────

  /**
   * Get transaction history for a payment.
   */
  async getHistory(paymentId) {
    if (typeof paymentEventLogger !== 'undefined' && window.supabaseReady) {
      try {
        const { data } = await supabaseClient
          .from('payment_transaction_logs')
          .select('*')
          .eq('payment_id', paymentId)
          .order('created_at', { ascending: true });
        return data || [];
      } catch { return []; }
    }
    return [];
  },

  /**
   * Log a payment event (delegates to paymentEventLogger if available).
   */
  async log(paymentId, eventType, oldState, newState, details = {}) {
    if (typeof paymentEventLogger !== 'undefined') {
      return paymentEventLogger.logPaymentEvent(paymentId, eventType, oldState, newState, details);
    }
    console.log(`[PaymentService] ${eventType}:`, { paymentId, details });
    return { data: null, error: null };
  },

  // ── Utilities ──────────────────────────────────────────────────────────────

  async _fetchPayment(paymentId) {
    if (window.supabaseReady) {
      const { data } = await supabaseClient.from('fees_payments').select('*').eq('id', paymentId).maybeSingle();
      return data;
    }
    return (dataManager?.getAll('payments') || []).find(p => p.id === paymentId) || null;
  },

  /**
   * Format currency in NGN.
   */
  formatAmount(amount) {
    return `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  },

  /**
   * Calculate outstanding balance for a student.
   */
  getStudentBalance(studentId) {
    const feeItems = (dataManager?.getAll('feeItems') || [])
      .filter(f => (f.studentId === studentId || f.student_id === studentId) && f.status !== 'paid');
    const totalOwed = feeItems.reduce((s, f) => s + (f.amount || 0), 0);
    const payments  = (dataManager?.getAll('payments') || [])
      .filter(p => (p.studentId === studentId || p.student_id === studentId) && p.status === 'paid');
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    return { totalOwed, totalPaid, balance: Math.max(0, totalOwed - totalPaid) };
  },

  /**
   * Get collection statistics for the admin dashboard.
   */
  getCollectionStats(academicYear = null) {
    const payments = dataManager?.getAll('payments') || [];
    const filtered = academicYear
      ? payments.filter(p => p.academic_year === academicYear || p.academicYear === academicYear)
      : payments;
    const paid    = filtered.filter(p => p.status === 'paid');
    const pending = filtered.filter(p => p.status === 'pending');
    return {
      totalCollected: paid.reduce((s, p) => s + (p.amount || 0), 0),
      totalPending:   pending.reduce((s, p) => s + (p.amount || 0), 0),
      paidCount:      paid.length,
      pendingCount:   pending.length,
    };
  },
};

if (typeof window !== 'undefined') window.PaymentService = PaymentService;
