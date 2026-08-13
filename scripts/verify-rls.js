#!/usr/bin/env node
/**
 * Row-Level Security probe — READ ONLY.
 *
 * Answers one question: what can someone holding only the public anon key see?
 * That key ships inside the browser bundle, so anything reachable with it is
 * effectively public. Run this before and after applying
 * `supabase/migrations/0013_harden_rls_policies.sql` to confirm the policy
 * changes did what you intended.
 *
 * This script never writes. It issues HEAD/GET requests with `count=exact` and
 * reports row counts only — it does not print row contents, so it is safe to
 * paste the output into a ticket.
 *
 * Usage:
 *   node scripts/verify-rls.js                 # reads SUPABASE_* from .env
 *   node scripts/verify-rls.js --url URL --key KEY
 *   node scripts/verify-rls.js --json          # machine-readable
 *
 * Exit code 1 if any table marked `mustBeEmpty` returns rows to anon.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');

function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

// ── Config ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const file = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([^=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv();
const URL_BASE = flag('--url') || process.env.SUPABASE_URL || env.SUPABASE_URL;
const ANON_KEY = flag('--key') || process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

if (!URL_BASE || !ANON_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY. Pass --url and --key, or add them to .env');
  process.exit(2);
}

/**
 * Tables to probe.
 *   mustBeEmpty: true  → anon returning ANY row is a finding (fails the run)
 *   mustBeEmpty: false → anon reads are expected/acceptable
 */
const TABLES = [
  { name: 'invitations',              mustBeEmpty: true,  why: 'holds default_password in plaintext' },
  { name: 'profiles',                 mustBeEmpty: true,  why: 'names, emails, roles of every user' },
  { name: 'students',                 mustBeEmpty: true,  why: 'minors’ personal data' },
  { name: 'staff',                    mustBeEmpty: true,  why: 'includes salary' },
  { name: 'school_settings',          mustBeEmpty: true,  why: 'migration 20260301 granted this to PUBLIC' },
  { name: 'custom_roles',             mustBeEmpty: true,  why: 'permission arrays feed authorization' },
  { name: 'fees_payments',            mustBeEmpty: true,  why: 'financial records' },
  { name: 'fee_items',                mustBeEmpty: true,  why: 'fee structure' },
  { name: 'payment_allocations',      mustBeEmpty: true,  why: 'source of truth for amounts paid' },
  { name: 'payment_transactions',     mustBeEmpty: true,  why: 'payer emails and references' },
  { name: 'payment_transaction_logs', mustBeEmpty: true,  why: 'audit trail' },
  { name: 'payment_idempotency',      mustBeEmpty: true,  why: 'payment references' },
  { name: 'paystack_webhook_events',  mustBeEmpty: true,  why: 'gateway event history' },
  { name: 'audit_logs',               mustBeEmpty: true,  why: 'who did what, across the portal' },
  { name: 'grades',                   mustBeEmpty: true,  why: 'student academic records' },
  { name: 'notifications',            mustBeEmpty: true,  why: 'per-user messages' },
  { name: 'inventory',                mustBeEmpty: true,  why: 'internal asset register' },
  { name: 'applications',             mustBeEmpty: true,  why: 'applicant personal data' },
  { name: 'calendar_events',          mustBeEmpty: true,  why: 'internal schedule' },
];

// ── Probe ────────────────────────────────────────────────────────────────────
async function probe(table) {
  const url = `${URL_BASE}/rest/v1/${table}?select=id`;
  let res;
  try {
    res = await fetch(url, {
      method: 'HEAD',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
  } catch (err) {
    return { status: 'error', detail: err.message };
  }

  // PostgREST reports the total in Content-Range as "start-end/total".
  const range = res.headers.get('content-range') || '';
  const total = range.includes('/') ? range.split('/')[1] : null;

  if (res.status === 404) return { status: 'missing', detail: 'table not found' };
  if (res.status === 401 || res.status === 403) {
    return { status: 'denied', detail: `HTTP ${res.status}`, rows: 0 };
  }
  if (!res.ok) return { status: 'error', detail: `HTTP ${res.status}`, rows: null };

  const rows = total === '*' || total === null ? 0 : Number(total);
  return { status: rows > 0 ? 'readable' : 'empty', rows, detail: `HTTP ${res.status}` };
}

async function main() {
  const results = [];
  for (const table of TABLES) {
    const result = await probe(table.name);
    results.push({ ...table, ...result });
  }

  const exposed = results.filter(r => r.mustBeEmpty && r.status === 'readable');

  if (JSON_OUT) {
    console.log(JSON.stringify({ url: URL_BASE, results, exposed: exposed.map(e => e.name) }, null, 2));
  } else {
    print(results, exposed);
  }

  process.exit(exposed.length > 0 ? 1 : 0);
}

function print(results, exposed) {
  const project = URL_BASE.replace(/^https?:\/\//, '').split('.')[0];
  console.log(`\n  Anon-key RLS probe — project ${project}`);
  console.log(`  What an unauthenticated visitor can read.\n`);

  const label = {
    readable: 'EXPOSED ',
    empty:    'ok      ',
    denied:   'ok      ',
    missing:  'absent  ',
    error:    'error   ',
  };

  for (const r of results) {
    const rows = r.rows === null ? '?' : r.rows;
    const note = r.status === 'readable' ? `  ← ${r.why}` : '';
    console.log(`  ${label[r.status]} ${r.name.padEnd(26)} ${String(rows).padStart(6)} rows${note}`);
  }

  console.log('');
  if (exposed.length === 0) {
    console.log('  No sensitive table returned rows to the anon key.\n');
    console.log('  Caveat: a table that is genuinely empty is indistinguishable from');
    console.log('  one that RLS is blocking. Re-run against a project with data, or');
    console.log('  confirm the policies in the Supabase dashboard.\n');
  } else {
    console.log(`  ${exposed.length} table(s) readable without authentication:\n`);
    for (const e of exposed) console.log(`    - ${e.name} (${e.rows} rows) — ${e.why}`);
    console.log('\n  Apply supabase/migrations/0013_harden_rls_policies.sql.\n');
  }
}

main();
