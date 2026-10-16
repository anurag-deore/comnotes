# CNOTE-8 – Auto-lock on idle / tab hidden

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-8/   **Branch:** cnote-8/auto-lock   **Blocked by:** none (builds on CNOTE-3 auth and CNOTE-5 autosave)

**Spec agreed:** autonomous loop approved by user 2026-10-16

## Goal
An unattended session locks itself. After 5 minutes without user activity, or after the tab has been hidden for 1 minute, ComNotes saves what it can and returns to the PIN screen, which says "Locked after inactivity". A **Lock** button does the same on demand. Locking never loses typed text: if the save can't finish, the app locks anyway and keeps the drafts in memory, and they are saved after the next unlock.

## Current state (from the code)
- `lib/auth.ts` `lock()` signs out of Firebase Auth (in-memory persistence). `AuthContext.logout` calls it and pushes `/`. `app/notes/layout.tsx` redirects to `/` when signed out. Nothing calls `logout` today and there is no lock button.
- `hooks/useAutosave.ts` creates the autosaver inside the notes page. It adds the `beforeunload` guard and flushes on unmount. Locking unmounts the page, so the saver goes with it and nothing can await `flush()` before signing out.
- The notes page merges snapshots with `isDirty(id)` and the previous local copy. After a remount there is no previous copy, so a draft still waiting in the saver would show the older server text.
- No idle or visibility handling exists.

## Scope
**In:**
- `lib/lockSettings.ts`: the lock timings in one place.
- `lib/autoLock.ts`: framework-free idle/hidden timer and `flushThenLock`.
- `contexts/AutosaveContext.tsx`: one autosaver for the app, mounted in `app/layout.tsx` around `AuthProvider`, so drafts survive a lock.
- `hooks/useAutosave.ts`: thin per-page view of the shared saver (same call shape for the page).
- `contexts/AuthContext.tsx`: flush-then-lock for manual and automatic locks, auto-lock while authenticated, retry pending drafts on unlock, "locked after inactivity" flag.
- PIN screen message and a **Lock** button in the notes sidebar.

**Out:**
- A settings UI for the timings, and per-device settings (constants only; change `lib/lockSettings.ts`).
- Persisting drafts across a refresh (in-memory auth already drops the session; CNOTE-20 covers an offline cache).
- Notes UI revamp (CNOTE-13). The Lock button is minimal.
- Locking from other tabs (each tab has its own in-memory session).

