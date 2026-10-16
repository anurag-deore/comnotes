# CNOTE-6 – Delete notes: soft delete to Trash with undo + auto-purge

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-6/   **Branch:** cnote-6/trash   **Blocked by:** none (builds on CNOTE-5 autosave and CNOTE-8's app-wide autosaver, follows ADR 0001)

**Spec agreed:** autonomous loop approved by user 2026-10-16

## Goal
Notes can be deleted. Deleting moves a note to Trash, with an Undo toast. Trash lists deleted notes with Restore and Delete forever, and trashed notes older than 30 days are purged automatically. Edits that were still saving when a note was trashed are kept with it. A note that disappears for good while you edit it no longer makes autosave retry forever.

## Current state (from the code)
- `lib/notes.ts` has `toNote`, `subscribeNotes`, `createNote` and `saveNote`. Nothing deletes a note.
- `saveNote` throws `Error('Note no longer exists')` when the document is gone. The autosaver treats that like a network failure: status stays `error` and it retries every 5 s forever (CNOTE-5 Assumptions).
- Since CNOTE-8 one autosaver lives in `contexts/AutosaveContext.tsx` for the whole app; pages use `useAutosave` and merge snapshots as `{ ...note, ...draft(note.id) }`.
- `firestore.rules` already allows the owner to read, write and delete `notes/*`.

## Scope
**In:**
- `deletedAt` on notes; missing or `null` means not deleted.
- `lib/notes.ts`: `trashNote`, `restoreNote`, `deleteNotesForever`, `purgeExpiredTrash`.
- `saveNote` returns `{ status: 'gone' }` for a missing note instead of throwing; the autosaver drops that draft and reports it.
- Minimal UI in `app/notes/page.tsx`: Delete button, Undo toast, Trash view with Restore / Delete forever (in-UI confirm) / Empty trash.
- Client-side purge of trash older than 30 days when the notes list first loads.

**Out:**
- UI revamp (CNOTE-13).
- Server-side purge. No server, and Spark has no scheduled Cloud Functions.
- Firestore TTL policies: rejected. The TTL docs (https://firebase.google.com/docs/firestore/ttl, checked 2026-10-16) don't say whether TTL works on Spark, so it isn't verified. Deletion also lags by up to 24 h.
- Backfilling `deletedAt` on existing documents (CNOTE-21). Not needed, missing reads as not deleted.

## Acceptance criteria
- [x] AC-1 `Note` has `deletedAt: Date | null`. A document without `deletedAt` (or with `null`) reads as `null`, so existing notes count as not deleted.
- [x] AC-2 `trashNote(id)` sets only `deletedAt` (server timestamp). `title`, `content`, `rev` and `updatedAt` are unchanged.
- [x] AC-3 `restoreNote(id)` sets `deletedAt` back to `null` and changes nothing else.
- [x] AC-4 `deleteNotesForever(ids)` deletes those documents in batched writes.
- [x] AC-5 `purgeExpiredTrash(notes, now)` deletes forever exactly the notes whose `deletedAt` is more than 30 days before `now`. It does no write when there are none. The page runs it once when the notes list first loads.
- [x] AC-6 The main list shows only notes that aren't deleted; the Trash view shows only deleted ones. Both come from the one live subscription, filtered client-side.
- [x] AC-7 The selected note has a Delete button. Deleting moves it to Trash at once, shows a toast with Undo (which restores it and selects it again), and selects the next note in the list (or the previous one, or none).
- [x] AC-8 Edits not yet saved when a note is trashed are not lost. The autosaver still saves them to the trashed note, the trashed note keeps showing the local version until then, and restoring brings them back.
- [x] AC-9 A save to a note that is in Trash (e.g. from another tab) succeeds and leaves it in Trash.
- [x] AC-10 Trashed notes aren't editable. The Trash view lists them with Restore and Delete forever, plus Empty trash. Permanent deletes are confirmed in the page, not with a browser dialog.
- [x] AC-11 A save to a note that no longer exists returns `{ status: 'gone' }`. The autosaver drops that note's drafts, stops retrying, doesn't leave the status on `error`, returns nothing from `draft(id)` and calls `onGone(draft)`. The notes page shows a toast saying the unsaved changes were discarded.
- [x] AC-12 `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.

## Design
- `types/note.ts`: `deletedAt: Date | null`.
- `lib/notes.ts`:
  - `toNote` maps a `deletedAt` Timestamp to a Date, anything else to `null`.
  - `SaveResult` gains `{ status: 'gone' }`. `saveNote` returns it when the document is missing. This is a typed result rather than an error, so the autosaver stays free of Firebase and doesn't match error strings.
  - `trashNote(id)` is `updateDoc(..., { deletedAt: serverTimestamp() })`. `rev` isn't bumped, so it never conflicts with an open editor. `updatedAt` isn't touched, so the note keeps its place when restored.
  - `restoreNote(id)` is `updateDoc(..., { deletedAt: null })`.
  - `deleteNotesForever(ids)` uses `writeBatch` in chunks of 500 (the batch limit).
  - `TRASH_DAYS = 30`. `purgeExpiredTrash(notes, now = new Date())` picks expired notes, calls `deleteNotesForever` and returns how many it deleted.
- `lib/autosave.ts`: new `onGone(draft)` option. On `gone` the autosaver forgets the note's known rev, drops the pending and in-flight drafts for it, clears `failed` and calls `onGone`.
- `contexts/AutosaveContext.tsx`: a `gone` listener set next to `conflicts`, fed by `onGone`.
- `hooks/useAutosave.ts`: `useAutosave(onConflict, onGone)` registers both listeners while the page is mounted.
- `app/notes/page.tsx`:
  - `activeNotes` and `trashedNotes` are derived from `localNotes`.
  - Snapshot merge stays `{ ...note, ...draft(note.id) }`. A draft only has `id`/`title`/`content`/`rev`, so the server's `deletedAt` always wins.
  - Delete marks the note locally first, then calls `trashNote`. Undo toast uses `react-hot-toast`. On failure the local mark is reverted.
  - Sidebar toggle between Notes and Trash (n). The Trash view has per-note Restore / Delete forever (confirm / cancel inline) and Empty trash (same confirm). The editor only renders for a selected note that isn't deleted.
  - On the first snapshot, `purgeExpiredTrash(serverNotes)` runs; failures are logged.
- `firestore.rules`: unchanged. `allow write` already covers update and delete for the owner.

## Tests
| Test | Verifies | Type |
|---|---|---|
| toNote: missing/null deletedAt → null, Timestamp → Date | AC-1 | vitest (mocked firestore) |
| trashNote updates only deletedAt with a server timestamp | AC-2 | vitest (mocked firestore) |
| restoreNote sets deletedAt null only | AC-3 | vitest (mocked firestore) |
| deleteNotesForever deletes each id in batches of ≤ 500 | AC-4 | vitest (mocked firestore) |
| purgeExpiredTrash deletes only notes trashed > 30 days ago; no write when none | AC-5 | vitest (mocked firestore) |
| saveNote on a missing note returns gone | AC-11 | vitest (mocked firestore) |
| saveNote on a trashed note saves and doesn't write deletedAt | AC-9 | vitest (mocked firestore) |
| autosaver gone: drops drafts, no retry, status not error, onGone called | AC-11 | vitest (fake timers) |
| autosaver gone during in-flight save drops the newer draft too; draft() is empty | AC-11 | vitest |
| a draft merged over a trashed server note keeps deletedAt | AC-8 | vitest |
| list filtering, delete/undo/select-next, trash view, confirm, purge on load, merge keeps dirty edits | AC-5–AC-8, AC-10 | manual check with real Firebase env |

## Assumptions / open questions
- 30 days is fixed (`TRASH_DAYS`); no setting.
- Purge runs only when the notes page loads, so trash can sit a bit past 30 days if the app isn't opened. That's fine for a personal app.
- Purge compares the server `deletedAt` with the client clock. A skewed clock shifts the purge by the skew.
- Deleting forever a note whose edits are still saving discards those edits (the save comes back `gone` and a toast says so). The user asked for the note to be deleted.
- If the note turns out to be gone while the app is locked (the notes page is unmounted), the draft is still dropped but no toast is shown. Nothing is listening, and a late toast after unlock wasn't worth the extra state.
- A note deleted forever elsewhere while you edit it disappears from the list on the next snapshot. Its unsaved edits are discarded with a toast, not recreated as a new note.
- Page behaviour has no unit tests because the repo has no DOM test setup (same as CNOTE-5). The logic it uses is covered in `lib/notes.ts` and `lib/autosave.ts`.
