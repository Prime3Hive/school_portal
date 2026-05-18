// ============================================
// SERVICE WORKER — TBD Academy School Portal
// Strategy: Network-first for API/Supabase, Cache-first for static assets
// ============================================

const CACHE_VERSION = 'v1';
const STATIC_CACHE  = `tbd-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `tbd-dynamic-${CACHE_VERSION}`;

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/css/design-system.css',
  '/css/components.css',
  '/css/accessibility.css',
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
      .then(cache => cache.addAll(PRECACHE_ASSETS).catch(err => {
        // Don't fail install if some assets are missing locally
        console.warn('[SW] Pre-cache partial failure:', err);
      }))
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

  // 4. Same-origin HTML pages: network-first (keep content fresh)
  if (url.origin === self.location.origin && request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request, STATIC_CACHE, 4000));
    return;
  }

  // 5. Same-origin static assets (JS, CSS, fonts, images): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

// ── Strategy helpers ──────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
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
    // Offline fallback for HTML pages
    if (request.headers.get('accept')?.includes('text/html')) {
      const offlinePage = await caches.match('/index.html');
      if (offlinePage) return offlinePage;
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
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'TBD Academy', {
      body: data.body || '',
      icon: '/manifest.json',
      badge: '/manifest.json',
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
