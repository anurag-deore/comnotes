# CNOTE-7 – Locked notes with client-side encryption

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-7/   **Branch:** cnote-7/locked-notes   **Blocked by:** none (builds on CNOTE-5 autosave, CNOTE-6 trash, CNOTE-8 auto-lock, CNOTE-19 backup)

**Spec agreed:** pre-approved by the user 2026-10-21 (decisions and design guidance given with the task).

## Goal
Any note can be **locked**. A locked note's title and content are encrypted in the browser (WebCrypto AES-GCM 256, key derived from a passphrase with PBKDF2-SHA-256) before anything is written, so Firestore, backups and the network only ever carry ciphertext. One passphrase protects all locked notes. It is never stored anywhere: a wrong passphrase is detected only because AES-GCM decryption fails. The passphrase is asked once per session and the derived key lives in memory only; app lock (manual or automatic) forgets it and hides every decrypted note. **Lost passphrase = locked notes are gone for good.**

## Current state (from the code)
- `lib/notes.ts` is the only Firestore notes module. `saveNote` is a rev-checked transaction; a stale rev writes a "(conflict copy)" with the local text. `NoteDraft = { id, title, content, rev }`.
- `lib/autosave.ts` keeps pending drafts in memory per note id; on a conflict it moves edits typed meanwhile to the copy's id. `AutosaveProvider` (app-wide) survives the notes page unmounting on lock (CNOTE-8); after unlock the page shows `draft(id)` over the server copy.
- `AuthContext.logout` = `flushThenLock(saver.flush, lock)` then `router.push('/')`; auto-lock calls it too. `lib/auth.ts lock()` signs out.
- Backups (CNOTE-19): `notes.json` version 1 with exact note keys `id, title, content, rev, createdAt, updatedAt, deletedAt`; import writes new ids; Markdown per note.
- No search exists. Previews come from `notePreview(content)`.
- Firestore rules: owner-only on `/notes`, no field checks. No rules change needed.

## Scope
**In:** crypto module, in-memory vault, locked-note storage format, encrypt-before-save autosave path, conflict copies that stay encrypted, Lock note / Remove lock / unlock UI, list + Trash placeholders, key clearing on every lock path, backup v2 (ciphertext in JSON, placeholder in Markdown, strict import), tests.
**Out (deferred):** changing the passphrase / re-encrypting all notes (new ticket), a "forget passphrase but keep the app unlocked" button, Argon2, passphrase recovery of any kind (by design), searching inside locked notes.

## Acceptance criteria
- [x] AC-1 `lib/noteCrypto.ts`: PBKDF2-SHA-256 (WebCrypto, default **600 000** iterations, configurable for tests) with a random 16-byte salt derives a **non-extractable** AES-GCM-256 key. The passphrase is NFC-normalised. No dependency added.
- [x] AC-2 Encrypting a note's `{ title, content }` gives `{ v: 1, kdf: 'PBKDF2-SHA256', iter, salt, iv, ct }` (base64), with a fresh random 12-byte IV for **every** encryption (every autosave) and the note id bound as AES-GCM additional data.
- [x] AC-3 Decrypting with the wrong passphrase, the wrong note id (AAD), a tampered `ct`/`iv`, or a malformed payload fails cleanly with one error type; nothing partial is returned.
- [x] AC-4 Payload shape is validated strictly wherever it enters (Firestore read, backup import): exact keys, `v === 1`, `kdf === 'PBKDF2-SHA256'`, integer `iter` in [100 000, 10 000 000], canonical base64 with salt = 16 bytes, iv = 12 bytes, ct ≥ 16 bytes (tag) and ≤ 1 MiB of base64 (Firestore's document limit, so nothing the app could have saved is ever rejected).
- [x] AC-5 The passphrase, a hash of it, or any verifier is never stored (code, env, Firestore, localStorage/sessionStorage, backups). Only derived `CryptoKey`s are held, in memory (`lib/vault.ts`), and only for the session.
- [x] AC-6 Firestore holds a locked note as `title: ''`, `content: ''`, `encrypted: <payload>` plus non-sensitive metadata (rev, createdAt, updatedAt, deletedAt). Locking and Remove lock are rev-checked saves (they bump rev), so a stale edit from another tab becomes a conflict copy instead of mixing plaintext and ciphertext.
- [x] AC-7 Every draft of a locked note is encrypted in the page **before** it reaches the autosaver (`NoteDraft.sealed`), so the saver, its retries after an app lock, and `saveNote` never hold or write the plaintext. A plain save writes `encrypted: null`.
- [x] AC-8 A conflict on a locked note writes an **encrypted** conflict copy: the text is re-encrypted for the copy's id with " (conflict copy)" added to its title. Edits the saver moves to the copy are re-encrypted for the copy before they are written. Without the key the save fails and retries; it never writes plaintext.
- [x] AC-9 **Lock note** (editor header) encrypts the open note in place. First use in a session asks for the passphrase in a dialog. If no locked note exists yet (Trash included) the dialog is the first-time setup: clear warning that a forgotten or mistyped passphrase loses the notes, passphrase typed twice, strength hint (not a block). Otherwise the passphrase is checked by decrypting an existing locked note before it is used.
- [x] AC-10 Opening a locked note without its key shows an in-pane unlock form (labelled passphrase field, error on wrong passphrase, busy state). After unlocking, every locked note whose salt matches decrypts in memory; titles show in the list, the open note is editable and autosaves encrypted.
- [x] AC-11 **Remove lock** (confirmed) stores the note as plain text again.
- [x] AC-12 The list shows "Locked note" (with a lock icon) for locked notes until they are decrypted this session; the preview is always the placeholder "Encrypted", never decrypted text. Trash and toasts show "Locked note". Trash, restore, delete forever and purge work on locked notes.
- [x] AC-13 App lock (Lock button, auto-lock, any sign-out) clears every key **first**, which hides decrypted content at once (the editor unmounts), then flushes and signs out. Nothing decrypted is written to storage at any point.
- [x] AC-14 Backup: `notes.json` becomes version 2 with `encrypted` on every note (payload or null); locked notes are exported as ciphertext (`title`/`content` empty), never decrypted. Markdown gets a placeholder file per locked note (`locked-note.md`, front matter `locked: true`) saying it is encrypted and only restorable from `notes.json`.
- [x] AC-15 Import accepts version 1 (no `encrypted`) and version 2. A version 2 note needs `encrypted`; a locked note must have empty title/content, a valid payload and a Firestore-safe id. Locked notes are imported **under their original id** (the ciphertext is bound to it) and skipped as duplicates when that id already exists or repeats in the file; existing notes are never written. Content of locked notes isn't sanitised (it's ciphertext).
- [x] AC-16 Dialogs are Radix (focus trap, Escape, labelled title/description), 44 px targets, design tokens and motion, both themes, phone width.
- [x] AC-17 Unit tests for the above; no `eslint-disable`, `ts-ignore`, npm overrides, `innerHTML`/`dangerouslySetInnerHTML`; `firestore.rules` unchanged.
- [x] AC-18 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; dev server serves `/` and `/notes` with 200 and no server errors.

