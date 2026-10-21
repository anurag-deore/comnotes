# CNOTE-21 – Migrate existing notes to the current schema

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-21/   **Branch:** cnote-21/schema-migration   **Blocked by:** none (builds on CNOTE-5 rev, CNOTE-6 trash, CNOTE-7 locked notes, CNOTE-14 Tiptap, CNOTE-19 backup)

**Spec agreed:** pre-approved by the user 2026-10-21 (approach and decisions given with the task).

## Goal
Notes saved by older versions of ComNotes show up in the list like any other note, with sensible dates. Once per unlocked session the app checks for such notes; if there are any, a calm banner says "N older notes need updating" and offers **Download backup** (the CNOTE-19 export) and **Update now**. Updating fills in missing fields, converts old Quill formatting to the editor's own HTML, and stamps each note `schemaVersion: 2`, one note at a time, never overwriting an edit made meanwhile. Notes look the same afterwards. New notes are written complete, so they never look old.

## Current state (from the code and git history)
- **Original schema** (initial commit `7281c73`, `app/notes/page.tsx`): `{ title, content, createdAt, updatedAt }`, dates always Firestore `Timestamp` (`Timestamp.now()` on create, `updatedAt: Timestamp.now()` on every "Sync"), content Quill 1 HTML (react-quill) and later Quill 2 HTML (CNOTE-4, react-quill-new). No other date field names (`timestamp`, `lastModified`) were ever used for notes; only the old `pin/default` doc used ISO strings, and it is not a note.
- Fields added since: `rev` (CNOTE-5, absent = 0), `deletedAt` (CNOTE-6, absent = live), `encrypted` (CNOTE-7, absent/null = plain). `createNote` still writes only `title, content, rev, createdAt, updatedAt`; plain conflict copies and plain imports omit `encrypted`.
- **Bug:** `subscribeNotes` queries `orderBy('updatedAt', 'desc')`. Firestore leaves out every document without `updatedAt`, so such notes are invisible in the list (they only appear in a CNOTE-19 backup). `toNote` turns a missing date into "now", which changes on every snapshot.
- Content is converted from Quill on every load (`convertQuillHtml`, CNOTE-14) and only rewritten as Tiptap HTML when the user edits. The converter is not idempotent for spaces: a run of `&nbsp;` keeps one breakable space plus the rest as `&nbsp;`, and a second pass turns that leftover single `&nbsp;` into a space too, so a Quill double space collapses once converted HTML is loaded again.
- `fetchAllNotes` (CNOTE-19) reads the whole collection with one `getDocs`, no `orderBy`.
- Firestore rules: owner-only read/write on `/notes`, no field checks. No rules change needed.

## Ticket items, reconciled
| Item | Status |
|---|---|
| Add `ownerId` | **Not needed.** Single-user app: rules allow `/notes` only to the owner uid (CNOTE-3), and there is no query or rule that would use it. Adding it would mean a value to keep in sync with the rules' hard-coded uid for no benefit. Revisit only if ComNotes becomes multi-user (ADR 0001 "Revisit if"). |
| Add `version` | Done as `rev` (CNOTE-5). Migration backfills `rev: 0`. A separate `schemaVersion: 2` marks a note as fully on the current schema. |
| Add `deletedAt` | Backfilled as `null`. |
| Add `archivedAt` | **Out of scope:** CNOTE-17 (archive) isn't built; it will treat a missing `archivedAt` as not archived. |
| Add `locked` | Represented by `encrypted` (CNOTE-7): `null` = plain. Migration backfills `encrypted: null` where absent; locked notes' ciphertext is never touched. |
| Convert content format | Done: Quill HTML → Tiptap HTML (editor schema) for plain notes. |
| Move backend | **No:** ADR 0001 keeps Firebase. |

## Scope
**In:** list shows notes without `updatedAt`; date fallbacks; pure `needsMigration` / `migrateNoteData`; once-per-session detection; banner with backup and update; per-note rev-checked migration transactions; new-note paths write the full current schema; idempotent Quill conversion; tests.
**Out:** `ownerId` (see above), `archivedAt` (CNOTE-17), a server-side/admin script (no server; Spark plan), removing the on-load Quill conversion (a later cleanup once every note is v2), any `firestore.rules` change.

