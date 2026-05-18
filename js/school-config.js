// ============================================
// SCHOOL CONFIGURATION - TBD ACADEMY
// ============================================

const schoolConfig = {
    // School Information
    name: 'TBD Academy',
    location: 'Makurdi, Benue State',
    country: 'Nigeria',
    currency: 'NGN',
    currencySymbol: '₦',

    // Contact Information
    email: 'info@tbdacademy.edu.ng',
    phone: '+234 XXX XXX XXXX',
    website: 'www.tbdacademy.edu.ng',

    // Academic Structure — TBD International Academy (synced with fee structure)
    // Grade names match feeStructure keys exactly — do NOT change without updating fee-structure.js
    grades: {
        earlyYears: [
            { name: 'Creche',       code: 'Creche',       level: 'Early Years', sections: ['A'], ageRange: '0-2 years' },
            { name: 'Pre-nursery',  code: 'Pre-nursery',  level: 'Early Years', sections: ['A', 'B'], ageRange: '2-3 years' },
            { name: 'Nursery 1',    code: 'Nursery 1',    level: 'Early Years', sections: ['A', 'B'], ageRange: '3-4 years' },
            { name: 'Nursery 2',    code: 'Nursery 2',    level: 'Early Years', sections: ['A', 'B'], ageRange: '4-5 years' },
            { name: 'Nursery 3',    code: 'Nursery 3',    level: 'Early Years', sections: ['A', 'B'], ageRange: '5-6 years' }
        ],
        primary: [
            { name: 'Basic 1', code: 'Basic 1', level: 'Primary', sections: ['A', 'B', 'C'], ageRange: '6-7 years' },
            { name: 'Basic 2', code: 'Basic 2', level: 'Primary', sections: ['A', 'B', 'C'], ageRange: '7-8 years' },
            { name: 'Basic 3', code: 'Basic 3', level: 'Primary', sections: ['A', 'B', 'C'], ageRange: '8-9 years' },
            { name: 'Basic 4', code: 'Basic 4', level: 'Primary', sections: ['A', 'B', 'C'], ageRange: '9-10 years' },
            { name: 'Basic 5', code: 'Basic 5', level: 'Primary', sections: ['A', 'B', 'C'], ageRange: '10-11 years' },
            { name: 'Basic 6', code: 'Basic 6', level: 'Primary', sections: ['A', 'B', 'C'], ageRange: '11-12 years' }
        ],
        secondary: [
            { name: 'JSS 1', code: 'JSS 1', level: 'Junior Secondary', sections: ['A', 'B'], ageRange: '12-13 years' },
            { name: 'JSS 2', code: 'JSS 2', level: 'Junior Secondary', sections: ['A', 'B'], ageRange: '13-14 years' },
            { name: 'JSS 3', code: 'JSS 3', level: 'Junior Secondary', sections: ['A', 'B'], ageRange: '14-15 years' }
        ]
    },

    // Academic Year Structure
    academicYear: {
        duration: 9, // months
        terms: [
            {
                name: 'First Term',
                code: 'TERM1',
                duration: 3, // months
                months: ['September', 'October', 'November'],
                startMonth: 9,
                endMonth: 11
            },
            {
                name: 'Second Term',
                code: 'TERM2',
                duration: 3, // months
                months: ['January', 'February', 'March'],
                startMonth: 1,
                endMonth: 3
            },
            {
                name: 'Third Term',
                code: 'TERM3',
                duration: 3, // months
                months: ['April', 'May', 'June'],
                startMonth: 4,
                endMonth: 6
            }
        ],
        holidays: [
            { name: 'Christmas Break', months: ['December'] },
            { name: 'Mid-Year Break', months: ['July', 'August'] }
        ]
    },

    // Promotion & Assessment Rules
    promotion: {
        // Minimum average required for promotion
        minimumAverage: 50, // percentage

        // Grading system
        gradingScale: [
            { grade: 'A', min: 90, max: 100, remark: 'Excellent', points: 5 },
            { grade: 'B', min: 80, max: 89, remark: 'Very Good', points: 4 },
            { grade: 'C', min: 70, max: 79, remark: 'Good', points: 3 },
            { grade: 'D', min: 60, max: 69, remark: 'Fair', points: 2 },
            { grade: 'E', min: 50, max: 59, remark: 'Pass', points: 1 },
            { grade: 'F', min: 0, max: 49, remark: 'Fail', points: 0 }
        ],

        // Promotion criteria
        criteria: {
            // Must pass at least this many core subjects
            minimumCoreSubjectsPassed: 3,

            // Core subjects that must be considered
            coreSubjects: ['Mathematics', 'English', 'Science'],

            // Maximum number of failed subjects allowed for promotion
            maxFailedSubjects: 2,

        },

        // Promotion outcomes
        outcomes: {
            promoted: 'Promoted to next class',
            repeat: 'Repeat current class',
            conditional: 'Conditional promotion (summer classes required)'
        }
    },

    // Subject Structure by Level
    subjects: {
        nursery: [
            'Literacy',
            'Numeracy',
            'Creative Arts',
            'Physical Education',
            'Social Skills'
        ],
        primary: [
            'Mathematics',
            'English Language',
            'Basic Science',
            'Basic Technology',
            'Social Studies',
            'Christian Religious Studies',
            'Physical & Health Education',
            'Creative Arts',
            'Hausa Language',
            'Computer Studies'
        ],
        secondary: [
            'Mathematics',
            'English Language',
            'Basic Science',
            'Basic Technology',
            'Social Studies',
            'Christian Religious Studies',
            'Physical & Health Education',
            'Creative Arts',
            'Hausa Language',
            'Computer Studies',
            'Business Studies',
            'Home Economics',
            'Agricultural Science'
        ]
    },

    // Fee Structure Template
    feeStructure: {
        nursery: {
            tuition: 150000, // per term
            development: 20000, // per term
            uniform: 15000, // once per year
            books: 10000, // once per year
            pta: 5000, // per term
            total: 185000 // per term (excluding one-time fees)
        },
        primary: {
            tuition: 180000,
            development: 25000,
            uniform: 18000,
            books: 15000,
            pta: 5000,
            exam: 8000,
            total: 218000
        },
        secondary: {
            tuition: 220000,
            development: 30000,
            uniform: 20000,
            books: 20000,
            pta: 5000,
            exam: 10000,
            lab: 15000,
            total: 285000
        }
    },

    // Helper Methods
    getCurrentTerm() {
        const month = new Date().getMonth() + 1; // 1-12

        for (const term of this.academicYear.terms) {
            if (month >= term.startMonth && month <= term.endMonth) {
                return term;
            }
        }

        // If not in any term, return upcoming term
        if (month === 12) return this.academicYear.terms[1]; // Second term
        if (month >= 7 && month <= 8) return this.academicYear.terms[0]; // First term

        return this.academicYear.terms[0];
    },

    getCurrentAcademicYear() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        // Academic year starts in September
        if (month >= 9) {
            return `${year}/${year + 1}`;
        } else {
            return `${year - 1}/${year}`;
        }
    },

    getAllGrades() {
        return [
            ...this.grades.earlyYears,
            ...this.grades.primary,
            ...this.grades.secondary
        ];
    },

    getGradeByCode(code) {
        return this.getAllGrades().find(g => g.code === code || g.name === code) || null;
    },

    // Get flat array of all grade names (canonical, matching feeStructure keys)
    getGradeCodes() {
        return this.getAllGrades().map(g => g.name);
    },

    // Get flat array of term names (e.g. ['First Term', 'Second Term', 'Third Term'])
    getTermNames() {
        return this.academicYear.terms.map(t => t.name);
    },

    // Generate <option> HTML for grade selects. selectedGrade = currently selected grade name.
    gradeOptionsHTML(selectedGrade = '', placeholder = 'Select Grade') {
        let html = `<option value="">${placeholder}</option>`;
        const levels = [
            { label: 'Early Years', items: this.grades.earlyYears },
            { label: 'Primary', items: this.grades.primary },
            { label: 'Junior Secondary', items: this.grades.secondary }
        ];
        for (const level of levels) {
            html += `<optgroup label="${level.label}">`;
            for (const g of level.items) {
                const sel = g.name === selectedGrade ? ' selected' : '';
                html += `<option value="${g.name}"${sel}>${g.name}</option>`;
            }
            html += `</optgroup>`;
        }
        return html;
    },

    // Generate <option> HTML for term selects. selectedTerm = currently selected term name.
    termOptionsHTML(selectedTerm = '', placeholder = '') {
        let html = placeholder ? `<option value="">${placeholder}</option>` : '';
        for (const t of this.academicYear.terms) {
            const sel = t.name === selectedTerm ? ' selected' : '';
            html += `<option value="${t.name}"${sel}>${t.name}</option>`;
        }
        return html;
    },

    // Generate <option> HTML for section selects based on grade code
    sectionOptionsHTML(gradeCode, selectedSection = '') {
        const grade = this.getGradeByCode(gradeCode);
        if (!grade) return '<option value="">Select grade first</option>';
        let html = '<option value="">Select Section</option>';
        for (const s of grade.sections) {
            const sel = s === selectedSection ? ' selected' : '';
            html += `<option value="${s}"${sel}>${s}</option>`;
        }
        return html;
    },

    getNextGrade(currentCode) {
        const allGrades = this.getAllGrades();
        const currentIndex = allGrades.findIndex(g => g.code === currentCode);

        if (currentIndex === -1 || currentIndex === allGrades.length - 1) {
            return null; // No next grade (graduated)
        }

        return allGrades[currentIndex + 1];
    },

    getSubjectsForLevel(level) {
        if (level === 'Early Years' || level === 'Pre-Primary') return this.subjects.nursery;
        if (level === 'Primary') return this.subjects.primary;
        if (level === 'Junior Secondary' || level === 'Secondary') return this.subjects.secondary;
        return [];
    },

    calculateGrade(percentage) {
        for (const scale of this.promotion.gradingScale) {
            if (percentage >= scale.min && percentage <= scale.max) {
                return scale;
            }
        }
        return this.promotion.gradingScale[this.promotion.gradingScale.length - 1]; // F
    },

    determinePromotion(studentGrades) {
        // Calculate average
        const total = studentGrades.reduce((sum, g) => sum + g.percentage, 0);
        const average = total / studentGrades.length;

        // Check average
        if (average < this.promotion.minimumAverage) {
            return {
                outcome: this.promotion.outcomes.repeat,
                reason: `Average (${average.toFixed(1)}%) below minimum requirement (${this.promotion.minimumAverage}%)`
            };
        }

        // Check core subjects
        const coreSubjectGrades = studentGrades.filter(g =>
            this.promotion.criteria.coreSubjects.includes(g.subject)
        );

        const passedCoreSubjects = coreSubjectGrades.filter(g => g.percentage >= 50).length;

        if (passedCoreSubjects < this.promotion.criteria.minimumCoreSubjectsPassed) {
            return {
                outcome: this.promotion.outcomes.repeat,
                reason: `Only ${passedCoreSubjects} core subjects passed (minimum: ${this.promotion.criteria.minimumCoreSubjectsPassed})`
            };
        }

        // Check failed subjects
        const failedSubjects = studentGrades.filter(g => g.percentage < 50).length;

        if (failedSubjects > this.promotion.criteria.maxFailedSubjects) {
            return {
                outcome: this.promotion.outcomes.conditional,
                reason: `${failedSubjects} subjects failed (maximum allowed: ${this.promotion.criteria.maxFailedSubjects})`
            };
        }

        // All criteria met
        return {
            outcome: this.promotion.outcomes.promoted,
            reason: `Average: ${average.toFixed(1)}%`
        };
    },

    // Load saved config from Supabase (overrides defaults with admin edits)
    async loadFromSupabase() {
        try {
            if (!window.supabaseClient) return;
            const { data, error } = await window.supabaseClient
                .from('school_settings').select('settings_json').limit(1).single();
            if (error || !data?.settings_json) return;
            const parsed = typeof data.settings_json === 'string' ? JSON.parse(data.settings_json) : data.settings_json;

            // Read school info saved by settingsModule (stored at top level of settings_json)
            if (parsed.schoolName)    this.name     = parsed.schoolName;
            if (parsed.schoolAddress) this.location = parsed.schoolAddress;
            if (parsed.schoolEmail)   this.email    = parsed.schoolEmail;
            if (parsed.schoolPhone)   this.phone    = parsed.schoolPhone;
            if (parsed.currency)      this.currency = parsed.currency;

            // Update sidebar DOM if already rendered
            const nameEl = document.getElementById('sidebar-school-name');
            const locEl  = document.getElementById('sidebar-school-location');
            if (nameEl && parsed.schoolName)    nameEl.textContent = parsed.schoolName;
            if (locEl  && parsed.schoolAddress) locEl.textContent  = parsed.schoolAddress;
            if (parsed.schoolName) document.title = parsed.schoolName + ' - School Management Portal';

            // Read structural schoolConfig overrides (saved by class-schedule module)
            if (parsed.schoolConfig) {
                const v = parsed.schoolConfig;
                if (v.grades) {
                    if (Array.isArray(v.grades.earlyYears)) this.grades.earlyYears = v.grades.earlyYears;
                    if (Array.isArray(v.grades.primary)) this.grades.primary = v.grades.primary;
                    if (Array.isArray(v.grades.secondary)) this.grades.secondary = v.grades.secondary;
                }
                if (Array.isArray(v.terms)) this.academicYear.terms = v.terms;
                if (v.subjects) Object.assign(this.subjects, v.subjects);
                if (v.feeStructure) Object.assign(this.feeStructure, v.feeStructure);
            }

            console.log('[SchoolConfig] Loaded saved config from Supabase');
        } catch (e) {
            console.warn('[SchoolConfig] Could not load from Supabase, using defaults:', e);
        }
    }
};

// Make available globally
window.schoolConfig = schoolConfig;

// ── Convenience constant — single source of truth for all modules ──
// Modules should reference CURRENT_ACADEMIC_YEAR instead of hardcoding '2025-2026'
const CURRENT_ACADEMIC_YEAR = schoolConfig.getCurrentAcademicYear().replace('/', '-');
window.CURRENT_ACADEMIC_YEAR = CURRENT_ACADEMIC_YEAR;

// Auto-load saved config when Supabase is ready
(async () => {
    const waitForSupabase = () => new Promise(resolve => {
        if (window.supabaseClient) return resolve();
        const iv = setInterval(() => { if (window.supabaseClient) { clearInterval(iv); resolve(); } }, 100);
        setTimeout(() => { clearInterval(iv); resolve(); }, 5000);
    });
    await waitForSupabase();
    await schoolConfig.loadFromSupabase();
})();
