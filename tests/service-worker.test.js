// ============================================
// SERVICE WORKER — offline routing tests
// Run: node tests/service-worker.test.js
// ============================================
// These are async, so they live outside tests/runner.js (which is sync-only).
//
// Regression guard for the bug where a public page served over a failed/slow
// network was answered with the cached portal shell. That file runs an auth
// guard, so a visitor with no session was redirected to login.html while the
// address bar still read the public URL — a reload just repeated it.
// ============================================

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

async function it(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
    failures.push({ name, error: err.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

/**
 * Load the real sw.js into a sandbox with the Service Worker globals stubbed.
 * @param {object} opts
 * @param {Map<string,string>} opts.cache  precached path -> body
 * @param {boolean} opts.online            whether fetch() succeeds
 */
const SW_PATH = process.env.SW_PATH || path.join(__dirname, '..', 'sw.js');

function loadWorker({ cache = new Map(), online = false } = {}) {
  const src = fs.readFileSync(SW_PATH, 'utf8');
  const listeners = {};
  const added = [];

  const stored = [];
  const cacheApi = {
    open: async () => ({
      put: async () => {},
      add: async (url) => {
        added.push(url);
        // Mirrors the browser: a missing/redirected URL rejects this one add.
        if (!cache.has(url)) throw new Error('404 ' + url);
        stored.push(url);
      },
      // cache.addAll is atomic — one bad URL discards the whole batch.
      addAll: async (urls) => {
        urls.forEach(u => added.push(u));
        if (urls.some(u => !cache.has(u))) throw new Error('addAll: one or more failed');
        urls.forEach(u => stored.push(u));
      }
    }),
    match: async (req) => {
      const url = typeof req === 'string' ? req : new URL(req.url).pathname;
      return cache.has(url)
        ? new Response(cache.get(url), { headers: { 'Content-Type': 'text/html' } })
        : undefined;
    },
    keys: async () => [],
    delete: async () => {}
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, AbortController, URL, Response, Request, Headers,
    Promise,
    self: {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      location: { origin: 'https://school.example' },
      registration: {},
      clients: { matchAll: async () => [], claim: async () => {} },
      skipWaiting: () => {}
    },
    caches: cacheApi,
    clients: { openWindow: () => {} },
    fetch: async () => {
      if (!online) throw new Error('net::ERR_INTERNET_DISCONNECTED');
      return new Response('<html><!-- LIVE FROM NETWORK --></html>', {
        status: 200, headers: { 'Content-Type': 'text/html' }
      });
    }
  };
  sandbox.self.caches = cacheApi;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { listeners, sandbox, added, stored };
}

/** Drive the SW's fetch handler for an HTML navigation and return the body. */
async function navigate(listeners, pathname) {
  let served;
  listeners.fetch({
    request: new Request('https://school.example' + pathname, {
      headers: { accept: 'text/html,application/xhtml+xml' }
    }),
    respondWith: (p) => { served = p; }
  });
  assert(served, 'navigation to ' + pathname + ' was not intercepted');
  const res = await served;
  return { body: await res.text(), status: res.status };
}

const PORTAL_SHELL = '<html><!-- ADMIN PORTAL SHELL: redirects to login --></html>';

(async () => {
  console.log('\n\x1b[1m📦 Service Worker — offline routing\x1b[0m');

  await it('never serves the portal shell for a public page when offline', async () => {
    const { listeners } = loadWorker({
      cache: new Map([['/portal.html', PORTAL_SHELL], ['/login.html', 'login']]),
      online: false
    });
    const { body } = await navigate(listeners, '/about.html');
    assert(!body.includes('ADMIN PORTAL SHELL'),
      'public page was answered with the auth-guarded portal shell');
  });

  await it('serves the offline page when the requested page is not cached', async () => {
    const { listeners } = loadWorker({
      cache: new Map([
        ['/portal.html', PORTAL_SHELL],
        ['/offline.html', '<html><!-- OFFLINE PAGE --></html>']
      ]),
      online: false
    });
    const { body } = await navigate(listeners, '/about.html');
    assert(body.includes('OFFLINE PAGE'), 'expected the offline page, got: ' + body.slice(0, 80));
  });

  await it('serves the real public page offline once it is precached', async () => {
    const { listeners } = loadWorker({
      cache: new Map([
        ['/portal.html', PORTAL_SHELL],
        ['/offline.html', 'offline'],
        ['/about.html', '<html><!-- PUBLIC PAGE --></html>']
      ]),
      online: false
    });
    const { body } = await navigate(listeners, '/about.html');
    assert(body.includes('PUBLIC PAGE'), 'expected the cached public page, got: ' + body.slice(0, 80));
  });

  await it('still prefers the network when online', async () => {
    const { listeners } = loadWorker({
      cache: new Map([['/about.html', '<html><!-- STALE --></html>']]),
      online: true
    });
    const { body } = await navigate(listeners, '/about.html');
    assert(body.includes('LIVE FROM NETWORK'), 'expected the network response, got: ' + body.slice(0, 80));
  });

  await it('falls back to inline HTML when even the offline page is missing', async () => {
    const { listeners } = loadWorker({ cache: new Map(), online: false });
    const { body, status } = await navigate(listeners, '/about.html');
    assert(status === 503, 'expected 503, got ' + status);
    assert(/offline/i.test(body), 'expected an offline message');
  });

  await it('precaches the public pages and the offline page', async () => {
    const { listeners, added } = loadWorker({ cache: new Map(), online: false });
    let waited;
    listeners.install({ waitUntil: (p) => { waited = p; } });
    await waited;
    for (const required of ['/offline.html', '/', '/about.html', '/login.html']) {
      assert(added.includes(required), 'not precached: ' + required);
    }
    // The redirecting path swapped over: index.html is now a real file at the
    // root, so '/' is cacheable, while '/index.html' 301s to it and is not.
    assert(!added.includes('/index.html'),
      "'/index.html' must not be precached — it 301s to '/', and redirected responses cannot be cached");
  });

  await it('one unreachable asset does not wipe the whole precache', async () => {
    // Only these two are reachable; every other precache entry 404s. The
    // reachable ones must still be cached. cache.addAll() is atomic, so using
    // it here would leave the cache completely empty — which is what used to
    // happen in production, because one redirecting entry took the entire
    // batch down with it.
    const { listeners, stored } = loadWorker({
      cache: new Map([['/login.html', 'login'], ['/offline.html', 'offline']]),
      online: false
    });
    let waited;
    listeners.install({ waitUntil: (p) => { waited = p; } });
    await waited;
    assert(stored.includes('/login.html') && stored.includes('/offline.html'),
      'reachable assets were discarded along with the failing one; got: ' + JSON.stringify(stored));
  });

  console.log('\n' + '─'.repeat(50));
  console.log(`  \x1b[32m✓ Passed:  ${passed}\x1b[0m`);
  if (failed) console.log(`  \x1b[31m✗ Failed:  ${failed}\x1b[0m`);
  console.log('─'.repeat(50));

  if (failed) {
    console.log('\n\x1b[31mFailed tests:\x1b[0m');
    failures.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.error}`));
    process.exit(1);
  }
  console.log('\n\x1b[32m✓ Service worker tests passed!\x1b[0m\n');
})();
