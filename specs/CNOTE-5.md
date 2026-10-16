# CNOTE-5 – Autosave per note + sync conflict resolution

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-5/   **Branch:** cnote-5/autosave   **Blocked by:** none (builds on CNOTE-3 auth + rules, follows ADR 0001)

**Spec agreed:** autonomous loop approved by user 2026-10-16

## Goal
Edits save themselves. Typing in a note writes only that note to Firestore shortly after you stop, with a real `updatedAt`, and a small indicator shows whether it is saving, saved, or failed. Refreshing or closing the tab no longer silently loses edits. If the same note was changed on another device or tab in the meantime, nothing is overwritten: your version is kept as a conflict copy and the server version is loaded. Other tabs see changes live.

## Current state (from the code)
- `app/notes/page.tsx` calls Firestore inline (`getDocs`, `addDoc`, `writeBatch`).
- Notes load once with `getDocs`; other tabs and devices never show up until a refresh.
- Edits live only in React state until the user presses **Sync Notes**, which rewrites every note in one batch and bumps every `updatedAt`, even for untouched notes. Last write wins.
- A refresh or tab close before pressing Sync loses the edits, with no warning.
- Loading shows a "Notes loaded successfully" toast every time.
- Notes have no revision field.

## Scope
**In:**
- `lib/notes.ts`: the only module that talks to Firestore for notes (ADR 0001 lock-in mitigation).
- A `rev` counter on notes, checked against the server copy in a transaction. Missing `rev` reads as 0.
- "Keep both" conflict resolution: local version saved as `<title> (conflict copy)`, server version loaded.
- `lib/autosave.ts`: framework-free debounced autosaver with dirty tracking, per-note serialised saves, retry after failure and `flush()`.
- `hooks/useAutosave.ts`: React wrapper with status, `flush()` and a `beforeunload` guard.
- Live list via `onSnapshot`.
- Remove the Sync Notes button and the "Notes loaded successfully" toast; add a Saving… / Saved / Offline / Save failed indicator.

**Out:**
- Trash / delete (CNOTE-6). A note deleted elsewhere while you edit it makes the save fail with an error status (see Assumptions).
- Encrypted locked notes (CNOTE-7).
- Auto-lock (CNOTE-8). It can call `flush()` before locking; lifting the hook into a context is part of that ticket.
- UI revamp (CNOTE-13).
- Offline cache / `persistentLocalCache` (CNOTE-20).
- Backfilling `rev` on existing documents (CNOTE-21). Not needed: missing `rev` is read as 0 and the first save writes 1.
- Per-property merge of conflicting edits (ADR 0001 "Revisit if").

