/**
 * Service Worker — Dr. Rania Patient Intelligence Assistant
 * Strategy:
 *   - Static assets (JS/CSS/fonts/icons): Cache-First (fastest load on tablet)
 *   - API calls (/api/*): Network-First (always fresh medical data)
 *   - HTML navigation: Network-First with offline shell fallback
 *
 * Version bumped on every deploy via CACHE_VERSION constant.
 */

const CACHE_VERSION = 'v4';
const CACHE_STATIC  = 'dr-rania-static-'  + CACHE_VERSION;
const CACHE_PAGES   = 'dr-rania-pages-'   + CACHE_VERSION;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
];

// ── Install: precache shell assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: prune stale caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const ACTIVE = [CACHE_STATIC, CACHE_PAGES];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !ACTIVE.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch routing ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 1. API — Network First, offline error JSON
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'Offline — please reconnect to the clinic network' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 2. Static assets — Cache First, then network + update cache
  if (
    url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|ico|svg|webp|gif)$/) ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 3. HTML navigation — Network First with offline app shell fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_PAGES).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match('/').then((shell) =>
          shell || new Response('Offline — please reconnect', { status: 503 })
        )
      )
  );
});
