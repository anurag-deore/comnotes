// ComNotes service worker (CNOTE-20): lets the app shell load offline. Registered in production
// only (components/ServiceWorkerRegistration.tsx). Route rules live in sw-routes.js.
importScripts('/sw-routes.js');

const {
  PAGE_CACHE, STATIC_CACHE, SHELL_PAGES, MAX_STATIC_ENTRIES, strategyFor, pageKey, assetUrls, isOldCache, overflow,
} = self.swRoutes;
const ORIGIN = self.location.origin;

async function trimStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, overflow(keys.length, MAX_STATIC_ENTRIES)).map((key) => cache.delete(key)));
}

// Only plain, complete same-origin HTML is kept; a redirected response can't answer a navigation
const isCacheablePage = (response) =>
  response.ok && response.type === 'basic' && !response.redirected
  && (response.headers.get('Content-Type') ?? '').includes('text/html');

// Keeps a page and the hashed files its HTML references, so it can start offline
async function cachePage(key, response) {
  const html = await response.clone().text();
  await (await caches.open(PAGE_CACHE)).put(key, response);
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(assetUrls(html, ORIGIN).map(async (url) => {
    if (await statics.match(url)) return;
    try {
      const asset = await fetch(url);
      if (asset.ok) await statics.put(url, asset);
    } catch {
      // Fetched again the next time the page is cached or the file is requested
    }
  }));
  await trimStaticCache();
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await Promise.all(SHELL_PAGES.map(async (path) => {
      const url = new URL(path, ORIGIN).href;
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (isCacheablePage(response)) await cachePage(pageKey(url), response);
      } catch {
        // Best effort: the page is cached on its next visit
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(isOldCache).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheFirst(event) {
  const cached = await caches.match(event.request, { cacheName: STATIC_CACHE });
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy)).then(trimStaticCache));
  }
  return response;
}

async function page(event) {
  const key = pageKey(event.request.url);
  try {
    const response = await fetch(event.request);
    if (isCacheablePage(response)) event.waitUntil(cachePage(key, response.clone()));
    return response;
  } catch (error) {
    const cached = (await caches.match(key, { cacheName: PAGE_CACHE }))
      ?? (await caches.match(`${ORIGIN}/`, { cacheName: PAGE_CACHE }));
    if (cached) return cached;
    throw error;
  }
}

async function networkFirst(event) {
  try {
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(event.request, { cacheName: PAGE_CACHE });
    if (cached) return cached;
    throw error;
  }
}

const HANDLERS = { 'cache-first': cacheFirst, page, 'network-first': networkFirst };

self.addEventListener('fetch', (event) => {
  const handler = HANDLERS[strategyFor(event.request, ORIGIN)];
  if (handler) event.respondWith(handler(event));
});
