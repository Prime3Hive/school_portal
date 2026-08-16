// ============================================
// SERVICE WORKER — TBD International Academy School Portal
// Strategy: Network-first for API/Supabase, stale-while-revalidate for static assets
// ============================================
// CACHING CONTRACT
// ----------------
// `scripts/build.js` content-hashes JS/CSS filenames (js/app.4f2a1c9d.js) and
// stamps CACHE_VERSION below with the build id. That gives us two classes of
// same-origin asset, handled differently:
//
//   • Hashed (js/app.<hash>.js)  → cache-first. The URL changes whenever the
//     bytes change, so a cache hit can never be stale. No revalidation at all.
//   • Unhashed (manifest.json …) → stale-while-revalidate. Instant paint from
//     cache, refreshed in the background, correct on the next navigation.
//
// Pure cache-first on an unhashed URL would pin a user to whatever build they
// first loaded, forever — that is the trap this split avoids.

const CACHE_VERSION = 'dev'; // replaced with the build id by scripts/build.js

/** Matches a build-fingerprinted filename: name.<8 hex>.js|css */
const HASHED_ASSET = /\.[0-9a-f]{8}\.(?:js|css)$/;
const STATIC_CACHE  = `tbd-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `tbd-dynamic-${CACHE_VERSION}`;

/**
 * Page served when an HTML navigation cannot be satisfied from network or cache.
 * It must never be the portal shell: index.html runs an auth guard, so handing
 * it to someone who asked for a public page bounces them to the login screen.
 */
const OFFLINE_PAGE = '/offline.html';

// Static assets to pre-cache on install.
// NOTE: no '/' entry — on Vercel it 3xx-redirects to /public-blog.html, and a
// redirected response cannot be written to the cache.
const PRECACHE_ASSETS = [
  '/index.html',
  '/login.html',
  OFFLINE_PAGE,
  // Public pages carry no auth guard and must stay reachable offline.
  '/public-blog.html',
  '/about.html',
  '/academics.html',
  '/admissions.html',
  '/contact.html',
  '/assets/logo-mark.svg',
  '/assets/logo.svg',
  '/assets/app-icon.svg',
  '/assets/campus-panel.svg',
  '/css/design-system.css',
  '/css/components.css',
  '/css/accessibility.css',
  '/css/dashboard-v2.css',
  '/css/mobile-optimizations.css',
  '/js/config.js',
  '/js/env-loader.js',
  '/js/school-config.js',
  '/js/permission-manager.js',
  '/js/components.js',
  '/js/loading-manager.js',
  '/js/theme-manager.js',
  '/js/bcrypt.min.js',
  '/js/auth-manager.js',
  '/js/data-manager.js',
  '/js/supabase-client.js',
  '/js/notification-manager.js',
  '/js/session-manager.js',
  '/js/global-search.js',
  '/js/payment-service.js',
  '/js/modules/admin-dashboard.js',
  '/manifest.json',
];

// Hosts whose responses should NEVER be cached (auth, real-time, payments)
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'paystack.co',
  'js.paystack.co',
];

// Hosts to use network-first (CDN scripts — cache as fallback)
const NETWORK_FIRST_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
];

// ── Install: pre-cache static assets ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async cache => {
        // Deliberately NOT cache.addAll(): that call is atomic, so a single
        // missing or redirected entry rejects the whole batch and leaves the
        // cache completely empty. Cache each asset on its own instead, so one
        // bad URL costs one asset rather than the entire precache.
        const results = await Promise.allSettled(
          PRECACHE_ASSETS.map(asset => cache.add(asset))
        );
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? PRECACHE_ASSETS[i] : null))
          .filter(Boolean);
        if (failed.length) console.warn('[SW] Pre-cache skipped:', failed);
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Non-GET requests always go to network (writes, auth, etc.)
  if (request.method !== 'GET') return;

  // 2. Never cache Supabase, Paystack, or other sensitive endpoints
  if (NEVER_CACHE_HOSTS.some(h => url.hostname.includes(h))) return;

  // 3. CDN scripts: network-first, fall back to cache
  if (NETWORK_FIRST_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE, 5000));
    return;
  }

  // 4. Same-origin HTML pages: network-first (keep content fresh).
  //    The timeout is deliberately generous — aborting early on a slow mobile
  //    connection drops an online user into the offline path for no good reason.
  if (url.origin === self.location.origin && request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request, STATIC_CACHE, 10000));
    return;
  }

  // 5. Never serve the runtime config from cache — it carries env values
  //    that differ per deployment and must not go stale.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // 6. Build-fingerprinted assets are immutable by construction — a cache hit
  //    is always correct, so serve it without touching the network.
  if (url.origin === self.location.origin && HASHED_ASSET.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 7. Remaining same-origin assets have stable names and could change in place,
  //    so revalidate in the background rather than trusting the cache forever.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
});

// ── Strategy helpers ──────────────────────────────────────────────────────────

/** Cache hit wins outright. Only safe for content-addressed (hashed) URLs. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Serve from cache immediately (if present) while refreshing the cache in the
 * background. A user on a stale build gets the current file on their next
 * navigation instead of being pinned to it forever.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  const networkFetch = fetch(request)
    .then(async response => {
      if (response.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Don't let the background refresh be killed when the response settles.
    networkFetch.catch(() => {});
    return cached;
  }

  const fresh = await networkFetch;
  if (fresh) return fresh;

  return new Response('Offline — resource unavailable', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}

async function networkFirst(request, cacheName, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    clearTimeout(timeout);
    const cached = await caches.match(request);
    if (cached) return cached;

    // Offline fallback for HTML pages.
    //
    // This used to hand back the cached '/index.html'. That is an SPA-shell
    // assumption and this app is multi-page: every route is a real file with
    // its own guard. Serving the portal shell for, say, /public-blog.html ran
    // index.html's auth check against a visitor with no session, which
    // redirected them to login.html — while the address bar still read
    // /public-blog.html, so reloading just repeated the bounce.
    //
    // Never substitute a different page: serve a neutral offline page instead.
    if (request.headers.get('accept')?.includes('text/html')) {
      const offlinePage = await caches.match(OFFLINE_PAGE);
      if (offlinePage) return offlinePage;
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
        '<p>You are offline. Please check your connection and try again.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    return new Response(JSON.stringify({ error: 'offline', message: 'You are offline. Please check your connection.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── Background sync: queue failed writes and retry on reconnect ──────────────
self.addEventListener('sync', event => {
  if (event.tag === 'tbd-sync-queue') {
    event.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  // Retrieve queued requests from IndexedDB (populated by the app)
  // This is a placeholder — the app stores failed writes in localStorage['tbd_sync_queue']
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SW_SYNC_READY' }));
}

// ── Push notifications ────────────────────────────────────────────────────────
// manifest.json is not an image — using it as an icon renders nothing.
// Use the school crest, same asset the manifest declares.
const NOTIFICATION_ICON = '/assets/app-icon.svg';

self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'TBD International Academy', {
      body: data.body || '',
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: data.tag || 'tbd-notification',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
