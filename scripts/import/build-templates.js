#!/usr/bin/env node
/**
 * Generate the data-collection sheets the school office fills in.
 *
 * The point of pre-filling is that nobody re-types 88 pupil names or 15 staff
 * names — every re-keying is a chance to introduce a name the import cannot
 * match later. Filled columns come from the school's own documents; blank
 * columns are what the portal needs and the documents do not contain.
 *
 * Usage: node scripts/import/build-templates.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { students, staff } = require('./source-data');

const OUT = path.join(__dirname, 'templates');
fs.mkdirSync(OUT, { recursive: true });

/** RFC-4180 quoting: quote anything containing a comma, quote or newline. */
const cell = v => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

/** Levenshtein distance, bailing out early once the lengths differ too much. */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Name split into tokens, dropping only initials ("T.").
 *
 * Do NOT filter by length here. An earlier version dropped tokens under four
 * characters, which ate the real surnames in "TOR DANIEL" and "DIO OLIVIA" and
 * promoted the given names DANIEL and OLIVIA to surname position.
 */
function tokensOf(name) {
  return name.trim().toUpperCase().split(/\s+/)
    .map(p => p.replace(/\.$/, ''))
    .filter(p => p.replace(/\W/g, '').length >= 2);
}

/**
 * Group pupils into households by surname.
 *
 * Grouping is done on the LEADING token only, which the population list uses
 * as the surname. That is the one signal strong enough to act on by itself.
 *
 * Weaker signals are reported, never applied:
 *
 *   • reversed order — "BERNICE AKPIRI" trails a token that leads another
 *     pupil's name, so the row may be FIRSTNAME SURNAME.
 *   • spelling variants — AONDOYAVENGA vs AONDOYEVENGA.
 *
 * Acting on those automatically would silently merge two households, and a
 * wrongly merged household means one family seeing another family's fees.
 * They go in review-links.csv for a human to confirm, and the office moves
 * the pupil by editing family_group.
 */
function groupFamilies(list) {
  const groups = new Map();
  for (const e of list) {
    if (!e.tokens.length) continue;
    const surname = e.tokens[0];
    if (!groups.has(surname)) groups.set(surname, []);
    groups.get(surname).push(e);
  }

  const leadCount = t => (groups.get(t) || []).length;
  const suggestions = [];

  for (const e of list) {
    if (e.tokens.length < 2) continue;
    const own = e.tokens[0];
    if (leadCount(own) > 1) continue;   // already in a household; no guess needed

    const trailing = e.tokens[e.tokens.length - 1];

    // Possible reversed order: the trailing token is a surname elsewhere.
    if (trailing !== own && leadCount(trailing) >= 1) {
      suggestions.push({
        pupil: e.name, grade: e.grade, currentGroup: own,
        suggestedGroup: trailing, reason: 'name may be written FIRSTNAME SURNAME',
        members: groups.get(trailing).map(m => m.name).join(' | ')
      });
    }

    // Possible spelling variant of an established surname. Both 8+ characters:
    // one character apart in a long Tiv surname is near-certainly the same
    // name; in a short token it is usually two different names.
    for (const other of groups.keys()) {
      if (other === own || leadCount(other) < 2 || other.length < 8) continue;
      if (own.length >= 8 && editDistance(own, other) === 1) {
        suggestions.push({
          pupil: e.name, grade: e.grade, currentGroup: own,
          suggestedGroup: other, reason: 'surname spelling variant of ' + other,
          members: groups.get(other).map(m => m.name).join(' | ')
        });
      }
      if (trailing.length >= 8 && editDistance(trailing, other) === 1) {
        suggestions.push({
          pupil: e.name, grade: e.grade, currentGroup: own,
          suggestedGroup: other, reason: 'trailing name is a spelling variant of ' + other,
          members: groups.get(other).map(m => m.name).join(' | ')
        });
      }
    }
  }

  return { groups, suggestions };
}

// ── Build the pupil list with family grouping ────────────────────────────────
const entries = [];
for (const [grade, names] of Object.entries(students)) {
  for (const name of names) entries.push({ grade, name, tokens: tokensOf(name) });
}

const { groups, suggestions } = groupFamilies(entries);

const familyOf = new Map();
for (const [root, members] of groups) {
  for (const m of members) familyOf.set(m.name, { root, size: members.length });
}

// ── Students ─────────────────────────────────────────────────────────────────
const studentHeader = [
  'class',                 // filled
  'name_as_written',       // filled — exactly as the population list has it
  'surname',               // BLANK: the list mixes SURNAME-FIRST and FIRST-SURNAME
  'first_name',            // BLANK
  'other_names',           // BLANK
  'gender',                // BLANK: M / F
  'date_of_birth',         // BLANK: YYYY-MM-DD
  'admission_date',        // BLANK: YYYY-MM-DD, approximate is fine
  'guardian_name',         // BLANK
  'guardian_relationship', // BLANK: Father / Mother / Guardian
  'guardian_phone',        // BLANK: 11 digits
  'guardian_email',        // BLANK: required for a portal login
  'address',               // BLANK
  'family_group',          // filled — a HINT; confirm or clear it
  'notes'
];

