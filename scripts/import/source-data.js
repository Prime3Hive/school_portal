/**
 * Source data transcribed from the school's own documents, 19 August 2026.
 *
 *   SCHOOL POPULATION BY CLASS.docx   -> students (88)
 *   STAFF LIST.docx                   -> staff (15)
 *
 * Nothing here is invented. Names are reproduced exactly as written, including
 * their inconsistent ordering — most rows read SURNAME FIRSTNAME, but a few
 * (e.g. "BERNICE AKPIRI", "LULU AONDOYEVENGA") read FIRSTNAME SURNAME. The
 * collection sheet asks the office to split them rather than guessing here.
 *
 * Correct a name here and re-run build-templates.js; do not hand-edit the CSVs.
 */

'use strict';

// ── Students, by class, in document order ────────────────────────────────────
const students = {
  'Creche': [
    'LULU AONDOYEVENGA', 'BERNICE AKPIRI'
  ],
  'Pre-nursery': [
    'ABEL KYLA', 'ATER SOOTER BLESSING', 'DIO OLIVIA', 'JOSEPH PECULIAR',
    'JOSEPH PRAISE', 'MSUGH JUSTINE', 'SHAKPANDE MARVELLOUS', 'WAYA TERDOO',
    'AXEL ITATU'
  ],
  'Nursery 1': [
    'AKOR GABRIEL EKONDU', 'AONDOYAVENGA BLESSING', 'BEMGBA CHERRY ANADOO',
    'ESEYIN ABRAHAM', 'FANEN SUGHUNTER', 'GYATA TERKUMA PRAISE',
    'HOR TEREMEMONDOO PENIEL', 'IVARAVE DIVINE NASHATER', 'KEMBE DANIEL',
    'MADUABUCHI UJU', 'SHAONDO OSCAR AONDONEGEN', 'TERKAA BEATRICE',
    'TERSEER RITA MSUURSHIMA', 'TOR SEKAV DOOM', 'UDUGH LUSETER GABRIEL',
    'UKPOJU GRACE ONYILOKO', 'YANDEV T. MATTHEW', 'YUWA YIMASE BRIGHT'
  ],
  'Nursery 2': [
    'ABEL KIMAYA', 'ASHIEKAA INGEM-I-TER', 'ASHIEKAA VERNA', 'CHRIS ELYANA',
    'GBAZUM NGOHIDE', 'KEMBE ANADOO', 'MSUGH JOSEPH TARTOR',
    'FAVOUR OHELUME UKUWE', 'TARBUNDE HELEN', 'TERDOO MSUURSHIMA',
    'WANAM MATILDA', 'IORCHIVIR EMMANUEL', 'AKPIRI PAUL-GREAT'
  ],
  'Nursery 3': [
    'AZEMBE OBADIAH', 'GBAZUM GABRIEL', 'MADUABUCHI JIDENNA',
    'MSUGH ISAAC TORDUE', 'TERKAA JESSICA', 'TYOKASE HEAVEN TERHIDE',
    'YUWA RUMMSE RAYMOND', 'OWOICHO SAMUEL', 'OWOICHO SAMSON'
  ],
  'Basic 1': [
    'ABA LOUIS LUPER', 'AKOR JAMES', 'AONDOFA NGOHIDE', 'ATAGHER SENATER',
    'IORSHIMBE CHIVITER', 'MSUGHVE RAPHAEL', 'TERDOO PURITY IEMBER',
    'IORCHIVIR VIVIAN'
  ],
  'Basic 2': [
    'ABEL KIRAN', 'AONDOYAVENGA ERNEST', 'SHAKPANDE OLIVIA M.',
    'TERDOO YIMASE', 'TERKAA BIBIANA', 'WANAM PHILOMENA',
    'ZUNUKU IYU MANNASSEH'
  ],
  'Basic 3': [
    'AGWAZA JOSEPH', 'ASHIEKAA SEFATER', 'AZEMBE MSENDO GERTRUDE',
    'CHRIS EHI SELINA', 'TERKIMBI VIVIAN', 'TERLUMUN SEWUESE FAVOUR'
  ],
  'Basic 4': [
    'AKOR REJOICE', 'AONDOYAVENGA PASCAL', 'BEM NGUHEMEN',
    'GADO NAMTOR KINGSLEY', 'SHAKPANDE ANITA DOOSE', 'TARKIGHIR KELVIN',
    'TERLUMUN IVEREN', 'YIMAN YUMNA', 'TOR DANIEL'
  ],
  'Basic 5': [
    'TARKIGHIR GERTRUDE MDOOTER', 'YUWA COLLINS ORAVANDE'
  ],
  'JSS 1': [
    'EZE CHINWENDU DAVID', 'GYATA ISAAC', 'INALEGAWU EHI DIVINE',
    'ORSEER SECHIVIR JOY', 'VANGER TERVER THOMAS'
  ]
};

