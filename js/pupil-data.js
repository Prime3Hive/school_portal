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

  /** One pupil's results for one term and session, or null if none are recorded. */
  function termResult(studentId, term, year) {
    const y = String(year || '').replace('/', '-');
    return results(studentId).find(r => r.term === term && r.year === y) || null;
  }

  /**
   * A class's results for one term: each pupil's average and position, and
   * the class figures a report card quotes. Positions rank pupils with
   * results by average (as shown, to one decimal place); equal averages share
   * a position and the next is skipped (1st, 2nd, 2nd, 4th). A pupil with no
   * results for the term has no position.
   */
  function classResults(students, term, year) {
    const pass = window.schoolConfig?.promotion?.minimumAverage ?? 50;
    const rows = students.map(s => ({ student: s, result: termResult(s.id, term, year), position: null }));
    const ranked = rows.filter(r => r.result).sort((a, b) => b.result.average - a.result.average);
    ranked.forEach((r, i) => {
      r.position = i && r.result.average === ranked[i - 1].result.average ? ranked[i - 1].position : i + 1;
    });
    const avgs = ranked.map(r => r.result.average);
    const round1 = (n) => Math.round(n * 10) / 10;

    const subjects = new Map();
    ranked.forEach(r => r.result.subjects.forEach(sub => {
      const x = subjects.get(sub.subject) || { subject: sub.subject, pcts: [] };
      x.pcts.push(sub.pct);
      subjects.set(sub.subject, x);
    }));

    return {
      rows,
      ranked: ranked.length,
      average: avgs.length ? round1(avgs.reduce((a, n) => a + n, 0) / avgs.length) : null,
      highest: avgs.length ? Math.max(...avgs) : null,
      lowest: avgs.length ? Math.min(...avgs) : null,
      passed: avgs.filter(n => n >= pass).length,
      passMark: pass,
      subjects: new Map([...subjects].map(([k, x]) => [k, {
        average: round1(x.pcts.reduce((a, n) => a + n, 0) / x.pcts.length),
        highest: Math.max(...x.pcts),
        lowest: Math.min(...x.pcts)
      }]))
    };
  }

  /** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
  function ordinal(n) {
    const v = n % 100;
    return n + (v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  }

  /**
   * What approving (or recording) a payment of `amount` will do to a pupil's
   * bills — the same walk as _allocate_payment_to_fee_items in the database:
   * unpaid lines, oldest first, any term. Money beyond what is owed is not
   * applied to anything, so it is reported separately.
   */
  function allocationPreview(studentId, amount) {
    const paidOf = (i) => parseFloat(i.amount_paid ?? i.amountPaid ?? 0) || 0;
    const items = all('feeItems')
      .filter(i => idOf(i) === studentId && i.status !== 'paid')
      .map(i => ({ ...i, balance: Math.max(0, (parseFloat(i.amount) || 0) - paidOf(i)) }))
      .filter(i => i.balance > 0)
      .sort((a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0));
    const owed = items.reduce((a, i) => a + i.balance, 0);
    let left = parseFloat(amount) || 0;
    const lines = [];
    for (const i of items) {
      if (left <= 0) break;
      const take = Math.min(left, i.balance);
      lines.push({ name: i.item_name || i.itemName || 'Fee', term: i.term || '', amount: take, clears: take >= i.balance });
      left -= take;
    }
    const paying = parseFloat(amount) || 0;
    return { owed, lines, unapplied: Math.max(0, left), remaining: Math.max(0, owed - paying) };
  }

  /**
   * The fee_type to record a payment under. record_fee_payment refuses a
   * second payment with the same fee type and term once one is paid (or a
   * transfer is waiting), so each payment in a term gets its own label.
   * A rejected one does not count.
   */
  function nextFeeTypeLabel(studentId, term) {
    const n = all('payments')
      .filter(p => idOf(p) === studentId && String(p.term || '') === term && paymentState(p).key !== 'rejected').length;
    return n ? `Term fees (payment ${n + 1})` : 'Term fees';
  }

  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const startOf = (r) => String(r.start_time || r.startTime || '');

  /**
   * The pupil's week, Monday to Friday, lessons in time order. It comes from
   * the class timetable (schoolSchedules, kept in Academics); a pupil's own
   * rows (studentSchedules) are used only when their class has none. The old
   * timetable page read the per-pupil rows alone, which nothing fills, so it
   * was empty even where the class had a timetable.
   */
  function timetable(student) {
    const week = Object.fromEntries(WEEKDAYS.map(d => [d, []]));
    if (!student) return week;
    const dayName = (v) => WEEKDAYS.find(d => d.toLowerCase() === String(v || '').trim().toLowerCase());
    const lesson = (r, day) => ({
      day, subject: r.subject || r.title || 'Lesson', teacher: r.teacher || '', room: r.room || '',
      start: startOf(r).slice(0, 5), end: String(r.end_time || r.endTime || '').slice(0, 5), period: r.period ?? null
    });
    let rows = all('schoolSchedules')
      .filter(r => r.grade === student.grade && (!r.section || r.section === student.section))
      .filter(r => !r.type || r.type === 'class' || r.type === 'lesson')
      .filter(r => String(r.status || 'active').toLowerCase() !== 'inactive');
    if (!rows.length) rows = all('studentSchedules').filter(r => idOf(r) === student.id);
    rows.forEach(r => { const d = dayName(r.day); if (d) week[d].push(lesson(r, d)); });
    WEEKDAYS.forEach(d => week[d].sort((a, b) => a.start.localeCompare(b.start)));
    return week;
  }

  /** Today's lessons for the pupil's class (none at the weekend). */
  function lessonsToday(student) {
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
    return timetable(student)[day] || [];
  }

  window.pupilData = { termScope, gradeFor, fees, paymentState, results, termResult, classResults, ordinal, timetable, lessonsToday, allocationPreview, nextFeeTypeLabel };
})();
