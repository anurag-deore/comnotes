# CNOTE-3 – Redesign PIN: stop storing it, make it the credential

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-3/   **Branch:** cnote-3/pin-as-credential   **Blocked by:** none (absorbs the auth + rules part of CNOTE-2)

## Goal
Opening ComNotes on any device, including an office PC where Google sign-in isn't possible, still takes one step: type the PIN. The PIN is now checked by Firebase Authentication on Google's servers. It is never stored in plaintext or anywhere a client can read it, repeated wrong guesses are throttled, and Firestore serves notes only to the signed-in owner. Nothing stays on the device after the tab is refreshed or closed.

## Current state (from the code)
- `components/PinLock.tsx` reads `pin/default` from Firestore and compares the PIN in the browser.
- `contexts/AuthContext.tsx` keeps "authenticated" as a React flag.
- `scripts/init-pin.ts` writes a plaintext default PIN `123456`.
- There are no security rules in the repo, so the `notes` and `pin` collections are open to anyone who has the public config.

## Decision (agreed 2026-10-14)
The PIN is the password of one Firebase Auth email/password user, the owner. There is no Google sign-in and no separate login step, because the owner uses many devices, some of them office PCs.

## Scope
**In:**
- PIN check through `signInWithEmailAndPassword`.
- Auth state from Firebase, held in memory only.
- Sign-out.
- `firestore.rules` restricted to the owner, with emulator tests.
- Delete `pin` usage, `scripts/init-pin.ts`, the `init-pin` npm script, the `Pin` type and the now-unused `dotenv`.
- README setup steps.

**Out:**
- Per-note `ownerId` and multi-user support. Single owner; CNOTE-21 backfills the field if it's ever needed.
- Google sign-in (rejected, see Decision).
- Fixing the broken `deploy` script (CNOTE-10).
- Encrypting note content (CNOTE-7).

## Acceptance criteria
- [x] AC-1 The PIN screen signs in with `signInWithEmailAndPassword(auth, NEXT_PUBLIC_OWNER_EMAIL, pin)`. Nothing in the app or repo reads or writes a `pin` collection.
- [x] AC-2 A wrong PIN shows "Invalid PIN". Firebase's `auth/too-many-requests` shows "Too many attempts. Try again later." Any other error shows "Could not unlock. Check your connection."
- [x] AC-3 Auth uses `inMemoryPersistence`, so a refresh or new tab asks for the PIN again and no auth token is stored in localStorage or IndexedDB.
- [x] AC-4 `isAuthenticated` comes from `onAuthStateChanged`, not a local flag. Logging out calls `signOut` and returns to `/`.
- [x] AC-5 The PIN input accepts more than 6 characters (Firebase's minimum is 6; longer is recommended in the README).
- [x] AC-6 `firestore.rules` allows read and write on `notes/{id}` only when `request.auth.uid` equals the owner uid, and denies every other path, including `pin/*`.
- [x] AC-7 (run in CI by CNOTE-9/CNOTE-27 on Temurin JDK 21, 5/5 pass, 2026-10-16; originally deferred because only JDK 17 was available locally) Emulator tests prove AC-6: anonymous read and write of notes are denied, another signed-in user is denied, the owner is allowed, and the owner is denied on `pin/default`.
- [x] AC-8 `scripts/init-pin.ts`, the `init-pin` npm script, the `Pin` type and `dotenv` are removed.
- [x] AC-9 The README documents one-time setup: enable the Email/Password provider, create the owner user with the PIN as its password, set `NEXT_PUBLIC_OWNER_EMAIL`, put the owner uid in `firestore.rules`, deploy the rules, and delete the `pin` collection in the console.
- [x] AC-10 `npm test`, `npm run lint` and `npm run build` pass.

## Design
- `lib/firebase.ts`: also export `auth = getAuth(app)`.
- `lib/auth.ts` (new):
  - `unlock(pin)` calls `setPersistence(auth, inMemoryPersistence)` and then `signInWithEmailAndPassword`. It maps Firebase error codes to the AC-2 messages and throws them.
  - `lock()` calls `signOut`.
- `contexts/AuthContext.tsx`: subscribe with `onAuthStateChanged`, and expose `isAuthenticated`, `isReady` and `logout`. Routing stays as it is today; `login()` is dropped because the auth state change triggers the redirect.
- `components/PinLock.tsx`: call `unlock(pin)`, show the error, remove the `maxLength={6}` limit, and disable the button while a request is in flight.
- `firestore.rules` (new): an owner-uid constant, `match /notes/{id}` allowing the owner, and a default deny.
- `firebase.json` (new): rules path plus the Firestore and Auth emulator config.
- Tests:
  - Vitest.
  - `lib/auth.test.ts` mocks `firebase/auth`.
  - `firestore.rules.test.ts` uses `@firebase/rules-unit-testing` against the Firestore emulator, through `firebase emulators:exec`.
- New dev dependencies: `vitest`, `@firebase/rules-unit-testing`, `firebase-tools`.

## Tests
| Test | Verifies | Type |
|---|---|---|
| unlock calls signInWithEmailAndPassword with owner email + PIN | AC-1 | vitest (mocked auth) |
| unlock maps wrong-password/invalid-credential → "Invalid PIN" | AC-2 | vitest |
| unlock maps too-many-requests → throttle message; other → connection message | AC-2 | vitest |
| unlock sets inMemoryPersistence before signing in | AC-3 | vitest |
| lock calls signOut | AC-4 | vitest |
| rules: anon read/write notes denied | AC-6, AC-7 | vitest + emulator |
| rules: other user denied on notes | AC-6, AC-7 | vitest + emulator |
| rules: owner read/write notes allowed | AC-6, AC-7 | vitest + emulator |
| rules: owner denied on pin/default | AC-6, AC-7 | vitest + emulator |
| grep: no `'pin'` collection refs, no init-pin, no dotenv | AC-1, AC-8 | manual / CI step |
| AuthContext wiring, PIN input length, refresh re-prompts | AC-3, AC-4, AC-5 | manual check (no real Firebase env here) |

## Assumptions / open questions
- Anyone can call the Auth sign-up API with the public config. That's harmless because the rules pin the owner uid. The README also suggests turning off sign-up under Auth → Settings → User actions.
- The console steps (create user, deploy rules, delete `pin/default`) are the owner's to run, since I have no Firebase credentials here. They are listed in the PR and the Plane comment.
- A 6-digit numeric PIN is only as strong as Firebase's throttling allows. The README recommends 8 or more characters.
- CNOTE-2: its scope (auth plus owner-only rules plus emulator tests) is delivered here. When CNOTE-3 closes, CNOTE-2 is set to Done with a comment pointing to this ticket.
- firebase-tools 15 requires JDK 21+. `npm test` runs the unit tests; `npm run test:rules` runs the rules tests in the emulator.
- Auth is created lazily (`getFirebaseAuth()`) so that `next build` prerendering works without Firebase env vars.
- The full sign-in flow against a real project (AC-3/4/5 in the browser) is a manual check after the console setup.
