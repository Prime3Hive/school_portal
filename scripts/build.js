#!/usr/bin/env node
/**
 * Production build — content-addressed asset pipeline.
 *
 * WHY THIS EXISTS
 * ---------------
 * Our JS/CSS filenames used to be stable (`js/app.js`), which makes long-lived
 * HTTP caching unsafe: a browser that cached `js/app.js` has no way to learn a
 * new build exists. We previously worked around that by forcing revalidation on
 * every asset, which costs ~30 conditional requests per page load.
 *
 * This script stamps each JS/CSS file with a hash of its own contents
 * (`js/app.4f2a1c9d.js`) and rewrites every reference to match. Because the URL
 * changes whenever the bytes change, the files can be served `immutable` — zero
 * revalidation, and deploys still reach users instantly.
 *
 * DESIGN NOTES
 * ------------
 * - Zero dependencies. Node built-ins only, so `npm ci` stays unnecessary.
 * - Dev is untouched: `python -m http.server` still serves the repo root with
 *   plain filenames. Nothing here runs at dev time.
 * - `js/app.js` builds module paths dynamically (`js/modules/${name}.js`), which
 *   no static rewrite can catch. We inline an asset map into each HTML page and
 *   `loadScript()` resolves through it, falling back to the raw path in dev.
 * - `sw.js` and `api/*` keep stable names: the service worker must live at
 *   `/sw.js` to control the origin, and Vercel routes functions by file path.
 *
 * Usage: node scripts/build.js [--out dist] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const args    = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const OUT_DIR = path.resolve(ROOT, valueOf('--out') || 'dist');

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

// ── What ships ───────────────────────────────────────────────────────────────
// Anything not matched here is left out of the deployment entirely.
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.vercel', '.claude', 'scripts', 'tests',
  'supabase', 'netlify', 'sql', 'dist',
  // `api/` is deliberately NOT copied into the output directory. Vercel picks
  // serverless functions up from the project root, and copying them into dist
  // would also publish their source as a static file.
  'api',
]);

const EXCLUDED_FILES = new Set([
  'package.json', 'package-lock.json', 'netlify.toml', 'vercel.json',
  '.gitignore', '.gitattributes', '.vercelignore',
]);

/** Files whose names must NOT be hashed — their paths are contracts. */
const STABLE_PATHS = new Set([
  'sw.js',            // must be served from the origin root to control scope
  'manifest.json',
]);

function isExcluded(relPath) {
  const parts = relPath.split('/');
  if (parts.some(p => EXCLUDED_DIRS.has(p))) return true;

  const base = parts[parts.length - 1];
  if (EXCLUDED_FILES.has(base)) return true;

  // Never ship env files, docs, archives, or the Supabase CLI binary.
  if (base.startsWith('.env')) return true;
  if (base.endsWith('.md'))    return true;
  if (base.endsWith('.tar.gz') || base.endsWith('.exe')) return true;

  return false;
}

function shouldHash(relPath) {
  if (STABLE_PATHS.has(relPath)) return false;
  return relPath.endsWith('.js') || relPath.endsWith('.css');
}

// ── Filesystem helpers ───────────────────────────────────────────────────────
function walk(dir, base = ROOT, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (isExcluded(rel)) continue;
    if (entry.isDirectory()) walk(abs, base, acc);
    else if (entry.isFile()) acc.push(rel);
  }
  return acc;
}

function hashContent(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

function hashedName(relPath, hash) {
  const ext  = path.extname(relPath);              // ".js"
  const stem = relPath.slice(0, -ext.length);      // "js/app"
  return `${stem}.${hash}${ext}`;                  // "js/app.4f2a1c9d.js"
}

/**
 * Empty the output directory without deleting the directory itself.
 *
 * Removing the root would be simpler, but on Windows it fails with EPERM
 * whenever anything holds a handle on it — a `npm run preview` server still
 * serving out of dist/, or an editor with the folder open. Clearing the contents
 * instead succeeds in those cases and is equivalent for our purposes.
 */
function cleanOutputDir() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    return;
  }

  for (const entry of fs.readdirSync(OUT_DIR)) {
    const target = path.join(OUT_DIR, entry);
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (err) {
      console.error(
        `  ERROR: could not remove ${path.relative(ROOT, target)} — ${err.code}.\n` +
        `  Something is holding it open (a preview server, or your editor).`
      );
      process.exit(1);
    }
  }
}

function writeOut(relPath, contents) {
  const dest = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents);
}

