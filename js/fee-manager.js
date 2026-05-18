// ============================================
// FEE MANAGER - Fee Item Management Utility
// ============================================

const feeManager = {
  /**
   * Initialize fee items for a student based on their grade
   * @param {string} studentId - Student UUID
   * @param {string} grade - Student's grade/class
   * @param {string} academicYear - Academic year (default: 2025/2026)
   */
  async initializeFeeItems(studentId, grade, academicYear = '2025-2026', term = null, skipIfExists = true) {
    if (!studentId || !grade) {
      console.error('[FeeManager] Missing studentId or grade');
      return { success: false, error: 'Missing required parameters' };
    }

    try {
      // FIX #2: Normalize academic year to YYYY-YYYY format
      const normalizedYear = academicYear.replace('/', '-');

      // Get fee structure for the grade
      const feeBreakdown = feeStructure.calculateFeeBreakdown(grade);

      if (!feeBreakdown || !feeBreakdown.items || feeBreakdown.items.length === 0) {
        console.warn('[FeeManager] No fee items found for grade:', grade);
        return { success: false, error: 'No fee structure found for this grade' };
      }

      if (skipIfExists) {
        // Check if fee items already exist for this student + year (+ term if provided)
        let checkQuery = supabaseClient
          .from('fee_items')
          .select('*')
          .eq('student_id', studentId)
          .eq('academic_year', normalizedYear);
        if (term) checkQuery = checkQuery.eq('term', term);
        const { data: existing, error: checkError } = await checkQuery;

        if (checkError) {
          console.error('[FeeManager] Error checking existing fee items:', checkError);
          return { success: false, error: checkError.message };
        }

        if (existing && existing.length > 0) {
          // FIX #6: Check if ALL items already exist to prevent duplicates
          if (existing.length === (feeBreakdown.items?.length || 0)) {
            console.log('[FeeManager] Fee items already exist for this student/term');
            return { success: true, message: 'Fee items already initialized', existing: true, count: 0 };
          }

          // If partially exist, delete stale ones before re-creating
          const staleIds = existing.map(e => e.id);
          const { error: deleteError } = await supabaseClient.from('fee_items').delete().in('id', staleIds);
          if (deleteError) {
            console.error('[FeeManager] Error cleaning up stale items:', deleteError);
          }
        }
      }

      // Create fee items — one row per fee structure item
      const feeItems = feeBreakdown.items.map(item => ({
        student_id: studentId,
        academic_year: normalizedYear,
        grade: feeBreakdown.grade,
        item_id: item.id,
        item_name: item.name,
        amount: item.amount,
        item_type: item.type,
        term: term || null,
        status: 'pending',
        amount_paid: 0
      }));

      const { data, error } = await supabaseClient
        .from('fee_items')
        .insert(feeItems)
        .select();

      if (error) {
        console.error('[FeeManager] Error creating fee items:', error);
        return { success: false, error: error.message };
      }

      console.log('[FeeManager] Successfully initialized', data.length, 'fee items for student (term:', term, ')');
      return { success: true, data, count: data.length };

    } catch (err) {
      console.error('[FeeManager] Exception in initializeFeeItems:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Get all fee items for a student
   * @param {string} studentId - Student UUID
   * @param {string} academicYear - Academic year (optional)
   */
  async getFeeItems(studentId, academicYear = null, term = null) {
    try {
      let query = supabaseClient
        .from('fee_items')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true });

      if (academicYear) {
        query = query.eq('academic_year', academicYear);
      }
      if (term) {
        query = query.eq('term', term);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[FeeManager] Error fetching fee items:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };

    } catch (err) {
      console.error('[FeeManager] Exception in getFeeItems:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Calculate fee summary for a student
   * @param {string} studentId - Student UUID
   * @param {string} academicYear - Academic year (optional)
   */
  async getFeeSummary(studentId, academicYear = '2025/2026') {
    const result = await this.getFeeItems(studentId, academicYear);
    
    if (!result.success) {
      return result;
    }

    const items = result.data;
    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const totalPaid = items.reduce((sum, item) => sum + parseFloat(item.amount_paid || 0), 0);
    const totalBalance = totalAmount - totalPaid;

    const paidItems = items.filter(item => item.status === 'paid').length;
    const pendingItems = items.filter(item => item.status === 'pending').length;
    const partialItems = items.filter(item => item.status === 'partial').length;

    return {
      success: true,
      summary: {
        totalAmount,
        totalPaid,
        totalBalance,
        totalItems: items.length,
        paidItems,
        pendingItems,
        partialItems,
        percentagePaid: totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0
      },
      items
    };
  },

  /**
   * Allocate a payment to specific fee items
   * @param {string} paymentId - Payment UUID
   * @param {number} paymentAmount - Total payment amount
   * @param {string} studentId - Student UUID
   * @param {Array} itemAllocations - Array of {item_id, amount} allocations (optional)
   */
  async allocatePayment(paymentId, paymentAmount, studentId, itemAllocations = null) {
    try {
      const feeItemsResult = await this.getFeeItems(studentId);
      
      if (!feeItemsResult.success) {
        return feeItemsResult;
      }

      let feeItems = feeItemsResult.data;
      let remainingAmount = parseFloat(paymentAmount);

      // If specific allocations provided, use them
      if (itemAllocations && itemAllocations.length > 0) {
        for (const allocation of itemAllocations) {
          const item = feeItems.find(fi => fi.id === allocation.item_id);
          if (!item) continue;

          const allocAmount = parseFloat(allocation.amount);
          const newPaid = parseFloat(item.amount_paid || 0) + allocAmount;
          const itemTotal = parseFloat(item.amount);
          
          let newStatus = 'pending';
          if (newPaid >= itemTotal) {
            newStatus = 'paid';
          } else if (newPaid > 0) {
            newStatus = 'partial';
          }

          await supabaseClient
            .from('fee_items')
            .update({
              amount_paid: newPaid,
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);
        }
      } else {
        // Auto-allocate: pay items in order until amount is exhausted
        const pendingItems = feeItems
          .filter(item => item.status !== 'paid')
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        for (const item of pendingItems) {
          if (remainingAmount <= 0) break;

          const itemBalance = parseFloat(item.amount) - parseFloat(item.amount_paid || 0);
          const allocAmount = Math.min(remainingAmount, itemBalance);
          const newPaid = parseFloat(item.amount_paid || 0) + allocAmount;
          const itemTotal = parseFloat(item.amount);

          let newStatus = 'pending';
          if (newPaid >= itemTotal) {
            newStatus = 'paid';
          } else if (newPaid > 0) {
            newStatus = 'partial';
          }

          await supabaseClient
            .from('fee_items')
            .update({
              amount_paid: newPaid,
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          remainingAmount -= allocAmount;
        }
      }

      return { success: true, message: 'Payment allocated successfully' };

    } catch (err) {
      console.error('[FeeManager] Exception in allocatePayment:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Update a specific fee item's payment
   * @param {string} itemId - Fee item UUID
   * @param {number} amountPaid - Amount paid for this item
   */
  async updateFeeItem(itemId, amountPaid) {
    try {
      const { data: item, error: fetchError } = await supabaseClient
        .from('fee_items')
        .select('*')
        .eq('id', itemId)
        .single();

      if (fetchError || !item) {
        return { success: false, error: 'Fee item not found' };
      }

      const newPaid = parseFloat(amountPaid);
      const itemTotal = parseFloat(item.amount);
      
      let newStatus = 'pending';
      if (newPaid >= itemTotal) {
        newStatus = 'paid';
      } else if (newPaid > 0) {
        newStatus = 'partial';
      }

      const { error } = await supabaseClient
        .from('fee_items')
        .update({
          amount_paid: newPaid,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, message: 'Fee item updated successfully' };

    } catch (err) {
      console.error('[FeeManager] Exception in updateFeeItem:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Get overall fee status for a student
   * @param {string} studentId - Student UUID
   */
  async getOverallFeeStatus(studentId) {
    const summary = await this.getFeeSummary(studentId);
    
    if (!summary.success) {
      return 'pending';
    }

    const { totalBalance, pendingItems, partialItems } = summary.summary;

    if (totalBalance <= 0) {
      return 'paid';
    } else if (partialItems > 0) {
      return 'partial';
    } else if (pendingItems > 0) {
      return 'pending';
    }

    return 'pending';
  },

  /**
   * Render fee breakdown HTML for a student
   * @param {string} studentId - Student UUID
   */
  async renderFeeBreakdown(studentId) {
    const result = await this.getFeeSummary(studentId);
    
    if (!result.success) {
      return `<div class="alert alert-warning">Unable to load fee breakdown: ${result.error}</div>`;
    }

    const { summary, items } = result;

    return `
      <div class="fee-breakdown-container">
        <!-- Summary Card -->
        <div class="card mb-4" style="background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);">
          <div class="card-body">
            <h4 class="mb-3" style="display: flex; align-items: center; gap: 8px;">
              <span>💰</span> Fee Summary
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div class="text-sm text-secondary mb-1">Total Fees</div>
                <div class="text-xl font-bold">₦${summary.totalAmount.toLocaleString()}</div>
              </div>
              <div>
                <div class="text-sm text-secondary mb-1">Amount Paid</div>
                <div class="text-xl font-bold text-success">₦${summary.totalPaid.toLocaleString()}</div>
              </div>
              <div>
                <div class="text-sm text-secondary mb-1">Balance</div>
                <div class="text-xl font-bold text-danger">₦${summary.totalBalance.toLocaleString()}</div>
              </div>
              <div>
                <div class="text-sm text-secondary mb-1">Progress</div>
                <div class="text-xl font-bold">${summary.percentagePaid}%</div>
              </div>
            </div>
            <div class="mt-3">
              <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-success" style="width: ${summary.percentagePaid}%"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Fee Items Table -->
        <div class="card">
          <div class="card-header">
            <h4 class="mb-0">Fee Items Breakdown</h4>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Item</th>
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
                    const statusBadge = item.status === 'paid' ? 'badge-success' : 
                                       item.status === 'partial' ? 'badge-warning' : 'badge-secondary';
                    return `
                      <tr>
                        <td><strong>${item.item_name}</strong></td>
                        <td><span class="badge badge-light">${item.item_type}</span></td>
                        <td class="text-right">₦${parseFloat(item.amount).toLocaleString()}</td>
                        <td class="text-right text-success">₦${parseFloat(item.amount_paid || 0).toLocaleString()}</td>
                        <td class="text-right ${balance > 0 ? 'text-danger' : 'text-success'}">₦${balance.toLocaleString()}</td>
                        <td><span class="badge ${statusBadge}">${item.status}</span></td>
                        <td>
                          ${item.status !== 'paid' ? `
                            <button class="btn btn-sm btn-primary" onclick="feeManager.showPaymentModal('${item.id}', '${item.item_name}', ${balance})">
                              Pay
                            </button>
                          ` : '<span class="text-success">✓ Paid</span>'}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr class="font-bold">
                    <td colspan="2"><strong>TOTAL</strong></td>
                    <td class="text-right"><strong>₦${summary.totalAmount.toLocaleString()}</strong></td>
                    <td class="text-right text-success"><strong>₦${summary.totalPaid.toLocaleString()}</strong></td>
                    <td class="text-right text-danger"><strong>₦${summary.totalBalance.toLocaleString()}</strong></td>
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

  /**
   * Apply (or re-apply) fee structure for a student's grade.
   * Always clears existing fee_items first, then creates fresh rows.
   * Use for new admissions AND grade changes.
   * @param {string} studentId - Student UUID
   * @param {string} grade - Grade name matching feeStructure keys
   * @param {object} options - { academicYear, term }
   */
  async applyFeeStructure(studentId, grade, options = {}) {
    const academicYear = options.academicYear || feeStructure.academicYear || '2025-2026';
    const term = options.term || null;
    return this.initializeFeeItems(studentId, grade, academicYear, term, false);
  },

  /**
   * Show payment modal for a specific fee item
   */
  showPaymentModal(itemId, itemName, balance) {
    // This will be implemented in the fees-payments module
    if (window.feesPaymentsModule && window.feesPaymentsModule.recordPaymentForItem) {
      window.feesPaymentsModule.recordPaymentForItem(itemId, itemName, balance);
    } else {
      showToast('Payment feature not available', 'error');
    }
  }
};

window.feeManager = feeManager;
