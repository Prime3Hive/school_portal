// ============================================
// REDESIGN — the calculations behind the new pages
// ============================================
// Loads the real files (school-config, score-book, pupil-data, the Today
// page, Payments to check, the family pages) into a sandbox with a fixed
// clock and in-memory data, and checks the figures they produce.
// Run: node tests/redesign.test.js
// ============================================

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function describe(name, fn) { console.log(`\n\x1b[1m📦 ${name}\x1b[0m`); fn(); }
const pending = [];
function it(name, fn) {
  const ok = () => { console.log(`  \x1b[32m✓\x1b[0m ${name}`); passed++; };
  const bad = (e) => { console.error(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${e.message}\x1b[0m`); failed++; };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(ok, bad));
    else ok();
  } catch (e) { bad(e); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}expected ${b}, got ${a}`);
}

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/**
 * A browser-ish sandbox whose clock reads `isoNow` and whose DataManager
 * serves `data`. Returns the sandbox's window.
 */
function sandbox(isoNow, data = {}, files = []) {
  const RealDate = Date;
  const fixed = new RealDate(isoNow).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(fixed); }
    static now() { return fixed; }
  }
  const store = {};
  const win = {
    Date: FixedDate,
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    location: { pathname: '/portal.html', origin: 'https://tbdacademy.org' },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    // Answers school-config's start-up read with "nothing saved", so it keeps its defaults.
    supabaseClient: { from: () => ({ select: () => ({ limit: () => ({ single: async () => ({ data: null, error: { message: 'none' } }) }) }) }) },
    dataManager: {
      getAll: c => data[c] || [],
      getById: (c, id) => (data[c] || []).find(r => r.id === id) || null
    },
    authManager: { getSession: () => ({ fullName: 'Test Teacher', role: 'teacher', supabaseId: 'auth-t', userId: 'T1' }) },
    escapeHtml: v => String(v ?? '')
  };
  win.window = win;
  vm.createContext(win);
  for (const f of ['js/school-config.js', ...files]) vm.runInContext(read(f), win, { filename: f });
  return win;
}

// ── Term and session ────────────────────────────────────────
describe('Term and session follow the school calendar', () => {
  const cases = [
    ['2026-09-26T09:00:00', 'First Term', '2026/2027'],
    ['2026-11-30T09:00:00', 'First Term', '2026/2027'],
    ['2026-12-10T09:00:00', 'Second Term', '2026/2027'],
    ['2027-02-15T09:00:00', 'Second Term', '2026/2027'],
    ['2027-05-20T09:00:00', 'Third Term', '2026/2027'],
    // July–August prepare the coming session. Before the fix August read
    // "2025/2026 First Term" — a term already over.
    ['2027-07-15T09:00:00', 'First Term', '2027/2028'],
    ['2027-08-20T09:00:00', 'First Term', '2027/2028']
  ];
  for (const [when, term, year] of cases) {
    it(`${when.slice(0, 10)} is ${term} ${year}`, () => {
      const w = sandbox(when);
      eq(w.schoolConfig.getCurrentTerm().name, term);
      eq(w.schoolConfig.getCurrentAcademicYear(), year);
    });
  }
  it('marks for a dated assessment with no term are filed under the term of its date', () => {
    const w = sandbox('2026-09-26T09:00:00', {}, ['js/score-book.js']);
    const june = { date: '2026-06-20', totalMarks: 60 };
    eq([w.scoreBook.termOf(june), w.scoreBook.yearOf(june), w.scoreBook.termOf({}), w.scoreBook.termOf({ term: 'Second Term', date: '2026-06-20' })],
      ['Third Term', '2025-2026', 'First Term', 'Second Term']);
  });
  // Any date, not only today: an assessment is filed under the term of its own date.
  it('a date string gives its own term and session, whatever today is', () => {
    const w = sandbox('2026-09-26T09:00:00');
    eq(cases.map(([when]) => [w.schoolConfig.termFor(when.slice(0, 10)).name, w.schoolConfig.academicYearFor(when.slice(0, 10))]),
      cases.map(([, term, year]) => [term, year]));
  });
});

// ── Grading scale ───────────────────────────────────────────
describe('Letters follow the school scale (A 90 · B 80 · C 70 · D 60 · E 50)', () => {
  const w = sandbox('2026-09-26T09:00:00', {}, ['js/score-book.js']);
  const cases = [[100, 'A'], [90, 'A'], [89.5, 'B'], [80, 'B'], [79.9, 'C'], [70, 'C'], [60, 'D'], [59.5, 'E'], [50, 'E'], [49.9, 'F'], [0, 'F']];
  for (const [pct, letter] of cases) {
    it(`${pct}% is ${letter}`, () => eq(w.scoreBook.gradeFor(pct).grade, letter));
  }
  it('schoolConfig.calculateGrade agrees: 89.5% was graded F before the fix', () => {
    eq(w.schoolConfig.calculateGrade(89.5).grade, 'B');
  });
});