// ── Staff ────────────────────────────────────────────────────────────────────
// `designation` is verbatim from the staff list. `managementRole` comes from
// the second table ("School Management Team"), which assigns extra duties to
// the same people rather than listing different ones.
// `type` follows the staff table's own `type` column: teaching / non-teaching.
//
// `basicSalary` and `payrollName` come from JULY PAYMENT VOUCHER.doc. Only the
// BASIC SALARY column is carried across: the voucher's "Child Fees/Loan"
// deduction changes month to month (three staff had one in July) and the portal
// stores a single constant figure per person. The voucher's own totals check
// out — 473,000 gross less 60,000 deductions is the 413,000 net it states.
//
// `payrollName` is kept because the two documents write names differently
// (staff list "MRS. WINIFRED KANYI", voucher "KANYI EMBERNEN WINIFRED"), and
// the office needs to see both to confirm each match.
const staff = [
  { name: 'AGBO LECH SIMMON',         designation: 'Head of School / Computer / Basic Science Teacher', phone: '08039217448', type: 'teaching',      payrollName: 'AGBO LECH SIMMON', basicSalary: 70000, payrollDesignation: 'Head of School', managementRole: 'Head of School' },
  { name: 'MRS. ALICE APE',           designation: 'HOD Upper Basic / CCA / CRS Teacher',               phone: '07039088875', type: 'teaching',      payrollName: 'APE ALICE', basicSalary: 35000, payrollDesignation: 'Basic 4 Form Mistress (HOD)', managementRole: 'HOD Upper Basic / Exam Officer' },
  { name: 'MRS. WINIFRED KANYI',      designation: 'HOD Lower Basic / Basic 1 Form Mistress',           phone: '08137551234', type: 'teaching',      payrollName: 'KANYI EMBERNEN WINIFRED', basicSalary: 36000, payrollDesignation: 'Basic 2 Class Teacher (HOD)', managementRole: 'HOD Lower Basic' },
  { name: 'MRS. VICTORIA JIRGBA',     designation: 'HOD Nursery Section / Nursery 1 Teacher',           phone: '08069113421', type: 'teaching',      payrollName: 'JIRGBA VICTORIA JOHN', basicSalary: 35000, payrollDesignation: 'Nursery 1 Class Teacher (HOD)', managementRole: 'HOD Nursery Section' },
  { name: 'MR. SHEDRACH TERSEER TIV', designation: 'Compound Master / Maths Teacher',                   phone: '07045042101', type: 'teaching',      payrollName: 'TIV SHADRACH TERSEER', basicSalary: 30000, payrollDesignation: 'Basic 5 Class Teacher', managementRole: 'Compound Master / Dean of Studies' },
  { name: 'MRS. GRACE IDOKO',         designation: 'Pre-nursery Teacher',                               phone: '08135837447', type: 'teaching',      payrollName: 'IDOKO INYAMU GRACE', basicSalary: 38000, payrollDesignation: 'Pre-nursery Class Teacher', managementRole: 'Store Keeper' },
  { name: 'MRS. MSUGH RACHEL',        designation: 'Basic 2 Teacher',                                   phone: '08138619175', type: 'teaching',      payrollName: 'MSUGH RACHEL AGBENYOL', basicSalary: 30000, payrollDesignation: 'Basic 1 Class Teacher', managementRole: '' },
  { name: 'MR. FRED AHEMBA',          designation: 'English Teacher',                                   phone: '07035966477', type: 'teaching',      payrollName: 'FRED AHEMBA', basicSalary: 35000, payrollDesignation: 'English Teacher', managementRole: '' },
  { name: 'MISS THERESA IORNUMBE',    designation: 'Nursery 2 Teacher',                                 phone: '08100735523', type: 'teaching',      payrollName: 'IORNUMBE THERESA NGUNAN', basicSalary: 32000, payrollDesignation: 'Nursery 2 Class Teacher', managementRole: 'Games Mistress' },
  { name: 'MISS FAITH OYEYE OMANGA',  designation: 'Nursery 3 Teacher',                                 phone: '08087925548', type: 'teaching',      payrollName: 'OMANGA OYEYE FAITH', basicSalary: 25000, payrollDesignation: 'Class Teacher Nursery 3', managementRole: 'Dean of Discipline' },
  { name: 'MRS. DOOSUUR ALOHO',       designation: 'Class Assistant, Nursery 2',                        phone: '08134841827', type: 'teaching',      payrollName: 'ALOHO DOOSUUR MARTHA', basicSalary: 22000, payrollDesignation: 'Class Assistant Nursery 3', managementRole: '' },
  { name: 'MRS. CHARITY AONDOYAVENGA',designation: 'Class Assistant, Nursery 1',                        phone: '07085372012', type: 'teaching',      payrollName: 'CHARITY IGYU', basicSalary: 20000, payrollDesignation: 'Class Assistant Nursery 1', managementRole: '' },
  { name: 'MRS. FELICIA ZUNUKU',      designation: 'Cleaner',                                           phone: '07060537473', type: 'non-teaching',  payrollName: 'ZUNUKU FELICIA ALIZI', basicSalary: 20000, payrollDesignation: 'Cleaner', managementRole: '' },
  { name: 'MR. SAMUEL OGBU',          designation: 'Chief Security Officer',                            phone: '08121802026', type: 'non-teaching',  payrollName: 'OGBU SAMUEL', basicSalary: 40000, payrollDesignation: 'Security', managementRole: 'Chief Security Officer' },
  { name: 'MR. TERYIMA KUSUGH',       designation: 'Security Personnel',                                phone: '07082391495', type: 'non-teaching',  payrollName: null, basicSalary: null, payrollDesignation: null, managementRole: '' },
  // On JULY PAYMENT VOUCHER.doc but absent from STAFF LIST.docx.
  { name: 'MR. FRIDAY ADAJI', designation: 'Vigilante Leader', phone: '', type: 'non-teaching', payrollName: 'Mr. FRIDAY ADAJI', basicSalary: 5000, payrollDesignation: 'Vigilante Leader', managementRole: '' }
];

module.exports = { students, staff };
