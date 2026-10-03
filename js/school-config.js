// ============================================
// SCHOOL CONFIGURATION - TBD INTERNATIONAL ACADEMY
// Motto: "Planting Seeds of Knowledge"
// ============================================

const schoolConfig = {
    // School Information
    name: 'TBD International Academy',
    shortName: 'TBD Academy',
    motto: 'Planting Seeds of Knowledge',
    crest: 'assets/logo-mark.svg',      // shield only — nav bars, favicons
    logo: 'assets/logo.svg',            // full lockup with wordmark + motto ribbon
    brandColors: { navy: '#1E2A5A', red: '#E23C3C' },
    location: 'Behind Civil Service Commission, Kertyo, Makurdi',
    country: 'Nigeria',
    currency: 'NGN',
    currencySymbol: '₦',

    // Contact Information
    email: 'support@tbdacademy.org',
    phone: '0707 171 1692',
    website: 'tbdacademy.org',

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
    /** A date's month (1-12). Accepts a Date, "YYYY-MM-DD" or nothing (today). */
    _monthOf(date) {
        if (typeof date === 'string' && /^\d{4}-\d{2}/.test(date)) return Number(date.slice(5, 7));
        const d = date ? new Date(date) : new Date();
        return (isNaN(d) ? new Date() : d).getMonth() + 1;
    },

    _yearOf(date) {
        if (typeof date === 'string' && /^\d{4}-\d{2}/.test(date)) return Number(date.slice(0, 4));
        const d = date ? new Date(date) : new Date();
        return (isNaN(d) ? new Date() : d).getFullYear();
    },

    /** The term a date falls in. December counts with the Second Term, July–August with the First. */
    termFor(date) {
        const month = this._monthOf(date);
        for (const term of this.academicYear.terms) {
            if (month >= term.startMonth && month <= term.endMonth) return term;
        }
        if (month === 12) return this.academicYear.terms[1];
        return this.academicYear.terms[0]; // July–August: the coming First Term
    },

    /**
     * The session a date belongs to, as "2026/2027". It turns over in July.
     * Lessons start in September, but July–August are spent preparing the
     * coming session and termFor() already treats them as its First Term;
     * turning over in September paired that First Term with the finished
     * session, so August showed (and billed) "2025/2026 First Term".
     */
    academicYearFor(date) {
        const year = this._yearOf(date);
        return this._monthOf(date) >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
    },

    getCurrentTerm() {
        return this.termFor();
    },

    getCurrentAcademicYear() {
        return this.academicYearFor();
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

    // Levels are the three carried by the grade entries above. 'Pre-Primary'
    // used to be accepted here as a fourth name; no grade in this file has
    // ever had that level, and the school does not run a class by that name.
    getSubjectsForLevel(level) {
        if (level === 'Early Years') return this.subjects.nursery;
        if (level === 'Primary') return this.subjects.primary;
        if (level === 'Junior Secondary') return this.subjects.secondary;
        return [];
    },

    calculateGrade(percentage) {
        // The highest band whose minimum is reached. Testing both ends of the
        // whole-number ranges (80–89, 90–100) left 89.5% in no band, and it
        // fell through to F.
        const bands = [...this.promotion.gradingScale].sort((a, b) => b.min - a.min);
        return bands.find(b => percentage >= b.min) || bands[bands.length - 1];
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

            // Read school info saved by settingsModule (stored at top level of settings_json).
            // A saved value still equal to a superseded default was never really
            // customised, so upgrade it rather than let the old brand win.
            const upgrade = window.upgradeLegacySchoolValue || ((f, v) => v);
            const savedName    = parsed.schoolName    ? upgrade('schoolName', parsed.schoolName)       : null;
            const savedAddress = parsed.schoolAddress ? upgrade('schoolAddress', parsed.schoolAddress) : null;

            if (savedName)          this.name     = savedName;
            if (savedAddress)       this.location = savedAddress;
            if (parsed.schoolEmail) this.email    = parsed.schoolEmail;
            if (parsed.schoolPhone) this.phone    = parsed.schoolPhone;
            if (parsed.currency)    this.currency = parsed.currency;

            // Update sidebar DOM if already rendered
            const nameEl = document.getElementById('sidebar-school-name');
            const locEl  = document.getElementById('sidebar-school-location');
            if (nameEl && savedName)    nameEl.textContent = savedName;
            if (locEl  && savedAddress) locEl.textContent  = savedAddress;
            if (savedName) document.title = savedName + ' - School Management Portal';

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
