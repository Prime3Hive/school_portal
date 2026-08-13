#!/usr/bin/env node
/**
 * Static checks that run before every build.
 *
 * There is no bundler or type checker in this project, so a file with a syntax
 * error — or one that reads a global its page never loads — ships silently and
 * fails at runtime in the browser. That is exactly how `file-upload-manager.js`
 * ended up throwing on the teacher portal: it reads `AppConfig` at module top
 * level, and `teacher-portal.html` did not load `config.js`.
 *
 * Two checks:
 *   1. Every .js file parses.
 *   2. Every page that loads a script depending on a top-level global also
 *      loads the script that defines it.
 *
 * Usage: node scripts/check-syntax.js
 * Exit code 1 on any failure, so it works as a CI gate.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', '.claude', 'dist']);

/**
 * Globals that are read at module top level (not inside a function), and the
 * file that defines each. If a page loads the dependent, it must also load the
 * provider — otherwise the dependent throws while executing and every symbol it
 * would have defined goes missing.
 */
const TOP_LEVEL_GLOBALS = {
  AppConfig: 'js/config.js',
};

let failures = 0;

function fail(message) {
  console.error(`  ✗ ${message}`);
  failures++;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

// ── Check 1: every .js file parses ───────────────────────────────────────────
function checkSyntax(jsFiles) {
  console.log('\n  Parsing JavaScript');
  for (const file of jsFiles) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    try {
      // Parse without executing. Scripts here are classic (non-module) scripts.
      new vm.Script(source, { filename: rel });
    } catch (err) {
      fail(`${rel}: ${err.message}`);
    }
  }
  console.log(`    ${jsFiles.length} files parsed`);
}

// ── Check 2: top-level global dependencies are satisfied per page ─────────────

/** Scripts a page loads, as repo-relative paths. */
function scriptsIn(html) {
  const found = [];
  const re = /<script\b[^>]*\ssrc=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (/^https?:\/\//i.test(src)) continue;          // CDN
    found.push(src.replace(/^\.\//, '').replace(/\?.*$/, ''));
  }
  return found;
}

/**
 * A stand-in for any global the file touches: callable, constructible, and
 * infinitely property-accessible, so incidental DOM/library use doesn't blow up.
 */
function permissiveStub() {
  const target = function () {};
  return new Proxy(target, {
    get: (t, key) => {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === 'then') return undefined;   // don't look like a thenable
      return permissiveStub();
    },
    set: () => true,
    has: () => true,
    apply: () => permissiveStub(),
    construct: () => permissiveStub(),
  });
}

/** Execute `source` in a sandbox; return the thrown error message, or null. */
function runIsolated(source, filename, absentGlobals) {
  const sandbox = new Proxy({}, {
    has: (_t, key) => !absentGlobals.has(key),
    get: (_t, key) => (absentGlobals.has(key) ? undefined : permissiveStub()),
    set: () => true,
  });

  try {
    new vm.Script(source, { filename })
      .runInContext(vm.createContext(sandbox), { timeout: 5000 });
    return null;
  } catch (err) {
    return `${err.constructor?.name}: ${err.message}`;
  }
}

/**
 * Does this file fail to load when `global` is missing?
 *
 * Determined differentially: run the file twice, once with the global present
 * and once without, and compare. If it only breaks in the second run, it has a
 * load-time dependency on that global.
 *
 * Two dead ends this avoids. Brace-depth heuristics miss the real case —
 * `file-upload-manager.js` reads AppConfig inside a top-level *object literal*,
 * nested by braces but still executed at load. And checking for a ReferenceError
 * doesn't work either: an absent global in a VM context reads as `undefined`, so
 * `AppConfig.storage` raises TypeError, not ReferenceError.
 *
 * The differential also handles `typeof X !== 'undefined'` guards for free —
 * guarded code doesn't throw in either run, so it isn't flagged.
 */
function readsGlobalAtTopLevel(source, global, filename) {
  const withGlobal    = runIsolated(source, filename, new Set());
  const withoutGlobal = runIsolated(source, filename, new Set([global]));

  // Broke only when the global was taken away → real load-time dependency.
  return withoutGlobal !== null && withoutGlobal !== withGlobal;
}

function checkGlobals(htmlFiles) {
  console.log('\n  Checking top-level global dependencies');

  // Which files depend on which global?
  const dependents = {};
  for (const [global, provider] of Object.entries(TOP_LEVEL_GLOBALS)) {
    dependents[global] = [];
    for (const file of walk(ROOT).filter(f => f.endsWith('.js'))) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (rel === provider || !rel.startsWith('js/')) continue;
      if (readsGlobalAtTopLevel(fs.readFileSync(file, 'utf8'), global, rel)) {
        dependents[global].push(rel);
      }
    }
  }

  let checked = 0;
  for (const file of htmlFiles) {
    const rel  = path.relative(ROOT, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    const loaded = new Set(scriptsIn(html));
    if (loaded.size === 0) continue;

    for (const [global, provider] of Object.entries(TOP_LEVEL_GLOBALS)) {
      const missing = dependents[global].filter(dep => loaded.has(dep));
      if (missing.length > 0 && !loaded.has(provider)) {
        fail(
          `${rel} loads ${missing.join(', ')} which read \`${global}\` at top level, ` +
          `but does not load ${provider} — those files will throw on load.`
        );
      }
    }
    checked++;
  }
  console.log(`    ${checked} pages checked`);
}

// ── Run ──────────────────────────────────────────────────────────────────────
const allFiles  = walk(ROOT);
const jsFiles   = allFiles.filter(f => f.endsWith('.js'));
const htmlFiles = allFiles.filter(f => f.endsWith('.html'));

checkSyntax(jsFiles);
checkGlobals(htmlFiles);

if (failures > 0) {
  console.error(`\n  ${failures} problem(s) found.\n`);
  process.exit(1);
}
console.log('\n  All checks passed.\n');
