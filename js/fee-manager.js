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
  /** The term and session to bill when a caller does not name one. */
  currentBillingPeriod() {
    return {
      term: window.schoolConfig?.getCurrentTerm?.()?.name || 'First Term',
      academicYear: String(window.schoolConfig?.getCurrentAcademicYear?.() || feeStructure.academicYear || '').replace('/', '-')
    };
  },

  /**
   * Bill a pupil for one term: add the fee lines their class owes that they
   * do not already have. Never deletes or changes a line.
   *
   * This replaced a version with two ways to lose or double money:
   *   - "skip existing" deleted every line for the term (paid ones included)
   *     whenever the count differed from the structure, then re-created them
   *     unpaid, so money already paid stopped counting against the bill;
   *   - "overwrite" deleted nothing and inserted the whole structure again,
   *     billing every item twice.
   * Adding only what is missing makes running it twice harmless, and 0023
   * gives the browser no UPDATE on fee_items anyway.
   *
   * @param {object} opts { term, academicYear, enrolment: 'new' | 'returning' }
   *   A pupil's first term is 'new' (adds the one-off uniform set).
   * @returns {Promise<{success:boolean, added?:number, alreadyBilled?:boolean, error?:string}>}
   */
  async billStudentForTerm(studentId, grade, opts = {}) {
    if (!studentId || !grade) return { success: false, error: 'Missing student or class' };
    const period = this.currentBillingPeriod();
    const term = opts.term || period.term;
    const academicYear = String(opts.academicYear || period.academicYear).replace('/', '-');
    const breakdown = feeStructure.calculateFeeBreakdown(grade, opts.enrolment || 'returning');
    if (!breakdown?.items?.length) return { success: false, error: `No fee structure for ${grade}` };

    try {
      const { data: existing, error: readError } = await supabaseClient
        .from('fee_items')
        .select('id, item_id, item_name')
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term);
      if (readError) return { success: false, error: readError.message };

      const haveIds = new Set((existing || []).map(e => e.item_id).filter(Boolean));
      const haveNames = new Set((existing || []).map(e => String(e.item_name || '').toLowerCase()));
      const missing = breakdown.items.filter(i => !haveIds.has(i.id) && !haveNames.has(String(i.name).toLowerCase()));
      if (!missing.length) return { success: true, added: 0, alreadyBilled: true };

      const rows = missing.map(item => ({
        student_id: studentId,
        academic_year: academicYear,
        grade: breakdown.grade,
        item_id: item.id,
        item_name: item.name,
        amount: item.amount,
        item_type: item.type,
        term,
        status: 'pending',
        amount_paid: 0
      }));
      const { data, error } = await supabaseClient.from('fee_items').insert(rows).select();
      if (error) return { success: false, error: error.message };
      return { success: true, added: data?.length || rows.length, alreadyBilled: false };
    } catch (err) {
      console.error('[FeeManager] billStudentForTerm:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * A pupil moved class during the term: this term's old-class lines that
   * nothing has been paid against are removed, then the new class's lines are
   * added. A line with money against it is kept, so a payment is never lost.
   */
  async moveStudentToGrade(studentId, newGrade, opts = {}) {
    const period = this.currentBillingPeriod();
    const term = opts.term || period.term;
    const academicYear = String(opts.academicYear || period.academicYear).replace('/', '-');
    const target = feeStructure.normalizeGrade(newGrade);
    try {
      const { data: lines, error } = await supabaseClient
        .from('fee_items')
        .select('id, grade, amount_paid')
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term);
      if (error) return { success: false, error: error.message };
      const untouchedOld = (lines || [])
        .filter(l => feeStructure.normalizeGrade(l.grade) !== target && !(parseFloat(l.amount_paid) > 0))
        .map(l => l.id);
      if (untouchedOld.length) {
        const { error: delError } = await supabaseClient.from('fee_items').delete().in('id', untouchedOld);
        if (delError) return { success: false, error: delError.message };
      }
      return this.billStudentForTerm(studentId, newGrade, { term, academicYear, enrolment: 'returning' });
    } catch (err) {
      console.error('[FeeManager] moveStudentToGrade:', err);
      return { success: false, error: err.message };
    }
  },

  /** Kept for older callers; always additive now. */
  async initializeFeeItems(studentId, grade, academicYear, term = null) {
    const r = await this.billStudentForTerm(studentId, grade, { academicYear, term });
    return r.success ? { ...r, existing: r.alreadyBilled, count: r.added } : r;
  },

  /**
   * Bill a pupil for the current term.
   *   { admission: true }   a new pupil: includes the one-off uniform set.
   *   { gradeChange: true } moved class: see moveStudentToGrade.
   * Used to bill with no term at all (so no term-scoped page saw the bill),
   * and to add a second full set on every class change.
   */
  async applyFeeStructure(studentId, grade, options = {}) {
    if (options.gradeChange) return this.moveStudentToGrade(studentId, grade, options);
    return this.billStudentForTerm(studentId, grade, {
      term: options.term,
      academicYear: options.academicYear,
      enrolment: options.admission ? 'new' : 'returning'
    });
  }
};

window.feeManager = feeManager;
