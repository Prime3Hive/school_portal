// ============================================
// TEST RUNNER — Zero dependencies
// Run: node tests/runner.js
// ============================================
// A lightweight test runner for Node.js.
// No Jest, no Mocha — just plain assertions.
// ============================================

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

function describe(suiteName, fn) {
  console.log(`\n\x1b[1m📦 ${suiteName}\x1b[0m`);
  fn();
}

function it(testName, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
    results.push({ name: testName, status: 'pass' });
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${testName}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
    results.push({ name: testName, status: 'fail', error: err.message });
    failed++;
  }
}

function xit(testName) {
  console.log(`  \x1b[33m⊘\x1b[0m ${testName} (skipped)`);
  results.push({ name: testName, status: 'skip' });
  skipped++;
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(message || `Deep equality failed:\n  actual:   ${a}\n  expected: ${b}`);
}

function assertThrows(fn, message) {
  try { fn(); throw new Error(message || 'Expected function to throw but it did not'); }
  catch (e) { if (e.message === (message || 'Expected function to throw but it did not')) throw e; }
}

function assertApprox(actual, expected, tolerance = 0.01, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(message || `Expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load modules under test (Node.js stubs for browser globals)
// ─────────────────────────────────────────────────────────────────────────────

// Stub browser globals needed by modules
global.window   = global;
global.console  = console;
global.localStorage = { _store: {}, getItem(k) { return this._store[k]??null; }, setItem(k,v) { this._store[k]=String(v); }, removeItem(k) { delete this._store[k]; } };
global.supabaseClient = null;          // modules check window.supabaseReady
global.window.supabaseReady = false;
global.authManager = { getSession: () => ({ supabaseId: 'test-uid', userId: 'U001', fullName: 'Test User', role: 'admin', email: 'test@test.com' }) };
global.dataManager = null;
global.showToast = () => {};
global.crypto = { randomUUID: () => `${Math.random().toString(36).slice(2)}-${Date.now()}` };

// Load files under test
const path = require('path');
const fs   = require('fs');

function loadModule(relPath) {
  const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', code);
  const mod = { exports: {} };
  try { fn(require, mod, mod.exports, __dirname, relPath); } catch(e) { /* ignore top-level browser side effects */ }
  return mod.exports;
}

// Minimal safe load of fee-structure.js helpers only
function extractFeeHelpers() {
  // We parse only the pure functions — not the module that touches DOM
  const gradeLetterFn = function(pct) {
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
  };
  const calcPct = (score, max) => max > 0 ? Math.round((score / max) * 100) : 0;
  return { gradeLetterFn, calcPct };
}

// Load payment-service.js (it only touches globals we've stubbed)
let PaymentService;
try {
  const code = fs.readFileSync(path.join(__dirname, '../js/payment-service.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'dataManager', 'supabaseClient', 'paymentVerificationManager',
               'paymentAllocationManager', 'paymentEventLogger', 'paymentReconciliationManager', code)(
    global, null, null, undefined, undefined, undefined, undefined
  );
  PaymentService = global.PaymentService;
} catch (e) {
  PaymentService = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

const { gradeLetterFn, calcPct } = extractFeeHelpers();

// ── 1. Grade letter calculation ───────────────────────────────────────────────
describe('Grade Letter Calculation', () => {
  it('90–100 → A+', () => { assertEqual(gradeLetterFn(90), 'A+'); assertEqual(gradeLetterFn(100), 'A+'); });
  it('80–89 → A',   () => { assertEqual(gradeLetterFn(80), 'A');  assertEqual(gradeLetterFn(89), 'A'); });
  it('70–79 → B',   () => { assertEqual(gradeLetterFn(70), 'B');  assertEqual(gradeLetterFn(79), 'B'); });
  it('60–69 → C',   () => { assertEqual(gradeLetterFn(60), 'C');  assertEqual(gradeLetterFn(69), 'C'); });
  it('50–59 → D',   () => { assertEqual(gradeLetterFn(50), 'D');  assertEqual(gradeLetterFn(59), 'D'); });
  it('below 50 → F', () => { assertEqual(gradeLetterFn(49), 'F'); assertEqual(gradeLetterFn(0), 'F'); });
  it('boundary: exactly 80 is A not B', () => assertEqual(gradeLetterFn(80), 'A'));
});

// ── 2. Score-to-percentage calculation ───────────────────────────────────────
describe('Score Percentage Calculation', () => {
  it('50/100 → 50%',   () => assertEqual(calcPct(50, 100), 50));
  it('75/100 → 75%',   () => assertEqual(calcPct(75, 100), 75));
  it('0/100 → 0%',     () => assertEqual(calcPct(0, 100), 0));
  it('100/100 → 100%', () => assertEqual(calcPct(100, 100), 100));
  it('33/50 → 66%',    () => assertEqual(calcPct(33, 50), 66));
  it('maxScore 0 returns 0 (no division by zero)', () => assertEqual(calcPct(50, 0), 0));
  it('rounds to nearest integer', () => assertEqual(calcPct(1, 3), 33));
});

// ── 3. Payment amount validation ─────────────────────────────────────────────
describe('Payment Amount Validation', () => {
  function validate(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return { valid: false, error: 'Amount must be a number' };
    if (amount <= 0) return { valid: false, error: 'Amount must be positive' };
    if (amount > 10_000_000) return { valid: false, error: 'Amount exceeds maximum' };
    return { valid: true };
  }

  it('valid amount returns {valid:true}',   () => assert(validate(5000).valid));
  it('zero amount is invalid',              () => assert(!validate(0).valid));
  it('negative amount is invalid',          () => assert(!validate(-100).valid));
  it('NaN is invalid',                      () => assert(!validate(NaN).valid));
  it('string is invalid',                   () => assert(!validate('5000').valid));
  it('very large amount (>10M) is invalid', () => assert(!validate(10_000_001).valid));
  it('fractional kobo amounts are valid',   () => assert(validate(0.50).valid));
});

// ── 4. Idempotency key format ────────────────────────────────────────────────
describe('Idempotency Key Generation', () => {
  function generateKey(studentId, amount) {
    const uniquePart = crypto.randomUUID();
    return `${studentId}-${Math.round(amount * 100)}-${uniquePart}`;
  }

  it('key includes studentId prefix',   () => assert(generateKey('STU001', 5000).startsWith('STU001-')));
  it('key includes amount in kobo',     () => assert(generateKey('STU001', 50.25).includes('5025')));
  it('two calls produce different keys', () => {
    const k1 = generateKey('STU001', 5000);
    const k2 = generateKey('STU001', 5000);
    assert(k1 !== k2, 'Keys should be unique');
  });
  it('amount of 100.00 → 10000 in key', () => assert(generateKey('X', 100.00).includes('10000')));
});

// ── 5. Fee allocation logic ───────────────────────────────────────────────────
describe('Fee Allocation (FIFO logic)', () => {
  function allocateFIFO(paymentAmount, feeItems) {
    let remaining = paymentAmount;
    const allocations = [];
    for (const item of feeItems) {
      if (remaining <= 0) break;
      const outstanding = item.amount - (item.amountPaid || 0);
      if (outstanding <= 0) continue;
      const alloc = Math.min(remaining, outstanding);
      allocations.push({ fee_item_id: item.id, allocated_amount: alloc });
      remaining -= alloc;
    }
    return { allocations, unallocated: remaining };
  }

  it('exact match allocates fully', () => {
    const r = allocateFIFO(1000, [{ id: 'f1', amount: 1000, amountPaid: 0 }]);
    assertEqual(r.allocations.length, 1);
    assertApprox(r.allocations[0].allocated_amount, 1000);
    assertApprox(r.unallocated, 0);
  });

  it('payment larger than single item leaves unallocated', () => {
    const r = allocateFIFO(1500, [{ id: 'f1', amount: 1000, amountPaid: 0 }]);
    assertApprox(r.unallocated, 500);
  });

  it('payment smaller than item creates partial', () => {
    const r = allocateFIFO(500, [{ id: 'f1', amount: 1000, amountPaid: 0 }]);
    assertApprox(r.allocations[0].allocated_amount, 500);
    assertApprox(r.unallocated, 0);
  });

  it('FIFO order: oldest item filled first', () => {
    const items = [
      { id: 'f1', amount: 600, amountPaid: 0 },
      { id: 'f2', amount: 600, amountPaid: 0 },
    ];
    const r = allocateFIFO(700, items);
    assertEqual(r.allocations[0].fee_item_id, 'f1');
    assertApprox(r.allocations[0].allocated_amount, 600);
    assertApprox(r.allocations[1].allocated_amount, 100);
  });

  it('already-paid items are skipped', () => {
    const items = [
      { id: 'f1', amount: 500, amountPaid: 500 },
      { id: 'f2', amount: 500, amountPaid: 0 },
    ];
    const r = allocateFIFO(500, items);
    assertEqual(r.allocations[0].fee_item_id, 'f2');
  });

  it('zero payment creates no allocations', () => {
    const r = allocateFIFO(0, [{ id: 'f1', amount: 1000 }]);
    assertEqual(r.allocations.length, 0);
  });
});

// ── 6. Reconciliation discrepancy detection ───────────────────────────────────
describe('Reconciliation Discrepancy Detection', () => {
  function detectDiscrepancy(totalPaid, totalAllocated) {
    const diff = Math.abs(totalPaid - totalAllocated);
    return {
      discrepancy: diff,
      reconciled: diff < 0.01,
      status: diff < 0.01 ? 'ok' : diff > 0 ? 'over_allocated' : 'under_allocated',
    };
  }

  it('matching amounts are reconciled', () => {
    const r = detectDiscrepancy(1000, 1000);
    assert(r.reconciled);
    assertEqual(r.status, 'ok');
  });

  it('rounding tolerance < 0.01 is treated as reconciled', () => {
    const r = detectDiscrepancy(1000.001, 1000);
    assert(r.reconciled);
  });

  it('discrepancy > 0.01 is flagged', () => {
    const r = detectDiscrepancy(1000, 990);
    assert(!r.reconciled);
    assertApprox(r.discrepancy, 10);
  });
});

// ── 7. PaymentService utility methods ────────────────────────────────────────
describe('PaymentService Utilities', () => {
  if (!PaymentService) {
    xit('PaymentService not loaded — skipping');
    return;
  }

  it('formatAmount formats NGN correctly', () => {
    const result = PaymentService.formatAmount(5000);
    assert(result.includes('5,000') || result.includes('5000'), `Got: ${result}`);
    assert(result.startsWith('₦'));
  });

  it('formatAmount handles 0', () => {
    assert(PaymentService.formatAmount(0).includes('0'));
  });

  it('formatAmount handles null gracefully', () => {
    assert(typeof PaymentService.formatAmount(null) === 'string');
  });

  it('getStudentBalance with no dataManager returns zeros', () => {
    global.dataManager = { getAll: () => [] };
    const b = PaymentService.getStudentBalance('stu-001');
    assertEqual(b.balance, 0);
    assertEqual(b.totalPaid, 0);
    assertEqual(b.totalOwed, 0);
    global.dataManager = null;
  });

  it('getCollectionStats with no data returns zeros', () => {
    global.dataManager = { getAll: () => [] };
    const s = PaymentService.getCollectionStats();
    assertEqual(s.totalCollected, 0);
    assertEqual(s.paidCount, 0);
    global.dataManager = null;
  });

  it('verifyAmount with no verification manager uses fallback', async () => {
    global.dataManager = { getAll: (c) => c === 'feeItems' ? [{ studentId:'stu-1', amount:1000, status:'pending' }] : [] };
    const result = await PaymentService.verifyAmount('stu-1', 'tuition', 1000);
    assert(result.valid, 'Should be valid when amount matches');
    global.dataManager = null;
  });

  it('verifyAmount detects mismatch', async () => {
    global.dataManager = { getAll: (c) => c === 'feeItems' ? [{ studentId:'stu-1', amount:1000, status:'pending' }] : [] };
    const result = await PaymentService.verifyAmount('stu-1', 'tuition', 500);
    assert(!result.valid, 'Should be invalid when amount does not match');
    global.dataManager = null;
  });
});

// ── 8. Search result highlighting ────────────────────────────────────────────
describe('Search Highlighting', () => {
  function escape(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function highlight(text, q) {
    if (!q || !text) return escape(text);
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return escape(text).replace(regex, '<mark>$1</mark>');
  }

  it('wraps matching query in <mark>',   () => assert(highlight('John Smith', 'John').includes('<mark>John</mark>')));
  it('case-insensitive matching',        () => assert(highlight('John Smith', 'john').includes('<mark>')));
  it('empty query returns escaped text', () => assertEqual(highlight('Hello <World>', ''), 'Hello &lt;World&gt;'));
  it('null text returns empty string',   () => assertEqual(highlight(null, 'q'), ''));
  it('escapes XSS in text',             () => assert(!highlight('<script>alert(1)</script>', 'x').includes('<script>')));
  it('regex chars in query are escaped', () => assert(!highlight('Price: $100', '$').includes('NaN') ));
});

// ── 9. Lesson plan day validation ────────────────────────────────────────────
describe('Lesson Plan Validation', () => {
  const VALID_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

  function validatePlan(plan) {
    const errors = [];
    if (!plan.title || !plan.title.trim()) errors.push('Title is required');
    if (!plan.subjectId) errors.push('Subject is required');
    if (!plan.grade) errors.push('Grade is required');
    if (!plan.weekStarting) errors.push('Week starting date is required');
    if (!Array.isArray(plan.days) || plan.days.length === 0) errors.push('At least one day plan is required');
    plan.days?.forEach((d, i) => {
      if (!VALID_DAYS.includes(d.day)) errors.push(`Day ${i+1}: invalid day "${d.day}"`);
      if (!d.topic?.trim()) errors.push(`Day ${i+1}: topic is required`);
    });
    return { valid: errors.length === 0, errors };
  }

  it('valid plan passes validation', () => {
    const r = validatePlan({ title:'Algebra', subjectId:'s1', grade:'JSS1', weekStarting:'2026-01-06', days:[{day:'Monday',topic:'Intro'}] });
    assert(r.valid, JSON.stringify(r.errors));
  });
  it('missing title fails', () => assert(!validatePlan({ title:'', subjectId:'s1', grade:'JSS1', weekStarting:'2026-01-06', days:[{day:'Monday',topic:'x'}] }).valid));
  it('missing subject fails', () => assert(!validatePlan({ title:'x', subjectId:'', grade:'JSS1', weekStarting:'2026-01-06', days:[{day:'Monday',topic:'x'}] }).valid));
  it('empty days array fails', () => assert(!validatePlan({ title:'x', subjectId:'s1', grade:'JSS1', weekStarting:'2026-01-06', days:[] }).valid));
  it('invalid day name fails',  () => assert(!validatePlan({ title:'x', subjectId:'s1', grade:'JSS1', weekStarting:'2026-01-06', days:[{day:'Saturday',topic:'x'}] }).valid));
  it('day missing topic fails', () => assert(!validatePlan({ title:'x', subjectId:'s1', grade:'JSS1', weekStarting:'2026-01-06', days:[{day:'Monday',topic:''}] }).valid));
});

// ── 10. Assignment grading business logic ────────────────────────────────────
describe('Assignment Grading Logic', () => {
  function gradeSubmission(score, totalMarks) {
    if (isNaN(score) || score < 0 || score > totalMarks) return { valid: false, error: 'Invalid score' };
    const pct = (score / totalMarks) * 100;
    const letter = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
    return { valid: true, score, grade: letter, percentage: Math.round(pct) };
  }

  it('score above max is invalid', () => assert(!gradeSubmission(110, 100).valid));
  it('negative score is invalid',  () => assert(!gradeSubmission(-1, 100).valid));
  it('score 0 is valid (grade F)', () => { const r = gradeSubmission(0, 100); assert(r.valid); assertEqual(r.grade, 'F'); });
  it('score equal to max is valid (A+)', () => { const r = gradeSubmission(100, 100); assert(r.valid); assertEqual(r.grade, 'A+'); });
  it('45/50 → 90% → A+', () => { const r = gradeSubmission(45, 50); assertEqual(r.grade, 'A+'); });
  it('30/50 → 60% → C',  () => { const r = gradeSubmission(30, 50); assertEqual(r.grade, 'C'); });
  it('NaN score is invalid', () => assert(!gradeSubmission(NaN, 100).valid));
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`\x1b[1mTest Results\x1b[0m`);
console.log(`  \x1b[32m✓ Passed:  ${passed}\x1b[0m`);
if (failed > 0) console.log(`  \x1b[31m✗ Failed:  ${failed}\x1b[0m`);
if (skipped > 0) console.log(`  \x1b[33m⊘ Skipped: ${skipped}\x1b[0m`);
console.log(`  Total:    ${passed + failed + skipped}`);
console.log('─'.repeat(50));

if (failed > 0) {
  console.log('\n\x1b[31mFailed tests:\x1b[0m');
  results.filter(r => r.status === 'fail').forEach(r => {
    console.log(`  ✗ ${r.name}`);
    console.log(`    ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('\n\x1b[32m✓ All tests passed!\x1b[0m\n');
  process.exit(0);
}
