# ComNotes

A personal notes app for one owner. It runs entirely in the browser: a
Next.js 16 app hosted on Vercel, talking straight to Firebase Authentication
and Cloud Firestore through the Firebase client SDK. There are no API routes
and no server code of its own. One PIN unlocks it on any device.

## Features

- **Rich-text editor** (Tiptap): headings, bold/italic/underline/strike,
  colours, links, bullet, numbered and check lists, quotes, code blocks,
  alignment, pasted images, Markdown shortcuts while typing.
- **Autosave**: a note saves about 1 s after you stop typing, in a
  rev-checked transaction. If the note changed on another device or tab in
  the meantime, nothing is overwritten: your version is kept as
  `<title> (conflict copy)` and the server version is loaded. The list is
  live across tabs and devices, and the browser warns before leaving with
  unsaved edits.
- **Trash**: deleting moves a note to Trash with an Undo toast. Trash has
  Restore, Delete forever and Empty trash. Notes in Trash for more than
  30 days are deleted for good when the list loads.
- **Archive**: archiving moves a note out of the main list (with an Undo
  toast). It stays editable in the Archive view and can be unarchived.
- **Search** over titles and text, by prefix and with small typos, with
  highlighted results and an **Include Archive** toggle. Locked notes are
  searched only while unlocked. The index lives in the tab's memory only.