## Acceptance criteria
- [x] AC-1 No file outside `lib/notes.ts` imports `firebase/firestore` for note data; `app/notes/page.tsx` has no inline Firestore calls.
- [x] AC-2 A note document without `rev` is read as `rev: 0`.
- [x] AC-3 Editing a note's title or content saves only that note, after a debounce (1 s), without a button. Rapid edits within the debounce produce one write with the latest values.
- [x] AC-4 A save runs in a Firestore transaction that reads the note, checks its `rev` equals the client's base `rev`, and writes `title`, `content`, `rev + 1` and `updatedAt: serverTimestamp()`. Other notes are not written and their `updatedAt` does not change.
- [x] AC-5 If the server `rev` differs from the base `rev`, the same transaction creates a new note titled `<title> (conflict copy)` with the local title/content and does not touch the server note. The UI loads the server version into the edited note, shows the copy in the list and shows a toast.
- [x] AC-6 Edits typed while the conflicted save was in flight are not lost; they are saved to the conflict copy.
- [x] AC-7 Saves of the same note never overlap; the next save uses the `rev` returned by the previous one (no self-conflicts).
- [x] AC-8 A failed save keeps the edit dirty, shows an error status ("Offline – not saved" when the browser is offline, otherwise "Save failed – retrying") and retries after 5 s.
- [x] AC-9 `flush()` saves all pending edits immediately and resolves `true` only when nothing is left unsaved. It is exposed by `useAutosave` for later tickets (CNOTE-8).
- [x] AC-10 Closing or refreshing the tab with unsaved or in-flight edits triggers the browser's leave-page prompt and starts a flush. (Implemented in `hooks/useAutosave.ts`; a browser check needs a real Firebase env.)
- [x] AC-11 The notes list is live via `onSnapshot` (ordered by `updatedAt` desc), so other tabs/devices appear without refresh. Incoming snapshots do not overwrite a note that has unsaved local edits. (The query and mapping are unit tested. The merge is in `app/notes/page.tsx`; a cross-tab check needs a real Firebase env.)
- [x] AC-12 The Sync Notes button and the "Notes loaded successfully" toast are gone; a save-status indicator shows Saving… / Saved / Offline – not saved / Save failed – retrying.
- [x] AC-13 `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.

## Design
- `types/note.ts`: `Note` gains `rev: number`.
- `lib/notes.ts` (new):
  - `toNote(id, data)` maps a document to `Note` (`rev ?? 0`, Timestamps to Dates).
  - `subscribeNotes(onNotes, onError)` is `onSnapshot` over `notes` ordered by `updatedAt` desc, using estimated server timestamps; returns the unsubscribe function.
  - `createNote()` adds an "Untitled Note" with `rev: 0` and returns it.
  - `saveNote(draft)` runs the AC-4/AC-5 transaction and returns `{ status: 'saved', rev }` or `{ status: 'conflict', server, copy }`. A missing note throws.
- `lib/autosave.ts` (new, no React, no Firebase): `createAutosaver({ save, delayMs, retryMs, onStatus, onConflict })` returns `{ change, flush, isDirty, hasPending, dispose }`.
  - `change(draft)` stores the latest draft per note and (re)starts one debounce timer.
  - The base `rev` of a save is the higher of the draft's `rev` and the last `rev` this autosaver saw for that note. This means a save made before our own write's snapshot arrives does not self-conflict.
  - A note with a save in flight is not saved again until that save finishes.
  - On conflict, the known `rev` becomes the server's. Any newer pending draft for that note is moved to the conflict copy.
  - Status: `idle | pending | saving | saved | error`.
- `hooks/useAutosave.ts` (new): owns one autosaver bound to `saveNote`. It exposes `{ status, change, flush, isDirty }`, adds the `beforeunload` guard, and flushes on unmount.
- `app/notes/page.tsx`:
  - subscribe with `subscribeNotes`, merging snapshots so dirty notes keep their local copy;
  - title/content edits update local state and call `change`;
  - `createNote` from the module;
  - on conflict, replace the note with the server version, add the copy and toast;
  - status indicator in the editor header;
  - Sync button and load toast removed.
- `app/components/QuillEditor.tsx`: forwards only `source === 'user'` changes, so loading a note (or the server version after a conflict) doesn't trigger a save.
- `firestore.rules`: unchanged (the owner can already read and write `notes/*`).

## Tests
| Test | Verifies | Type |
|---|---|---|
| toNote defaults missing rev to 0, converts Timestamps | AC-2 | vitest (mocked firestore) |
| saveNote with matching rev updates title/content/rev+1/serverTimestamp in a transaction, nothing else | AC-4 | vitest (mocked firestore) |
| saveNote with stale rev creates "(conflict copy)" note, leaves server note alone, returns server + copy | AC-5 | vitest (mocked firestore) |
| saveNote on a missing note rejects | Out/Assumptions | vitest |
| subscribeNotes queries notes by updatedAt desc and maps docs | AC-11 | vitest (mocked firestore) |
| createNote writes rev 0 and returns the note | AC-2 | vitest (mocked firestore) |
| autosaver debounces rapid edits into one save of the latest draft | AC-3 | vitest (fake timers) |
| autosaver saves only dirty notes | AC-3 | vitest |
| autosaver never overlaps saves of one note and uses the returned rev next | AC-7 | vitest |
| autosaver conflict: reports it, adopts server rev, moves newer edits to the copy | AC-5, AC-6 | vitest |
| autosaver failure: status error, stays dirty, retries after retryMs | AC-8 | vitest |
| flush saves immediately; resolves true/false | AC-9 | vitest |
| status transitions pending → saving → saved | AC-12 | vitest |
| beforeunload prompt, snapshot merge, indicator, toast | AC-10, AC-11, AC-12 | manual check with real Firebase env |
| grep: no `firebase/firestore` import outside lib/ | AC-1 | manual |

## Assumptions / open questions
- `rev` is a plain counter, not a hash. Two devices that both save from the same base: the first one wins and the second becomes a conflict copy. That is the intended "keep both" behaviour.
- The conflict copy starts at `rev: 0` and `createdAt = updatedAt = now`.
- Transactions need the network. Offline, saves fail and retry every 5 s while the tab stays open, and the `beforeunload` guard warns before losing them. Persistent offline queues are CNOTE-20.
- A note deleted elsewhere (console only until CNOTE-6) makes its save fail and retry with an error status. CNOTE-6 should decide how a trashed note is handled.
- `beforeunload` cannot wait for the async flush. The prompt gives the save time to finish if the user cancels.
- React hook behaviour (unload guard, snapshot merge) has no unit tests because the repo has no DOM test setup. The logic it wraps is covered by the `lib/autosave.ts` tests.
