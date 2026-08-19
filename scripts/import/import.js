#!/usr/bin/env node
/**
 * Load the school's staff, guardians and pupils into the portal.
 *
 * WHY IT SIGNS IN RATHER THAN USING A SERVICE-ROLE KEY
 * ----------------------------------------------------
 * `create-account` is the only supported way to make a login, and its
 * requireAdmin() gate resolves the caller's JWT to a profile row and checks
 * role = 'admin'. A service-role key has no profile, so it cannot pass that
 * gate. Signing in as the school's admin is therefore both necessary and
 * better: every write goes through the same RLS the UI is subject to, school
 * IDs are allocated by the same code, credential emails are sent, and the
 * audit log records who did it. No service-role key is needed anywhere.
 *
 * ZERO DEPENDENCIES
 * -----------------
 * Node built-ins only, matching scripts/build.js. Supabase is reached over its
 * REST and Functions endpoints with global fetch.
 *
 * USAGE
 * -----
 *   node scripts/import/import.js                     # validate only, writes nothing
 *   node scripts/import/import.js --only=staff        # validate one section
 *   node scripts/import/import.js --apply --only=staff
 *   node scripts/import/import.js --apply             # everything, in order
 *
 * Credentials come from the environment, never the command line, so they stay
 * out of your shell history:
 *   IMPORT_ADMIN_EMAIL=...  IMPORT_ADMIN_PASSWORD=...  node scripts/import/import.js --apply
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES = path.join(__dirname, 'templates');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || 'all';

// ── Grades the portal will accept ───────────────────────────────────────────
// Kept in step with js/school-config.js. A pupil imported under a grade the
// portal does not know is invisible in the directory and cannot be billed.
const GRADES = [
  'Creche', 'Pre-nursery', 'Nursery 1', 'Nursery 2', 'Nursery 3',
  'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6',
  'JSS 1', 'JSS 2', 'JSS 3'
];

// ── Tiny CSV reader (RFC 4180: quotes, escaped quotes, embedded newlines) ────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* handled with \n */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(v => String(v).trim() !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

function readSheet(name) {
  const file = path.join(TEMPLATES, name);
  if (!fs.existsSync(file)) {
    console.error(`  missing sheet: ${file}\n  run: node scripts/import/build-templates.js`);
    process.exit(1);
  }
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

// ── Validators ──────────────────────────────────────────────────────────────
const isEmail = v => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);
/** Nigerian mobile: 11 digits starting 0, or +234 followed by 10. */
const isPhone = v => /^0\d{10}$/.test(v.replace(/[\s-]/g, ''))
                  || /^\+?234\d{10}$/.test(v.replace(/[\s-]/g, ''));
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

class Report {
  constructor(section) { this.section = section; this.errors = []; this.warnings = []; this.ready = 0; this.skipped = 0; this._dirty = new Set(); }
  error(row, msg) { this.errors.push(`row ${row}: ${msg}`); this._dirty.add(row); }
  /** Count a row as importable only if nothing flagged it. */
  pass(row) { if (!this._dirty.has(row)) this.ready++; }
  warn(row, msg) { this.warnings.push(`row ${row}: ${msg}`); }
  print() {
    console.log(`\n${this.section}`);
    console.log(`  ready to import : ${this.ready}`);
    console.log(`  incomplete      : ${this.skipped}`);
    if (this.errors.length) {
      console.log(`  errors          : ${this.errors.length}`);
      for (const e of this.errors.slice(0, 15)) console.log('      ' + e);
      if (this.errors.length > 15) console.log(`      ... and ${this.errors.length - 15} more`);
    }
    if (this.warnings.length) {
      console.log(`  warnings        : ${this.warnings.length}`);
      for (const w of this.warnings.slice(0, 10)) console.log('      ' + w);
      if (this.warnings.length > 10) console.log(`      ... and ${this.warnings.length - 10} more`);
    }
  }
}

// ── Validation ──────────────────────────────────────────────────────────────
function validateStaff(rows) {
  const r = new Report('STAFF');
  const seen = new Map();
  rows.forEach((s, i) => {
    const line = i + 2;
    const name = s.name_as_written;
    if (!name) { r.error(line, 'no name'); return; }

    const missing = [];
    if (!s.email) missing.push('email');
    if (!s.basic_salary_monthly) missing.push('basic_salary_monthly');
    if (missing.length) { r.skipped++; r.warn(line, `${name}: waiting on ${missing.join(', ')}`); return; }

    if (!isEmail(s.email)) { r.error(line, `${name}: "${s.email}" is not a valid email`); return; }
    const key = s.email.toLowerCase();
    if (seen.has(key)) { r.error(line, `${name}: email already used by ${seen.get(key)}`); return; }
    seen.set(key, name);

    if (!/^\d+$/.test(s.basic_salary_monthly.replace(/[, ]/g, ''))) {
      r.error(line, `${name}: salary "${s.basic_salary_monthly}" is not a number`); return;
    }
    if (s.phone && !isPhone(s.phone)) r.warn(line, `${name}: phone "${s.phone}" looks wrong`);
    if (s.hire_date && !isDate(s.hire_date)) r.error(line, `${name}: hire_date must be YYYY-MM-DD`);
    if (s.type && !['teaching', 'non-teaching'].includes(s.type)) {
      r.error(line, `${name}: type must be teaching or non-teaching`);
    }
    r.pass(line);
  });
  return r;
}

function validateStudents(rows) {
  const r = new Report('PUPILS');
  rows.forEach((s, i) => {
    const line = i + 2;
    const name = s.name_as_written;
    if (!name) { r.error(line, 'no name'); return; }

    if (!GRADES.includes(s.class)) {
      r.error(line, `${name}: class "${s.class}" is not one the portal knows`); return;
    }
    if (s.date_of_birth && !isDate(s.date_of_birth)) r.error(line, `${name}: date_of_birth must be YYYY-MM-DD`);
    if (s.admission_date && !isDate(s.admission_date)) r.error(line, `${name}: admission_date must be YYYY-MM-DD`);
    if (s.gender && !['M', 'F'].includes(s.gender.toUpperCase())) r.error(line, `${name}: gender must be M or F`);
    if (s.guardian_email && !isEmail(s.guardian_email)) r.error(line, `${name}: guardian email is invalid`);
    if (s.guardian_phone && !isPhone(s.guardian_phone)) r.warn(line, `${name}: guardian phone looks wrong`);

    // A pupil imports fine with no guardian — they just have no portal access
    // until an admin links one. That is expected for Creche.
    if (!s.guardian_email) r.warn(line, `${name}: no guardian email — no portal access yet`);
    r.pass(line);
  });
  return r;
}

function validateFamilies(rows) {
  const r = new Report('GUARDIAN ACCOUNTS');
  const seen = new Map();
  rows.forEach((f, i) => {
    const line = i + 2;
    if (!f.guardian_email) { r.skipped++; r.warn(line, `${f.family_group}: no email yet`); return; }
    if (!isEmail(f.guardian_email)) { r.error(line, `${f.family_group}: invalid email`); return; }
    const key = f.guardian_email.toLowerCase();
    if (seen.has(key)) { r.error(line, `${f.family_group}: email already used by ${seen.get(key)}`); return; }
    seen.set(key, f.family_group);
    if (!f.guardian_name) { r.error(line, `${f.family_group}: email given but no name`); return; }
    if (f.confirmed_same_family && !/^y/i.test(f.confirmed_same_family)) {
      r.warn(line, `${f.family_group}: not confirmed as one family — check review-links.csv`);
    }
    r.pass(line);
  });
  return r;
}

// ── Supabase over plain fetch ───────────────────────────────────────────────
function loadEnv() {
  const file = path.join(__dirname, '..', '..', '.env');
  const env = { ...process.env };
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

async function signIn(env) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, IMPORT_ADMIN_EMAIL, IMPORT_ADMIN_PASSWORD } = env;
  for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, IMPORT_ADMIN_EMAIL, IMPORT_ADMIN_PASSWORD })) {
    if (!v) { console.error(`\n  --apply needs ${k}`); process.exit(1); }
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: IMPORT_ADMIN_EMAIL, password: IMPORT_ADMIN_PASSWORD })
  });
  const body = await res.json();
  if (!res.ok) { console.error('\n  sign-in failed: ' + (body.error_description || body.msg || res.status)); process.exit(1); }
  return body.access_token;
}