## Acceptance criteria
- [x] AC-1 While authenticated, 5 minutes without pointer, keyboard, wheel/scroll, touch or focus activity locks the app.
- [x] AC-2 While authenticated, the tab being hidden for 1 minute locks the app. Coming back sooner cancels it. If the browser delayed the timer while hidden, returning after the deadline locks at once.
- [x] AC-3 Activity events only record a timestamp; they do not reset timers per event, so typing costs no timer churn.
- [x] AC-4 Both timings live in `lib/lockSettings.ts`.
- [x] AC-5 Locking awaits `flush()` for at most 3 s, then calls `lock()` from `lib/auth.ts` whatever the flush result (failure, rejection or hang).
- [x] AC-6 Drafts that could not be saved stay in memory after the lock. They keep retrying quietly while locked (no toasts) and are flushed as soon as the user unlocks.
- [x] AC-7 After unlocking, a note with an unsaved draft shows the draft text, not the older server text, so further typing builds on it.
- [x] AC-8 Auto-lock is off while signed out and restarts fresh on each unlock.
- [x] AC-9 After an automatic lock the PIN screen shows "Locked after inactivity"; a manual lock or a fresh visit does not. The message goes away after unlocking.
- [x] AC-10 The notes sidebar has a **Lock** button that uses the same flush-then-lock path.
- [x] AC-11 The `beforeunload` guard and conflict handling from CNOTE-5 still work with the shared saver.
- [x] AC-12 `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.

## Design
- `lib/lockSettings.ts`: `IDLE_LOCK_MS = 5 min`, `HIDDEN_LOCK_MS = 1 min`, `LOCK_FLUSH_TIMEOUT_MS = 3 s`. No env override (YAGNI; one constants file is easy to change).
- `lib/autoLock.ts` (no React, no Firebase):
  - `createAutoLock({ idleMs, hiddenMs, onLock })` returns `{ activity, visibility(hidden), dispose }`.
    - `activity()` stores `Date.now()`. One idle timer checks the elapsed time when it fires and reschedules for the remainder, so events never touch timers (AC-3).
    - `visibility(true)` starts the hidden timer; `visibility(false)` checks whether the hidden or idle deadline already passed (throttled background timers), otherwise cancels the hidden timer.
    - `onLock` fires once, then all timers stop.
  - `flushThenLock(flush, lock, timeoutMs)`: races `flush()` (rejection counts as false) with a timeout, then awaits `lock()`. Returns whether the flush succeeded.
- `contexts/AutosaveContext.tsx`: `AutosaveProvider` owns the single autosaver (`saveNote`, 1 s debounce, 5 s retry), its `status`, the `beforeunload` guard and a set of conflict listeners. `useSaver()` returns `{ saver, status, conflicts }`. The saver is never disposed by a page; only the provider's unmount disposes it.
- `hooks/useAutosave.ts`: `useAutosave(onConflict)` registers `onConflict` (via `useEffectEvent`) while the page is mounted and returns `{ status, change, draft }`. No unmount flush; the provider owns the saver.
- `lib/autosave.ts`: adds `draft(id)`, the latest unsaved draft of a note (pending or in flight).
- `contexts/AuthContext.tsx`:
  - `logout()` now flushes then locks (no auto-lock flag). Internal `autoLock()` sets the flag and does the same.
  - While `isAuthenticated`, an effect creates `createAutoLock` and wires `pointerdown`, `pointermove`, `keydown`, `wheel`, `scroll` (capture), `touchstart` and `focus` (capture) to `activity()`, and `visibilitychange` to `visibility(document.hidden)`. Listeners are passive.
  - On sign-in the auth listener clears the flag and flushes pending drafts.
  - Exposes `lockedForInactivity`.
- `app/layout.tsx`: `<AutosaveProvider><AuthProvider>…` .
- `components/PinLock.tsx`: shows a small "Locked after inactivity" line when the flag is set.
- `app/notes/page.tsx`: the snapshot merge uses `draft(id)` instead of `isDirty` plus the previous local copy (AC-7); a **Lock** button under New Note calls `logout`.

## Tests
| Test | Verifies | Type |
|---|---|---|
| locks after idleMs without activity, not before | AC-1 | vitest (fake timers) |
| activity pushes the idle deadline; many events schedule no extra timers | AC-1, AC-3 | vitest |
| locks after hiddenMs hidden; visible again before that cancels | AC-2 | vitest |
| returning visible after a missed hidden/idle deadline locks immediately | AC-2 | vitest |
| onLock fires once; dispose stops all timers | AC-8 | vitest |
| flushThenLock locks after a successful flush, a false flush, a rejected flush and a hung flush (after the timeout) | AC-5 | vitest |
| autosaver `draft(id)` returns pending and in-flight drafts, undefined once saved, keeps failed drafts | AC-6, AC-7 | vitest |
| auto-lock, PIN message, Lock button, offline lock then unlock keeps drafts | AC-1, AC-2, AC-6, AC-9, AC-10, AC-11 | manual check with real Firebase env |

## Assumptions / open questions
- While locked, retries fail with `permission-denied`. That is expected and silent: the saver shows no toasts, and the status indicator isn't mounted.
- `beforeunload` still warns about unsaved drafts while locked; a refresh then loses them (in-memory session, by design).
- A hidden tab keeps counting idle time too, so a hidden tab locks after 1 minute, whichever comes first.
- Activity in other tabs of the app doesn't count; each tab locks on its own.
- React wiring (listeners, providers) has no unit tests because the repo has no DOM test setup. The logic it wraps is in `lib/autoLock.ts` and `lib/autosave.ts`, which are unit tested.