// ── Build ────────────────────────────────────────────────────────────────────
function build() {
  const started = Date.now();

  cleanOutputDir();

  const files = walk(ROOT);

  // Pass 1 — hash every JS/CSS file and build original → hashed map.
  /** @type {Record<string,string>} */
  const assetMap = {};
  const contents = new Map();

  for (const rel of files) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    contents.set(rel, buf);
    if (shouldHash(rel)) {
      assetMap[rel] = hashedName(rel, hashContent(buf));
    }
  }

  // A single fingerprint for the whole asset set — used to version the SW cache
  // so each deploy gets a fresh cache bucket instead of reusing a stale one.
  const buildId = hashContent(
    Buffer.from(Object.keys(assetMap).sort().map(k => `${k}:${assetMap[k]}`).join('\n'))
  );

  const inlineMap = buildInlineAssetMap(assetMap);

  let htmlCount = 0, hashedCount = 0, copiedCount = 0;

  // Pass 2 — emit, rewriting references as we go.
  for (const rel of files) {
    const buf = contents.get(rel);

    if (rel.endsWith('.html')) {
      const rewritten = rewriteHtml(buf.toString('utf8'), assetMap, inlineMap);
      writeOut(rel, rewritten);
      htmlCount++;
      continue;
    }

    if (rel === 'sw.js') {
      const rewritten = rewriteServiceWorker(buf.toString('utf8'), assetMap, buildId);
      writeOut(rel, rewritten);
      copiedCount++;
      continue;
    }

    if (assetMap[rel]) {
      writeOut(assetMap[rel], buf);
      hashedCount++;
      continue;
    }

    writeOut(rel, buf);
    copiedCount++;
  }

  // Emit the manifest as a build artifact — useful for debugging a bad deploy.
  writeOut('asset-manifest.json', JSON.stringify({ buildId, assets: assetMap }, null, 2));

  report({ htmlCount, hashedCount, copiedCount, buildId, started, assetMap });
}

/**
 * Inline `<script>` that teaches the runtime how to resolve an unhashed path.
 * Injected into every HTML page so `app.js` can map `js/modules/fees-payments.js`
 * to its hashed filename at navigation time.
 */
function buildInlineAssetMap(assetMap) {
  // Only module scripts are looked up at runtime; shipping the whole map to
  // every page would be dead weight.
  const runtimeEntries = Object.fromEntries(
    Object.entries(assetMap).filter(([k]) => k.startsWith('js/modules/'))
  );
  return `<script>window.__ASSET_MAP=${JSON.stringify(runtimeEntries)};</script>`;
}

/** Rewrite src=/href= attributes and inject the runtime asset map. */
function rewriteHtml(html, assetMap, inlineMap) {
  let out = html.replace(
    /(\s(?:src|href)=)(["'])([^"']+)\2/g,
    (match, attr, quote, url) => {
      const normalized = url.replace(/^\.\//, '');
      const hashed = assetMap[normalized];
      return hashed ? `${attr}${quote}${hashed}${quote}` : match;
    }
  );

  // Inject before the first <script> so the map exists before app.js needs it.
  // Falls back to </head>, then <body>, so a page without scripts still works.
  const injectionPoint = out.search(/<script\b/i);
  if (injectionPoint !== -1) {
    out = out.slice(0, injectionPoint) + inlineMap + '\n  ' + out.slice(injectionPoint);
  } else if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `  ${inlineMap}\n</head>`);
  }

  return out;
}

/**
 * The service worker pre-caches a hardcoded asset list and keys its caches on
 * CACHE_VERSION. Both must track the build or the SW will pre-cache 404s and
 * serve last deploy's files.
 */
function rewriteServiceWorker(source, assetMap, buildId) {
  let out = source.replace(
    /(['"])\/((?:js|css)\/[^'"]+)\1/g,
    (match, quote, rel) => {
      const hashed = assetMap[rel];
      return hashed ? `${quote}/${hashed}${quote}` : match;
    }
  );

  out = out.replace(
    /const CACHE_VERSION = ['"][^'"]*['"];/,
    `const CACHE_VERSION = '${buildId}'; // stamped by scripts/build.js`
  );

  return out;
}

function report({ htmlCount, hashedCount, copiedCount, buildId, started, assetMap }) {
  const ms = Date.now() - started;
  console.log(`\n  Build ${buildId} → ${path.relative(ROOT, OUT_DIR)}/`);
  console.log(`  ${hashedCount} hashed · ${htmlCount} html rewritten · ${copiedCount} copied · ${ms}ms\n`);

  if (VERBOSE) {
    for (const [from, to] of Object.entries(assetMap).sort()) {
      console.log(`    ${from}  →  ${to}`);
    }
    console.log('');
  }

  // Fail loudly rather than shipping an empty directory.
  if (hashedCount === 0) {
    console.error('  ERROR: no assets were hashed — check EXCLUDED_DIRS/paths.');
    process.exit(1);
  }
  if (htmlCount === 0) {
    console.error('  ERROR: no HTML files were emitted — nothing would be served.');
    process.exit(1);
  }
}

build();