- **Locked notes**: any note can be encrypted in the browser with a
  passphrase (see [Security model](#security-model)).
- **Backup**: Export downloads `comnotes-backup-YYYY-MM-DD.zip` with a
  lossless `notes.json` and a Markdown copy of each note. Import checks the
  file strictly and adds its notes as new ones; nothing existing is
  overwritten.
- **Offline and installable**: unlocked notes stay readable and editable
  offline, edits save when the connection is back, the app can be installed
  as a PWA and its shell loads without a network.
- **Auto-lock** after 5 minutes without activity or 1 minute with the tab
  hidden, plus a Lock button.
- **Themes**: Light, Dark or System, remembered per browser.
- **Home dashboard** when no note is open: recent notes, counts, words
  written, a 12-week activity grid and writing streaks, all computed in the
  browser.
- **Keyboard shortcuts** and a **⌘K / Ctrl+K command palette** that also
  jumps to notes (see [Keyboard shortcuts](#keyboard-shortcuts)).
- **Older notes**: notes saved by earlier versions are detected once per
  session; a banner offers a backup download and a one-click update to the
  current schema.

## Security model

- **The PIN is a Firebase Auth password.** There is one Firebase
  email/password user, the owner (`NEXT_PUBLIC_OWNER_EMAIL`), and the PIN is
  its password. Firebase checks it on its servers and throttles repeated
  wrong guesses; the app never stores it. The session is kept in memory
  only, so a refresh or a new tab asks for the PIN again and nothing stays
  signed in on a shared PC. Unlocking needs a network connection.
- **Owner-only Firestore rules.** [`firestore.rules`](firestore.rules)
  allows reads and writes on `notes/{id}` only for the owner's uid and
  denies everything else. The committed file holds the placeholder
  `REPLACE_WITH_OWNER_UID`; the real uid is pasted in locally only to deploy
  the rules and is never committed.
- **Auto-lock.** Locking (automatic or the Lock button) forgets the keys of
  locked notes first, waits up to 3 s for pending saves, then signs out.
  Drafts that couldn't be saved stay in the tab's memory and are saved after
  the next unlock.
- **Locked notes.** Title and content are encrypted in the browser with
  AES-GCM 256, using a key derived from your passphrase with PBKDF2-SHA-256
  (600 000 iterations). Firestore, backups and the offline cache only ever
  hold the ciphertext. One passphrase covers all locked notes and it is
  **never stored anywhere**: not in Firestore, not in the browser, not as a
  hash. A wrong passphrase is detected only because decryption fails.
  **A lost passphrase means the locked notes are gone for good**; nobody can
  recover them. Firestore still sees which notes are locked, their dates,
  Trash/Archive state and the ciphertext length. Backups and conflict copies
  made before a note was locked can still hold its plain text.
- **Offline cache.** By default Firestore keeps notes, and edits waiting for
  the network, in this browser's IndexedDB, so ordinary notes are stored in
  plain text on the device (locked notes stay encrypted). Turn off
  **Keep notes available offline on this device** in the sidebar to keep
  notes in memory only; turning it off deletes the cache. The setting is per
  device.
- **The Firebase web config is public by design.** The
  `NEXT_PUBLIC_FIREBASE_*` values are built into the JavaScript every
  visitor downloads. Access is controlled by Firebase Auth and the rules,
  not by keeping the config secret.
- **Note HTML is never injected.** Outside the editor, note content is
  shown only as plain text, and ESLint rejects `dangerouslySetInnerHTML`,
  `innerHTML`/`outerHTML` assignments and `insertAdjacentHTML`.

## Setup

### Prerequisites

- **Node 24.** CI runs on Node 24.
- **npm 11.19 or later.** CI's `npm ci` uses the npm bundled with Node 24
  (11.19), which rejects lockfiles that older npm versions wrote with
  missing optional entries. If you change dependencies, write the lockfile
  with npm 11.19 or later, for example
  `npx npm@11.19.0 install --package-lock-only`.
- **JDK 21+**, only for the Firestore rules tests (the emulator in
  firebase-tools 15 needs it).
- A **Firebase project** with Firestore and Authentication. The free Spark
  plan is enough.

### Install and run

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. `/` is the PIN screen and `/notes` is the app.

### Environment

Create `.env.local` with the Firebase web config (Project settings → Your
apps → Web app) and the owner's email. These are the only variables the
code reads ([`lib/firebase.ts`](lib/firebase.ts), [`lib/auth.ts`](lib/auth.ts)):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_OWNER_EMAIL=you@example.com
```

`NEXT_PUBLIC_*` values are inlined at build time, so restart `npm run dev`
or rebuild after changing them. `npm run build` succeeds without them (CI
builds that way), but the app can't reach Firebase.

### Firebase console (one-time)

1. Firestore: create the database.
2. Authentication → Sign-in method: enable **Email/Password**.
3. Authentication → Users → **Add user**: the email is
   `NEXT_PUBLIC_OWNER_EMAIL`, the password is your PIN. Firebase requires at
   least 6 characters and the app adds no limit of its own; use 8 or more,
   mixing letters and digits.
4. Note the new user's **User UID** for the rules deploy below.
5. Authentication → Settings → **Authorized domains**: `localhost` is there
   by default; add your production domain.
6. Optional: Authentication → Settings → User actions: turn off
   **Enable create (sign-up)**.
7. Deploy the rules (next section).
8. Upgrading an old install: delete the old `pin` collection in
   Firestore → Data.

To change the PIN, change that user's password in the console.

### Firestore rules

The rules are deployed by hand, because the real owner uid must never be
committed. Sign in once with `npx firebase login`, then:

1. Paste the owner's User UID into `ownerUid()` in `firestore.rules`,
   replacing `REPLACE_WITH_OWNER_UID`.
2. `npm run deploy:rules -- --project <project-id>`. It refuses while
   `REPLACE_WITH_OWNER_UID` is still there.
3. `git restore firestore.rules`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest `unit` project) |
| `npm run test:rules` | Rules tests in the Firestore emulator |
| `npm run deploy:rules` | Deploy `firestore.rules` (see above) |

## Testing

- **Unit tests** (`npm test`): [`tests/unit`](tests/unit), Vitest. Firebase
  is mocked; DOM tests use jsdom. No network or emulator needed.
- **Rules tests** (`npm run test:rules`):
  [`tests/rules`](tests/rules) against the Firestore emulator (project
  `demo-comnotes`, port 8080) through `firebase emulators:exec`. Needs JDK
  21+; on macOS with several JDKs:
  `JAVA_HOME=$(/usr/libexec/java_home -v 21) npm run test:rules`. The tests
  read the owner uid from `firestore.rules`, so they work with the
  placeholder.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on
  every pull request and every push to `main`, as five parallel jobs:
  `lint`, `typecheck`, `unit-tests`, `build` (with no Firebase env vars) and
  `rules-tests` (Temurin JDK 21, emulator download cached). A newer push to
  the same branch cancels the run in progress.

## Deploy

### App (Vercel)

The Vercel GitHub integration builds every push. The Firebase env vars are
set in the Vercel project, not in the repo.

- **PRs** get a preview deployment.
- **`main`** gets a production build. It is only promoted to the production
  domain once all five CI checks (`lint`, `typecheck`, `unit-tests`,
  `build`, `rules-tests`) pass on that commit, via Vercel
  [Deployment Checks](https://vercel.com/docs/deployment-checks).
  **Force Promote** on the deployment page bypasses this.

One-time setup in the Vercel dashboard:

1. Project → Settings → Environments → Production: make sure automatic
   aliasing for production is on.
2. Project → Settings → Build and Deployment → Deployment Checks →
   **Add Checks** → **GitHub** → select `lint`, `typecheck`, `unit-tests`,
   `build`, `rules-tests`.

Vercel matches checks by job name, so renaming a CI job means updating this
list.

### Service worker and PWA

- The service worker ([`public/sw.js`](public/sw.js), route rules in
  [`public/sw-routes.js`](public/sw-routes.js)) is registered **only in
  production builds**. In development any leftover worker is unregistered,
  so test offline behaviour with `npm run build && npm start`.
- [`next.config.ts`](next.config.ts) serves both files with
  `Cache-Control: no-cache`, so a new deploy's worker is picked up, and a
  same-origin-only Content-Security-Policy.
- The manifest is [`app/manifest.ts`](app/manifest.ts); icons are in
  [`public/icons`](public/icons).
- Offline, the shell and an already-unlocked tab keep working. A cold start
  offline shows the PIN screen, but unlocking waits for the network.

## Architecture

```text
app/          Routes: / (PIN screen), /notes (the app), layout, manifest,
              globals.css (design tokens, light and dark)
components/   PinLock, editor/ (Tiptap editor, toolbar, link popover),
              notes/ (sidebar, editor pane, Home, Archive, Trash, search,
              command palette, dialogs), ui/ (shared primitives)
contexts/     AuthContext (auth state, lock, auto-lock),
              AutosaveContext (one autosaver for the whole app)
hooks/        useAutosave, useNoteSearch, useNoteMigration,
              useOnlineStatus, useNow, useReturnFocus
lib/          Logic, mostly pure and unit-tested (below)
public/       Service worker and icons
types/        Note type
tests/        unit/ (Vitest), rules/ (emulator)
docs/         adr/ (decisions), design/ (design language)
specs/        One spec per ticket
```

Main `lib/` modules:

- [`notes.ts`](lib/notes.ts): the **only** module that talks to Firestore
  about notes: live list, create, rev-checked save with conflict copies,
  trash/restore/purge, archive, import, migration writes.
- [`firebase.ts`](lib/firebase.ts): Firebase app, Firestore with the
  offline cache setting, lazy Auth.
- [`auth.ts`](lib/auth.ts): unlock with the PIN, lock (clears the vault,
  signs out).
- [`autosave.ts`](lib/autosave.ts): debounced per-note saver (no React, no
  Firebase): serialised saves, retry, `flush()`, conflict and "gone"
  handling.
- [`autoLock.ts`](lib/autoLock.ts),
  [`lockSettings.ts`](lib/lockSettings.ts): idle and hidden-tab timers,
  flush-then-lock, the timings.
- [`noteCrypto.ts`](lib/noteCrypto.ts): WebCrypto PBKDF2 + AES-GCM,
  payload validation.
- [`vault.ts`](lib/vault.ts): in-memory keys for locked notes;
  [`lockedNotes.ts`](lib/lockedNotes.ts): placeholders and draft overlay.
- [`backup.ts`](lib/backup.ts), [`backupMarkdown.ts`](lib/backupMarkdown.ts),
  [`backupZip.ts`](lib/backupZip.ts),
  [`downloadBackup.ts`](lib/downloadBackup.ts): backup format and strict
  import checks, Markdown files, zip, export.
- [`migration.ts`](lib/migration.ts): detects older notes and brings them to
  `schemaVersion` 2; [`quillToTiptap.ts`](lib/quillToTiptap.ts) converts
  pre-Tiptap Quill HTML.
- [`noteSearch.ts`](lib/noteSearch.ts): in-memory MiniSearch index;
  [`searchHighlight.ts`](lib/searchHighlight.ts),
  [`searchKeys.ts`](lib/searchKeys.ts): highlights and keyboard model.
- [`shortcuts.ts`](lib/shortcuts.ts): command registry and key matcher;
  [`commandPalette.ts`](lib/commandPalette.ts): palette ranking.
- [`metrics.ts`](lib/metrics.ts): Home dashboard numbers.
- [`noteViews.ts`](lib/noteViews.ts): which view (Notes, Archive, Trash) a
  note belongs to.
- [`noteHtml.ts`](lib/noteHtml.ts), [`editorContent.ts`](lib/editorContent.ts),
  [`editorExtensions.ts`](lib/editorExtensions.ts): note HTML as plain text,
  sanitising, the editor schema.
- [`offlineSetting.ts`](lib/offlineSetting.ts),
  [`onlineStatus.ts`](lib/onlineStatus.ts), [`pwa.ts`](lib/pwa.ts): offline
  cache setting, connectivity, PWA colours.
- [`theme.ts`](lib/theme.ts), [`themeStore.ts`](lib/themeStore.ts),
  [`motion.ts`](lib/motion.ts), [`listMotion.ts`](lib/listMotion.ts): theme
  preference and motion.

### Note document

One collection, `notes/{id}`:

| Field | Type | Meaning |
| --- | --- | --- |
| `title` | string | Plain title; `''` when locked |
| `content` | string | Editor (Tiptap) HTML; `''` when locked |
| `rev` | number | Bumped by every save; a save needs a matching rev |
| `createdAt` | timestamp | Server time |
| `updatedAt` | timestamp | Server time of the last save |
| `deletedAt` | timestamp \| null | In Trash since |
| `archivedAt` | timestamp \| null | Archived since |
| `encrypted` | object \| null | Ciphertext of a locked note |
| `schemaVersion` | number | `2` for current notes |

`encrypted` is `{ v, kdf, iter, salt, iv, ct }` (base64), bound to the note
id. Older documents with missing fields are read with safe defaults until
they are updated.

### Key decisions

- Keep Firebase, all Firestore calls in one module:
  [ADR 0001](docs/adr/0001-storage-backend.md).
- PIN as the Firebase Auth credential, owner-only rules:
  [CNOTE-3](specs/CNOTE-3.md).
- Rev check and "keep both" conflict copies: [CNOTE-5](specs/CNOTE-5.md).
- Soft delete, client-side 30-day purge: [CNOTE-6](specs/CNOTE-6.md).
- Locked notes, PBKDF2 over Argon2, no passphrase recovery:
  [CNOTE-7](specs/CNOTE-7.md).
- Auto-lock and the app-wide autosaver: [CNOTE-8](specs/CNOTE-8.md).
- CI and Vercel gating: [CNOTE-9](specs/CNOTE-9.md),
  [CNOTE-10](specs/CNOTE-10.md).
- Note HTML only as text outside the editor: [CNOTE-12](specs/CNOTE-12.md).
- Tiptap instead of Quill: [CNOTE-14](specs/CNOTE-14.md).
- Archive: [CNOTE-17](specs/CNOTE-17.md). Search in memory only:
  [CNOTE-18](specs/CNOTE-18.md).
- Backup format: [CNOTE-19](specs/CNOTE-19.md). Offline and PWA:
  [CNOTE-20](specs/CNOTE-20.md). Schema migration:
  [CNOTE-21](specs/CNOTE-21.md).
- Shortcuts and command palette: [CNOTE-24](specs/CNOTE-24.md).

## Keyboard shortcuts

The in-app help (`?`, or **Keyboard shortcuts** in the command palette) is
the source of truth; it shows the keys for your platform.

| Action | Mac | Windows / Linux |
| --- | --- | --- |
| Command palette | ⌘K | Ctrl+K |
| Search notes | `/` or ⇧⌘F | `/` or Ctrl+Shift+F |
| Keyboard shortcuts | `?` or ⌘/ | `?` or Ctrl+/ |
| New note | ⌥⌘N | Ctrl+Alt+N |
| Archive / unarchive note | ⌥⌘A | Ctrl+Alt+A |
| Move note to Trash | ⌥⌘⌫ | Ctrl+Alt+Backspace |
| Go to Home | ⇧⌘H | Ctrl+Shift+H |
| Toggle sidebar | ⌘\\ | Ctrl+\\ |
| Toggle light/dark theme | ⇧⌘D | Ctrl+Shift+D |
| Lock ComNotes | ⌥⌘L | Ctrl+Alt+L |
| Lock note / remove lock | palette only | palette only |
| Show Archive, Show Trash | palette only | palette only |

`/` and `?` are ignored while typing in a field or the editor. Archive,
Trash and Lock note need an open note.

## Work tracking

Work is tracked in the Plane project **CNOTE**. Each ticket gets a spec in
[`specs/`](specs) (`specs/CNOTE-<n>.md`) with its acceptance criteria and
tests, written before the code, and a branch `cnote-<n>/<slug>`. Commits
start with the ticket key.

## Design credit

The design language is adapted from a Wise-inspired `DESIGN.md` in
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md),
kept in [`docs/design/DESIGN.md`](docs/design/DESIGN.md). No Wise name,
logo or font is used; the UI is set in Inter and note text in Open Sans.
