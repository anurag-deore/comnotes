# CNOTE-20 – Offline support / PWA

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-20/   **Branch:** cnote-20/offline-pwa   **Blocked by:** none (builds on CNOTE-3 PIN auth, CNOTE-5 autosave + conflict copies, CNOTE-7 locked notes, CNOTE-8 auto-lock, CNOTE-15 themes)

**Spec agreed:** pre-approved by the user 2026-10-21 (approach and decisions given with the task).

## Goal
ComNotes keeps working when the connection drops. While unlocked, notes stay readable and editable offline; edits wait in the tab and are saved with the usual rev check as soon as the connection is back, so an edit made elsewhere meanwhile still ends up as a conflict copy instead of being overwritten. A quiet pill says when the app is offline and whether changes are waiting. ComNotes can be installed as an app (manifest, icons, theme colour) and its shell loads without a network. Each device can choose not to keep notes on disk.

## Current state (from the code)
- `lib/firebase.ts` uses `getFirestore(app)`: memory cache only. Nothing survives a reload.
- Autosave (`lib/autosave.ts`, CNOTE-5) saves each note with `saveNote`, a `runTransaction` that reads the server rev. **Transactions need the server**: offline they fail after Firestore's retries. The saver then marks `error` and retries every 5 s forever, hammering a dead connection. The draft is kept in memory (`AutosaveContext`, survives lock/unlock, CNOTE-8). A locked note's draft is already ciphertext (`sealed`, CNOTE-7).
- `createNote` awaits `addDoc`, which only resolves once the server acknowledges: offline, **New note** hangs. `trashNote`/`restoreNote`/`deleteNotesForever` are blind writes (no rev check by design, CNOTE-6) that Firestore queues offline.
- Auth (CNOTE-3): Firebase Auth with `inMemoryPersistence`; app lock and auto-lock (CNOTE-8) call `signOut`. A reload or a lock therefore needs a sign-in, and sign-in verifies the PIN on Firebase's servers.
- `SaveStatus` already shows "Offline – not saved" when a save fails while `navigator.onLine` is false.
- No manifest, no icons besides `app/favicon.ico`, no service worker, no theme-color.

