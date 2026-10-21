# CNOTE-19 – Export / backup notes (Markdown + JSON)

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-19/   **Branch:** cnote-19/export-import   **Blocked by:** none

**Spec agreed:** pre-approved by the user 2026-10-21 (scope and constraints given with the task).

## Goal
From the sidebar, "Backup" opens a small dialog. **Export** downloads one file, `comnotes-backup-YYYY-MM-DD.zip`, holding a lossless `notes.json` of every note (Trash and legacy notes included) and a readable Markdown copy of each note, with pasted images saved as files. **Import** takes that zip (or its `notes.json`), checks it strictly, shows how many notes it will add, skip as duplicates or ignore as invalid, and after confirmation adds them as new notes. Nothing existing is ever overwritten. This is the safety net before any backend migration (ADR 0001).

## Current state (from the code)
- `lib/notes.ts` is the only Firestore notes module. The live list (`subscribeNotes`) orders by `updatedAt`, so documents without `updatedAt` (legacy) never show up in it.
- Note content is Tiptap HTML; older notes hold Quill HTML, converted on every load by `convertQuillHtml` and then parsed by the editor schema (`noteExtensions`), which drops scripts, handlers, disallowed links/images (CNOTE-12/14).
- `toNote` turns a missing timestamp into "now" and passes a missing title through as `undefined`.
- Firestore rules: owner-only read/write on `/notes`, no field checks. No rule changes needed.

## Scope
**In:** Backup dialog (export + import) in the sidebar; zip/JSON/Markdown builders; strict import validator; duplicate detection; batched import writes; tests.
**Out:** automatic/scheduled backups, importing Markdown or other apps' formats, merging into or overwriting existing notes, cloud backup targets.

