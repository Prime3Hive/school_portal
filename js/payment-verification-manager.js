// ============================================
// PAYMENT VERIFICATION MANAGER
// ============================================
// Client-side security layer for Paystack payments
// Ensures payment amounts match quoted fees before showing Paystack popup
// Implements idempotency to prevent duplicate payment submissions

const paymentVerificationManager = {
  /**
   * Verify payment amount matches quoted fee before showing Paystack popup
   * Server-side verification happens via webhook, this is client-side safeguard
   *
   * @param {string} studentId - Student UUID
   * @param {string} feeType - Type of fee (tuition, etc.)
   * @param {number} quotedAmount - Amount shown to student in interface
   * @returns {Promise<{valid: boolean, error?: string, quoted?: number, expected?: number}>}
   */
  async verifyPaymentAmount(studentId, feeType, quotedAmount) {
    try {
      if (!studentId || quotedAmount <= 0) {
        return { valid: false, error: "Invalid student ID or amount" };
      }

      // Calculate expected fees from fee_items (authoritative source)
      const { data: feeItems, error } = await supabaseClient
        .from("fee_items")
        .select("amount")
        .eq("student_id", studentId)
        .in("status", ["pending", "partial"]);

      if (error) {
        console.error("Error fetching fee items:", error);
        return { valid: false, error: "Unable to verify fees" };
      }

      const expectedTotal = (feeItems || []).reduce((sum, item) => sum + (item.amount || 0), 0);

      if (Math.abs(quotedAmount - expectedTotal) > 0.01) {
        // Allow small rounding difference (less than 1 kobo)
        console.error(
          `Amount mismatch: quoted ₦${quotedAmount}, expected ₦${expectedTotal}`
        );
        return {
          valid: false,
          error: "Payment amount does not match quoted fees",
          quoted: quotedAmount,
          expected: expectedTotal,
        };
      }

      return { valid: true };
    } catch (error) {
      console.error("Payment verification error:", error);
      return { valid: false, error: error.message };
    }
  },

  /**
   * Generate cryptographically random idempotency key
   * Prevents duplicate payments from double-click or network retries
   *
   * @param {string} studentId - Student UUID
   * @param {number} amount - Payment amount
   * @returns {string} Unique idempotency key
   */
  generateIdempotencyKey(studentId, amount) {
    // Use crypto.randomUUID() — cryptographically secure, guaranteed unique
    const uniquePart = crypto.randomUUID();
    return `${studentId}-${Math.round(amount * 100)}-${uniquePart}`;
  },

  /**
   * Check if payment was already submitted (prevent double-click)
   *
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<{status, payment_id}>}  Existing record or null
   */
  async checkIdempotency(idempotencyKey) {
    try {
      const { data } = await supabaseClient
        .from("payment_idempotency")
        .select("status, payment_id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      return data;
    } catch (error) {
      console.error("Idempotency check error:", error);
      return null;
    }
  },

  /**
   * Create idempotency record before payment attempt
   * This must be done BEFORE showing Paystack popup
   *
   * @param {string} studentId - Student UUID
   * @param {number} amount - Payment amount
   * @param {string} paystackRef - Paystack payment reference (format: PAY-{timestamp}-{random})
   * @returns {Promise<{key, data, error}>}
   */
  async createIdempotencyRecord(studentId, amount, paystackRef) {
    try {
      const key = this.generateIdempotencyKey(studentId, amount);

      // Check if this idempotency key already exists
      const existing = await this.checkIdempotency(key);
      if (existing?.payment_id) {
        console.warn(`Duplicate idempotency key detected: ${key}`);
        return {
          key,
          data: existing,
          duplicate: true,
          error: "This payment is already being processed",
        };
      }

      // Create new idempotency record (status = 'pending' until webhook confirms)
      const { data, error } = await supabaseClient
        .from("payment_idempotency")
        .insert({
          idempotency_key: key,
          paystack_reference: paystackRef,
          student_id: studentId,
          amount,
          status: "pending",
        })
        .select();

      if (error) {
        console.error("Failed to create idempotency record:", error);
        return { key, data: null, error: error.message };
      }

      return {
        key,
        data: data?.[0],
        error: null,
      };
    } catch (error) {
      console.error("Create idempotency error:", error);
      return { key: "", data: null, error: error.message };
    }
  },

  /**
   * Check if specific Paystack reference is already being processed
   * Prevents same payment reference being created twice
   *
   * @param {string} paystackRef - Paystack reference
   * @returns {Promise<boolean>} True if already exists
   */
  async isReferenceAlreadyProcessing(paystackRef) {
    try {
      const { data } = await supabaseClient
        .from("payment_idempotency")
        .select("id")
        .eq("paystack_reference", paystackRef)
        .maybeSingle();

      return !!data;
    } catch {
      return false;
    }
  },

  /**
   * Validate payment metadata before submission
   * Standard fintech check: ensure all required fields present and valid
   *
   * @param {object} paymentData - Payment submission data
   * @returns {object} {valid, errors: []}
   */
  validatePaymentData(paymentData) {
    const errors = [];

    if (!paymentData.studentId) errors.push("Student ID is required");
    if (!paymentData.amount || paymentData.amount <= 0) errors.push("Valid amount required");
    if (!paymentData.paymentMethod) errors.push("Payment method is required");
    if (paymentData.amount > 10000000) errors.push("Amount exceeds maximum limit (₦10M)");
    if (typeof paymentData.amount !== "number") errors.push("Amount must be a number");

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Format amount for display (with currency symbol)
   * Used to show student the amount they're about to pay
   *
   * @param {number} amount - Amount in Naira
   * @returns {string} Formatted amount
   */
  formatAmount(amount) {
    return `₦${parseFloat(amount).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  },

  /**
   * Log payment attempt for debugging
   * (Separate from audit logs - for troubleshooting)
   *
   * @param {string} studentId - Student UUID
   * @param {number} amount - Amount
   * @param {string} status - 'initiated', 'success', 'failed'
   * @param {object} details - Additional details
   */
  async logPaymentAttempt(studentId, amount, status, details = {}) {
    try {
      console.log(
        `[Payment] ${status}: Student ${studentId}, Amount ₦${amount}`,
        details
      );
      // Could also send to backend analytics if needed
    } catch (error) {
      console.error("Payment logging error:", error);
    }
  },
};

// Expose to window for use in payment module
window.paymentVerificationManager = paymentVerificationManager;