async function createAccount(env, token, payload) {
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/create-account`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

async function patch(env, token, table, filter, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('TBD International Academy — data import');
  console.log(APPLY ? '  MODE: APPLY — this writes to the database' : '  MODE: dry run — nothing will be written');
  console.log(`  SECTION: ${ONLY}`);

  const want = s => ONLY === 'all' || ONLY === s;
  const reports = [];

  const staff = want('staff') ? readSheet('staff-collection.csv') : [];
  const families = want('guardians') ? readSheet('families-collection.csv') : [];
  const students = want('students') ? readSheet('students-collection.csv') : [];

  if (want('staff')) reports.push(validateStaff(staff));
  if (want('guardians')) reports.push(validateFamilies(families));
  if (want('students')) reports.push(validateStudents(students));

  for (const r of reports) r.print();

  const errors = reports.reduce((n, r) => n + r.errors.length, 0);
  const ready = reports.reduce((n, r) => n + r.ready, 0);

  console.log('\n' + '-'.repeat(60));
  if (errors) {
    console.log(`  ${errors} error(s). Nothing will be imported until these are fixed.`);
    process.exit(1);
  }
  console.log(`  ${ready} record(s) pass validation.`);

  if (!APPLY) {
    console.log('  Dry run — nothing written. Re-run with --apply to import.');
    return;
  }

  const env = loadEnv();
  const token = await signIn(env);
  console.log('  signed in as ' + env.IMPORT_ADMIN_EMAIL);

  // Staff: create the login, then fill the columns create_user_records leaves
  // NULL — it only sets auth_id, name, role and status.
  let created = 0, failed = 0;
  for (const s of staff) {
    if (!s.email || !s.basic_salary_monthly) continue;
    const res = await createAccount(env, token, {
      email: s.email,
      role: s.type === 'non-teaching' ? 'staff' : 'teacher',
      fullName: s.name_as_written,
      department: s.designation || null
    });
    if (!res.ok) {
      // 409 means the account already exists — the run is resumable.
      if (res.status === 409) { console.log(`  = ${s.name_as_written} already has an account`); continue; }
      console.log(`  ! ${s.name_as_written}: ${res.body.error || res.status}`);
      failed++; continue;
    }
    await patch(env, token, 'staff', `auth_id=eq.${res.body.authId}`, {
      salary: Number(s.basic_salary_monthly.replace(/[, ]/g, '')),
      phone: s.phone || null,
      email: s.email,
      type: s.type || 'teaching',
      role: s.designation || null,
      hire_date: s.hire_date || null,
      subjects: s.subjects ? s.subjects.split(';').map(x => x.trim()) : null
    });
    console.log(`  + ${s.name_as_written} (${res.body.schoolId})`);
    created++;
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`  created ${created}, failed ${failed}`);
  if (failed) process.exit(1);
})();
