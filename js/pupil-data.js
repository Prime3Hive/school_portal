// ============================================
// PUPIL DATA — one reading of a child's fees and results
// ============================================
// The staff student record and the family pages both show a pupil's bill,
// payments and results. Working them out here, once, means the office and
// the parent can never be shown different figures for the same child.
// ============================================

(function () {
  'use strict';

  const all = (c) => window.dataManager?.getAll(c) || [];
  const idOf = (row) => row.student_id || row.studentId;

  function termScope() {
    return {
      term: window.schoolConfig?.getCurrentTerm?.()?.name || '',
      year: String(window.schoolConfig?.getCurrentAcademicYear?.() || '').replace('/', '-')
    };
  }

  function gradeFor(pct) {
    if (window.scoreBook) {
      const b = window.scoreBook.gradeFor(pct);
      return { letter: b.grade, remark: b.remark };
    }
    const bands = [...(window.schoolConfig?.promotion?.gradingScale || [])].sort((a, b) => b.min - a.min);
    const band = bands.find(b => pct >= b.min) || bands[bands.length - 1];
    return band ? { letter: band.grade, remark: band.remark } : { letter: '', remark: '' };
  }

  /** Bills (fee items) and payments for one pupil, with this term's totals. */
  function fees(studentId) {
    const paidOf = (i) => parseFloat(i.amount_paid ?? i.amountPaid ?? 0) || 0;
    const items = all('feeItems')
      .filter(i => idOf(i) === studentId)
      .map(i => ({ ...i, billed: parseFloat(i.amount) || 0, paid: paidOf(i) }))
      .map(i => ({ ...i, balance: Math.max(0, i.billed - i.paid) }));

    const scope = termScope();
    const inTerm = (i) => String(i.term || '') === scope.term &&
      String(i.academic_year || i.academicYear || '').replace('/', '-') === scope.year;
    const termItems = items.filter(inTerm);
    const sum = (list, k) => list.reduce((a, i) => a + i[k], 0);

    const payments = all('payments')
      .filter(p => idOf(p) === studentId)
      .sort((a, b) => new Date(b.paymentDate || b.payment_date || b.createdAt || 0) - new Date(a.paymentDate || a.payment_date || a.createdAt || 0));

    return {
      scope,
      items,
      termItems,
      term: { billed: sum(termItems, 'billed'), paid: sum(termItems, 'paid'), balance: sum(termItems, 'balance') },
      all: { billed: sum(items, 'billed'), paid: sum(items, 'paid'), balance: sum(items, 'balance') },
      payments
    };
  }

  /** A payment's state in the words the school uses. */
  function paymentState(p) {
    const method = String(p?.paymentMethod || p?.payment_method || '').toLowerCase();
    if (p?.status === 'pending' && (method === 'bank-deposit' || method === 'paystack')) return { label: 'Being checked', tone: 'warn', key: 'checking' };
    if (p?.status === 'paid') return { label: 'Paid', tone: 'good', key: 'paid' };
    if (p?.rejectionReason || p?.rejection_reason) return { label: 'Not accepted', tone: 'warn', key: 'rejected' };
    const s = String(p?.status || 'pending');
    return { label: s[0].toUpperCase() + s.slice(1), tone: '', key: s };
  }

  /**
   * Recorded grades grouped by session and term, newest first. Within a term
   * each subject's scores are pooled across its assessments.
   */
  function results(studentId) {
    const termRank = { 'First Term': 1, 'Second Term': 2, 'Third Term': 3 };
    const groups = new Map();
    all('grades')
      .filter(g => idOf(g) === studentId)
      .forEach(g => {
        const year = String(g.academicYear || g.academic_year || '').replace('/', '-');
        const key = `${year}|${g.term || ''}`;
        if (!groups.has(key)) groups.set(key, { year, term: g.term || '', subjects: new Map() });
        const subj = g.subject || 'Unnamed subject';
        const row = groups.get(key).subjects.get(subj) || { subject: subj, score: 0, total: 0, remarks: [] };
        row.score += parseFloat(g.score) || 0;
        row.total += parseFloat(g.totalMarks ?? g.total_marks) || 0;
        if (g.remarks) row.remarks.push(g.remarks);
        groups.get(key).subjects.set(subj, row);
      });

    return [...groups.values()]
      .map(grp => {
        const subjects = [...grp.subjects.values()]
          .filter(r => r.total > 0)
          .map(r => {
            const pct = Math.round((r.score / r.total) * 1000) / 10;
            return { ...r, pct, ...gradeFor(pct) };
          })
          .sort((a, b) => a.subject.localeCompare(b.subject));
        const average = subjects.length ? Math.round((subjects.reduce((a, r) => a + r.pct, 0) / subjects.length) * 10) / 10 : null;
        return { ...grp, subjects, average, ...(average != null ? gradeFor(average) : { letter: '', remark: '' }) };
      })
      .filter(grp => grp.subjects.length)
      .sort((a, b) => (b.year.localeCompare(a.year)) || ((termRank[b.term] || 0) - (termRank[a.term] || 0)));
  }

  /** Today's lessons for the pupil's class, from the school timetable. */
  function lessonsToday(student) {
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
    return all('schoolSchedules')
      .filter(s => String(s.day || '').toLowerCase() === day && s.grade === student.grade && (!s.section || s.section === student.section))
      .filter(s => String(s.status || 'active').toLowerCase() !== 'inactive')
      .sort((a, b) => String(a.start_time || a.startTime || '').localeCompare(String(b.start_time || b.startTime || '')));
  }

  window.pupilData = { termScope, gradeFor, fees, paymentState, results, lessonsToday };
})();
