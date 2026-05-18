#!/usr/bin/env node
// ============================================
// MIGRATION RUNNER
// Run: node supabase/run-migrations.js
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
// ============================================

const fs   = require('fs');
const path = require('path');
const https = require('https');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ── Migration tracking table ──────────────────────────────────────────────────

const CREATE_TRACKER = `
CREATE TABLE IF NOT EXISTS _migration_history (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  checksum VARCHAR(64)
);
`;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        else resolve(JSON.parse(data || '{}'));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Simpler: use Supabase's SQL endpoint directly
function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const urlStr = `${SUPABASE_URL}/rest/v1/`;
    // Use the Supabase management API's SQL endpoint
    const pgUrl = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
    const managementUrl = `https://api.supabase.com/v1/projects/${pgUrl}/database/query`;

    const body = JSON.stringify({ query: sql });
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${SERVICE_KEY}`,
      }
    };

    const url = new URL(managementUrl);
    const req = https.request({ ...options, hostname: url.hostname, path: url.pathname }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`SQL error (${res.statusCode}): ${data}`));
        } else {
          resolve(data ? JSON.parse(data) : {});
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 TBD Academy — Migration Runner');
  console.log(`📡 Supabase project: ${SUPABASE_URL}\n`);

  // Get migration files sorted by number
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.match(/^\d{4}_.*\.sql$/))
    .sort();

  if (!files.length) {
    console.log('ℹ️  No migration files found.');
    process.exit(0);
  }

  console.log(`📂 Found ${files.length} migration file(s):\n`);
  files.forEach(f => console.log(`  • ${f}`));

  // Dry-run mode
  if (process.argv.includes('--dry-run')) {
    console.log('\n[DRY RUN] The following SQL would be executed:');
    files.forEach(f => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      console.log(`\n──── ${f} ────\n${sql.substring(0, 200)}…\n`);
    });
    process.exit(0);
  }

  // Apply each migration
  let applied = 0;
  let skipped = 0;
  let errored = 0;

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    process.stdout.write(`  Running ${file}… `);
    try {
      await runSQL(sql);
      console.log('✅');
      applied++;
    } catch (err) {
      // Many errors mean "already applied" (duplicate table, constraint, etc.)
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log('⊘ (already applied)');
        skipped++;
      } else {
        console.log(`❌\n    Error: ${err.message}`);
        errored++;
      }
    }
  }

  console.log('\n──────────────────────────────────');
  console.log(`✅ Applied: ${applied}`);
  console.log(`⊘ Skipped: ${skipped}`);
  if (errored) console.log(`❌ Errors:  ${errored}`);
  console.log('──────────────────────────────────\n');

  if (errored > 0) process.exit(1);
}

main().catch(err => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
