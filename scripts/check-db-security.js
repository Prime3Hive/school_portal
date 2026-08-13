#!/usr/bin/env node
/**
 * Database security assertions — READ ONLY.
 *
 * WHY THIS EXISTS
 * ---------------
 * Five separate times, this schema shipped a migration that looked like it
 * hardened something and did not:
 *
 *   0013  dropped policies by exact name; the live policy had a different name,
 *         so school_settings kept a duplicate permissive read policy
 *   0013  wrote policies for four payment tables where RLS was never enabled —
 *         a policy on a table without RLS does nothing at all
 *   0015  took the documents bucket private and added five scoped policies, but
 *         left nine legacy ones in place. Postgres OR-combines permissive
 *         policies, so "Public read access for documents" still governed and
 *         111 children's birth certificates stayed world-readable
 *   0014  three reporting views were left SECURITY DEFINER, bypassing the
 *         policies underneath them; one leaked 24 payment records to anon
 *   ----  the fee RPCs were SECURITY DEFINER, checked nothing, and were granted
 *         EXECUTE to PUBLIC — anyone could mark any student's fees paid
 *
 * Reviewing migration text catches none of these. Every one is obvious when you
 * ask the live database what is actually true. That is all this script does.
 *
 * It asserts, and exits non-zero on any violation:
 *   1. every table carrying a policy has RLS enabled
 *   2. no table in the API schema has RLS disabled
 *   3. no SECURITY DEFINER function is executable by anon (outside allowlist)
 *   4. every view runs with security_invoker
 *   5. no anon/PUBLIC policy is ungated (outside allowlist)
 *   6. nothing anonymous can read the documents bucket
 *   7. every SECURITY DEFINER function pins search_path
 *
 * Usage:
 *   node scripts/check-db-security.js          # against the linked project
 *   node scripts/check-db-security.js --json
 *
 * Requires the Supabase CLI, authenticated and linked. It issues only SELECTs
 * against catalog tables — it never reads application data and never writes.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');

// Prefer the CLI binary vendored next to the repo, fall back to PATH.
function cliPath() {
  const local = path.join(ROOT, process.platform === 'win32' ? 'supabase.exe' : 'supabase');
  return fs.existsSync(local) ? local : 'supabase';
}

function query(sql) {
  const out = execFileSync(cliPath(), ['db', 'query', '--linked', '--output', 'json', sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // The CLI prints progress lines before the JSON body.
  const start = out.indexOf('{');
  if (start === -1) throw new Error(`No JSON in CLI output:\n${out}`);
  return JSON.parse(out.slice(start)).rows || [];
}

/**
 * Documented exceptions. Every entry needs a reason — an allowlist without one
 * is just a way to silence the check.
 */
const ALLOW = {
  // SECURITY DEFINER functions anon is permitted to execute.
  anonExecutable: {
    check_application_status:
      'the public admissions status page; requires application number AND matching email, returns no PII',
    get_my_role:
      'returns only the caller’s own role, NULL for anon. RLS policies call it — revoking turns policy evaluation into a permission error',
  },
  // Policies that are deliberately reachable by anon with no auth predicate.
  ungatedPolicies: {
    'application_fee_schedule|fee_schedule: public read':
      'application fee prices are shown on the public admissions page',
    'payment_transactions|payment_transactions: anon open pending':
      'an applicant is not signed in; constrained to pending/paystack/NGN and a bounded amount',
    'payment_transactions|payment_transactions: anon update non-final':
      'lets the applicant’s browser cancel its own popup; cannot reach a settled state',
    'storage.objects|documents: anon submit application files':
      'applicants upload documents before they have an account; INSERT only, scoped to applications/',

    // ── Accepted risk, NOT a clean bill of health ────────────────────────────
    // The yp_* tables belong to a different application sharing this Supabase
    // project. Their policies are `{public}` with a `true` predicate, so anything
    // stored in them is world-readable — yp_member_profiles carries full_name,
    // email, phone, address and gender.
    //
    // All six tables are EMPTY, which is the only reason this is allowlisted.
    // The moment that application stores a row this becomes a live PII
    // exposure. It is allowlisted rather than fixed because the code that reads
    // these tables is not in this repository, so tightening them here could
    // break an app we cannot test.
    //
    // REVISIT THE MOMENT yp_* HOLDS DATA. Check with:
    //   select count(*) from yp_member_profiles;
    'yp_member_profiles|Users can view all profiles':
      'separate app, empty table — revisit before it stores any row (holds name/email/phone/address)',
    'yp_event_registrations|Anyone can view registrations':
      'separate app, empty table — revisit before it stores any row',
    'yp_room_assignments|Anyone can view room assignments':
      'separate app, empty table — revisit before it stores any row',
    'yp_events|Anyone can view events':
      'separate app, empty table — event listings are plausibly public by design',
    'yp_rooms|Anyone can view rooms':
      'separate app, empty table — room listings are plausibly public by design',
  },
  // Tables permitted to run without RLS.
  rlsDisabled: {},
};

