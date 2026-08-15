// ============================================
// PUBLIC SITE CONFIG — TBD INTERNATIONAL ACADEMY, MAKURDI
// ============================================
// Public-facing school details, taken from the school's admission flyer.
// The public pages (public-blog / about / academics / admissions / contact)
// deliberately do NOT load js/school-config.js: that file is portal
// infrastructure and starts a Supabase poll on load. This is the small,
// dependency-free equivalent for the marketing site.
//
// Contact details here must stay in sync with the matching fields in
// js/school-config.js (name, motto, location, email, phone).
// ============================================

(function () {
    'use strict';

    const publicSite = {
        name: 'TBD International Academy',
        shortName: 'TBD Academy',
        city: 'Makurdi',
        state: 'Benue State',
        motto: 'Planting Seeds of Knowledge',
        tagline: 'Nurturing Leaders, Building Tomorrow',
        promise: 'Building Character, Inspiring Excellence, Transforming Lives',
        crest: 'assets/logo-mark.svg',
        established: 2011,

        website: 'tbdacademy.org',

        contact: {
            // As printed on the flyer.
            phones: ['0707111692', '09027512438', '08030614777'],
            whatsapp: '2348030614777',
            // School-domain mailboxes, matching the senders the portal mails
            // from (supabase/functions/_shared/email.ts). Each must be a real,
            // monitored inbox — parents reply to them.
            email: 'support@tbdacademy.org',
            admissionsEmail: 'headteacher@tbdacademy.org',
            financeEmail: 'finance@tbdacademy.org',
            address: 'Behind Civil Service Commission, Kertyo, Makurdi',
            officeHours: '8:00am – 2:00pm',
            formsNote: 'Forms available at the school premises'
        },

        vision: 'To raise global Superstars in all aspects of human endeavours.',

        mission: [
            'Plant seeds of knowledge',
            'Be the best in Sports',
            'Be the best in ICT',
            'To lead in Academics',
            'To raise Experts in Science & Technology',
            'To raise Morally Sound Leaders',
            'To raise Exceptionally Determined graduates'
        ],

        admissions: {
            status: 'Admission in Progress',
            session: '2026/2027',

            // `classes` mirrors the grade structure in js/school-config.js, so the
            // levels advertised here are the ones the portal can actually admit into.
            levels: [
                {
                    name: 'Creche',
                    classes: 'Creche',
                    blurb: 'Nurturing young minds with love and care.',
                    icon: 'fa-shapes',
                    accent: 'amber'
                },
                {
                    name: 'Nursery',
                    classes: 'Pre-nursery – Nursery 3',
                    blurb: 'Building a strong foundation for lifelong learning.',
                    icon: 'fa-baby',
                    accent: 'emerald'
                },
                {
                    name: 'Primary',
                    classes: 'Basic 1 – Basic 6',
                    blurb: 'Empowering learners with knowledge, values and skills.',
                    icon: 'fa-book-open',
                    accent: 'red'
                },
                {
                    name: 'Secondary',
                    classes: 'JSS 1 – JSS 3',
                    blurb: "Preparing tomorrow's leaders for a global future.",
                    icon: 'fa-user-graduate',
                    accent: 'sky'
                }
            ]
        },

        // Bumping this re-shows the popup to visitors who already dismissed it.
        // Use it whenever the admission campaign above changes.
        campaign: 'admission-2026-2027'
    };

    publicSite.telHref = function (phone) {
        const digits = String(phone).replace(/\D/g, '');
        // Local 0-prefixed numbers dial reliably as +234.
        return digits.startsWith('0') ? '+234' + digits.slice(1) : '+' + digits;
    };

    window.PUBLIC_SITE = publicSite;
})();
