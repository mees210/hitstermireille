const CACHE_NAME = 'hitster-cache-v1';

const CORE_ASSETS = [
  'index.html',
  'style.css',
  'app.js',
  'songs.json',
  'manifest.json',
  'assets/homelogo.png',
  'assets/afspeelcirkel.gif',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

// Install: pre-cache alle kern-bestanden
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching core assets');
      // Gebruik addAll met foutafhandeling zodat ontbrekende assets de install niet breken
      return Promise.allSettled(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] Kon niet cachen: ${url}`, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: verwijder oude caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Verwijder oude cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First voor kern-assets, Network-Falling-Back-To-Cache voor de rest
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Sla niet-GET verzoeken over
  if (event.request.method !== 'GET') return;

  // Sla externe verzoeken (CDN, fonts) over — laat de browser dit afhandelen
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Cache hit — geef direct terug, maar vernieuw op de achtergrond
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => {/* netwerk niet beschikbaar, geen probleem */});
        return cachedResponse;
      }

      // Niet in cache: haal op van netwerk en sla op
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        return networkResponse;
      }).catch(() => {
        // Fallback voor HTML-pagina's
        if (event.request.destination === 'document') {
          return caches.match('index.html');
        }
      });
    })
  );
});