## Acceptance criteria
- [x] AC-1 The live list reads `/notes` without `orderBy` and sorts in the client by `updatedAt` desc (ties by id), so a document without `updatedAt` is listed. Missing `updatedAt` falls back to `createdAt` and vice versa; with neither, both read as the Unix epoch (stable, sorts last), never "now".
- [x] AC-2 `needsMigration(data)` (pure, no DOM) is true when `schemaVersion` is missing or below 2, or `createdAt`/`updatedAt` isn't a Timestamp, `rev` isn't a non-negative integer, `deletedAt` isn't null or a Timestamp, `encrypted` is absent, or a plain note's `title`/`content` isn't a string. A note with `schemaVersion` above 2 (a newer app) is never migrated.
- [x] AC-3 `migrateNoteData(data, now)` returns the minimal patch (or `null` when nothing to do): `createdAt`/`updatedAt` from themselves, each other, or `now`; `rev` 0; `deletedAt` null (a Timestamp is kept, so a trashed note stays in Trash); `encrypted` null when absent; plain notes get a string `title` and their content passed through the editor load path (Quill conversion + schema, `sanitizeNoteHtml`) once, when pre-v2; `schemaVersion: 2`. Locked notes' `title`, `content` and `encrypted` are never touched. `rev` and `updatedAt` are not bumped.
- [x] AC-4 Migrating is idempotent: `migrateNoteData` of its own result is `null`, and a second run writes nothing.
- [x] AC-5 `convertQuillHtml` is idempotent (`convert(convert(x)) === convert(x)`): an `&nbsp;` run next to a normal space is left alone, so converted HTML loaded again keeps its spaces.
- [x] AC-6 Once per unlocked session, after the list's first snapshot, `findLegacyNotes()` reads all notes once (the CNOTE-19 read-all) and returns `{ id, rev }` of those that `needsMigration`. Failure is logged, not shown.
- [x] AC-7 With legacy notes, a banner above the note pane says "N older notes need updating", explains that they will look the same, and offers **Download backup** (CNOTE-19 export), **Update now** and a dismiss (hides it for this session). Tokens only, both themes, phone width, 44 px targets, `role="region"` with a label, progress and results in a `role="status"` line, buttons `aria-disabled` while busy.
- [x] AC-8 **Update now** migrates each legacy note in its own transaction that re-reads it and skips it when it's gone or its `rev` differs from the one detected (an edit landed meanwhile; never clobbered), and recomputes the patch from the fresh data. At most 5 run at once. Result counts: updated, skipped, failed.
- [x] AC-9 Results are quiet: all done → toast "Updated N notes" and the banner goes away; otherwise the banner stays with the counts and the remaining number from a fresh check, and **Update now** reads **Try again**.
- [x] AC-10 `createNote`, conflict copies and imports write the complete current schema (`deletedAt`, `encrypted`, `schemaVersion: 2`), so `needsMigration` is false for them. `saveNote`'s update does not stamp `schemaVersion` (it doesn't backfill `createdAt`/`deletedAt`, so a legacy note it saves stays visible to the migration; a v2 note stays v2).
- [x] AC-11 No `ownerId`, no `archivedAt`, no backend change; `firestore.rules` unchanged. No `eslint-disable`, `ts-ignore`, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`.
- [x] AC-12 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; dev server serves `/` and `/notes` with 200 and no server errors.

## Design
**Modules**
- `lib/migration.ts`: `SCHEMA_VERSION = 2`, `needsMigration(data)`, `migrateNoteData(data, now)` → `MigrationPatch | null`, `noteDates(data)` (the date fallbacks, shared with `toNote`). Uses `Timestamp` (instanceof) and `sanitizeNoteHtml` (browser/jsdom; the notes page already loads Tiptap).
- `lib/notes.ts`:
  - `toNote` uses `noteDates`; `fetchAllNotes` drops its own fallback.
  - `subscribeNotes`: `onSnapshot(collection)`, sorted by `compareNotes` (updatedAt desc, id).
  - `findLegacyNotes()` → `{ id, rev }[]` (shares `readAllNotes()` = one `getDocs`, `serverTimestamps: 'estimate'` so a pending save doesn't look like a missing date).
  - `migrateNote(id, rev, now)` → `'updated' | 'changed' | 'gone' | 'current'` (rev-checked transaction, `tx.update(patch)`).
  - `migrateNotes(legacy, now, onProgress)` → `{ updated, skipped, failed }`, a pool of 5.
  - `createNote`, conflict copies, `importNotes` add `deletedAt: null` (create/copy), `encrypted: null` (plain), `schemaVersion: 2`.
- `lib/quillToTiptap.ts`: `convertNbsp` skips runs adjacent to a normal space (Quill 2 never mixes them; only already-converted or Tiptap HTML does).
- `lib/downloadBackup.ts`: the CNOTE-19 export (`fetchAllNotes` → lazy `buildBackupZip` → download), shared by `BackupDialog` and the banner.
- `components/notes/MigrationBanner.tsx`: presentational banner (count, phase, result) on `bg-primary-pale`/`text-ink`; `lib/migrationText.ts` builds its copy (pure, tested).
- `app/notes/page.tsx`: runs detection once after the first snapshot, owns banner state, calls `downloadBackup` / `migrateNotes`.

**Decisions**
- *List without `orderBy`.* The ordered query reads the same documents minus the invisible ones, so reading the whole collection costs at most the legacy docs extra (single user, small collection) and needs no index. Sorting a few hundred notes in the client is trivial. This fixes the bug for everyone, before and without migrating.
- *User-triggered, not silent.* The migration rewrites stored data, so the user chooses when, with a backup offered first.
- *Detect with a separate read once per session*, not on every snapshot: the content check runs once, and the live listener stays a plain mapper. Cost: one extra read of the collection per unlock while legacy notes may exist.
- *No `rev`/`updatedAt` bump.* The converted content parses to the same editor document that the load-time conversion already produced, so nothing visible changes. Bumping `rev` would turn every open editor's next save (another tab/device) into a spurious conflict copy; bumping `updatedAt` would reorder the list and fake "edited just now". An editor that saves after the migration (same rev) simply writes its Tiptap HTML over the converted content, which is equivalent.
- *Concurrent edits.* Detection remembers each note's raw `rev`; the transaction re-reads, skips on a different `rev` and computes the patch from the fresh data, so a trash/restore (no rev change) isn't undone either. Skipped notes are offered again on **Try again** or next session.
- *Content conversion keyed on `schemaVersion`.* Every pre-v2 plain note goes through `sanitizeNoteHtml` once (the same path imports use, CNOTE-19 AC-10), and content is written only if it changed. v2 content is Tiptap by construction (editor saves, sanitised imports), so no heuristic Quill sniffing is needed and `needsMigration` stays cheap.
- *Both dates missing → epoch, not now.* Stable sort and stable backup duplicate detection (CNOTE-19 AC-12). Only possible for hand-made docs; migration backfills them with the migration time.

**Firestore:** reads the collection once per session (detection) and once more after a run with leftovers; one transaction (1 read + ≤1 write) per legacy note. No new fields beyond `schemaVersion`; rules unchanged.

## Tests
| Test | Verifies | Type |
|---|---|---|
| notes: subscribeNotes has no orderBy, sorts by updatedAt desc/id, lists a doc missing updatedAt | AC-1 | vitest |
| notes: toNote date fallbacks (each other, epoch) | AC-1 | vitest |
| migration: needsMigration per legacy shape; current v2 doc false; schemaVersion 3 false | AC-2 | vitest |
| migration: migrateNoteData original 2025 shape, missing dates, rev/deletedAt/encrypted/title, Quill lists/code, trashed keeps deletedAt, locked untouched, v2 → null | AC-3 | vitest + jsdom |
| migration: migrate(result) → null; needsMigration(result) false | AC-4 | vitest + jsdom |
| quillToTiptap: convert twice = once for fixtures; mixed space/nbsp left alone | AC-5 | vitest + jsdom |
| notes: findLegacyNotes uses getDocs without orderBy, estimate, returns only legacy ids/revs | AC-6 | vitest |
| migrationText: banner copy and result summaries | AC-7, AC-9 | vitest |
| notes: migrateNote updates with patch; skips changed rev / gone / current; migrateNotes counts + failure + concurrency ≤ 5; second run writes nothing | AC-4, AC-8 | vitest |
| notes: createNote, conflict copy, importNotes write schemaVersion 2 and pass needsMigration; saveNote update has no schemaVersion | AC-10 | vitest |
| lint, typecheck, build, dev curl | AC-11, AC-12 | CLI |

## Manual browser checks (real Firebase env; not run here — no Firebase env in the worktree, `/notes` redirects to the PIN screen)
- With a doc missing `updatedAt` (made in the console): it appears in the list; banner shows; Download backup works; Update now updates it; reload → no banner.
- Edit a legacy note in another tab between detection and Update now → that note is skipped, banner says so, Try again updates it.
- Keyboard and screen reader through the banner; dark theme; 375 px width.

## Deviations from the task brief
- `saveNote`'s update does not write `schemaVersion` (brief said "saves"): see AC-10. Create, conflict copies and imports do.
- The banner doesn't say "some may be missing from the list": the list no longer hides them (AC-1), so that would be false.
- No Quill sniffing in `needsMigration`: every pre-v2 note needs migrating anyway, and v2 content is never Quill.
- Small converter fix (AC-5) so converting at migration time and again at load doesn't collapse double spaces.

## Verification (2026-10-21)
`npm test` 23 files / 428 tests pass; `npm run lint`, `npm run typecheck`, `npm run build` clean; `next dev -p 3100`: `/` 200, `/notes` 200, no server errors. No dependency changes (lockfile untouched).

## Open questions
None.
