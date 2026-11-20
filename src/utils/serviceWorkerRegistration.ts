// Service Worker registration and lifecycle manager for PWA updates

type UpdateCallback = (registration: ServiceWorkerRegistration) => void;

const updateListeners = new Set<UpdateCallback>();
let activeRegistration: ServiceWorkerRegistration | null = null;
let isRefreshing = false;

// Notify all subscribers that a new version is waiting
function notifyUpdateListeners(registration: ServiceWorkerRegistration) {
  activeRegistration = registration;
  updateListeners.forEach((callback) => {
    try {
      callback(registration);
    } catch (err) {
      console.error('[SW Registration] Error in update listener:', err);
    }
  });
}

/**
 * Subscribe to update events when a new app version is available.
 * Returns an unsubscribe function.
 */
export function onServiceWorkerUpdate(callback: UpdateCallback): () => void {
  updateListeners.add(callback);
  // If an update is already waiting when subscriber connects, immediately notify
  if (activeRegistration && activeRegistration.waiting) {
    callback(activeRegistration);
  }
  return () => {
    updateListeners.delete(callback);
  };
}

/**
 * Triggers the waiting service worker to skipWaiting and reloads the page.
 */
export function applyServiceWorkerUpdate(registration?: ServiceWorkerRegistration | null) {
  const targetReg = registration || activeRegistration;
  if (!targetReg || !targetReg.waiting) {
    window.location.reload();
    return;
  }

  // Reload when the new service worker takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!isRefreshing) {
      isRefreshing = true;
      window.location.reload();
    }
  });

  // Signal the waiting service worker to activate
  targetReg.waiting.postMessage({ type: 'SKIP_WAITING' });

  // Safety timeout in case controllerchange doesn't fire
  setTimeout(() => {
    if (!isRefreshing) {
      isRefreshing = true;
      window.location.reload();
    }
  }, 1000);
}

/**
 * Register the Service Worker in production mode with automatic update checks.
 */
export function registerServiceWorker() {
  // Listen for Vite dynamic import preload failures (happens when old chunks are deleted on new deploy)
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[PWA] Chunk preload error detected; reloading page to load latest build', event);
    window.location.reload();
  });

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;

    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        activeRegistration = registration;
        console.log('[SW Registration] Scope:', registration.scope);

        // Case 1: An update is already waiting (e.g. downloaded during previous session)
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateListeners(registration);
        }

        // Case 2: An update is currently installing
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (
              installingWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.log('[SW Registration] New version installed and waiting.');
              notifyUpdateListeners(registration);
            }
          });
        });

        // Periodic check for new updates every 15 minutes
        setInterval(() => {
          registration.update().catch((err) => {
            console.warn('[SW Registration] Periodic update check non-fatal:', err);
          });
        }, 15 * 60 * 1000);

        // Check for updates when tab gains focus or user returns to the app
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
        window.addEventListener('focus', () => {
          registration.update().catch(() => {});
        });
      })
      .catch((error) => {
        console.warn('[SW Registration] Registration failed:', error);
      });
  });
}