// ── Mark validation ─────────────────────────────────────────
describe('Marks that cannot be saved', () => {
  const w = sandbox('2026-09-26T09:00:00', {}, ['js/score-book.js']);
  it('blank is allowed (not entered yet)', () => eq(w.scoreBook.problem('', 20), ''));
  it('within the maximum is fine', () => eq(w.scoreBook.problem('20', 20), ''));
  it('decimals are fine', () => eq(w.scoreBook.problem('17.5', 20), ''));
  it('over the maximum is refused', () => eq(w.scoreBook.problem('21', 20), 'The most is 20'));
  it('below zero is refused', () => eq(w.scoreBook.problem('-1', 20), 'Cannot be below 0'));
  it('words are refused', () => eq(w.scoreBook.problem('abc', 20), 'Numbers only'));
});

// ── Saving marks: update, never duplicate ───────────────────
describe('Saving marks updates an existing grade instead of adding one', () => {
  const grades = [{ id: 'G1', studentId: 'S1', assessmentId: 'A1', score: 12, totalMarks: 20 }];
  const w = sandbox('2026-10-05T09:00:00', { grades }, ['js/score-book.js']);
  const calls = [];
  w.dataManager.update = async (c, id, d) => { calls.push(['update', id, d]); return { id, ...d }; };
  w.dataManager.create = async (c, d) => { calls.push(['create', d]); return { id: 'new', ...d }; };

  it('corrects S1, creates S2, skips blanks and bad marks', async () => {
    const res = await w.scoreBook.save({ id: 'A1', subject: 'Mathematics', totalMarks: 20 }, [
      { studentId: 'S1', score: '15' }, { studentId: 'S2', score: '18' },
      { studentId: 'S3', score: '' }, { studentId: 'S4', score: '25' }
    ]);
    eq(res, { created: 1, updated: 1, failed: 0 });
    eq(calls.map(c => c[0]), ['update', 'create']);
    // … stamping term, session, percentage and letter on what it saves.
    const saved = calls.find(c => c[0] === 'create')[1];
    eq([saved.term, saved.academicYear, saved.percentage, saved.grade], ['First Term', '2026-2027', 90, 'A']);
  });
});

