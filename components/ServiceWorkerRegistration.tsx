'use client';

import { useEffect } from 'react';

// Registers public/sw.js, which lets the app shell load offline (CNOTE-20). Production only: in
// development a worker left by `next start` on the same origin would serve stale files, so it's removed.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error) => console.error('Error removing the service worker:', error));
      return;
    }
    // updateViaCache 'none': the browser always checks sw.js and sw-routes.js for a new version
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.error('Error registering the service worker:', error));
  }, []);
  return null;
}