## Design

**Why PBKDF2, not Argon2.** WebCrypto has PBKDF2 natively (no dependency, no WASM, audited browser code, works in every target browser and in Node for tests). Argon2id is more resistant to GPU cracking but needs a WASM package (≈ 30–100 kB, supply-chain surface in a public repo). 600 000 iterations of PBKDF2-HMAC-SHA-256 is OWASP's 2023 recommendation; the payload records `kdf` and `iter`, so a later ticket can move to Argon2 or raise the count without breaking old notes. The real protection is passphrase strength, so the dialog pushes for a long one.

**Salt and key reuse.** Each payload is self-describing (`salt`, `iter`). The vault keeps one salt for new locks: it reuses the salt of the existing locked note it verified against, or makes a random one when no locked note exists. So normally all notes share a salt and the key is derived **once per session** (~0.5 s), not per note. Notes with a different salt (another device's first lock, an imported backup) just ask for the passphrase again when opened. Keys are cached per `(salt, iter)` in memory only. A note keeps its own salt when edited.

**AAD.** `comnotes:note:v1:<noteId>`. Moving ciphertext between documents fails authentication. Consequences: conflict copies and imports must re-encrypt or keep the id (see AC-8, AC-15).

**Modules**
- `lib/noteCrypto.ts` (pure WebCrypto): `PBKDF2_ITERATIONS`, `deriveKey(passphrase, salt, iter)`, `newSalt()`, `encryptNote(key, noteId, text)`, `decryptNote(key, noteId, payload)`, `isEncryptedPayload(value)`, `DecryptError`, base64 helpers.
- `lib/vault.ts`: `createVault({ iterations })` → `{ setup(passphrase), unlock(passphrase, sample), hasKeyFor(payload), canEncrypt(), encrypt(noteId, text, like?), decrypt(noteId, payload), reseal(payload, fromId, toId, edit?), lock(), subscribe, getVersion }`; `noteVault` is the app's single instance. `passphraseStrength(text)` (rough entropy estimate → weak/fair/strong).
- `lib/lockedNotes.ts` (pure): `withDraft(note, draft)` (draft overlay incl. sealed drafts), `LOCKED_TITLE`, `listTitle`.
- `types/note.ts`: `Note.locked: boolean`, `Note.encrypted: EncryptedPayload | null` (`locked && !encrypted` = payload this version can't read: shown as locked, can't be opened, left out of `notes.json`).
- `lib/notes.ts`: `toNote` reads `encrypted`; `NoteDraft.sealed?: { noteId, payload }`; `saveNote(draft, keys?)` writes ciphertext for sealed drafts (re-encrypting first when `sealed.noteId !== draft.id`), `encrypted: null` for plain ones, encrypted conflict copies via `keys.reseal`; `importNotes` writes sealed notes under their own id.
- `contexts/AutosaveContext.tsx`: `save: (draft) => saveNote(draft, noteVault)`; exposes `flush`.
- `contexts/AuthContext.tsx` + `lib/auth.ts`: `logout` clears the vault before `flushThenLock`; `lock()` and the auth listener (signed out) clear it too.
- `app/notes/page.tsx`: decrypted text in a `plain` map (state, memory only) keyed by note id with the payload IV it came from; decrypts locked notes when the vault has their key; seals edits before `change`; Lock note / Remove lock; clears `plain` when the vault locks.
- `components/notes/LockDialog.tsx` (setup / passphrase / remove-lock confirm), `components/notes/LockedNotePane.tsx` (unlock form), `EditorPane` (Lock note / Remove lock button), `NoteListItem`, `TrashView`.
- `lib/backup.ts`, `lib/backupMarkdown.ts`: version 2, payload validation, locked import planning, Markdown placeholder.

## Recovery story
- The passphrase is the only way to decrypt. It isn't stored, so it can't be reset, recovered or reported by anyone, including the owner of the Firebase project. **A lost passphrase means the locked notes are lost.** A typo on first setup is the same as a lost passphrase, which is why setup asks twice.
- Backups keep locked notes encrypted, so a backup is only useful together with the passphrase.
- Remove lock before exporting if a readable copy is wanted somewhere safe.
- Locking overwrites the plaintext in Firestore, but earlier backups, earlier conflict copies, and Firestore point-in-time recovery (if enabled on the project, up to 7 days) can still hold the old plaintext.
- Recommendation in the dialog: a long passphrase (4+ random words or 16+ characters), written down somewhere safe offline.

## Security trade-offs
- PBKDF2 (not Argon2): weaker against GPU guessing; mitigated by 600 000 iterations and the strength hint. The format records `kdf`/`iter` for a later upgrade.
- No verifier means a typo on first setup can't be caught except by the double entry, and two devices could each "set up" a different passphrase if both lock their first note before syncing. Later locks always verify against an existing locked note.
- JavaScript can't wipe strings: the passphrase and decrypted text sit in memory until garbage collected. Keys are non-extractable `CryptoKey`s and all references are dropped on lock.
- Firestore sees which notes are locked, their timestamps, rev, Trash state and the ciphertext length (≈ text length).
- A decrypted title shows in the list while the session is unlocked (memory only); previews never do.
- Locked notes are imported under their original id (their ciphertext is bound to it), an exception to CNOTE-19's "new ids" rule; an existing id is never overwritten.
- The payload validator accepts `iter` down to 100 000 so it never rejects older payloads; new keys always use 600 000.

## Tests
| Test | Verifies | Type |
|---|---|---|
| crypto: round-trip; key non-extractable; default iterations ≥ 600 000 | AC-1, AC-2 | vitest (Node WebCrypto) |
| crypto: IV unique per encryption, 12-byte IV, 16-byte salt | AC-2 | vitest |
| crypto: wrong passphrase, wrong note id (AAD), tampered ct / iv fail with DecryptError | AC-3 | vitest |
| crypto: payload validator accepts real payloads, rejects extra/missing keys, v, kdf, iter range, bad base64, wrong lengths | AC-4 | vitest |
| vault: setup/unlock verify by decryption, wrong passphrase stores no key, lock clears keys and notifies, reseal adds suffix and rebinds id, reseal without key throws | AC-5, AC-8, AC-9, AC-13 | vitest |
| notes: toNote reads locked/encrypted; sealed save writes no plaintext (real crypto, scan every write); plain save writes `encrypted: null`; conflict copy encrypted and decryptable only under the copy id; moved draft re-encrypted; no key → throws and writes nothing | AC-6, AC-7, AC-8 | vitest (mocked Firestore) |
| lockedNotes: withDraft overlays plain and sealed drafts, ignores a sealed draft bound to another id; listTitle | AC-7, AC-12 | vitest |
| auth: lock() clears the vault | AC-13 | vitest |
| backup: v2 export keeps ciphertext; locked round-trip; v1 accepted; v2 missing `encrypted` / locked with title / bad payload / bad id invalid; planImport keeps locked ids, skips existing ids and in-file repeats, doesn't sanitise ciphertext | AC-14, AC-15 | vitest |
| markdown: locked placeholder file, no ciphertext or title in it | AC-14 | vitest (jsdom) |
| notes: importNotes writes a locked note under its id with the payload | AC-15 | vitest |
| lint, typecheck, build, dev curl | AC-17, AC-18 | CLI |

## Manual browser checks (need a real Firebase env; not available in the worktree)
- First lock (setup dialog, mismatch error), lock a second note (no prompt), app Lock → unlock PIN → locked note asks for passphrase; wrong passphrase error; edit + reload another tab sees only ciphertext in Firestore console.
- Remove lock; conflict between two tabs on a locked note; export/import a backup with locked notes into an empty project.
- Keyboard-only, dark theme, 375 px width.

## Open questions
None. Assumption: "first time ever" = no locked note exists (Trash included), since nothing about the passphrase is stored.
