/* =============================================
   HITSTER PWA — sw.js
   Service Worker — Cache-First Strategy
   ============================================= */

const CACHE_NAME = 'hitster-cache-v1';

// Core files to cache on install
const CORE_ASSETS = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'songs.json',
  'manifest.json',
  'assets/homelogo.png',
  'assets/afspeelcirkel.gif',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

// External resources to cache on first use
const CACHE_EXTERNALS = [
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
];

// =====================
// INSTALL — pre-cache core assets
// =====================
self.addEventListener('install', event => {
  console.log('[SW] Installing…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching core assets');
        // Cache core assets, but don't fail if one is missing
        return Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Could not cache:', url, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// =====================
// ACTIVATE — clean old caches
// =====================
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// =====================
// FETCH — Cache-First for app shell; Network-First for audio
// =====================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) return;

  // Audio files: Network-First (large files, stream from server)
  if (url.pathname.startsWith('/songs/') || url.pathname.includes('.mp3')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Google Fonts / CDN: Cache-First
  if (CACHE_EXTERNALS.some(ext => event.request.url.startsWith(ext.split('?')[0]))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: Cache-First with network fallback
  event.respondWith(cacheFirst(event.request));
});

// =====================
// STRATEGIES
// =====================

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Network failed for:', request.url);
    return new Response('Offline — bestand niet beschikbaar', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline — audiobestand niet beschikbaar', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}