// ============================================
// FEE STRUCTURE CONFIGURATION
// TBD International Academy - 2025/2026 Academic Session
// ============================================

const feeStructure = {
  academicYear: '2025-2026',
  
  // Fee items breakdown by grade
  feeItems: {
    'Creche': [
      { id: 'tuition', name: 'Tuition Fees', amount: 10000, type: 'monthly', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 3800, type: 'once', required: true },
      { id: 'sweater', name: 'Sweater', amount: 2600, type: 'once', required: true },
      { id: 'casual_wear', name: 'Casual Wear', amount: 2800, type: 'once', required: true },
      { id: 'sportswear', name: 'Sportswear', amount: 2800, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true }
    ],
    'Pre-nursery': [
      { id: 'tuition', name: 'Tuition Fees', amount: 22000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 20550, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 7500, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 2000, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Nursery 1': [
      { id: 'tuition', name: 'Tuition Fees', amount: 28000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 20550, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 16800, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 3500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Nursery 2': [
      { id: 'tuition', name: 'Tuition Fees', amount: 28000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 20550, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 16800, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 3500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Nursery 3': [
      { id: 'tuition', name: 'Tuition Fees', amount: 28000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 20550, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 16800, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 3500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Basic 1': [
      { id: 'tuition', name: 'Tuition Fees', amount: 30000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 25000, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 17000, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 4500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Basic 2': [
      { id: 'tuition', name: 'Tuition Fees', amount: 30000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 25000, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 17000, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 4500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Basic 3': [
      { id: 'tuition', name: 'Tuition Fees', amount: 30000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 25000, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 17000, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 4500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Basic 4': [
      { id: 'tuition', name: 'Tuition Fees', amount: 35000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 25500, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 17800, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 5500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Basic 5': [
      { id: 'tuition', name: 'Tuition Fees', amount: 35000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 25500, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 17800, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 5500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'Basic 6': [
      { id: 'tuition', name: 'Tuition Fees', amount: 35000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 25500, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 17800, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 5500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 1500, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 1500, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1000, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'JSS 1': [
      { id: 'tuition', name: 'Tuition Fees', amount: 40000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 26000, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 15000, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 6500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 2000, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 2000, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1500, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'JSS 2': [
      { id: 'tuition', name: 'Tuition Fees', amount: 40000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 26000, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 15000, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 6500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 2000, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 2000, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1500, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
    ],
    'JSS 3': [
      { id: 'tuition', name: 'Tuition Fees', amount: 40000, type: 'once', required: true },
      { id: 'uniforms', name: 'Uniforms (2 pairs daily uniform)', amount: 26000, type: 'once', required: true },
      { id: 'textbooks', name: 'Textbooks', amount: 15000, type: 'once', required: true },
      { id: 'exercise_books', name: 'Exercise Books', amount: 6500, type: 'once', required: true },
      { id: 'exam_fees', name: 'Exam Fees', amount: 2000, type: 'once', required: true },
      { id: 'ict', name: 'ICT', amount: 2000, type: 'once', required: true },
      { id: 'natality_assurance', name: 'Natality Assurance', amount: 1500, type: 'once', required: true },
      { id: 'first_aid', name: 'First Aid', amount: 1000, type: 'once', required: true }
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

  getFeeItems(grade) {
    const normalizedGrade = this.normalizeGrade(grade);
    return this.feeItems[normalizedGrade] || [];
  },

  getTotalFees(grade) {
    const items = this.getFeeItems(grade);
    return items.reduce((total, item) => total + item.amount, 0);
  },

  getAdditionalItems(grade) {
    const normalizedGrade = this.normalizeGrade(grade);
    if (normalizedGrade === 'Creche') {
      return this.additionalItems.creche;
    }
    return this.additionalItems.preNurToBasic;
  },

  calculateFeeBreakdown(grade) {
    const items = this.getFeeItems(grade);
    const total = this.getTotalFees(grade);
    
    return {
      grade: this.normalizeGrade(grade),
      items: items.map(item => ({...item})),
      total,
      additionalItems: this.getAdditionalItems(grade),
      academicYear: this.academicYear
    };
  },

  // Load admin-saved fee structure overrides from Supabase school_settings
  async loadFromSupabase() {
    // Skip load on pages that have no fee UI (login, public pages)
    const path = window.location.pathname;
    if (path.includes('login.html') || path.includes('public-blog.html') ||
        path.includes('about.html') || path.includes('admissions.html') ||
        path.includes('contact.html') || path.includes('academics.html')) {
      return;
    }

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
            this.feeItems[grade] = items;
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