## Acceptance criteria
- [x] AC-1 A "Backup" button in the sidebar (desktop and mobile drawer) opens an accessible dialog (Radix Dialog: focus trap, Escape, labelled title/description, 44px targets, both themes) with Export and Import sections.
- [x] AC-2 Export downloads one zip named `comnotes-backup-YYYY-MM-DD.zip` (local date) containing `notes.json` and `markdown/…`.
- [x] AC-3 `notes.json` is `{ format: "comnotes-backup", version: 1, exportedAt, notes: [...] }`; each note has `id, title, content (raw HTML, unchanged), rev, createdAt, updatedAt, deletedAt` with dates as ISO strings (`deletedAt` null when live). It includes every document in `/notes`: live, Trash, and legacy documents without `updatedAt`.
- [x] AC-4 Notes are read for export by `fetchAllNotes()` in `lib/notes.ts`: one `getDocs` of the whole collection, no `orderBy`. A missing `updatedAt` falls back to `createdAt` (and vice versa); a missing title reads as `''`.
- [x] AC-5 Markdown: one `markdown/<slug>.md` per live note and `markdown/trash/<slug>.md` per trashed note, slugs unique across both folders (`-2`, `-3`, …), ASCII, ≤ 60 chars, `untitled` for blank titles, Windows-reserved names avoided. Each file starts with YAML front matter (`title`, `created`, `updated`, plus `deleted` in Trash).
- [x] AC-6 Markdown body: content goes through `convertQuillHtml` and the editor schema first, then Tiptap's own Markdown serializer. Headings, bold/italic/strike, links, inline code, bullet/ordered lists, task lists (`- [x]`), code blocks with language, blockquotes and images come out as GFM; disallowed links/images are dropped as in the editor.
- [x] AC-7 Base64 (`data:image/…`) images are written to `markdown/assets/<slug>-<n>.<ext>` and referenced relatively (`assets/…`, `../assets/…` from Trash); remote images stay as URLs; an undecodable data URI stays inline.
- [x] AC-8 Import accepts a `.zip` (reads only its root `notes.json`) or a `.json` file. Files or an unzipped `notes.json` over 20 MB, non-UTF-8/unparsable JSON, a zip without `notes.json`, wrong `format`, unsupported `version`, unknown top-level keys, a non-array `notes`, more than 10 000 notes, or `__proto__` / `constructor` / `prototype` keys anywhere reject the whole file with a clear inline error.
- [x] AC-9 Per note, the shape is checked strictly (exact keys, string title/content, non-negative integer rev, strict ISO dates, `deletedAt` ISO or null, title + content ≤ 1 000 000 bytes). Bad notes are counted as invalid and skipped; the rest still import.
- [x] AC-10 Imported content is passed through the editor's load path (`convertQuillHtml` → schema parse → HTML) before it is written, so it holds nothing the editor would not. It never reaches `innerHTML` or the DOM outside the editor (parsing uses the inert `DOMParser` path Tiptap uses).
- [x] AC-11 Import creates new notes with new ids (backup ids are ignored), `rev: 0`, and the backup's `createdAt`/`updatedAt`/`deletedAt`. Existing notes are never written.
- [x] AC-12 A note is a duplicate (skipped) when an existing note — or an earlier note in the same file — has the same title, the same `createdAt` (ms) and the same content (raw or sanitised), so importing the same backup twice adds nothing.
- [x] AC-13 Before writing, a confirmation step shows the counts (to import, of which in Trash; duplicates skipped; invalid). With nothing to import it says so and offers only Close.
- [x] AC-14 Writes are batched (≤ 500 writes and ≤ ~8 MB per batch) and the dialog shows progress ("Importing 120 of 300…"); a failure reports how many were imported before it.
- [x] AC-15 States: while working, the action buttons are `aria-disabled` (focus stays put) and the dialog can't be dismissed, progress announced (`role="status"`), errors inline (`role="alert"`), quiet success toast ("Backup downloaded", "Imported N notes").
- [x] AC-16 Pure logic is unit-tested (see Tests); no `eslint-disable`, `ts-ignore`, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`; `firestore.rules` unchanged.
- [x] AC-17 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; `npm ci` with npm 11.19 succeeds on the lockfile; dev server serves `/` and `/notes` with 200 and no server-side errors.

## Design
**Dependencies**
- `@tiptap/markdown@^3.32.0` (Tiptap's official package, same release line as the editor; depends on `marked`). Its `MarkdownManager` serialises the editor's own JSON document with each extension's `renderMarkdown`, so Markdown is produced from exactly what the editor schema accepted: task lists, code blocks with language, links, images all come out as GFM with no extra rules. Turndown would need a second HTML→Markdown path, custom rules for Tiptap's task-item markup (`label > input` isn't what `turndown-plugin-gfm` matches) and its GFM plugin is unmaintained since 2017. Underline renders as Tiptap's `++text++`; colours/highlights/alignment have no Markdown and are dropped (JSON keeps them).
- `fflate@^0.8.3` (≈8 kB gz used, no deps, sync zip/unzip, `filter` lets import inflate only `notes.json` and check its declared size first). JSZip is ~10× larger and promise-only.

Personal data is small, so everything runs on the main thread; the UI yields one frame before heavy work so the progress state paints. `lib/backupZip.ts` (and with it fflate, `@tiptap/markdown`, `marked`) is loaded with a dynamic `import()` only when a backup is made or read, so the notes page bundle doesn't grow.

**Modules**
- `lib/backup.ts` (pure): `BACKUP_FORMAT`, `BACKUP_VERSION`, `MAX_BACKUP_BYTES` (20 MB), `MAX_BACKUP_NOTES`, `buildBackup(notes, now)`, `parseBackup(text)` → `{ ok, notes, invalid } | { ok: false, error }` (strict validator), `backupFileName(date)`, `planImport(imported, existing, sanitize)` → `{ create, duplicates }`, `chunkBatches(items, size, maxCount, maxBytes)`.
- `lib/editorContent.ts`: `sanitizeNoteHtml(html)` = `generateHTML(generateJSON(convertQuillHtml(html), noteExtensions()))` (empty stays empty), `noteHtmlToDoc(html)` (JSON for Markdown).
- `lib/backupMarkdown.ts`: `slugify`, `uniqueSlugs`, `dataUriToFile`, `noteToMarkdown(note, slug, dir)` → `{ markdown, assets }`, `markdownFiles(notes)` → path → text/bytes.
- `lib/backupZip.ts`: `buildBackupZip(notes, now)` → `Uint8Array` (fflate `zipSync`); `readBackupText(name, bytes)` → `{ ok, text } | { ok: false, error }` (zip magic → `unzipSync` with filter; else strict UTF-8 decode, BOM stripped).
- `lib/notes.ts`: `fetchAllNotes()` (`getDocs`, no `orderBy`, timestamp/title fallbacks) and `importNotes(notes, onProgress)` (new doc ids, `Timestamp.fromDate`, `writeBatch` chunks from `chunkBatches`). `toNote` reads a non-string title as `''`.
- `components/notes/BackupDialog.tsx`: trigger button + Radix Dialog; export (fetch → zip → Blob download via a temporary `<a download>`), import (hidden file input behind a labelled button, `accept=".zip,.json"`), confirmation step, progress, inline errors, toasts.
- `components/notes/Sidebar.tsx`: `BackupDialog` trigger under the theme switcher.

**Decisions**
- Trashed notes are exported to `markdown/trash/` (not excluded): the Markdown copy should be as complete as the JSON.
- Import keeps `deletedAt`, so a note trashed over 30 days ago is purged on the next load like any old Trash (the confirm step shows how many are in Trash).
- Import never trusts the backup's ids; every note is a new document.

**Firestore:** reads the whole `/notes` collection once per export/import; writes only new documents. Rules unchanged.

## Tests
| Test | Verifies | Type |
|---|---|---|
| backup: build → JSON → parse round-trip keeps fields, ISO dates, trash, legacy | AC-3, AC-9 | vitest |
| backup: rejects non-JSON, wrong format, version 2 / "1", unknown top-level key, notes not array, too many notes, oversized text, `__proto__`/`constructor`/`prototype` anywhere | AC-8 | vitest |
| backup: invalid notes (bad types, extra key, bad date, negative rev, too big) counted, valid ones kept | AC-9 | vitest |
| backup: planImport skips existing (raw and sanitised content) and in-file duplicates; differs by title/createdAt/content → imported | AC-12 | vitest |
| backup: backupFileName local date; chunkBatches by count and bytes | AC-2, AC-14 | vitest |
| markdown: slugify (accents, symbols, blank, long, reserved); uniqueSlugs | AC-5 | vitest |
| markdown: task list, code block, links (incl. dropped javascript:), remote + data images, front matter, trash paths | AC-5–AC-7 | vitest (jsdom) |
| markdown: legacy Quill checklist/code converts cleanly | AC-6 | vitest (jsdom) |
| editorContent: sanitizeNoteHtml strips script/handlers/bad links, keeps Tiptap HTML stable | AC-10 | vitest (jsdom) |
| zip: unzip contains `notes.json`, `markdown/a.md`, `markdown/trash/…`, `markdown/assets/…`; readBackupText from zip/json/BOM; rejects zip without notes.json, oversized entry, bad UTF-8 | AC-2, AC-7, AC-8 | vitest |
| notes: fetchAllNotes uses getDocs without orderBy + fallbacks; importNotes new ids, rev 0, Timestamps, 501 → 2 batches, progress | AC-4, AC-11, AC-14 | vitest |
| lint, typecheck, build, npm 11.19 ci, dev curl | AC-16, AC-17 | CLI |

## Manual browser checks (real Firebase env; not yet run — no Firebase env in the worktree, `/notes` redirects to the PIN screen)
- Export with live, Trash and legacy notes; open the zip; Markdown renders in a viewer; images open.
- Import the zip into an empty project and into the same project (second import: all duplicates).
- Keyboard-only: open Backup, export, import, cancel; dark theme.

## Open questions
None.
