const CACHE_NAME = 'meal-sys-v1';

// Install event - Cache static assets using current service worker scope
self.addEventListener('install', (event) => {
  const scope = self.registration.scope;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        scope,
        `${scope}index.html`,
        `${scope}manifest.json`,
        `${scope}logo.svg`,
      ]).catch((err) => {
        console.warn('SW initial cache warning (non-fatal):', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Cache-first with network fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const scope = self.registration.scope;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Offline fallback
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match(`${scope}index.html`) || caches.match(scope);
        }
      });
    })
  );
});
