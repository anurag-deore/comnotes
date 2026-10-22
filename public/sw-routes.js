// Which requests the service worker handles and how (CNOTE-20). A classic script so sw.js can
// importScripts it; pure, so tests/unit/swRoutes.test.ts loads it too. Only the app shell is ever
// cached: same-origin pages and hashed build files. Notes travel to Firestore on other origins and
// are never seen here.
(function (scope) {
  // Bump to drop every cache an older worker made
  const CACHE_VERSION = 'v1';
  const PAGE_CACHE = `comnotes-pages-${CACHE_VERSION}`;
  const STATIC_CACHE = `comnotes-static-${CACHE_VERSION}`;
  // Cached on install, so the app can start offline after the first visit
  const SHELL_PAGES = ['/', '/notes'];
  // Hashed files pile up across deploys; the oldest go first
  const MAX_STATIC_ENTRIES = 200;
  const PUBLIC_FILES = ['/manifest.webmanifest', '/favicon.ico'];
  const WORKER_FILES = ['/sw.js', '/sw-routes.js'];
  // A /_next/static path that starts a quoted, bracketed or listed URL in the HTML, up to its end
  const ASSET_PATTERN = /(?<=["'(\s,])\/_next\/static\/[^"'\\\s<>()]+/g;

  // 'cache-first': hashed build files never change. 'page': network-first, falling back to the cached
  // page and then the cached root. 'network-first': small public files and images. 'none': not handled at all.
  function strategyFor(request, origin) {
    if (request.method !== 'GET') return 'none';
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return 'none';
    }
    if (url.origin !== origin) return 'none';
    const path = url.pathname;
    if (WORKER_FILES.includes(path) || path.startsWith('/__/')) return 'none';
    // React Server Component payloads and prefetches vary per navigation; Next handles them
    if (url.searchParams.has('_rsc') || request.headers.get('RSC') || request.headers.get('Next-Router-Prefetch')) return 'none';
    if (path.startsWith('/_next/static/')) return 'cache-first';
    if (request.mode === 'navigate') return 'page';
    if (PUBLIC_FILES.includes(path) || path.startsWith('/icons/') || path.startsWith('/images/')) return 'network-first';
    return 'none';
  }

  // Pages are cached by path: a query or hash doesn't change the shell
  function pageKey(url) {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname}`;
  }

  // The same-origin hashed files a page's HTML references, once each, as absolute URLs
  function assetUrls(html, origin) {
    return [...new Set(html.match(ASSET_PATTERN) ?? [])].map((path) => `${origin}${path}`);
  }

  function isOldCache(name) {
    return name.startsWith('comnotes-') && name !== PAGE_CACHE && name !== STATIC_CACHE;
  }

  // How many of the oldest entries to delete to get back to the limit
  function overflow(count, max) {
    return Math.max(0, count - max);
  }

  scope.swRoutes = {
    CACHE_VERSION, PAGE_CACHE, STATIC_CACHE, SHELL_PAGES, MAX_STATIC_ENTRIES,
    strategyFor, pageKey, assetUrls, isOldCache, overflow,
  };
})(globalThis);
