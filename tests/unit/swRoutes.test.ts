import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, test } from 'vitest';

// public/sw-routes.js is a classic script for the service worker (importScripts) that puts its helpers
// on the global scope; the test runs it the same way, as a script in a fresh global
interface SwRoutes {
  PAGE_CACHE: string;
  STATIC_CACHE: string;
  SHELL_PAGES: string[];
  MAX_STATIC_ENTRIES: number;
  strategyFor(request: RequestLike, origin: string): 'cache-first' | 'page' | 'network-first' | 'none';
  pageKey(url: string): string;
  assetUrls(html: string, origin: string): string[];
  isOldCache(name: string): boolean;
  overflow(count: number, max: number): number;
}

interface RequestLike {
  method: string;
  url: string;
  mode: string;
  headers: { get(name: string): string | null };
}

const ORIGIN = 'https://comnotes.example';
let routes: SwRoutes;

beforeAll(() => {
  const source = readFileSync(fileURLToPath(new URL('../../public/sw-routes.js', import.meta.url)), 'utf8');
  // Workers have URL; a bare script context doesn't
  const scope: { URL: typeof URL; swRoutes?: SwRoutes } = { URL };
  runInNewContext(source, scope);
  routes = scope.swRoutes!;
});

const request = (url: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}): RequestLike => {
  const headers = new Headers(init.headers);
  return { method: init.method ?? 'GET', url, mode: init.mode ?? 'no-cors', headers };
};

describe('strategyFor (CNOTE-20 AC-13)', () => {
  test('hashed Next static files are cache-first', () => {
    expect(routes.strategyFor(request(`${ORIGIN}/_next/static/chunks/app-abc123.js`), ORIGIN)).toBe('cache-first');
    expect(routes.strategyFor(request(`${ORIGIN}/_next/static/media/font.woff2?dpl=dpl_1`), ORIGIN)).toBe('cache-first');
  });

  test('navigations are network-first with the cached page as fallback', () => {
    expect(routes.strategyFor(request(`${ORIGIN}/`, { mode: 'navigate' }), ORIGIN)).toBe('page');
    expect(routes.strategyFor(request(`${ORIGIN}/notes`, { mode: 'navigate' }), ORIGIN)).toBe('page');
  });

  test('the manifest, favicon and icons are network-first', () => {
    for (const path of ['/manifest.webmanifest', '/favicon.ico', '/icons/icon-192.png']) {
      expect(routes.strategyFor(request(`${ORIGIN}${path}`), ORIGIN)).toBe('network-first');
    }
  });

  test('Firestore, Auth and other Google APIs are never touched', () => {
    for (const url of [
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8',
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x',
      'https://securetoken.googleapis.com/v1/token?key=x',
      'https://www.gstatic.com/firebasejs/x.js',
      'https://comnotes.firebaseapp.com/__/auth/iframe',
    ]) {
      expect(routes.strategyFor(request(url, { mode: 'cors' }), ORIGIN)).toBe('none');
      expect(routes.strategyFor(request(url, { mode: 'navigate' }), ORIGIN)).toBe('none');
    }
  });

  test('non-GET, RSC/prefetch requests, /__/ paths and the worker files pass through', () => {
    expect(routes.strategyFor(request(`${ORIGIN}/notes`, { method: 'POST', mode: 'navigate' }), ORIGIN)).toBe('none');
    expect(routes.strategyFor(request(`${ORIGIN}/notes?_rsc=1x2`), ORIGIN)).toBe('none');
    expect(routes.strategyFor(request(`${ORIGIN}/notes`, { headers: { RSC: '1' } }), ORIGIN)).toBe('none');
    expect(routes.strategyFor(request(`${ORIGIN}/notes`, { headers: { 'Next-Router-Prefetch': '1' } }), ORIGIN)).toBe('none');
    expect(routes.strategyFor(request(`${ORIGIN}/__/auth/handler`, { mode: 'navigate' }), ORIGIN)).toBe('none');
    expect(routes.strategyFor(request(`${ORIGIN}/sw.js`), ORIGIN)).toBe('none');
    expect(routes.strategyFor(request(`${ORIGIN}/sw-routes.js`), ORIGIN)).toBe('none');
    expect(routes.strategyFor(request(`${ORIGIN}/api/anything`), ORIGIN)).toBe('none');
  });

  test('a malformed URL passes through', () => {
    expect(routes.strategyFor(request('not a url'), ORIGIN)).toBe('none');
  });
});

describe('page cache helpers (CNOTE-20 AC-13)', () => {
  test('caches the shell pages', () => {
    expect(routes.SHELL_PAGES).toEqual(['/', '/notes']);
  });

  test('a page is cached by path, without query or hash', () => {
    expect(routes.pageKey(`${ORIGIN}/notes?from=lock#x`)).toBe(`${ORIGIN}/notes`);
    expect(routes.pageKey(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
  });

  test('finds the same-origin hashed files a page references, once each', () => {
    const html = [
      '<link rel="stylesheet" href="/_next/static/css/app-1.css" data-precedence="next"/>',
      '<link rel="preload" href="/_next/static/media/inter-2.woff2" as="font" crossorigin=""/>',
      '<script src="/_next/static/chunks/main-3.js?dpl=dpl_9" async=""></script>',
      '<script src="/_next/static/chunks/main-3.js?dpl=dpl_9" async=""></script>',
      '<script>self.__next_f.push([1,"0:[\\"/_next/static/chunks/page-4.js\\"]"])</script>',
      '<img src="https://cdn.example/_next/static/other.js">',
    ].join('');
    expect(routes.assetUrls(html, ORIGIN)).toEqual([
      `${ORIGIN}/_next/static/css/app-1.css`,
      `${ORIGIN}/_next/static/media/inter-2.woff2`,
      `${ORIGIN}/_next/static/chunks/main-3.js?dpl=dpl_9`,
      `${ORIGIN}/_next/static/chunks/page-4.js`,
    ]);
  });

  test('only older ComNotes caches are deleted on activate', () => {
    expect(routes.isOldCache('comnotes-pages-v0')).toBe(true);
    expect(routes.isOldCache(routes.PAGE_CACHE)).toBe(false);
    expect(routes.isOldCache(routes.STATIC_CACHE)).toBe(false);
    expect(routes.isOldCache('some-other-app')).toBe(false);
  });

  test('the static cache is trimmed to its limit, oldest first', () => {
    expect(routes.MAX_STATIC_ENTRIES).toBe(200);
    expect(routes.overflow(150, 200)).toBe(0);
    expect(routes.overflow(205, 200)).toBe(5);
  });
});
