// ============================================
// FEE STRUCTURE CONFIGURATION
// TBD International Academy - 2026/2027 Academic Session
//
// Transcribed from the school's two published sheets:
//   SCHOOL FEES FOR NEW INTAKE.docx
//   SCHOOL FEES FOR RETURNING STUDENTS 2026-2027.docx
// ============================================

/**
 * True for the public marketing site, where no portal machinery should run.
 *
 * This used to be a list of pathname.includes() checks against filenames.
 * Two things broke it: the public pages are also served at clean URLs with
 * no filename (/about), and the homepage is now the bare root. Matching
 * both forms plus "/" is what makes the guard actually hold.
 */
function isPublicPath(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/index.html') return true;
  return /^\/(about|academics|admissions|contact|login|verify-invitation)(\.html)?$/.test(p);
}

const feeStructure = {
  academicYear: '2026-2027',

  // ── Billing cadence ────────────────────────────────────────────────
  // Every amount below is what a student owes for ONE TERM. The structure is
  // applied at the start of each term (admin → Fees & Payments → Assign Fees),
  // which writes a fresh set of fee_items rows for that term. There is no
  // monthly billing anywhere in the school.
  //
  // This matters because `item.type` used to carry the value 'monthly' on one
  // item while nothing in the app read the field, so the label was free to
  // disagree with the maths without anyone noticing. Totals are per-term sums;
  // see getTotalFees() / getSessionFees().
  billingCycle: 'per-term',
  termsPerSession: 3,

  // Fee items breakdown by grade — amounts are PER TERM
  feeItems: {
    'Creche': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 30000, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Pre-nursery': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 22000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount:  7500, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  2000, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Nursery 1': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 28000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 16800, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  3500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Nursery 2': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 28000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 16800, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  3500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Nursery 3': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 28000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 16800, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  3500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Basic 1': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 30000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 17000, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  4500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Basic 2': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 30000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 17000, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  4500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Basic 3': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 30000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 17000, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  4500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Basic 4': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 35000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 17800, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  5500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Basic 5': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 35000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 17800, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  5500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'Basic 6': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 35000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 17800, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  5500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  1500, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  1500, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1000, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'JSS 1': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 40000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 18000, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  6500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  2000, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  2000, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1500, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'JSS 2': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 40000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 18000, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  6500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  2000, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  2000, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1500, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ],
    'JSS 3': [
      { id: 'tuition',            name: 'Tuition Fees',          amount: 40000, type: 'once', required: true },
      { id: 'textbooks',          name: 'Textbooks',             amount: 18000, type: 'once', required: true },
      { id: 'exercise_books',     name: 'Exercise Books',        amount:  6500, type: 'once', required: true },
      { id: 'exam_fees',          name: 'Exam Fees',             amount:  2000, type: 'once', required: true },
      { id: 'ict',                name: 'ICT',                   amount:  2000, type: 'once', required: true },
      { id: 'quality_assurance',  name: 'Quality Assurance',     amount:  1500, type: 'once', required: true },
      { id: 'first_aid',          name: 'First Aid',             amount:  1000, type: 'once', required: true },
      { id: 'christmas_carol',    name: 'Christmas Carol',       amount:  2000, type: 'once', required: true },
      { id: 'pta',                name: 'PTA',                   amount:   500, type: 'once', required: true }
    ]
  },

  /**
   * Charged ONCE, when a pupil is first admitted — never again.
   *
   * The school publishes two sheets, "new intake" and "returning learners".
   * The only difference between them is this uniform set, so it lives here
   * rather than duplicating fourteen grades of identical rows.
   *
   * Pass enrolment: 'new' to getFeeItems / calculateFeeBreakdown to include it.
   * Do NOT include it when re-assigning fees in a pupil's second or third
   * term: the base items above repeat every term, this one does not.
   */
  newIntakeItems: {
    'Creche': [],
    'Pre-nursery': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 20550, type: 'once', required: true, oncePerAdmission: true }
    ],
    'Nursery 1': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 20550, type: 'once', required: true, oncePerAdmission: true }
    ],
    'Nursery 2': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 20550, type: 'once', required: true, oncePerAdmission: true }
    ],
    'Nursery 3': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 20550, type: 'once', required: true, oncePerAdmission: true }
    ],
    'Basic 1': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 26800, type: 'once', required: true, oncePerAdmission: true }   // PROVISIONAL — see note above
    ],
    'Basic 2': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 26800, type: 'once', required: true, oncePerAdmission: true }   // PROVISIONAL — see note above
    ],
    'Basic 3': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 26800, type: 'once', required: true, oncePerAdmission: true }   // PROVISIONAL — see note above
    ],
    'Basic 4': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 25500, type: 'once', required: true, oncePerAdmission: true }
    ],
    'Basic 5': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 25500, type: 'once', required: true, oncePerAdmission: true }
    ],
    'Basic 6': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 25500, type: 'once', required: true, oncePerAdmission: true }
    ],
    'JSS 1': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 26000, type: 'once', required: true, oncePerAdmission: true }
    ],
    'JSS 2': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 26000, type: 'once', required: true, oncePerAdmission: true }
    ],
    'JSS 3': [
      { id: 'uniform_set', name: 'Uniform, Sportswear, T-shirt & Cardigan', amount: 26000, type: 'once', required: true, oncePerAdmission: true }
    ]
  },

  // Grade aliases for flexibility
  gradeAliases: {
    'Creche': ['Creche', 'creche', 'CRECHE'],
    'Pre-nursery': ['Pre-nursery', 'pre-nursery', 'PRE-NURSERY', 'Pre Nursery'],
    'Nursery 1': ['Nursery 1', 'nursery 1', 'NUR.1-3', 'Nur 1'],
    'Nursery 2': ['Nursery 2', 'nursery 2', 'Nur 2'],
    'Nursery 3': ['Nursery 3', 'nursery 3', 'Nur 3'],
    'Basic 1': ['Basic 1', 'basic 1', 'BASIC 1-3', 'Primary 1', 'Grade 1'],
    'Basic 2': ['Basic 2', 'basic 2', 'Primary 2', 'Grade 2'],
    'Basic 3': ['Basic 3', 'basic 3', 'Primary 3', 'Grade 3'],
    'Basic 4': ['Basic 4', 'basic 4', 'BASIC 4-6', 'Primary 4', 'Grade 4'],
    'Basic 5': ['Basic 5', 'basic 5', 'Primary 5', 'Grade 5'],
    'Basic 6': ['Basic 6', 'basic 6', 'Primary 6', 'Grade 6'],
    'JSS 1': ['JSS 1', 'jss 1', 'JSSI-3', 'JSS1', 'Junior Secondary 1'],
    'JSS 2': ['JSS 2', 'jss 2', 'JSS2', 'Junior Secondary 2'],
    'JSS 3': ['JSS 3', 'jss 3', 'JSS3', 'Junior Secondary 3']
  },

  // Additional items required for all students
  additionalItems: {
    creche: [
      'One medium size of Izal',
      '3 diapers per day',
      'Wipes',
      'An extra cloth',
      'Food & water',
      '500 grams detergent',
      'Jumbo size tissue paper'
    ],
    preNurToBasic: [
      '1 jumbo size tissue paper',
      '1 litre of Jik',
      '500 grams detergent'
    ]
  },

  // Bank details
  bankDetails: {
    name: 'Keystone Bank',
    accountName: 'TBD International Academy',
    accountNumber: '1013525760'
  },

  // Helper methods
  normalizeGrade(grade) {
    if (!grade) return null;
    const gradeStr = grade.toString().trim();
    
    for (const [canonical, aliases] of Object.entries(this.gradeAliases)) {
      if (aliases.some(alias => alias.toLowerCase() === gradeStr.toLowerCase())) {
        return canonical;
      }
    }
    return gradeStr;
  },

  /**
   * Items to bill for one term.
   *
   * `enrolment` is 'returning' (the default, and what every existing pupil is)
   * or 'new'. A new pupil additionally owes the uniform set, once, in the term
   * they are admitted — pass 'returning' for their second term onwards or they
   * will be charged for it again.
   */
  getFeeItems(grade, enrolment = 'returning') {
    const normalizedGrade = this.normalizeGrade(grade);
    const base = this.feeItems[normalizedGrade] || [];
    if (enrolment !== 'new') return base;
    return base.concat(this.newIntakeItems[normalizedGrade] || []);
  },

  /**
   * Total owed for ONE TERM. A plain sum is correct: the structure is applied
   * afresh each term, so multiplying here would bill the same item twice.
   */
  getTotalFees(grade, enrolment = 'returning') {
    const items = this.getFeeItems(grade, enrolment);
    return items.reduce((total, item) => total + item.amount, 0);
  },

  /**
   * What the same grade costs across a full session.
   *
   * The recurring items repeat each term; the new-intake uniform does not, so
   * it is added once rather than multiplied.
   */
  getSessionFees(grade, enrolment = 'returning') {
    const recurring = this.getTotalFees(grade) * this.termsPerSession;
    if (enrolment !== 'new') return recurring;
    const normalizedGrade = this.normalizeGrade(grade);
    const once = (this.newIntakeItems[normalizedGrade] || [])
      .reduce((total, item) => total + item.amount, 0);
    return recurring + once;
  },

  /**
   * Coerce a fee item's cadence label to something true.
   *
   * The admin editor once offered Once / Termly / Monthly and nothing read the
   * answer, so a saved override can still carry 'monthly' — a label that would
   * be a lie about a per-term structure. Normalising on the way in stops old
   * saved data reintroducing it.
   */
  normalizeItemType(type) {
    return type === 'monthly' || type === 'termly' ? 'once' : (type || 'once');
  },

  getAdditionalItems(grade) {
    const normalizedGrade = this.normalizeGrade(grade);
    if (normalizedGrade === 'Creche') {
      return this.additionalItems.creche;
    }
    return this.additionalItems.preNurToBasic;
  },

  calculateFeeBreakdown(grade, enrolment = 'returning') {
    const items = this.getFeeItems(grade, enrolment);
    const total = this.getTotalFees(grade, enrolment);

    return {
      grade: this.normalizeGrade(grade),
      enrolment,
      items: items.map(item => ({ ...item, type: this.normalizeItemType(item.type) })),
      // `total` is per term. Kept under its original name because call sites
      // (fee-manager, the modules) already treat it as the amount to bill now.
      total,
      perTermTotal: total,
      termsPerSession: this.termsPerSession,
      sessionTotal: this.getSessionFees(grade, enrolment),
      billingCycle: this.billingCycle,
      additionalItems: this.getAdditionalItems(grade),
      academicYear: this.academicYear
    };
  },

  // Load admin-saved fee structure overrides from Supabase school_settings
  async loadFromSupabase() {
    // Skip load on pages that have no fee UI (login, public pages)
    if (isPublicPath(window.location.pathname)) return;

    try {
      if (!window.supabaseClient) return;
      const { data, error } = await window.supabaseClient
        .from('school_settings')
        .select('settings_json')
        .limit(1)
        .maybeSingle(); // maybeSingle() returns null (not error) when 0 rows exist
      if (error || !data?.settings_json) return;
      const parsed = typeof data.settings_json === 'string'
        ? JSON.parse(data.settings_json)
        : data.settings_json;
      if (!parsed?.feeStructure) return;
      const saved = parsed.feeStructure;
      if (saved.feeItems && typeof saved.feeItems === 'object') {
        // Replace (not merge) the grades present in saved data, preserving defaults
        // for any grades the admin has not overridden.
        for (const [grade, items] of Object.entries(saved.feeItems)) {
          if (Array.isArray(items) && items.length > 0) {
            this.feeItems[grade] = items.map(item => ({
              ...item,
              type: this.normalizeItemType(item.type)
            }));
          }
        }
        console.log('[FeeStructure] Loaded admin overrides from Supabase');
      }
      if (saved.academicYear) this.academicYear = saved.academicYear;
    } catch (e) {
      console.warn('[FeeStructure] Could not load from Supabase, using defaults:', e);
    }
  }
};

window.feeStructure = feeStructure;

// Capture built-in defaults before any Supabase overrides are applied
feeStructure._builtInFeeItems = JSON.parse(JSON.stringify(feeStructure.feeItems));

// Auto-load saved overrides once Supabase is available
(function tryLoad() {
  if (window.supabaseClient) {
    feeStructure.loadFromSupabase();
  } else {
    document.addEventListener('supabase-ready', () => feeStructure.loadFromSupabase(), { once: true });
    // Fallback: retry after a short delay in case supabase-ready never fires
    setTimeout(() => {
      if (window.supabaseClient) feeStructure.loadFromSupabase();
    }, 2000);
  }
})();
