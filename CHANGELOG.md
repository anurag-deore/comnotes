# Changelog

All notable changes to ComNotes. Newest first. Ticket ids (`CNOTE-n`) match the Plane project
and the specs in [`specs/`](specs/); commit hashes are on `main`.

## 2026-10-21 — UI polish

### Changed

- **Bigger logo** — 40px in the notes sidebar and 80px on the PIN screen (`fa2e943`, `f4315cc`, `d21eb7c`).
- **New logo** — wordmark with a blue gradient mark. Its outlines and the name are drawn in
  `currentColor`, so they follow the light/dark theme, and the gradient stays fixed. Gradient ids
  are unique per instance (`useId`), because the logo can render twice at once (sidebar and
  drawer) (`1af1292`).
- **Sidebar header** — the logo is now the Home button (`aria-current` while Home shows). The
  separate Home icon is gone, the menu button takes its place, and the keyboard-shortcuts header
  button is removed; shortcuts live in Settings, `?` and ⌘K (`ad16ceb`).
- **Sidebar menu and settings window** (`d196f31`):
  - A gear button in the header opens a menu (Radix DropdownMenu): Archive (count), Trash
    (count), Settings, Lock. The footer buttons are gone.
  - Settings is a window with a category list (Radix Tabs; a horizontal tab row below 768px):
    - **General:** theme, and keyboard shortcuts → View.
    - **Data controls:** keep notes available offline on this device, and Backup.
    - **Security:** Lock now, with the auto-lock timing built from `lib/lockSettings.ts`; a
      locked-notes passphrase note.
  - "Open settings" is in the ⌘K palette, with no key binding (⌘, is Chrome's).
  - Focus fixes: closing Settings opened from the menu returns focus to the gear. Dialogs opened
    from the palette return focus to where the palette was opened, which fixes the CNOTE-24 known
    gap. Open menus block app shortcuts.
- **Settings dialog** — theme, offline copy and backup moved out of the sidebar into a dialog
  (`b2a7396`, since redesigned above).
- **Logo** — first wordmark logo, inline SVG in `currentColor` (`16fa412`).

### Added

- `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`.

## 2026-10-21 — Features, data and docs

### Added

- **CNOTE-25 README** — rewritten from the code: features, security model, setup (env vars,
  Firebase console, rules deploy), scripts, testing, deploy, architecture, note document,
  shortcuts, work tracking, design credit (`3ba2163`).
- **CNOTE-24 Keyboard shortcuts and ⌘K command palette** (`ee8ee50`):
  - **Registry:** a single command registry with a pure matcher (`lib/shortcuts.ts`). Mod = ⌘
    on Mac and Ctrl elsewhere.
  - **When keys are ignored:** single-key shortcuts while typing, during IME composition, and
    inside dialogs. The matcher is AltGr-safe.
  - **Keys:**
    - Palette ⌘K; search `/` or ⇧⌘F; help `?` or ⌘/.
    - New note ⌥⌘N; archive ⌥⌘A; Trash ⌥⌘⌫.
    - Home ⇧⌘H; sidebar ⌘\; theme ⇧⌘D; lock ⌥⌘L.
    - Browser-reserved and editor keys are avoided.
  - **Palette:** commands plus jump-to-note through the existing search index (no second
    index). Locked notes appear only while unlocked.
  - **Help dialog:** generated from the registry, with platform-aware key labels.
- **CNOTE-23 Home dashboard** (`dfd77ba`):
  - Shown from the logo or whenever no note is open.
  - Shows counts (active, archived, locked, Trash), words written, a 12-week activity grid
    (hand-rolled SVG), current and longest streak, and recent notes.
  - Pure `lib/metrics.ts` with no extra Firestore reads. Locked notes count only while
    unlocked. Day keys use the local timezone and are DST-safe.
- **CNOTE-18 Search** (`036a8e7`):
  - Lazy-loaded MiniSearch (its own ~6 kB chunk): title boost, prefix and typo matching,
    incremental per-note index, debounced input, up to 50 results.
  - **Scope:** active notes by default; "Include Archive"; Trash isn't searchable.
  - **Locked notes:** indexed only while unlocked, in memory. The index is rebuilt without them
    on lock and never persisted.
  - **Results:** highlights are built as React elements from plain text (no HTML injection);
    combobox keyboard navigation and a live-region result count.
- **CNOTE-20 Offline support and installable PWA** (`3a968ba`):
  - **Cache:** Firestore persistent multi-tab cache. A per-device "Keep notes available
    offline" setting (default on); turning it off clears IndexedDB and uses a memory cache.
  - **Offline edits:** kept as autosave drafts and saved through the rev-checked transaction on
    reconnect, so conflict copies still apply.
  - **UI:** an offline indicator. The PIN screen explains that unlocking needs a connection.
  - **Install:** manifest, icons, theme-color. A hand-written `public/sw.js` (production only)
    caches the app shell and never caches Firestore or Auth.
  - **Trade-offs:**
    - With the offline setting on, plain notes sit unencrypted in this device's IndexedDB.
    - No offline unlock.
    - Unsaved offline drafts are lost if the tab is closed while offline.
- **CNOTE-17 Archive** (`9e2e87f`):
  - `archivedAt`; archive and unarchive don't bump rev or `updatedAt`.
  - An Archive view; archived notes stay editable; undo toast.
  - Trash wins: Restore returns an archived note to Archive. Locked notes can be archived
    without unlocking.
  - Backup format v3.
- **CNOTE-21 Migration of older notes** (`c20f13b`):
  - **Fixed:** the notes list used `orderBy('updatedAt')`, which silently hid notes missing that
    field. The list now reads all notes and sorts client-side.
  - **Migration:** user-triggered and idempotent, from a banner (Download backup / Update now).
    - Backfills dates, rev, `deletedAt`, title and `encrypted`.
    - Converts legacy Quill HTML once and stamps `schemaVersion: 2`.
    - Per-note transactions skip notes edited meanwhile. Locked notes are untouched.
  - New notes, conflict copies and imports write the current schema.
- **CNOTE-7 Locked notes with client-side encryption** (`2e6054c`):
  - **Passphrase:** one passphrase for all locked notes, never stored, hashed or committed. A
    wrong passphrase simply fails to decrypt (AES-GCM authentication).
  - **Key:** PBKDF2-SHA-256 (600k iterations, random salt) → non-extractable AES-GCM-256 key,
    held in memory only.
  - **Encryption:** a fresh IV per save, and the note id as additional data. Title and content
    are encrypted, and Firestore stores only ciphertext.
  - **Saves:** autosave encrypts before the saver; conflict copies are re-encrypted.
  - **Lock:** app lock, auto-lock and sign-out clear the keys.
  - **Backups:** keep ciphertext.
  - **Recovery:** a lost passphrase means locked notes can't be recovered.
- **CNOTE-19 Backup export and import** (`7fa039d`):
  - **Export:** one zip with a lossless `notes.json` (including Trash) plus Markdown per note
    (Trash under `markdown/trash/`, images under `markdown/assets/`).
  - **Import:** `notes.json` or the zip.
    - Strict validation: format and version, types, 20 MB limit, prototype keys.
    - Content goes through the editor's sanitizer.
    - Always creates new notes and skips duplicates; a confirm dialog shows counts first.
  - Deps: `@tiptap/markdown`, `fflate` (lazy-loaded).

### Removed

- **CNOTE-22 Cleanup** (`c34cd6c`):
  - An unreachable duplicate auth redirect, unused `images` config, and Create Next App SVGs.
  - `agentRules: false` stops `next dev` generating `AGENTS.md`.
  - Deps listed in the ticket turned out to be in use; none removed (checked with depcheck and
    knip).

## 2026-10-20 — Editor, design system, motion, themes

### Added

- **CNOTE-15 Themes** (`5d1d2bc`):
  - Light, dark and system (default system), remembered per browser.
  - No flash on load: a pre-paint head script from a fixed string, with no lint disables.
  - A dark palette derived from the design guide, and an accessible theme switcher.
  - Open Sans for note text; Inter for the UI.
  - 36 WCAG contrast checks across both themes.
- **CNOTE-16 Animations** (`702228a`):
  - Motion tokens.
  - List enter, exit and reorder via View Transitions (autosaves don't trigger them); animated
    sidebar collapse, remembered.
  - Drawer, popover and toast exit animations; a PIN-screen shake on a wrong PIN; a save-status
    crossfade.
  - Reduced motion: opacity only.
- **CNOTE-13 UI/UX revamp** (`d335efd`, `3e4ce4c`, `8c35fdd`):
  - Design tokens adapted from a Wise-inspired design guide (`docs/design/DESIGN.md`), with no
    Wise branding.
  - Inter, a new sidebar and editor-card layout, and the page split into components.
  - A Radix link popover replaces `window.prompt`.
  - A mobile drawer below 768px.
  - Focus rings, ARIA landmarks and labels, AA contrast.
  - Quieter toasts and an inline save status.

### Changed

- **CNOTE-14 Editor** — Quill replaced with Tiptap v3; storage stays HTML (`a8ade7d`, `7027eb7`).
  - Quill 1 and 2 HTML (lists, checklists, indent, code blocks, alignment) is converted on load.
  - Links are limited to http, https and mailto with safe `rel`. Images are limited to http(s)
    and `data:image`.
  - Loading never triggers a save. Markdown typing shortcuts are on.

## 2026-10-16 — Security, autosave, CI, deploys

### Added

- **CNOTE-6 Trash** (`ff4b48f`) — soft delete (`deletedAt`) with Undo; Trash view with
  Restore, Delete forever and Empty trash; purge after 30 days.
- **CNOTE-8 Auto-lock** (`097f49f`):
  - Locks after 5 minutes idle or 1 minute with the tab hidden.
  - Pending saves are flushed first; unsaved drafts survive a lock and save after unlock.
  - A Lock button; a "Locked after inactivity" message.
- **CNOTE-5 Autosave** (`b6ef81d`):
  - Each note saves about 1 s after typing stops.
  - Rev-checked transactions keep a "(conflict copy)" when two edits clash.
  - The notes list updates live across tabs. `lib/notes.ts` is the only Firestore notes module.
- **CNOTE-9 / CNOTE-27 CI** (`997b320`, `8439b52`, `e3677cc`) — GitHub Actions: lint,
  typecheck, unit tests, build, and Firestore rules tests (emulator, JDK 21).

### Changed

- **CNOTE-10 Deploys** (`835a452`, `c3fe634`) — kept the Vercel Git integration, with production
  gated on the CI checks. Removed broken export/deploy scripts. `deploy:rules` refuses to run while
  the owner UID is still a placeholder.

### Security

- **CNOTE-3 PIN as the Firebase Auth credential** (`ee520ac`):
  - The PIN is the password of the single owner account.
  - Owner-only Firestore rules.
  - The old plaintext `pin` collection is no longer used. Supersedes CNOTE-2.
- **CNOTE-12 Sanitized note HTML** (`22c3883`):
  - Closed a hole where pasted embeds could be stored and rendered as live HTML.
  - Note HTML is only ever shown as plain text outside the editor.
  - Lint bans `dangerouslySetInnerHTML`, `innerHTML` and `insertAdjacentHTML`.

## 2026-10-14 — Foundations

### Changed

- **CNOTE-4** — upgraded Next.js, React and all dependencies to their latest versions (`f007486`).
- **CNOTE-1** — ADR 0001: keep Firebase as the storage backend (`ed99a00`).

## 2025-04-23 — Initial app

- First version: PIN-protected notes on Firestore with a Quill editor (`7281c73`, `4413944`,
  `e905bab`), on top of Create Next App (`91e665a`).

## Known open items

- **CNOTE-11:** restrict the Firebase API key to app domains and enable App Check (backlog).
- **CNOTE-26:** clear the `@grpc/grpc-js` advisories once Firebase ships a fix (blocked
  upstream; `npm audit` reports 4 high).
- **Not yet tried in a browser with a signed-in session:**
  - Most of the 2026-10-20 and 2026-10-21 UI: sidebar, settings window, search, palette, archive,
    dashboard, locked notes.
  - The offline flows and the migration banner.