// ── Pupil figures ───────────────────────────────────────────
describe('A pupil\'s bill, payments and results', () => {
  const data = {
    feeItems: [
      { id: 'F1', student_id: 'S1', term: 'First Term', academic_year: '2026-2027', item_name: 'Tuition', amount: 28000, amount_paid: 28000 },
      { id: 'F2', student_id: 'S1', term: 'First Term', academic_year: '2026-2027', item_name: 'Textbooks', amount: 16800, amount_paid: 2000 },
      { id: 'F3', student_id: 'S1', term: 'Third Term', academic_year: '2025-2026', item_name: 'Exam', amount: 1500, amount_paid: 0 },
      { id: 'F4', student_id: 'S2', term: 'First Term', academic_year: '2026-2027', item_name: 'Tuition', amount: 99999, amount_paid: 0 }
    ],
    payments: [
      { id: 'P1', studentId: 'S1', amount: 30000, status: 'paid', paymentMethod: 'bank-deposit', paymentDate: '2026-09-12' },
      { id: 'P2', studentId: 'S1', amount: 14800, status: 'pending', paymentMethod: 'bank-deposit', paymentDate: '2026-09-26' },
      { id: 'P3', studentId: 'S1', amount: 5000, status: 'overdue', paymentMethod: 'bank-deposit', rejectionReason: 'Unreadable' }
    ],
    grades: [
      { studentId: 'S1', subject: 'Maths', score: 15, totalMarks: 20, term: 'First Term', academicYear: '2026-2027' },
      { studentId: 'S1', subject: 'Maths', score: 50, totalMarks: 60, term: 'First Term', academicYear: '2026-2027' },
      { studentId: 'S1', subject: 'English', score: 30, totalMarks: 40, term: 'First Term', academicYear: '2026-2027' },
      { studentId: 'S1', subject: 'Maths', score: 8, totalMarks: 10, term: 'Third Term', academicYear: '2025-2026' }
    ]
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/score-book.js', 'js/pupil-data.js']);
  const f = w.pupilData.fees('S1');

  it('this term: billed, paid and balance come from the same fee items', () => {
    eq(f.term, { billed: 44800, paid: 30000, balance: 14800 });
  });
  it('all terms include last term\'s unpaid exam fee', () => eq(f.all.balance, 16300));
  it('another pupil\'s bill never leaks in', () => eq(f.items.length, 3));
  it('payment states', () => {
    eq(f.payments.map(p => w.pupilData.paymentState(p).key).sort(), ['checking', 'paid', 'rejected']);
  });

  const r = w.pupilData.results('S1');
  it('results come newest term first', () => eq(r.map(x => x.term), ['First Term', 'Third Term']));
  it('a subject pools its assessments: Maths (15+50)/(20+60) = 81.3%', () => {
    eq(r[0].subjects.find(s => s.subject === 'Maths').pct, 81.3);
  });
  it('term average is the mean of subject percentages: (81.3 + 75) / 2 = 78.2 (C)', () => {
    eq([r[0].average, r[0].letter], [78.2, 'C']);
  });
});

// ── Today page ──────────────────────────────────────────────
describe('Today: this term\'s collection', () => {
  const data = {
    students: [
      { id: 'S1', name: 'A', grade: 'Nursery 2', section: 'A', status: 'active', father: { phone: '080' } },
      { id: 'S2', name: 'B', grade: 'Basic 1', section: 'A', status: 'active' },
      { id: 'S3', name: 'C', grade: 'Basic 1', section: 'A', status: 'archived' }
    ],
    feeItems: [
      { student_id: 'S1', grade: 'Nursery 2', term: 'First Term', academic_year: '2026-2027', amount: 50000, amount_paid: 50000 },
      { student_id: 'S2', grade: 'Basic 1', term: 'First Term', academic_year: '2026-2027', amount: 60000, amount_paid: 15000 },
      { student_id: 'S2', grade: 'Basic 1', term: 'Third Term', academic_year: '2025-2026', amount: 9000, amount_paid: 0 }
    ],
    payments: [{ status: 'pending', paymentMethod: 'paystack', amount: 1000 }, { status: 'pending', paymentMethod: 'bank-deposit', amount: 2000 }, { status: 'pending', amount: 3000 }],
    applications: [{ status: 'pending', grade: 'JSS 1' }], inventory: [], staff: [{}], classes: []
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/modules/admin-dashboard.js']);
  const st = w.adminDashboardModule.getStats();

  it('counts enrolled pupils only', () => eq(st.totalStudents, 2));
  it('billed, collected and owed use this term only', () => eq([st.billed, st.collected, st.outstanding], [110000, 65000, 45000]));
  it('collection rate rounds: 65000 / 110000 = 59%', () => eq(st.rate, 59));
  it('one pupil still owes', () => eq(st.owingCount, 1));
  it('transfers and Paystack claims both wait for checking; an unpaid bill does not', () => eq(st.waiting.length, 2));
  it('flags the pupil with no parent phone', () => eq(st.noPhone.map(s => s.id), ['S2']));
  it('by class level', () => eq(st.levels.map(l => [l.level, l.billed, l.collected]), [['Early Years', 50000, 50000], ['Primary', 60000, 15000]]));
});

// ── Payments to check: the preview matches the database ─────
describe('Payments to check: how a payment will be applied', () => {
  // _allocate_payment_to_fee_items: unpaid items, oldest first, any term.
  const data = {
    feeItems: [
      { id: 'F2', student_id: 'S1', item_name: 'Textbooks', amount: 16800, amount_paid: 2000, status: 'partial', created_at: '2026-09-02', term: 'First Term' },
      { id: 'F1', student_id: 'S1', item_name: 'Tuition', amount: 28000, amount_paid: 28000, status: 'paid', created_at: '2026-09-01', term: 'First Term' },
      { id: 'F0', student_id: 'S1', item_name: 'Exam', amount: 1500, amount_paid: 0, status: 'pending', created_at: '2026-04-01', term: 'Third Term' }
    ]
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/score-book.js', 'js/pupil-data.js', 'js/modules/payment-checks.js']);
  const m = w.paymentChecksModule;

  it('oldest first, skipping what is paid', () => {
    const a = m.allocation({ studentId: 'S1', amount: 10000 });
    eq(a.lines.map(l => [l.name, l.amount, l.clears]), [['Exam', 1500, true], ['Textbooks', 8500, false]]);
    // Owed 1,500 + 14,800 = 16,300; after 10,000, 6,300 is still owed.
    eq(a.remaining, 6300);
  });
  it('exact balance clears it', () => eq(m.outcome({ studentId: 'S1', amount: 16300 }).short, 'Clears balance'));
  it('more than owed is flagged, with the amount not applied', () => {
    const a = m.allocation({ studentId: 'S1', amount: 20000 });
    eq([a.unapplied, m.outcome({ studentId: 'S1', amount: 20000 }).short], [3700, 'More than owed']);
  });
  it('no bill is flagged', () => eq(m.outcome({ studentId: 'S9', amount: 100 }).short, 'No unpaid bill'));
  it('a second claim for the same pupil and amount is a possible duplicate', () => {
    const list = [{ id: 'X', studentId: 'S1', amount: 5000 }, { id: 'Y', studentId: 'S1', amount: 5000 }, { id: 'Z', studentId: 'S1', amount: 6000 }];
    eq([!!m.duplicateOf(list[0], list), !!m.duplicateOf(list[2], list)], [true, false]);
  });
});

// ── Family: paying ──────────────────────────────────────────
describe('Family pages: sending a payment', () => {
  const data = {
    payments: [
      { studentId: 'S1', term: 'First Term', status: 'paid', paymentMethod: 'bank-deposit' },
      { studentId: 'S1', term: 'First Term', status: 'overdue', paymentMethod: 'bank-deposit', rejectionReason: 'x' }
    ]
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/score-book.js', 'js/pupil-data.js', 'js/modules/family.js']);
  const f = w.familyFeesModule;
  it('each transfer in a term gets its own fee type (a rejected one does not count)', () => {
    eq(f.feeType({ id: 'S1' }, 'First Term'), 'Term fees (payment 2)');
    eq(f.feeType({ id: 'S2' }, 'First Term'), 'Term fees');
  });
  it('narration does not repeat TBD', () => {
    eq(f.narration({ name: 'Mrs Doosuur Akaa', rollNo: 'TBD/25/0142' }), 'TBD/25/0142 DOOSUUR');
    eq(f.narration({ name: 'Ada Obi', rollNo: '0142' }), 'TBD 0142 ADA');
  });
  it('the database\'s refusals become words a parent can act on', () => {
    eq(/pay at the office/.test(f.explain('FORBIDDEN:No student record is linked to this account.')), true);
    eq(/already have a transfer/.test(f.explain('PENDING:A bank deposit…')), true);
  });
});

// ── Fees & payments: one term's figures ─────────────────────
describe('Fees page: a term\'s figures always add up', () => {
  const data = {
    students: [
      { id: 'S1', name: 'A', grade: 'Nursery 2', section: 'A', status: 'active' },
      { id: 'S2', name: 'B', grade: 'Basic 1', section: 'A', status: 'active' },
      { id: 'S3', name: 'C', grade: 'Basic 1', section: 'A', status: 'active' }
    ],
    feeItems: [
      { student_id: 'S1', grade: 'Nursery 2', term: 'First Term', academic_year: '2026-2027', amount: 50000, amount_paid: 50000 },
      { student_id: 'S2', grade: 'Basic 1', term: 'First Term', academic_year: '2026/2027', amount: 60000, amount_paid: 15000 },
      { student_id: 'S2', grade: 'Basic 1', term: 'Third Term', academic_year: '2025-2026', amount: 9000, amount_paid: 0 }
    ],
    payments: [
      { studentId: 'S1', amount: 50000, status: 'paid', paymentMethod: 'bank-deposit', term: 'First Term', academicYear: '2026-2027' },
      { studentId: 'S2', amount: 5000, status: 'paid', paymentMethod: 'bulk-assign', term: 'First Term', academicYear: '2026-2027' }
    ]
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/score-book.js', 'js/pupil-data.js', 'js/modules/fees-payments.js']);
  const m = w.feesPaymentsModule;
  m.period = m.currentPeriod();
  const f = m.figures();
  it('billed = collected + still owed', () => eq([f.billed, f.collected, f.owed, f.billed - f.collected - f.owed], [110000, 65000, 45000, 0]));
  it('a session written 2026/2027 is the same session as 2026-2027', () => eq(f.items.length, 2));
  it('last term\'s unpaid line stays out of this term but counts across all terms', () => eq(f.allBalance.get('S2'), 54000));
  it('the pupil with no bill is listed as not billed', () => eq(f.notBilled.map(s => s.id), ['S3']));
  it('a charge the old bulk-assign saved as paid is flagged, and not counted as money received', () => {
    eq([f.fakeCharges.length, f.received], [1, 50000]);
  });
});

describe('Billing a term adds only what is missing', () => {
  const run = async (existing, grade, opts) => {
    const w = sandbox('2026-09-26T09:00:00', {}, ['js/fee-structure.js', 'js/fee-manager.js']);
    const inserted = [], deleted = [];
    w.supabaseClient = {
      from: () => ({
        select: () => { const q = { eq: () => q, then: (r) => r({ data: existing, error: null }) }; return q; },
        insert: (rows) => { inserted.push(...rows); return { select: async () => ({ data: rows, error: null }) }; },
        delete: () => ({ in: async (_, ids) => { deleted.push(...ids); return { error: null }; } })
      })
    };
    const r = await w.feeManager.applyFeeStructure('S1', grade, opts);
    return { r, inserted, deleted, w };
  };

  it('a pupil with nothing billed gets every line, with the term and session', async () => {
    const { inserted, w } = await run([], 'Nursery 2', {});
    eq(inserted.length, w.feeStructure.getFeeItems('Nursery 2').length);
    eq([inserted[0].term, inserted[0].academic_year, inserted[0].amount_paid], ['First Term', '2026-2027', 0]);
  });
  it('a pupil already billed in full gets nothing — running it twice is harmless', async () => {
    const w0 = sandbox('2026-09-26T09:00:00', {}, ['js/fee-structure.js']);
    const have = w0.feeStructure.getFeeItems('Nursery 2').map((i, k) => ({ id: 'L' + k, item_id: i.id, item_name: i.name }));
    const { r, inserted, deleted } = await run(have, 'Nursery 2', {});
    eq([r.added, r.alreadyBilled, inserted.length, deleted.length], [0, true, 0, 0]);
  });
  it('a pupil missing one line gets only that line; nothing is deleted', async () => {
    const w0 = sandbox('2026-09-26T09:00:00', {}, ['js/fee-structure.js']);
    const have = w0.feeStructure.getFeeItems('Nursery 2').slice(1).map((i, k) => ({ id: 'L' + k, item_id: i.id, item_name: i.name }));
    const { inserted, deleted } = await run(have, 'Nursery 2', {});
    eq([inserted.length, deleted.length], [1, 0]);
  });
  it('a new admission also owes the one-off uniform set', async () => {
    const { inserted, w } = await run([], 'Nursery 2', { admission: true });
    eq(inserted.length, w.feeStructure.getFeeItems('Nursery 2', 'new').length);
    eq(inserted.some(i => i.item_id === 'uniform_set'), true);
  });
  it('a class change removes only untouched old-class lines; paid ones stay', async () => {
    const lines = [
      { id: 'OLD_UNPAID', grade: 'Nursery 2', amount_paid: 0 },
      { id: 'OLD_PAID', grade: 'Nursery 2', amount_paid: 5000 }
    ];
    const { deleted } = await run(lines, 'Basic 1', { gradeChange: true });
    eq(deleted, ['OLD_UNPAID']);
  });
});

// ── Report cards ────────────────────────────────────────────
describe('Report cards: averages, positions and class figures', () => {
  const T = 'First Term', Y = '2026/2027';
  const g = (sid, subject, score, total, term = T, year = Y) => ({ studentId: sid, subject, score, totalMarks: total, term, academicYear: year });
  const students = ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, name: id, grade: 'JSS 1', section: 'A', status: 'active' }));
  const data = {
    students,
    grades: [
      // A: Maths (18+54)/(20+60) = 90, English 40/50 = 80 → 85
      g('A', 'Maths', 18, 20), g('A', 'Maths', 54, 60), g('A', 'English', 40, 50),
      // B: Maths 45/50 = 90, English 80/100 = 80 → 85 (ties with A)
      g('B', 'Maths', 45, 50), g('B', 'English', 80, 100),
      // C: Maths 30/100 = 30, English 20/50 = 40 → 35
      g('C', 'Maths', 30, 100), g('C', 'English', 20, 50),
      // D: 60/100 → 60
      g('D', 'Maths', 60, 100),
      // E: marks only for last term — no result this term
      g('E', 'Maths', 99, 100, 'Third Term', '2025-2026')
    ]
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/score-book.js', 'js/pupil-data.js']);
  const cr = w.pupilData.classResults(students, T, '2026-2027');
  const pos = Object.fromEntries(cr.rows.map(r => [r.student.id, r.position]));

  it('marks are weighed by what each test is out of, not averaged raw', () => {
    eq(cr.rows.find(r => r.student.id === 'A').result.subjects.find(s => s.subject === 'Maths').pct, 90);
  });
  it('equal averages share a place and the next is skipped: 1, 1, 3, 4', () => eq([pos.A, pos.B, pos.D, pos.C], [1, 1, 3, 4]));
  it('a pupil with no marks this term has no position and is not counted', () => eq([pos.E, cr.ranked], [null, 4]));
  it('class average is the mean of pupil averages: (85 + 85 + 35 + 60) / 4 = 66.3', () => eq(cr.average, 66.3));
  it('highest, lowest, and passed at 50%', () => eq([cr.highest, cr.lowest, cr.passed], [85, 35, 3]));
  it('subject figures: Maths average (90 + 90 + 30 + 60) / 4 = 67.5, highest 90', () => {
    const m = cr.subjects.get('Maths');
    eq([m.average, m.highest, m.lowest], [67.5, 90, 30]);
  });
  it('a session written 2026/2027 matches 2026-2027', () => eq(w.pupilData.termResult('A', T, '2026/2027').average, 85));
  it('ordinals', () => eq([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(w.pupilData.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']));
});

// ── Staff ───────────────────────────────────────────────────
describe('Staff: who counts as a teacher', () => {
  const data = {
    staff: [
      { id: 'A', name: 'Typed teacher', type: 'teaching', status: 'active' },
      // create-account's row: portal role in `role`, no type
      { id: 'B', name: 'Login teacher', role: 'teacher', authId: 'x', status: 'active' },
      { id: 'C', name: 'Login staff', role: 'staff', authId: 'y', status: 'active' },
      { id: 'D', name: 'Bursar', role: 'Bursar', type: 'non-teaching', status: 'active' },
      { id: 'E', name: 'Head', role: 'Head teacher', type: 'admin', status: 'active' },
      { id: 'F', name: 'Left', type: 'teaching', status: 'inactive' }
    ]
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/modules/staff-management.js']);
  vm.runInContext(read('js/components.js').match(/function isTeachingStaff[\s\S]*?\n}/)[0] + '\nwindow.isTeachingStaff = isTeachingStaff;', w);
  const m = w.staffManagementModule;
  const f = m.figures();

  it('a teacher added with a login (role teacher, no type) is a teacher', () => eq(w.isTeachingStaff(data.staff[1]), true));
  it('a stated type wins over the job title ("Head teacher", admin)', () => eq(w.isTeachingStaff(data.staff[4]), false));
  it('active counts leave out people who have left', () => eq([f.active.length, f.teaching, f.other, f.inactive], [5, 2, 3, 1]));
  it('the portal role is not shown as a job', () => eq(data.staff.slice(0, 3).map(s => m.jobTitle(s)), ['', 'Teacher', '']));
  it('people without a login are counted', () => eq(f.noLogin, 3));
});

// ── Inventory ───────────────────────────────────────────────
describe('Inventory: stock, value and low stock', () => {
  const data = {
    inventory: [
      { id: 'I1', name: 'Markers', quantity: 40, allocated: 10, minStock: 30, unitCost: 500 },   // 30 in store = min → low
      { id: 'I2', name: 'Chairs', quantity: 20, allocated: 20, minStock: 0, unitCost: 12000 },   // none in store → out
      { id: 'I3', name: 'Globes', quantity: 5, allocated: 0, min_stock: 2, unit_price: 8000 },   // older price field
      { id: 'I4', name: 'Balls', quantity: '8', allocated: null, minStock: 0, unitCost: '1500.50' }
    ],
    inventoryAssignments: [
      { id: 'A1', status: 'active', expectedReturnDate: '2026-09-25' },
      { id: 'A2', status: 'active', expectedReturnDate: '2026-09-26' },
      { id: 'A3', status: 'returned', expectedReturnDate: '2026-01-01' }
    ]
  };
  const w = sandbox('2026-09-26T09:00:00', data, ['js/modules/inventory.js']);
  const m = w.inventoryModule;
  const f = m.figures();
  const [I1, I2, I3, I4] = data.inventory;

  it('in store = held - on loan; empty fields count as 0', () => eq([I1, I2, I3, I4].map(i => m.inStore(i)), [30, 0, 5, 8]));
  it('value = held × unit cost, loaned items included, older unit_price read', () => eq([I1, I2, I3, I4].map(i => m.value(i)), [20000, 240000, 40000, 12004]));
  it('stock value is the sum', () => eq(f.value, 312004));
  it('low = none in store, or at/below a minimum above 0', () => eq(f.low.map(i => i.id), ['I1', 'I2']));
  it('overdue = past the due day, not on it; returned loans never overdue', () => eq(f.overdue.map(a => a.id), ['A1']));
  it('receiving stock averages the unit cost by quantity: 10 @ 500 + 30 @ 700 = 650', () => eq(m.averageCost(10, 500, 30, 700), 650));
  it('receiving into an empty item takes the new cost', () => eq(m.averageCost(0, 500, 12, 800), 800));
  it('a returned loan leaves "on loan"; only a lost one leaves the stock held', () => {
    eq([m.returnEffect(I1, 4, 'good'), m.returnEffect(I1, 4, 'lost')], [{ allocated: 6, quantity: 40 }, { allocated: 6, quantity: 36 }]);
  });
  it('CSV cells keep commas and quotes inside quotes', () => {
    eq(m.parseCSV('name,unit\r\n"Pens, blue","box ""A"""\n\nRulers,pcs'), [['name', 'unit'], ['Pens, blue', 'box "A"'], ['Rulers', 'pcs']]);
  });
});

// ── Calendar ────────────────────────────────────────────────
describe('Calendar: either table shape, local days', () => {
  const w = sandbox('2026-09-26T09:00:00', {}, ['js/calendar-events.js']);
  const c = w.calendarEvents;

  it('the first shape (start_date timestamptz, type)', () => {
    eq(c.normalise({ id: 1, title: 'Resumption', start_date: '2026-09-14T00:00:00+00:00', end_date: '2026-09-14T00:00:00+00:00', type: 'academic' }),
      { id: 1, title: 'Resumption', description: '', start: '2026-09-14', end: '2026-09-14', type: 'academic', createdBy: null });
  });
  it('the 0003 shape (event_date date, event_type)', () => {
    const e = c.normalise({ id: 2, title: 'Mid-term', event_date: '2026-10-29', end_date: '2026-10-31', event_type: 'holiday' });
    eq([e.start, e.end, e.type], ['2026-10-29', '2026-10-31', 'holiday']);
  });
  it('a missing or earlier end date means a one-day event', () => {
    eq([c.normalise({ event_date: '2026-10-05' }).end, c.normalise({ event_date: '2026-10-05', end_date: '2026-10-01' }).end], ['2026-10-05', '2026-10-05']);
  });
  it('day keys are local and plain dates pass through unchanged', () => {
    eq([c.dayKey('2026-09-15'), c.dayKey(new Date(2026, 8, 15)), c.fromKey('2026-09-15').getDate()], ['2026-09-15', '2026-09-15', 15]);
  });
  it('between() keeps events touching the range (including ones under way), then writes in the shape it read', async () => {
    w.supabaseClient = { from: () => ({ select: async () => ({ data: [
      { id: 'a', title: 'Old', event_date: '2026-09-01', end_date: '2026-09-02' },
      { id: 'b', title: 'Running', event_date: '2026-09-20', end_date: '2026-09-28' },
      { id: 'c', title: 'Soon', event_date: '2026-10-05' },
      { id: 'd', title: 'Later', event_date: '2026-11-20' }
    ], error: null }) }) };
    eq((await c.between('2026-09-26', '2026-10-10')).map(e => e.id), ['b', 'c']);
    // Having read 0003-shaped rows, a new event is written in that shape.
    let sent;
    w.supabaseClient.from = () => ({ insert: (rows) => { sent = rows[0]; return { select: () => ({ single: async () => ({ data: { id: 'n', ...rows[0] }, error: null }) }) }; } });
    await c.create({ title: 'Exams', start: '2026-11-23', end: '2026-11-27', type: 'exam' });
    eq([sent.event_date, sent.event_type, sent.end_date, 'start_date' in sent], ['2026-11-23', 'exam', '2026-11-27', false]);
  });
});

describe('Calendar: an unknown table shape is found on the first write', () => {
  const w = sandbox('2026-09-26T09:00:00', {}, ['js/calendar-events.js']);
  it('retries with event_date when start_date does not exist', async () => {
    const tried = [];
    w.supabaseClient = { from: () => ({ insert: (rows) => ({ select: () => ({ single: async () => {
      tried.push('start_date' in rows[0] ? 'start' : 'event');
      return 'start_date' in rows[0]
        ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'start_date' column" } }
        : { data: { id: 'x', ...rows[0] }, error: null };
    } }) }) }) };
    const e = await w.calendarEvents.create({ title: 'PTA', start: '2026-10-10', end: '2026-10-10', type: 'meeting' });
    eq([tried, e.start], [['start', 'event'], '2026-10-10']);
  });
});

// ── Assignments ─────────────────────────────────────────────
describe('Assignments: per-pupil rows grouped into one assignment', () => {
  const students = [
    { id: 'P1', name: 'Ada', grade: 'Basic 2', section: 'B', status: 'active' },
    { id: 'P2', name: 'Bem', grade: 'Basic 2', section: 'B', status: 'active' },
    { id: 'P3', name: 'Chi', grade: 'Basic 2', section: 'A', status: 'active' }
  ];
  const row = (id, sid, extra = {}) => ({ id, studentId: sid, title: 'Fractions', subjectName: 'Mathematics', type: 'assignment', dueDate: '2026-10-02', totalMarks: 20, status: 'pending', ...extra });
  const rows = [
    row('r1', 'P1', { status: 'graded', score: 18 }),       // 90%
    row('r2', 'P2', { status: 'submitted' }),
    row('r3', 'P3'),                                         // other arm → its own assignment
    row('r4', 'P1', { title: 'Spelling', subjectName: 'English Studies', totalMarks: 10 })
  ];
  const w = sandbox('2026-09-26T09:00:00', { students, studentAssignments: rows }, ['js/score-book.js', 'js/pupil-data.js', 'js/modules/teacher-tasks.js']);
  const m = w.teacherTasksModule;
  const sets = m.sets();
  const b2 = sets.find(s => s.title === 'Fractions' && s.section === 'B');

  it('one assignment per class, title, subject, kind, due date and marks', () => eq(sets.length, 3));
  it('counts: handed in includes marked; marked needs a mark', () => eq([b2.pupils, b2.handedIn, b2.marked], [2, 2, 1]));
  it('average is of marked pupils only: 18/20 = 90%', () => eq(b2.average, 90));
  it('grades use the school scale (no A+): 18/20 → A, 11/20 → E, 9/20 → F', () => eq([m.gradeFor(18, 20), m.gradeFor(11, 20), m.gradeFor(9, 20)], ['A', 'E', 'F']));
  it('a mark saves the pupil as marked, with the grade', () => {
    const c = m.markChange(rows[1], true, '15', 20);
    eq([c.score, c.grade, c.status], [15, 'C', 'graded']); // 75%
  });
  it('an unchanged mark saves nothing', () => eq(m.markChange(rows[0], true, '18', 20), null));
  it('a mark above the total is refused', () => eq(m.markChange(rows[1], true, '21', 20), { error: true }));
  it('clearing a mark and unticking sends the pupil back to "not handed in"', () => {
    const c = m.markChange(rows[0], false, '', 20);
    eq([c.status, c.score, c.grade], ['pending', null, null]);
  });
  it('a pupil who joined later gets a row only once there is something to record', () => {
    eq([m.markChange(null, false, '', 20), m.markChange(null, true, '', 20).status], [null, 'submitted']);
  });
});

// ── Pupil timetable and tasks ───────────────────────────────
describe('Pupil timetable: from the class timetable', () => {
  const kid = { id: 'K', name: 'Kid', grade: 'Basic 2', section: 'B' };
  const data = {
    schoolSchedules: [
      { day: 'monday', grade: 'Basic 2', section: 'B', subject: 'English', start_time: '09:00:00', end_time: '09:40:00', type: 'class' },
      { day: 'Monday', grade: 'Basic 2', section: 'B', subject: 'Maths', start_time: '08:00', end_time: '08:40', type: 'class' },
      { day: 'Monday', grade: 'Basic 2', subject: 'Assembly', start_time: '07:45', end_time: '08:00' },          // whole year group
      { day: 'Monday', grade: 'Basic 2', section: 'A', subject: 'Other arm', start_time: '08:00' },
      { day: 'Monday', grade: 'Basic 2', section: 'B', subject: 'Dropped', start_time: '10:00', status: 'inactive' },
      { day: 'Saturday', grade: 'Basic 2', section: 'B', subject: 'Weekend', start_time: '10:00' }
    ],
    studentSchedules: [{ student_id: 'K', day: 'Tuesday', subject: 'Own row', start_time: '08:00' }]
  };
  const w = sandbox('2026-09-28T08:20:00', data, ['js/score-book.js', 'js/pupil-data.js']);
  const week = w.pupilData.timetable(kid);
  it('Monday: whole-group and own-arm lessons, in time order, whatever the day\'s case', () => eq(week.Monday.map(l => l.subject), ['Assembly', 'Maths', 'English']));
  it('times are trimmed to hours and minutes', () => eq([week.Monday[2].start, week.Monday[2].end], ['09:00', '09:40']));
  it('a pupil\'s own rows are ignored when the class has a timetable', () => eq(week.Tuesday.length, 0));
  it('today\'s lessons (a Monday) are the same list', () => eq(w.pupilData.lessonsToday(kid).length, 3));
  it('with no class timetable, the pupil\'s own rows are used', () => {
    const w2 = sandbox('2026-09-28T08:20:00', { schoolSchedules: [], studentSchedules: data.studentSchedules }, ['js/score-book.js', 'js/pupil-data.js']);
    eq(w2.pupilData.timetable(kid).Tuesday.map(l => l.subject), ['Own row']);
  });
});

describe('Pupil tasks: what state each task is in', () => {
  const w = sandbox('2026-09-28T09:00:00', {}, ['js/modules/student-tasks.js']);
  const s = (t) => w.myTasksModule.stateOf(t, '2026-09-28');
  it('not handed in, due today → to do', () => eq(s({ status: 'pending', dueDate: '2026-09-28' }), 'todo'));
  it('not handed in, due yesterday → late', () => eq(s({ status: 'pending', dueDate: '2026-09-27' }), 'late'));
  it('handed in after the due date is not late', () => eq(s({ status: 'submitted', dueDate: '2026-09-01' }), 'handed'));
  it('marked needs a mark', () => eq([s({ status: 'graded', score: 7 }), s({ status: 'graded', score: null })], ['marked', 'handed']));
  it('a mark of 0 is still a mark', () => eq(s({ status: 'graded', score: 0 }), 'marked'));
});

// ── Users & access ──────────────────────────────────────────
describe('Users & access: logins are counted apart from records', () => {
  const w = sandbox('2026-09-26T09:00:00', {
    students: [
      { id: 'P1', name: 'Has login', authId: 'auth-p1', status: 'active' },
      { id: 'P2', name: 'No login', status: 'active' },
      { id: 'P3', name: 'Left', status: 'inactive' }
    ],
    staff: [{ id: 'S1', name: 'Bursar', authId: 'auth-s1', role: 'Bursar', type: 'non-teaching', status: 'active' }]
  }, ['js/modules/user-management.js']);
  w.isTeachingStaff = (s) => s.type === 'teaching';
  w.dataManager.waitForReady = async () => {};
  const m = w.userManagementModule;
  m._users = [
    { id: 'TBD/STU/1', authId: 'auth-p1', fullName: 'Has login', role: 'student', status: 'active', lastLogin: '2026-09-01' },
    { id: 'TBD/STF/1', authId: 'auth-s1', fullName: 'Bursar', email: 'b@x.org', role: 'staff', status: 'active', lastLogin: null },
    { id: 'TBD/ADM/1', authId: 'auth-a', fullName: 'Admin', role: 'admin', status: 'suspended', lastLogin: '2026-01-01' }
  ];
  it('a record linked to a login by auth_id is not listed again as "no login"; figures count logins apart', async () => {
    await m._mergeDirectoryData();
    eq(m._users.filter(u => u._source === 'directory').map(u => u.id), ['P2', 'P3']);
    // Then the figures: logins, signed in, never signed in, suspended, active records with no login.
    const f = m.figures();
    eq([f.accounts, f.signedIn, f.neverSignedIn, f.suspended, f.noLogin], [3, 1, 1, 1, 1]);
  });
});

// ── Label tidying ───────────────────────────────────────────
describe('Older pages lose leading emoji, not words', () => {
  const src = read('js/portal-shell.js');
  const re = eval(src.match(/const LEADING_EMOJI = (\/.*\/u);/)[1]);
  const cases = [['💰 Fees & Payments', 'Fees & Payments'], ['👨‍👩‍👧 Child', 'Child'], ['🗑️ Void', 'Void'], ['Record 2025', 'Record 2025'], ['₦5,000', '₦5,000'], ['© TBD', '© TBD']];
  for (const [input, out] of cases) it(`"${input}" → "${out}"`, () => eq(input.replace(re, ''), out));
});

// Report once every async test has settled.
Promise.all(pending).then(() => {
  console.log(`\n${'─'.repeat(50)}\n  \x1b[32m✓ Passed: ${passed}\x1b[0m${failed ? `\n  \x1b[31m✗ Failed: ${failed}\x1b[0m` : ''}\n${'─'.repeat(50)}`);
  if (failed) process.exit(1);
});
