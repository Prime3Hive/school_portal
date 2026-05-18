// ============================================
// PAYMENT ALLOCATION MANAGER
// ============================================
// Atomic payment allocation to fee items
// Standard fintech procedure: every dollar must be traceable to specific charges
// Implements reversible allocations for payment voids/refunds

const paymentAllocationManager = {
  /**
   * Atomically allocate payment to fee items
   * Ensures complete and consistent state - either all allocations succeed or none
   *
   * Returns: {success, allocations: [{fee_item_id, allocated_amount, order}], error}
   *
   * @param {string} paymentId - Payment UUID
   * @param {string} studentId - Student UUID
   * @param {number} paymentAmount - Total amount being allocated
   */
  async allocatePaymentAtomic(paymentId, studentId, paymentAmount) {
    try {
      console.log(
        `[Allocation] Starting atomic allocation: Payment ${paymentId}, Amount ₦${paymentAmount}`
      );

      // Step 1: Fetch payment record
      const { data: payment, error: paymentError } = await supabaseClient
        .from("fees_payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();

      if (paymentError || !payment) {
        return { success: false, error: "Payment not found" };
      }

      // Step 2: Check if already fully allocated (prevent double allocation)
      const { data: existingAllocations } = await supabaseClient
        .from("payment_allocations")
        .select("allocated_amount")
        .eq("payment_id", paymentId);

      if (existingAllocations && existingAllocations.length > 0) {
        const totalAllocated = existingAllocations.reduce(
          (sum, a) => sum + (a.allocated_amount || 0),
          0
        );

        if (Math.abs(totalAllocated - paymentAmount) < 0.01) {
          // Already fully allocated (allow small rounding difference)
          console.log(`[Allocation] Payment ${paymentId} already fully allocated`);
          return { success: true, allocations: [], message: "Already allocated" };
        }

        if (totalAllocated > 0) {
          // Partial allocation - shouldn't happen in normal flow
          console.warn(
            `[Allocation] Payment ${paymentId} partially allocated (₦${totalAllocated} of ₦${paymentAmount})`
          );
        }
      }

      // Step 3: Get pending fee items, ordered by creation date (FIFO)
      const { data: feeItems, error: feeError } = await supabaseClient
        .from("fee_items")
        .select("*")
        .eq("student_id", studentId)
        .in("status", ["pending", "partial"])
        .order("created_at", { ascending: true });

      if (feeError || !feeItems || feeItems.length === 0) {
        return { success: false, error: "No pending fee items found for student" };
      }

      console.log(
        `[Allocation] Found ${feeItems.length} pending/partial fee items for student ${studentId}`
      );

      // Step 4: Calculate allocations (FIFO method: allocate to oldest items first)
      let remainingAmount = paymentAmount;
      const allocations = [];
      let allocationOrder = 1;

      for (const item of feeItems) {
        if (remainingAmount <= 0.01) break; // Stop when fully allocated (allow small rounding)

        const itemBalance = item.amount - (item.amount_paid || 0);
        const allocAmount = Math.min(remainingAmount, itemBalance);

        if (allocAmount > 0) {
          allocations.push({
            fee_item_id: item.id,
            allocated_amount: allocAmount,
            order: allocationOrder,
            item_name: item.item_name,
          });

          remainingAmount -= allocAmount;
          allocationOrder++;
        }
      }

      if (allocations.length === 0) {
        return { success: false, error: "Unable to calculate allocations" };
      }

      console.log(
        `[Allocation] Calculated ${allocations.length} allocations, remaining: ₦${remainingAmount}`
      );

      // Step 5: Insert all allocations as atomic batch
      // Resolve user ID once outside the map — await is illegal inside a non-async map callback
      const currentUserId = await this._getCurrentUserId();
      const { error: allocError } = await supabaseClient
        .from("payment_allocations")
        .insert(
          allocations.map((a) => ({
            payment_id: paymentId,
            fee_item_id: a.fee_item_id,
            allocated_amount: a.allocated_amount,
            allocation_order: a.order,
            allocated_by: currentUserId,
            notes: `Allocated from payment ${paymentId}`,
          }))
        );

      if (allocError) {
        console.error("[Allocation] Failed to insert allocations:", allocError);
        throw allocError;
      }

      console.log(`[Allocation] Inserted ${allocations.length} allocation records`);

      // Step 6: Update fee_items with new amount_paid and status
      for (const alloc of allocations) {
        const feeItem = feeItems.find((fi) => fi.id === alloc.fee_item_id);
        if (!feeItem) continue;

        const newPaid = (feeItem.amount_paid || 0) + alloc.allocated_amount;
        const newStatus =
          newPaid >= feeItem.amount
            ? "paid"
            : newPaid > 0
              ? "partial"
              : "pending";

        const { error: updateError } = await supabaseClient
          .from("fee_items")
          .update({
            amount_paid: newPaid,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alloc.fee_item_id);

        if (updateError) {
          console.error(
            `[Allocation] Failed to update fee_item ${alloc.fee_item_id}:`,
            updateError
          );
          throw updateError;
        }

        console.log(
          `[Allocation] Updated fee_item ${feeItem.item_name}: ₦${newPaid} / ₦${feeItem.amount} (${newStatus})`
        );
      }

      // Step 7: Log allocation event for audit trail
      await paymentEventLogger.logAllocation(paymentId, allocations);

      console.log(
        `[Allocation] Successfully completed atomic allocation of ₦${paymentAmount - remainingAmount}`
      );

      return { success: true, allocations };
    } catch (error) {
      console.error("[Allocation] Atomic allocation failed:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Reverse payment allocation when payment is voided
   * Decrements fee_items and deletes allocation records
   * Must be called before payment status is changed to 'cancelled'
   *
   * @param {string} paymentId - Payment UUID
   * @returns {Promise<{success, error?}>}
   */
  async reverseAllocation(paymentId) {
    try {
      console.log(`[Reversal] Starting allocation reversal for payment ${paymentId}`);

      // Step 1: Get all allocations for this payment
      const { data: allocations, error: fetchError } = await supabaseClient
        .from("payment_allocations")
        .select("*")
        .eq("payment_id", paymentId);

      if (fetchError) {
        throw fetchError;
      }

      if (!allocations || allocations.length === 0) {
        console.log(`[Reversal] No allocations to reverse for payment ${paymentId}`);
        return { success: true };
      }

      console.log(
        `[Reversal] Found ${allocations.length} allocations to reverse for payment ${paymentId}`
      );

      // Step 2: Reverse each allocation
      for (const alloc of allocations) {
        // Fetch current fee_item state
        const { data: feeItem, error: itemError } = await supabaseClient
          .from("fee_items")
          .select("*")
          .eq("id", alloc.fee_item_id)
          .maybeSingle();

        if (itemError || !feeItem) {
          console.warn(`[Reversal] Fee item ${alloc.fee_item_id} not found`);
          continue;
        }

        // Calculate new amount_paid (subtract allocation)
        const newPaid = Math.max(0, (feeItem.amount_paid || 0) - alloc.allocated_amount);
        const newStatus =
          newPaid === 0
            ? "pending"
            : newPaid >= feeItem.amount
              ? "paid"
              : "partial";

        // Update fee_item
        const { error: updateError } = await supabaseClient
          .from("fee_items")
          .update({
            amount_paid: newPaid,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alloc.fee_item_id);

        if (updateError) {
          console.error(`[Reversal] Failed to update fee_item ${alloc.fee_item_id}:`, updateError);
          throw updateError;
        }

        console.log(
          `[Reversal] Reversed allocation: ${feeItem.item_name} from ₦${feeItem.amount_paid} to ₦${newPaid}`
        );
      }

      // Step 3: Delete allocation records (immutable audit trail preserved in payment_allocations table)
      const { error: deleteError } = await supabaseClient
        .from("payment_allocations")
        .delete()
        .eq("payment_id", paymentId);

      if (deleteError) {
        throw deleteError;
      }

      // Step 4: Log reversal event
      await paymentEventLogger.logPaymentEvent(
        paymentId,
        "UNALLOCATED",
        null,
        { allocations_reversed: allocations.length },
        { reversed_allocations_count: allocations.length }
      );

      console.log(`[Reversal] Successfully reversed all ${allocations.length} allocations`);

      return { success: true };
    } catch (error) {
      console.error("[Reversal] Allocation reversal failed:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get all allocations for a specific payment
   *
   * @param {string} paymentId - Payment UUID
   * @returns {Promise<{data, error}>}
   */
  async getAllocationsForPayment(paymentId) {
    try {
      const { data, error } = await supabaseClient
        .from("payment_allocations")
        .select("*, fee_items(item_name, amount)")
        .eq("payment_id", paymentId)
        .order("allocation_order", { ascending: true });

      return { data, error };
    } catch (error) {
      console.error("Get allocations error:", error);
      return { data: null, error: error.message };
    }
  },

  /**
   * Get total allocated for a specific payment
   *
   * @param {string} paymentId - Payment UUID
   * @returns {Promise<number>} Total allocated amount
   */
  async getTotalAllocated(paymentId) {
    try {
      const { data: allocations } = await supabaseClient
        .from("payment_allocations")
        .select("allocated_amount")
        .eq("payment_id", paymentId);

      const total = (allocations || []).reduce(
        (sum, a) => sum + (a.allocated_amount || 0),
        0
      );

      return total;
    } catch (error) {
      console.error("Get total allocated error:", error);
      return 0;
    }
  },

  /**
   * Get unallocated portion of a payment
   * Returns amount that's in fees_payments but not in payment_allocations
   *
   * @param {string} paymentId - Payment UUID
   * @returns {Promise<number>} Unallocated amount
   */
  async getUnallocatedAmount(paymentId) {
    try {
      const { data: payment } = await supabaseClient
        .from("fees_payments")
        .select("amount")
        .eq("id", paymentId)
        .maybeSingle();

      if (!payment) return 0;

      const totalAllocated = await this.getTotalAllocated(paymentId);
      return Math.max(0, payment.amount - totalAllocated);
    } catch (error) {
      console.error("Get unallocated amount error:", error);
      return 0;
    }
  },

  /**
   * Get current user ID from session
   * @private
   * @returns {Promise<string|null>}
   */
  async _getCurrentUserId() {
    try {
      // AuthManager stores { supabaseId, userId, email, role, ... } — not { user: { id } }
      const session = JSON.parse(localStorage.getItem("sb_session") || "{}");
      return session.supabaseId || session.userId || null;
    } catch {
      return null;
    }
  },
};

// Expose to window for use in payment module
window.paymentAllocationManager = paymentAllocationManager;