const studentRows = [studentHeader];
for (const e of entries) {
  const fam = familyOf.get(e.name);
  studentRows.push([
    e.grade, e.name, '', '', '', '', '', '', '', '', '', '', '',
    fam && fam.size > 1 ? fam.root : '', ''
  ]);
}
fs.writeFileSync(path.join(OUT, 'students-collection.csv'), toCsv(studentRows));

// ── Staff ────────────────────────────────────────────────────────────────────
const staffHeader = [
  'name_as_written',        // filled — from the staff list
  'payroll_name',           // filled — from the July voucher, often written differently
  'surname',                // BLANK
  'first_name',             // BLANK
  'designation',            // filled — staff list
  'payroll_designation',    // filled — voucher; CONFLICTS with the above in places
  'management_role',        // filled where the management table names one
  'type',                   // filled: teaching / non-teaching
  'phone',                  // filled
  'email',                  // BLANK: required for a portal login
  'basic_salary_monthly',   // filled from the voucher's BASIC SALARY column
  'hire_date',              // BLANK: YYYY-MM-DD
  'subjects',               // BLANK: semicolon-separated, e.g. Maths;Basic Science
  'form_class',             // BLANK: confirm — the two documents disagree
  'notes'                   // filled where the documents conflict
];

// Where the staff list and the payroll voucher disagree, say so in the row
// rather than silently picking one. Class assignments in particular differ.
function staffNote(s) {
  const notes = [];
  if (!s.payrollName) notes.push('NOT on the July payroll — confirm still employed and set salary');
  if (s.payrollDesignation && s.payrollDesignation.toLowerCase() !== s.designation.toLowerCase()) {
    notes.push('designation differs between documents — confirm which is current');
  }
  return notes.join('; ');
}

const staffRows = [staffHeader];
for (const s of staff) {
  staffRows.push([
    s.name, s.payrollName || '', '', '',
    s.designation, s.payrollDesignation || '', s.managementRole, s.type, s.phone,
    '', s.basicSalary == null ? '' : s.basicSalary,
    '', '', '', staffNote(s)
  ]);
}
fs.writeFileSync(path.join(OUT, 'staff-collection.csv'), toCsv(staffRows));

// ── One row per household, so contacts are gathered once per family ──────────
const multi = [...groups.entries()]
  .filter(([, members]) => members.length > 1)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

const famRows = [[
  'family_group', 'children_count', 'children',
  'guardian_name', 'guardian_relationship', 'guardian_phone', 'guardian_email',
  'confirmed_same_family'   // office writes yes / no
]];
for (const [root, members] of multi) {
  famRows.push([
    root,
    members.length,
    members.map(m => m.name + ' (' + m.grade + ')').join(' | '),
    '', '', '', '', ''
  ]);
}
fs.writeFileSync(path.join(OUT, 'families-collection.csv'), toCsv(famRows));

// ── Report ───────────────────────────────────────────────────────────────────
const grouped = multi.reduce((n, [, m]) => n + m.length, 0);
const contactSets = multi.length + (entries.length - grouped);

console.log('Templates written to scripts/import/templates/');
console.log('');
console.log('  students-collection.csv   ' + entries.length + ' pupils across ' + Object.keys(students).length + ' classes');
console.log('  staff-collection.csv      ' + staff.length + ' staff');
console.log('  families-collection.csv   ' + multi.length + ' households with more than one child');
console.log('                            covering ' + grouped + ' of ' + entries.length + ' pupils');
console.log('');
console.log('  Contact sets to collect:  ' + contactSets + ' rather than ' + entries.length);

// Suggested cross-links, for a human to confirm — never applied automatically.
const sugRows = [['pupil', 'class', 'current_family_group', 'suggested_family_group', 'why', 'who_is_in_the_suggested_group', 'office_decision']];
for (const s of suggestions) {
  sugRows.push([s.pupil, s.grade, s.currentGroup, s.suggestedGroup, s.reason, s.members, '']);
}
fs.writeFileSync(path.join(OUT, 'review-links.csv'), toCsv(sugRows));

if (suggestions.length) {
  console.log('');
  console.log('  review-links.csv          ' + suggestions.length + ' possible household links to confirm by hand:');
  for (const s of suggestions) {
    console.log('    ' + s.pupil + '  ->  ' + s.suggestedGroup + '   (' + s.reason + ')');
  }
}

console.log('');
console.log('Class sizes:');
for (const [grade, names] of Object.entries(students)) {
  console.log('  ' + grade.padEnd(13) + String(names.length).padStart(3));
}
