// Service Worker for DINING MANAGEMENT SYSTEM (PWA)
// The __BUILD_TIME__ placeholder is replaced with a unique timestamp during 'npm run build'
const BUILD_TIME = '__BUILD_TIME__';
const CACHE_NAME = BUILD_TIME.startsWith('__') ? `meal-sys-dev-${Date.now()}` : `meal-sys-v${BUILD_TIME}`;

// Core assets to pre-cache on install for offline functionality
const PRECACHE_ASSETS = [
  'manifest.json',
  'logo.svg',
];

// 1. Install Event: Pre-cache minimal shell assets
self.addEventListener('install', (event) => {
  const scope = self.registration.scope;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const urlsToCache = PRECACHE_ASSETS.map((asset) => new URL(asset, scope).href);
      return cache.addAll(urlsToCache).catch((err) => {
        console.warn('[SW] Non-fatal pre-cache warning:', err);
      });
    })
  );
});

// 2. Activate Event: Clean up all older caches (CacheStorage ONLY - NEVER touches IndexedDB)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Message Event: Handle SKIP_WAITING from the UI "Update Now" prompt
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Event:
// - Navigation/HTML: NETWORK-FIRST with offline cache fallback (prevents stale HTML forever!)
// - Hashed assets (/assets/): CACHE-FIRST with network fallback
// - Other static assets: STALE-WHILE-REVALIDATE
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests and http/https protocols
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) ||
    url.pathname.endsWith('.html') ||
    url.pathname === self.registration.scope ||
    url.pathname === `${self.registration.scope}index.html`;

  // === STRATEGY 1: NETWORK-FIRST FOR HTML / NAVIGATION ===
  if (isNavigation) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-cache' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
              // Also cache under scope and index.html for seamless offline fallback
              cache.put(self.registration.scope, responseToCache.clone());
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // If network is offline, serve cached index.html
          console.log('[SW] Device is offline, serving cached app shell for navigation');
          const cache = await caches.open(CACHE_NAME);
          const cached =
            (await cache.match(request)) ||
            (await cache.match(self.registration.scope)) ||
            (await cache.match(`${self.registration.scope}index.html`));
          if (cached) return cached;

          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>You are currently offline</h2><p>Please check your internet connection and reload.</p></body></html>',
            {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
          );
        })
    );
    return;
  }

  // === STRATEGY 2: CACHE-FIRST FOR CONTENT-HASHED ASSETS (/assets/) ===
  const isHashedAsset = url.pathname.includes('/assets/');
  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // === STRATEGY 3: STALE-WHILE-REVALIDATE FOR OTHER STATIC ASSETS ===
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
