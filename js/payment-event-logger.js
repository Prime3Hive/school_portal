// ============================================
// PAYMENT EVENT LOGGER
// ============================================
// Immutable audit trail for all payment lifecycle events
// Standard fintech compliance: every state change is logged with who, what, when, why
// Ensures compliance with financial regulations and enables dispute resolution

const paymentEventLogger = {
  /**
   * Log payment state changes for audit trail
   * Creates immutable record of all payment modifications
   *
   * @param {string} paymentId - Payment UUID
   * @param {string} eventType - CREATED, UPDATED, VERIFIED, REJECTED, ALLOCATED, UNALLOCATED, VOIDED, CANCELLED, REFUNDED
   * @param {object} oldState - Payment state before change
   * @param {object} newState - Payment state after change
   * @param {object} details - Additional context (optional)
   */
  async logPaymentEvent(paymentId, eventType, oldState, newState, details = {}) {
    try {
      // AuthManager stores { supabaseId, email, role, ... } — not { user: { id, email } }
      const session = JSON.parse(localStorage.getItem("sb_session") || "{}");
      const userId = session.supabaseId || session.userId || null;
      const email  = session.email || null;

      const logEntry = {
        payment_id: paymentId,
        transaction_type: eventType,
        old_state: oldState,
        new_state: newState,
        performed_by: userId,
        performer_email: email,
        details: details,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseClient
        .from("payment_transaction_logs")
        .insert(logEntry);

      if (error) {
        console.error(`[AuditLog] Failed to log ${eventType}:`, error);
      } else {
        console.log(`[AuditLog] ${eventType} logged for payment ${paymentId}`);
      }

      return { data, error };
    } catch (err) {
      console.error("Payment event logging error:", err);
      return { data: null, error: err.message };
    }
  },

  /**
   * Log payment allocation (which payment paid for which fee items)
   *
   * @param {string} paymentId - Payment UUID
   * @param {array} allocationDetails - Array of {fee_item_id, allocated_amount}
   */
  async logAllocation(paymentId, allocationDetails) {
    const allocatedAmount = allocationDetails.reduce((sum, a) => sum + a.allocated_amount, 0);

    await this.logPaymentEvent(
      paymentId,
      "ALLOCATED",
      null,
      {
        allocated_items: allocationDetails.length,
        total_allocated: allocatedAmount,
      },
      {
        allocations: allocationDetails.map((a) => ({
          fee_item_id: a.fee_item_id,
          amount: a.allocated_amount,
          order: a.order,
        })),
      }
    );
  },

  /**
   * Log payment verification (admin approving bank deposit)
   *
   * @param {string} paymentId - Payment UUID
   * @param {string} verifiedBy - Admin/system that verified
   * @param {string} rejectionReason - If rejected, the reason (optional)
   * @param {string} notes - Additional notes (optional)
   */
  async logVerification(paymentId, verifiedBy, rejectionReason = null, notes = "") {
    const eventType = rejectionReason ? "REJECTED" : "VERIFIED";
    const newStatus = rejectionReason ? "overdue" : "paid"; // rejection sets to overdue

    const details = {
      verified_by: verifiedBy,
    };

    if (rejectionReason) {
      details.rejection_reason = rejectionReason;
    }
    if (notes) {
      details.notes = notes;
    }

    await this.logPaymentEvent(
      paymentId,
      eventType,
      null,
      {
        status: newStatus,
        verified_at: new Date().toISOString(),
      },
      details
    );
  },

  /**
   * Log payment creation
   *
   * @param {string} paymentId - Payment UUID
   * @param {object} paymentData - The created payment record
   * @param {string} method - Payment method (paystack, bank-deposit, cash)
   */
  async logCreation(paymentId, paymentData, method) {
    await this.logPaymentEvent(
      paymentId,
      "CREATED",
      null,
      {
        student_id: paymentData.student_id || paymentData.studentId,
        amount: paymentData.amount,
        method: method,
        status: paymentData.status,
      },
      {
        method: method,
        initial_status: paymentData.status,
      }
    );
  },

  /**
   * Log payment void/cancellation
   *
   * @param {string} paymentId - Payment UUID
   * @param {object} originalPayment - The payment record before void
   * @param {string} reason - Reason for void (optional)
   */
  async logVoid(paymentId, originalPayment, reason = "") {
    const details = {};
    if (reason) details.reason = reason;

    await this.logPaymentEvent(
      paymentId,
      "VOIDED",
      originalPayment,
      { status: "cancelled" },
      details
    );
  },

  /**
   * Log payment refund
   *
   * @param {string} paymentId - Payment UUID
   * @param {number} refundAmount - Amount refunded
   * @param {string} reason - Reason for refund
   * @param {string} refundReference - Refund reference number
   */
  async logRefund(paymentId, refundAmount, reason, refundReference) {
    await this.logPaymentEvent(
      paymentId,
      "REFUNDED",
      null,
      { status: "refunded", refund_amount: refundAmount },
      {
        reason: reason,
        refund_reference: refundReference,
        refund_date: new Date().toISOString(),
      }
    );
  },

  /**
   * Get complete audit trail for a payment
   * Returns all events in chronological order
   *
   * @param {string} paymentId - Payment UUID
   * @returns {Promise<{data, error}>}
   */
  async getAuditTrail(paymentId) {
    try {
      const { data, error } = await supabaseClient
        .from("payment_transaction_logs")
        .select("*")
        .eq("payment_id", paymentId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching audit trail:", error);
      } else {
        console.log(`[AuditLog] Retrieved ${data?.length || 0} events for payment ${paymentId}`);
      }

      return { data, error };
    } catch (err) {
      console.error("Get audit trail error:", err);
      return { data: null, error: err.message };
    }
  },

  /**
   * Get all events by a specific user (for user activity report)
   *
   * @param {string} performedByEmail - User email
   * @param {string} startDate - ISO date string (optional)
   * @param {string} endDate - ISO date string (optional)
   * @returns {Promise<{data, error}>}
   */
  async getEventsByUser(performedByEmail, startDate = null, endDate = null) {
    try {
      let query = supabaseClient
        .from("payment_transaction_logs")
        .select("*")
        .eq("performer_email", performedByEmail)
        .order("created_at", { ascending: false });

      if (startDate) {
        query = query.gte("created_at", startDate);
      }
      if (endDate) {
        query = query.lte("created_at", endDate);
      }

      const { data, error } = await query;

      return { data, error };
    } catch (err) {
      console.error("Get user events error:", err);
      return { data: null, error: err.message };
    }
  },

  /**
   * Get all events of a specific type (e.g., all ALLOCATIONS)
   * Useful for compliance reports
   *
   * @param {string} eventType - Event type to filter (CREATED, VERIFIED, etc.)
   * @param {string} startDate - ISO date string (optional)
   * @returns {Promise<{data, error}>}
   */
  async getEventsByType(eventType, startDate = null) {
    try {
      let query = supabaseClient
        .from("payment_transaction_logs")
        .select("*")
        .eq("transaction_type", eventType)
        .order("created_at", { ascending: false });

      if (startDate) {
        query = query.gte("created_at", startDate);
      }

      const { data, error } = await query.limit(1000);

      return { data, error };
    } catch (err) {
      console.error("Get events by type error:", err);
      return { data: null, error: err.message };
    }
  },

  /**
   * Export audit trail as CSV (for compliance/audit purposes)
   *
   * @param {array} auditTrail - Array of audit log entries
   * @returns {string} CSV content
   */
  exportAsCsv(auditTrail) {
    if (!auditTrail || auditTrail.length === 0) {
      return "No audit trail data";
    }

    const headers = [
      "Timestamp",
      "Payment ID",
      "Event Type",
      "Performed By",
      "Old Status",
      "New Status",
      "Amount",
      "Details",
    ];

    const rows = auditTrail.map((entry) => [
      entry.created_at,
      entry.payment_id,
      entry.transaction_type,
      entry.performer_email,
      entry.old_state?.status || "-",
      entry.new_state?.status || "-",
      entry.new_state?.amount || "-",
      entry.details ? JSON.stringify(entry.details) : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return csvContent;
  },

  /**
   * Display audit trail in human-readable format (for admin UI)
   *
   * @param {array} auditTrail - Array of audit log entries
   * @returns {string} Formatted HTML
   */
  renderAuditTrailHtml(auditTrail) {
    if (!auditTrail || auditTrail.length === 0) {
      return "<p class='text-secondary'>No audit trail events</p>";
    }

    const eventEmojis = {
      CREATED: "➕",
      UPDATED: "✏️",
      VERIFIED: "✅",
      REJECTED: "❌",
      ALLOCATED: "💰",
      UNALLOCATED: "🔄",
      VOIDED: "🚫",
      CANCELLED: "⛔",
      REFUNDED: "💸",
    };

    const html = auditTrail
      .map(
        (entry) => `
      <div class="audit-event" style="padding: 12px; border: 1px solid var(--border-primary); border-radius: 6px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
          <div>
            <strong>${eventEmojis[entry.transaction_type] || "📋"} ${entry.transaction_type}</strong>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 4px 0;">
              ${new Date(entry.created_at).toLocaleString()}
            </p>
            <p style="font-size: 0.875rem; color: var(--text-tertiary); margin: 4px 0;">
              By: ${entry.performer_email || "System"}
            </p>
          </div>
          <div style="text-align: right;">
            ${
              entry.old_state?.status && entry.new_state?.status
                ? `<span style="display: inline-block; background: var(--bg-secondary); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">
                   ${entry.old_state.status} → ${entry.new_state.status}
                 </span>`
                : ""
            }
          </div>
        </div>
        ${
          entry.details && Object.keys(entry.details).length > 0
            ? `<details style="margin-top: 8px; font-size: 0.875rem;">
               <summary style="cursor: pointer; color: var(--color-primary);">Details</summary>
               <pre style="background: var(--bg-secondary); padding: 8px; border-radius: 4px; overflow-x: auto;">
${JSON.stringify(entry.details, null, 2)}
               </pre>
             </details>`
            : ""
        }
      </div>
    `
      )
      .join("");

    return html;
  },
};

// Expose to window for use in payment module
window.paymentEventLogger = paymentEventLogger;