## Scope
**In:** Firestore persistent cache (multi-tab) with a per-device opt-out; offline-aware autosave (no saves while offline, flush on reconnect, conflict strategy unchanged); notes created offline; offline pill; offline message on the PIN screen; manifest, icons, theme-color, Apple web-app meta; hand-written service worker for the app shell; tests.
**Out:** unlocking while offline (would weaken CNOTE-3/8, see Auth); keeping unsaved drafts across a tab close/reload (see Limits); background sync; push notifications; a custom install button (browsers' own install UI is used); Next's experimental `useOffline` (see Design); any `firestore.rules` change.

## Acceptance criteria
- [x] AC-1 Firestore is initialised with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` in the browser when "Keep notes available offline on this device" is on (the default), and with `memoryLocalCache()` when it is off or on the server.
- [x] AC-2 The setting is stored per device in `localStorage` (`comnotes:offline-cache`, `'1'`/`'0'`); missing, unreadable or throwing storage reads as on. A write that throws is reported, so the app never claims a change it couldn't keep.
- [x] AC-3 Changing the setting needs a connection and nothing unsaved: offline → "Connect to the internet to change this"; unsaved drafts or Firestore writes that don't reach the server within 10 s → "Some changes haven't saved yet. Try again in a moment." Only then is the new value stored. Turning it **off** then `terminate`s Firestore and runs `clearIndexedDbPersistence`, and the page reloads (which locks, as every reload does). Turning it **on** stores the value and reloads. When the setting is off, every load also tries `clearIndexedDbPersistence` once before Firestore starts (finishes a clear that another open tab blocked).
- [x] AC-4 While offline the autosaver doesn't attempt saves: status is `offline` (not `error`), no retry timer runs, and `flush()` resolves false at once while anything is unsaved (so locking doesn't wait). A save that fails while offline isn't retried on a timer.
- [x] AC-5 On reconnect (`online` event) the autosaver flushes every waiting draft through the normal rev-checked `saveNote`: an unchanged server note is saved; a note changed elsewhere produces a conflict copy (locked notes: an encrypted copy, CNOTE-7); a note deleted for good drops its draft with the existing message (CNOTE-6).
- [x] AC-6 `saveNote` waits for Firestore's pending writes (`waitForPendingWrites`) before its transaction, so a note created offline reaches the server before its first save reads it, and isn't mistaken for a deleted note.
- [x] AC-7 `createNote` offline returns the new note at once (written to the local cache with a pre-allocated id; Firestore sends it when back online; a later failure is logged). Online it still waits for the server, so failures still toast.
- [x] AC-8 Expired-Trash purge runs only on a snapshot from the server (`metadata.fromCache === false`), never on cached data that could be stale.
- [x] AC-9 Offline drafts of locked notes stay ciphertext: nothing new stores or sends plaintext of a locked note (the saver, the cache and the service worker only ever see the stored ciphertext).
- [x] AC-10 Offline pill: while offline a pill says "Offline" plus "Changes will save when you're back online" when the saver has unsaved changes, otherwise "Notes you have open stay available"; after reconnecting it says "Back online" for 3 s. Tokens only, both themes, phone width, `role="status"` polite live region that is always mounted, no motion beyond the shared fade (reduced-motion safe). Driven by `navigator.onLine` + `online`/`offline` events (`useOnlineStatus`, shared with `SaveStatus`).
- [x] AC-11 PIN screen: when offline it shows "You're offline. Unlocking needs an internet connection." under the heading (`role="status"`), and a sign-in that fails with `auth/network-request-failed` reports the same text instead of a generic error. Unlock still always verifies the PIN with Firebase.
- [x] AC-12 Web app manifest via `app/manifest.ts` (served at `/manifest.webmanifest`): name/short_name "ComNotes", `id`/`start_url`/`scope` `/`, `display: standalone`, light background/theme colours from the tokens, icons 192 and 512 (`purpose: any`) and 512 maskable. Layout adds `theme-color` for light (`#e8ebe6`) and dark (`#121410`) via `viewport.themeColor`, an apple-touch-icon (180) and `appleWebApp` meta. Icons are PNGs rendered from one SVG in sage/ink/lime, no third-party branding.
- [x] AC-13 Service worker `public/sw.js` (with its pure route helpers in `public/sw-routes.js`), registered only in production with `updateViaCache: 'none'`; in development any existing registration is removed. Strategy: cache-first for hashed `/_next/static/*`; network-first with cached fallback for navigations (falls back to the cached page, then to the cached `/`) and for the manifest and icons; everything else passes through untouched: non-GET, cross-origin (Firestore, Auth, googleapis, gstatic), `/__/*`, RSC/prefetch requests (`RSC` header or `_rsc` query), `/sw.js` and `/sw-routes.js`. On install it caches `/` and `/notes` and the `/_next/static` files their HTML references; each fresh page response refreshes that. Old `comnotes-*` caches are deleted on activate; the static cache keeps at most 200 entries.
- [x] AC-14 `/sw.js` and `/sw-routes.js` are served with `Cache-Control: no-cache, max-age=0`, a JavaScript content type and `Content-Security-Policy: default-src 'self'` (next.config `headers()`).
- [x] AC-15 No `eslint-disable`, `ts-ignore`, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`; `firestore.rules` unchanged; no new dependencies.
- [x] AC-16 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; `next start` serves `/`, `/notes`, `/manifest.webmanifest`, `/sw.js` with 200 and the headers above, with no server errors.

## Design
### Offline edits: keep the draft, retry the rev-checked save on reconnect
Transactions can't run offline, and queuing blind `updateDoc`s would bypass the rev check (an edit elsewhere would be silently overwritten). So offline edits stay where they already live: the app-wide autosaver's in-memory draft (`AutosaveContext`). The saver gets `isOnline` and `connectionChanged()`:
- `report()` order: in flight → `saving`; unsaved and offline → `offline`; failed → `error`; unsaved → `pending`; else `saved`.
- `flush()` offline: no saves, resolves `!hasPending()` at once.
- A failed save schedules the retry only when online.
- `connectionChanged()`: re-report; when online with unsaved drafts, `flush()`.
- `AutosaveProvider` passes `isOnline` (`navigator.onLine`) and calls `connectionChanged()` on `online`/`offline`.
On reconnect each draft is saved with the rev it was based on, so CNOTE-5's conflict copies apply unchanged. `saveNote` first awaits `waitForPendingWrites(db)` (AC-6). `navigator.onLine` can say online on a network with no internet; then the transaction fails as before and the 5 s retry applies.

Locked notes: the saver only ever holds `sealed` ciphertext (CNOTE-7), so offline drafts of locked notes are never plaintext. A conflict copy of a locked note needs the vault key (re-encryption); if the vault was locked meanwhile, the save throws and is retried until the passphrase is entered, exactly as today.

Other writes (`trashNote`, `restoreNote`, `deleteNotesForever`, imports, notes created offline) are plain Firestore writes: Firestore applies them to the cache at once and queues them; with the persistent cache the queue survives a reload and is sent the next time the owner signs in online. They keep their existing last-writer-wins semantics (they don't touch `rev`).

### Limits (documented, not fixed here)
- **Unsaved drafts live in the tab's memory.** Closing or reloading the tab while offline with unsaved drafts loses them; the existing `beforeunload` guard asks the user to stay. Persisting drafts would mean writing note text outside Firestore (plaintext for plain notes) and restoring it across a sign-out; deferred.
- **No unlock offline.** A reload or a lock (manual or auto-lock) signs out of Firebase Auth (`inMemoryPersistence`, `signOut`), and signing in checks the PIN on Firebase's servers. Offline the app shell still loads (service worker) and the PIN screen says why it can't unlock. Making offline unlock possible would need a local PIN verifier or persisted session, weakening CNOTE-3/8; not done.
- So offline use is: stay unlocked when the connection drops (auto-lock after 5 min idle / 1 min hidden still applies), keep reading and editing; reconnect to save.
- The theme-color meta follows the OS scheme; a manual Light/Dark override doesn't change the browser chrome colour.

### Security trade-off: the on-device cache
With the persistent cache, Firestore stores every note the app has read, plus queued writes, in this browser's IndexedDB. Plain notes are readable there by anyone with access to the device profile, even while ComNotes is locked; locked notes are stored as their ciphertext only (CNOTE-7), so they stay protected. The cache isn't cleared on lock (the point is to keep it). Mitigation: the per-device setting **Keep notes available offline on this device** (sidebar, under Theme). Off = memory cache only, and the existing IndexedDB data is deleted (AC-3). Use it on shared or untrusted devices. Default on, as the ticket asks for offline support; the setting text says what it stores.

### Modules
- `lib/onlineStatus.ts`: `isOnline(nav?)`, `subscribeOnline(target, onChange)`, `connectionMessage({ online, unsaved, reconnected })` (pill copy, pure).
- `hooks/useOnlineStatus.ts`: `useSyncExternalStore` over the above; `SaveStatus` uses it instead of its own copy.
- `lib/offlineSetting.ts`: `OFFLINE_CACHE_KEY`, `readOfflineCache(storage)`, `writeOfflineCache(storage, on)` → boolean, `changeOfflineCache(on, deps)` → `'done' | 'offline' | 'unsaved' | 'storage'` (orchestration with injected `isOnline`, `settle`, `write`, `clearCache`, `reload`; pure, tested). Reuses `browserStorage()` from `lib/sidebarPreference.ts`.
- `lib/firebase.ts`: `initializeFirestore` with the cache from the setting; `settlePendingWrites(timeoutMs)`; `dropOfflineCache()` (`terminate` + `clearIndexedDbPersistence`); init-time clear when off.
- `lib/autosave.ts`: `isOnline` option, `offline` status, `connectionChanged()`. `lib/saveStatus.ts`: `offline` → "Offline – saves when back online" (muted tone, cloud-off icon).
- `lib/notes.ts` (minimal): `createNote` uses `doc()` + `setDoc` and only awaits it online; `saveNote` awaits `waitForPendingWrites`; `subscribeNotes` passes `fromCache` to its callback. `app/notes/page.tsx` purges Trash on the first server snapshot.
- `lib/auth.ts`: `auth/network-request-failed` → offline message (`OFFLINE_UNLOCK_MESSAGE`).
- `components/OfflineIndicator.tsx` (root layout, inside the providers): the pill. `components/notes/OfflineSetting.tsx`: a `role="switch"` row in the sidebar under the theme switcher, with a one-line explanation and errors as toasts.
- `components/ServiceWorkerRegistration.tsx` (root layout): registers `/sw.js` in production, unregisters in development.
- `public/sw-routes.js`: classic script defining `self.swRoutes = { CACHE_VERSION, PAGE_CACHE, STATIC_CACHE, SHELL_PAGES, MAX_STATIC_ENTRIES, strategyFor(request, origin), pageKey(url), assetUrls(html, origin), isOldCache(name), overflow(count, max) }`. Pure: the vitest test imports it (it assigns to `self`). `public/sw.js` `importScripts('/sw-routes.js')` and wires install/activate/fetch.
  - Why hand-written and not Serwist: the app shell is two static pages plus hashed chunks and nothing user-specific may ever be cached, so ~100 lines cover it, with no build plugin to keep working across Next 16/Turbopack upgrades and no new dependency. Next's `experimental.useOffline` only retries RSC navigations/Server Actions (this app has none; all data goes through Firestore) and is experimental, so it isn't used.
- `app/manifest.ts`; `public/icons/icon.svg` (source), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180). Rendered once with sharp (Next's own image dependency) from the SVG; regenerate the same way if the SVG changes. Art: ink square, lime note sheet with ink lines, sheet inside the maskable safe zone.
- `app/layout.tsx`: `viewport.themeColor` (light/dark), `metadata.appleWebApp`, `metadata.icons.apple`; renders `OfflineIndicator` and `ServiceWorkerRegistration`.
- `next.config.ts`: `headers()` for `/sw.js` and `/sw-routes.js`.

## Tests
| Test | Verifies | Type |
|---|---|---|
| offlineSetting: read default on / '0' off / throwing storage on; write ok / throwing → false | AC-2 | vitest |
| offlineSetting: changeOfflineCache offline / unsaved / storage failure / off clears then reloads / on doesn't clear / clear failure still reloads | AC-3 | vitest |
| autosave: offline → status offline, no save, no retry timer; flush resolves false at once | AC-4 | vitest |
| autosave: reconnect flushes; conflict on reconnect reported; gone on reconnect | AC-5 | vitest |
| notes: saveNote awaits waitForPendingWrites before the transaction | AC-6 | vitest |
| notes: createNote online awaits setDoc; offline returns at once and logs a later failure | AC-7 | vitest |
| notes: subscribeNotes passes fromCache | AC-8 | vitest |
| onlineStatus: isOnline, subscribeOnline add/remove, connectionMessage | AC-10 | vitest |
| saveStatus: offline label/tone | AC-4, AC-10 | vitest |
| auth: network-request-failed → offline message | AC-11 | vitest |
| manifest: fields, icons, colours from tokens | AC-12 | vitest |
| sw-routes: strategyFor (static, navigate, manifest/icons, cross-origin, POST, RSC, /__/, sw files), pageKey, assetUrls, isOldCache, overflow | AC-13 | vitest (jsdom) |
| curl `/`, `/notes`, `/manifest.webmanifest`, `/sw.js` on `next start` | AC-14, AC-16 | manual |

## Open questions
None; decisions above were given with the task. Manual checks still to do by the user on a deployed build: DevTools offline (edit → pill + status → reconnect → saved / conflict copy), install prompt, Lighthouse PWA/installability.
