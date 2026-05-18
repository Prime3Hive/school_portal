// ============================================
// PAYMENT RECONCILIATION MANAGER
// ============================================
// Detect and report discrepancies between payments and allocations
// Standard fintech requirement: periodic reconciliation to catch errors early
// Provides admin visibility into unallocated payments and data inconsistencies

const paymentReconciliationManager = {
  /**
   * Detect discrepancies between fees_payments and fee_items for a student
   * Compares: total payments vs total allocated to fee items
   *
   * @param {string} studentId - Student UUID
   * @param {string} academicYear - Academic year (optional)
   * @returns {Promise<{totalPaymentsRecorded, totalAllocated, discrepancy, allocationsReconciled, detailed}>}
   */
  async detectDiscrepancies(studentId, academicYear = null) {
    try {
      console.log(
        `[Reconciliation] Detecting discrepancies for student ${studentId}, year ${academicYear || "all"}`
      );

      // Step 1: Get all payments marked as paid
      let paymentsQuery = supabaseClient
        .from("fees_payments")
        .select("*")
        .eq("student_id", studentId)
        .eq("status", "paid")
        .is("deleted_at", null);

      if (academicYear) {
        paymentsQuery = paymentsQuery.eq("academic_year", academicYear);
      }

      const { data: payments, error: paymentsError } = await paymentsQuery;

      if (paymentsError) {
        throw paymentsError;
      }

      const totalPaymentsRecorded = (payments || []).reduce(
        (sum, p) => sum + (p.amount || 0),
        0
      );

      console.log(`[Reconciliation] Total payments recorded: ₦${totalPaymentsRecorded}`);

      // Step 2: Get total allocated to fee_items
      let feeItemsQuery = supabaseClient
        .from("fee_items")
        .select("*")
        .eq("student_id", studentId);

      if (academicYear) {
        feeItemsQuery = feeItemsQuery.eq("academic_year", academicYear);
      }

      const { data: feeItems, error: feeError } = await feeItemsQuery;

      if (feeError) {
        throw feeError;
      }

      const totalAllocated = (feeItems || []).reduce(
        (sum, i) => sum + (i.amount_paid || 0),
        0
      );

      console.log(`[Reconciliation] Total allocated to fee_items: ₦${totalAllocated}`);

      // Step 3: Get total from allocations table (more authoritative)
      const paymentIds = (payments || []).map((p) => p.id);

      if (paymentIds.length === 0) {
        return {
          totalPaymentsRecorded: 0,
          totalAllocated: 0,
          totalFromAllocations: 0,
          discrepancy: 0,
          allocationsReconciled: true,
          detailed: { unallocated: 0, overpaid: 0 },
        };
      }

      const { data: allocations, error: allocError } = await supabaseClient
        .from("payment_allocations")
        .select("allocated_amount")
        .in("payment_id", paymentIds);

      if (allocError) {
        throw allocError;
      }

      const totalFromAllocations = (allocations || []).reduce(
        (sum, a) => sum + (a.allocated_amount || 0),
        0
      );

      console.log(`[Reconciliation] Total from allocations table: ₦${totalFromAllocations}`);

      const discrepancy = totalPaymentsRecorded - totalFromAllocations;
      const allocationsReconciled = Math.abs(discrepancy) < 0.01; // Allow small rounding difference

      const result = {
        totalPaymentsRecorded,
        totalAllocated,
        totalFromAllocations,
        discrepancy,
        allocationsReconciled,
        detailed: {
          unallocated: Math.max(0, totalPaymentsRecorded - totalFromAllocations),
          overpaid: Math.max(0, totalAllocated - totalPaymentsRecorded),
        },
      };

      if (!allocationsReconciled) {
        console.warn(
          `[Reconciliation] DISCREPANCY DETECTED: ₦${discrepancy} unallocated for student ${studentId}`
        );
      }

      return result;
    } catch (error) {
      console.error("[Reconciliation] Discrepancy detection error:", error);
      return { error: error.message };
    }
  },

  /**
   * Generate reconciliation report for all students in academic year
   * Shows which students have payment discrepancies
   *
   * @param {string} academicYear - Academic year (optional, defaults to current)
   * @returns {Promise<array>} Array of students with discrepancies
   */
  async generateReconciliationReport(academicYear = "2025/2026") {
    try {
      console.log(`[Reconciliation] Generating report for academic year ${academicYear}`);

      // Get all active students
      const { data: students, error: studentError } = await supabaseClient
        .from("students")
        .select("id, name, roll_number")
        .eq("status", "active");

      if (studentError) {
        throw studentError;
      }

      const report = [];

      for (const student of students || []) {
        const discrepancies = await this.detectDiscrepancies(student.id, academicYear);

        // Only include students with discrepancies
        if (discrepancies.discrepancy && Math.abs(discrepancies.discrepancy) > 0.01) {
          report.push({
            student_id: student.id,
            student_name: student.name,
            roll_number: student.roll_number,
            ...discrepancies,
          });
        }
      }

      console.log(
        `[Reconciliation] Report complete: ${report.length} students with discrepancies out of ${(students || []).length}`
      );

      return report;
    } catch (error) {
      console.error("[Reconciliation] Report generation error:", error);
      return { error: error.message };
    }
  },

  /**
   * Get unallocated payments (in fees_payments but not fully in payment_allocations)
   *
   * @param {string} studentId - Student UUID (optional)
   * @returns {Promise<array>} Array of unallocated payments
   */
  async getUnallocatedPayments(studentId = null) {
    try {
      console.log(`[Reconciliation] Fetching unallocated payments${studentId ? ` for student ${studentId}` : ""}`);

      // Query: Find payments marked as paid but not fully allocated
      let query = supabaseClient
        .from("unallocated_payments") // This is a view created in migration
        .select("*")
        .gt("unallocated", 0);

      if (studentId) {
        query = query.eq("student_id", studentId);
      }

      const { data, error } = await query;

      if (error && error.code !== "PGRST116") {
        // PGRST116 = relation does not exist (view might not be created)
        throw error;
      }

      // Fallback: calculate manually if view doesn't exist
      if (!data) {
        return await this._getUnallocatedPaymentsManual(studentId);
      }

      console.log(`[Reconciliation] Found ${(data || []).length} unallocated payment records`);
      return data || [];
    } catch (error) {
      console.error("[Reconciliation] Get unallocated payments error:", error);
      return { error: error.message };
    }
  },

  /**
   * Fallback manual calculation of unallocated payments
   * Used if the view doesn't exist
   * @private
   */
  async _getUnallocatedPaymentsManual(studentId = null) {
    try {
      let query = supabaseClient
        .from("fees_payments")
        .select("id, student_id, amount, status, payment_date, fee_type")
        .eq("status", "paid")
        .is("deleted_at", null);

      if (studentId) {
        query = query.eq("student_id", studentId);
      } else {
        query = query.limit(100); // Limit to prevent slow queries
      }

      const { data: payments } = await query;

      const unallocated = [];

      for (const payment of payments || []) {
        const totalAllocated = await paymentAllocationManager.getTotalAllocated(payment.id);

        if (totalAllocated < payment.amount) {
          unallocated.push({
            payment_id: payment.id,
            student_id: payment.student_id,
            amount: payment.amount,
            allocated: totalAllocated,
            remaining: payment.amount - totalAllocated,
            fee_type: payment.fee_type,
            payment_date: payment.payment_date,
          });
        }
      }

      return unallocated;
    } catch (error) {
      console.error("[Reconciliation] Manual calculation error:", error);
      return [];
    }
  },

  /**
   * Get webhook processing status (how many unprocessed webhooks)
   *
   * @returns {Promise<{unprocessed, failed, processed_today}>}
   */
  async getWebhookStatus() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Unprocessed events
      const { data: unprocessed } = await supabaseClient
        .from("paystack_webhook_events")
        .select("id")
        .eq("processed", false);

      // Failed events
      const { data: failed } = await supabaseClient
        .from("paystack_webhook_events")
        .select("id")
        .not("processing_error", "is", null)
        .gte("created_at", today.toISOString());

      // Processed today
      const { data: processedToday } = await supabaseClient
        .from("paystack_webhook_events")
        .select("id")
        .eq("processed", true)
        .gte("processed_at", today.toISOString());

      return {
        unprocessed: unprocessed?.length || 0,
        failed: failed?.length || 0,
        processed_today: processedToday?.length || 0,
      };
    } catch (error) {
      console.error("[Reconciliation] Webhook status error:", error);
      return { error: error.message };
    }
  },

  /**
   * Render reconciliation report as HTML (for admin dashboard)
   *
   * @param {array} report - Reconciliation report data
   * @returns {string} HTML content
   */
  renderReportHtml(report) {
    if (!report || report.length === 0) {
      return "<div class='alert alert-success'><strong>✅ No discrepancies detected!</strong> All payments are properly allocated.</div>";
    }

    const rows = report
      .map(
        (item) => `
      <tr>
        <td>${item.student_name}</td>
        <td>${item.roll_number || "-"}</td>
        <td style="text-align: right;">₦${(item.totalPaymentsRecorded || 0).toLocaleString()}</td>
        <td style="text-align: right;">₦${(item.totalFromAllocations || 0).toLocaleString()}</td>
        <td style="text-align: right; color: var(--color-danger); font-weight: bold;">₦${(item.discrepancy || 0).toLocaleString()}</td>
        <td style="text-align: center;">
          <span class="badge ${item.allocationsReconciled ? "badge-success" : "badge-danger"}">
            ${item.allocationsReconciled ? "✅ OK" : "⚠️ Issue"}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="paymentReconciliationManager.showStudentDetails('${item.student_id}')">
            View
          </button>
        </td>
      </tr>
    `
      )
      .join("");

    return `
      <div class="alert alert-warning" style="margin-bottom: 16px;">
        <strong>⚠️ Payment Discrepancies Found</strong><br>
        ${report.length} students have unallocated payments totaling ₦${report.reduce((sum, r) => sum + (r.discrepancy || 0), 0).toLocaleString()}
      </div>
      <table class="table table-sm table-hover">
        <thead>
          <tr>
            <th>Student</th>
            <th>Roll #</th>
            <th>Total Paid</th>
            <th>Allocated</th>
            <th>Discrepancy</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  },

  /**
   * Show detailed reconciliation for a specific student
   *
   * @param {string} studentId - Student UUID
   * @returns {Promise<object>} Detailed reconciliation data
   */
  async showStudentDetails(studentId) {
    try {
      const discrepancies = await this.detectDiscrepancies(studentId);
      const unallocated = await this.getUnallocatedPayments(studentId);

      return {
        ...discrepancies,
        unallocated_payments: unallocated,
      };
    } catch (error) {
      console.error("[Reconciliation] Student details error:", error);
      return { error: error.message };
    }
  },

  /**
   * Export reconciliation report as CSV
   *
   * @param {array} report - Report data
   * @returns {string} CSV content
   */
  exportReportAsCsv(report) {
    if (!report || report.length === 0) {
      return "No discrepancies found";
    }

    const headers = [
      "Student Name",
      "Roll Number",
      "Total Payments",
      "Total Allocated",
      "Discrepancy",
      "Status",
    ];

    const rows = report.map((item) => [
      item.student_name,
      item.roll_number || "",
      item.totalPaymentsRecorded,
      item.totalFromAllocations,
      item.discrepancy,
      item.allocationsReconciled ? "OK" : "ISSUE",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return csvContent;
  },
};

// Expose to window for use in admin dashboard
window.paymentReconciliationManager = paymentReconciliationManager;
