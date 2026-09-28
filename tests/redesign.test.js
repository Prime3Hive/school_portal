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