const CHECKS = [
  {
    id: 'policies-without-rls',
    title: 'Tables carrying a policy must have RLS enabled',
    why: 'A policy on a table without RLS enabled does nothing. 0013 wrote four of these.',
    sql: `
      SELECT c.relname AS name,
             (SELECT count(*) FROM pg_policies p
               WHERE p.schemaname='public' AND p.tablename=c.relname) AS detail
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
        AND EXISTS (SELECT 1 FROM pg_policies p
                     WHERE p.schemaname='public' AND p.tablename=c.relname)
      ORDER BY 1`,
    render: r => `${r.name} — has ${r.detail} inert policies`,
  },
  {
    id: 'rls-disabled',
    title: 'No table in the API schema may have RLS disabled',
    why: 'PostgREST exposes every public table. Without RLS the anon key reaches it directly.',
    sql: `
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
      ORDER BY 1`,
    allow: r => ALLOW.rlsDisabled[r.name],
    render: r => r.name,
  },
  {
    id: 'anon-security-definer',
    title: 'SECURITY DEFINER functions must not be executable by anon',
    why: 'SECURITY DEFINER bypasses RLS entirely. The fee RPCs were granted to PUBLIC.',
    sql: `
      SELECT p.proname AS name
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
      ORDER BY 1`,
    allow: r => ALLOW.anonExecutable[r.name],
    render: r => r.name,
  },
  {
    id: 'views-security-invoker',
    title: 'Views must run with security_invoker',
    why: 'A view runs as its owner, bypassing RLS underneath. unallocated_payments leaked 24 payment records.',
    sql: `
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='v'
        AND NOT COALESCE(
          array_to_string(c.reloptions, ',') LIKE '%security_invoker=on%'
          OR array_to_string(c.reloptions, ',') LIKE '%security_invoker=true%',
          false)
      ORDER BY 1`,
    render: r => r.name,
  },
  {
    id: 'ungated-anon-policies',
    title: 'Anon-reachable policies must carry an auth predicate',
    why: 'A {public} or {anon} policy with a true predicate is readable by the whole internet.',
    sql: `
      SELECT tablename AS tbl, policyname AS name, cmd AS detail
      FROM pg_policies
      WHERE schemaname='public'
        AND ('anon' = ANY(roles::text[]) OR 'public' = ANY(roles::text[]))
        AND COALESCE(qual, with_check, 'true') !~
            'auth\\.uid|get_my_role|current_user_has_role|auth\\.jwt|request\\.jwt'
      ORDER BY 1, 2`,
    allow: r => ALLOW.ungatedPolicies[`${r.tbl}|${r.name}`],
    render: r => `${r.tbl} — "${r.name}" (${r.detail})`,
  },
  {
    id: 'storage-anon-read',
    title: 'Anonymous clients must not read stored documents',
    why: 'Applicant documents are birth certificates and passport photographs of children.',
    sql: `
      SELECT policyname AS name, cmd AS detail, 'storage.objects' AS tbl
      FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
        AND cmd IN ('SELECT','ALL')
        AND ('anon' = ANY(roles::text[]) OR 'public' = ANY(roles::text[]))
      ORDER BY 1`,
    allow: r => ALLOW.ungatedPolicies[`storage.objects|${r.name}`],
    render: r => `"${r.name}" (${r.detail}) is readable without authentication`,
  },
  {
    id: 'mutable-search-path',
    title: 'SECURITY DEFINER functions must pin search_path',
    why: 'Without it the definer’s privileges can be redirected to attacker-controlled objects.',
    sql: `
      SELECT p.proname AS name
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND (p.proconfig IS NULL
             OR NOT array_to_string(p.proconfig, ',') LIKE '%search_path%')
      ORDER BY 1`,
    render: r => r.name,
  },
];

function run() {
  const results = [];

  for (const check of CHECKS) {
    let rows;
    try {
      rows = query(check.sql);
    } catch (err) {
      results.push({ ...check, error: err.message.split('\n')[0] });
      continue;
    }

    const violations = [];
    const allowed = [];
    for (const r of rows) {
      const reason = check.allow ? check.allow(r) : undefined;
      (reason ? allowed : violations).push({ row: r, reason });
    }
    results.push({ ...check, violations, allowed });
  }

  const failed = results.filter(r => r.violations && r.violations.length);
  const errored = results.filter(r => r.error);

  if (JSON_OUT) {
    console.log(JSON.stringify(
      results.map(r => ({
        id: r.id,
        error: r.error,
        violations: (r.violations || []).map(v => v.row),
        allowed: (r.allowed || []).map(v => v.row),
      })), null, 2));
  } else {
    print(results, failed, errored);
  }

  process.exit(failed.length || errored.length ? 1 : 0);
}

function print(results, failed, errored) {
  console.log('\n  Database security assertions — live schema\n');

  for (const r of results) {
    if (r.error) {
      console.log(`  ERROR   ${r.title}`);
      console.log(`          ${r.error}\n`);
      continue;
    }
    const n = r.violations.length;
    const tag = n ? 'FAIL   ' : 'ok     ';
    const extra = r.allowed.length ? `  (${r.allowed.length} allowlisted)` : '';
    console.log(`  ${tag} ${r.title}${extra}`);
    if (n) {
      console.log(`          ${r.why}`);
      for (const v of r.violations) console.log(`            → ${r.render(v.row)}`);
      console.log('');
    }
  }

  if (errored.length) {
    console.log('\n  Could not complete. Is the Supabase CLI linked and authenticated?');
    console.log('    supabase login && supabase link --project-ref <ref>\n');
    return;
  }

  if (!failed.length) {
    console.log('\n  All assertions passed.\n');
  } else {
    const total = failed.reduce((n, r) => n + r.violations.length, 0);
    console.log(`\n  ${total} violation(s) across ${failed.length} assertion(s).`);
    console.log('  Fix the schema, or add an allowlist entry WITH A REASON in this file.\n');
  }
}

run();
