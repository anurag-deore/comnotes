# CNOTE-17 – Archive notes

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-17/   **Branch:** cnote-17/archive   **Blocked by:** none (builds on CNOTE-6 trash, CNOTE-7 locked notes, CNOTE-13/15/16 design, CNOTE-19 backup, CNOTE-21 schema)

**Spec agreed:** pre-approved by the user 2026-10-21 (approach and decisions given with the task).

## Goal
A note can be archived: it leaves the main notes list (and, once CNOTE-18 lands, search) without being deleted. An Archive view next to Trash in the sidebar lists archived notes; each can be opened, edited and unarchived. Archiving shows a quiet toast with Undo. Backups keep which notes are archived.

## Current state (from the code)
- `lib/notes.ts` is the only Firestore notes module. `trashNote`/`restoreNote` write only `deletedAt` (no `rev`/`updatedAt` bump, so open editors don't conflict).
- The page derives `activeNotes` (not trashed) and `trashedNotes` from one live subscription; `showTrash` switches the sidebar between the list and `TrashView`. Only non-trashed notes can be selected.
- `noteListsChanged` (lib/motion.ts) animates when the notes list or the Trash list gains, loses or re-orders rows; it only knows `deletedAt`.
- Schema v2 (CNOTE-21): `needsMigration` checks the fields v2 defines; CNOTE-21 said CNOTE-17 "will treat a missing `archivedAt` as not archived".
- Backup format v2 (CNOTE-19 + CNOTE-7) has exact keys per note version; v1 files still import.
- Firestore rules: owner-only read/write on `/notes`, no field checks. No rules change needed.

## Decisions
- **Field:** `archivedAt: Timestamp | null` on the document, `Date | null` on `Note`. Missing or not a Timestamp reads as `null` (not archived).
- **No rev/updatedAt bump:** `archiveNote` writes only `archivedAt: serverTimestamp()`, `unarchiveNote` only `archivedAt: null`, like trash. An editor with unsaved edits keeps saving (its rev still matches) and the note keeps its place in the list by `updatedAt`. `saveNote` never writes `archivedAt`, so edits leave an archived note archived.
- **Trash wins:** a note with `deletedAt` shows only in Trash, whatever `archivedAt` says. Trashing an archived note keeps `archivedAt`, so Restore puts it back in Archive. Archive/Unarchive don't touch `deletedAt`.
- **Archived notes are editable:** archiving is filing, not locking. They open read-write from the Archive view; the editor header says "Archived" and offers Unarchive.
- **Locked notes** can be archived and unarchived without decrypting (only `archivedAt` is written).
- **No schema bump:** `archivedAt` is nullable and reads as `null` when missing, so a v2 note without it is complete. Bumping to v3 would make every user run the migration banner again to write a field that changes nothing. New notes (create, conflict copy, import) write `archivedAt` explicitly; `needsMigration`/`migrateNoteData` are unchanged.
- **Backup format v3** adds `archivedAt` (ISO string or null) to each note. v1 and v2 files still import, with `archivedAt` null. Exact-key checks stay strict per version. The Markdown export adds an `archived:` front-matter line (files stay where they are; Trash still goes in `trash/`).
- **Search hook-up:** `lib/noteViews.ts` exports `noteView(note)` and `visibleNotes(notes, view = 'notes')`; CNOTE-18 filters with `visibleNotes(notes)` so archived and trashed notes are hidden by default.
- The Backup button's icon changes from `Archive` to `DatabaseBackup` so the archive icon means one thing.

## Scope
**In:** `archivedAt` on notes; `archiveNote`/`unarchiveNote`; `noteView`/`visibleNotes`; Archive view in the sidebar (desktop + drawer); Archive/Unarchive in the editor and locked-note headers; Undo toast; list motion for archive moves; backup v3 + Markdown front matter; tests.
**Out:** search UI (CNOTE-18); bulk archive; archiving from a list row; schema bump / migration backfill (see Decisions); `firestore.rules` changes.

## Acceptance criteria
- [x] AC-1 `Note` has `archivedAt: Date | null`. A document without `archivedAt` (or `null`, or not a Timestamp) reads as `null`; a Timestamp becomes a Date. A v2 note without `archivedAt` doesn't need migration.
- [x] AC-2 `archiveNote(id)` writes only `archivedAt` (server timestamp); `unarchiveNote(id)` writes only `archivedAt: null`. Neither changes `rev`, `updatedAt`, `deletedAt`, title, content or ciphertext.
- [x] AC-3 New notes (`createNote`, conflict copies, imports without an archive date) are written with `archivedAt: null`; `saveNote` never writes `archivedAt`.
- [x] AC-4 `noteView` puts a note in `trash` when `deletedAt` is set (whatever `archivedAt` is), else `archive` when `archivedAt` is set, else `notes`. `visibleNotes(notes, view)` keeps order and defaults to `notes`.
- [x] AC-5 The main list shows only notes that are neither archived nor trashed; the Archive view only archived, non-trashed notes; Trash only trashed notes (archived ones included). Initial selection is the first main-list note.
- [x] AC-6 The open note's header has Archive (or Unarchive when archived) for plain, unlocked and locked notes. Archiving moves it out of the list at once, selects the next note in the same list (or the previous, or none) and shows a quiet toast with Undo, which unarchives and reselects it. Unarchive keeps the note open and says so in a quiet toast.
- [x] AC-7 The sidebar has an Archive button next to Trash with a count. The Archive view has Back to notes, an empty state, and rows that open the note plus an Unarchive button per row (labelled with the note's name; locked notes show "Locked note"). Tokens only, both themes, desktop sidebar and mobile drawer, 44 px targets, nav landmark labelled "Archive".
- [x] AC-8 Archived notes open and edit normally from the Archive view; the editor header shows an "Archived" label.
- [x] AC-9 Trashing an archived note keeps `archivedAt`; it shows only in Trash; restoring returns it to Archive.
- [x] AC-10 List motion (CNOTE-16) animates rows moving between the notes list, Archive and Trash; content edits that keep the order still don't animate.
- [x] AC-11 Backup export is format version 3 with `archivedAt` per note (ISO or null). Import reads v3 (strict keys, valid ISO or null) and v1/v2 (archivedAt null); round-trip keeps `archivedAt`; imported notes are written with it. Markdown front matter carries `archived:` for archived notes. The import summary counts archived notes.
- [x] AC-12 `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass; `/` and `/notes` return 200 from `next dev`.

## Design
- `types/note.ts`: `archivedAt: Date | null`.
- `lib/noteViews.ts` (new, pure): `NoteView`, `noteView`, `visibleNotes`.
- `lib/notes.ts`: `toNote` maps `archivedAt`; `newNoteFields` gains `archivedAt: null`; `importNotes` writes the imported date; `archiveNote`, `unarchiveNote`.
- `lib/migration.ts`: header comment only.
- `lib/motion.ts`: `noteListsChanged` compares ids per `noteView` (notes / archive / trash).
- `lib/backup.ts`: `BACKUP_VERSION = 3`, `NOTE_KEYS_V3`, `archivedAt` on `BackupNote` and `ImportedNote`.
- `lib/backupMarkdown.ts`: `archived:` front-matter line.
- `components/notes/ArchiveView.tsx` (new): empty state, rows via `NoteListItem` with an Unarchive action.
- `components/notes/NoteListItem.tsx`: optional `action` rendered beside the row button (siblings, never nested).
- `components/notes/Sidebar.tsx`: `view: NoteView` + `onShowView` replace `showTrash`; Archive and Trash buttons side by side under the list (notes view); Lock moves to its own full-width row; Back to notes for both sub-views.
- `components/notes/TrashView.tsx`: an archived note in Trash says "From Archive" (Restore returns it there).
- `components/notes/EditorPane.tsx`, `LockedNotePane.tsx`: Archive/Unarchive icon button; "Archived" label.
- `components/notes/BackupDialog.tsx`: icon, archived count in the import summary.
- `app/notes/page.tsx`: view state, derived lists via `visibleNotes`, selection from non-trashed notes, archive/unarchive handlers, shared Undo toast.

## Tests
| Test | Verifies | Type |
|---|---|---|
| toNote: missing/null/garbage archivedAt → null, Timestamp → Date; v2 note without archivedAt doesn't need migration | AC-1 | vitest (mocked firestore) |
| archiveNote / unarchiveNote write only archivedAt | AC-2 | vitest (mocked firestore) |
| createNote, conflict copy, importNotes write archivedAt; saveNote update has no archivedAt | AC-3 | vitest (mocked firestore) |
| noteView / visibleNotes per view, trash wins, order kept | AC-4, AC-5, AC-9 | vitest |
| trashNote / restoreNote leave archivedAt alone (writes only deletedAt) | AC-9 | vitest (mocked firestore) |
| noteListsChanged: archive/unarchive and trash-of-archived are changes; edits are not | AC-10 | vitest |
| backup v3 build/parse round-trip with archivedAt; v1/v2 import with null; bad archivedAt rejected; v3 missing key rejected | AC-11 | vitest |
| Markdown front matter has archived line | AC-11 | vitest (jsdom) |
| Sidebar/Archive view, editor buttons, toast, drawer, themes | AC-5–AC-8 | manual check (dev server; real Firebase env needed for data) |

Verification (2026-10-21): 446 unit tests, lint, typecheck and build pass; `next dev` on :3100 serves `/` and `/notes` with 200 and no server errors. UI ACs (5–8) are checked through the code and build; a visual pass in both themes and the phone drawer needs a signed-in session with real Firebase config and is still to do.

## Open questions
None. Assumption: the Archive list is ordered like the main list (by `updatedAt`), not by archive date.
