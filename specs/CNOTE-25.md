# CNOTE-25 – Rewrite README (setup, env vars, deploy, architecture)

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-25/   **Branch:** cnote-25/readme   **Blocked by:** none (documents CNOTE-1…24 as merged on `main`)

**Spec agreed:** pre-approved by the user 2026-10-21 (contents given with the task).

## Goal
The README describes ComNotes as it is: what it does, its security model, how to set it up from scratch, how it is tested and deployed, how the code is laid out, and the keyboard shortcuts. The create-next-app boilerplate is gone. Every fact comes from the code, the specs or the ADR.

## Scope
In: `README.md` rewrite, keeping the facts of the existing setup (CNOTE-3), CI (CNOTE-9) and deploy (CNOTE-10) sections.
Out: code, config or workflow changes; badges; anything not in the repo.

## Acceptance criteria
- [x] AC-1 Overview and feature list match what's merged (Tiptap editor, autosave + conflict copies, Trash with 30-day purge + undo, archive, search, locked notes, backup export/import, offline/PWA, auto-lock, themes, Home dashboard, shortcuts + ⌘K palette).
- [x] AC-2 Security model: PIN = Firebase Auth password of the owner, owner-only rules with the `REPLACE_WITH_OWNER_UID` placeholder, auto-lock, locked notes (passphrase never stored, lost = unrecoverable), offline cache on the device (with its setting), public Firebase web config.
- [x] AC-3 Setup lists exactly the env vars the code reads (`lib/firebase.ts`, `lib/auth.ts`), Node/npm/JDK prerequisites, the Firebase console steps and the manual rules deploy.
- [x] AC-4 Scripts table matches `package.json`; testing and CI jobs match `vitest.config.ts` and `.github/workflows/ci.yml`.
- [x] AC-5 Deploy: Vercel Git integration, production gated by Deployment Checks on the five CI jobs, service worker production-only.
- [x] AC-6 Architecture: folder map, one line per important `lib/` module, note document fields, key decisions linking the ADR and specs.
- [x] AC-7 Shortcuts table matches `lib/shortcuts.ts`; the in-app help is named as the source of truth.
- [x] AC-8 Work tracking (specs/, Plane project key only) and design credit (`docs/design/DESIGN.md`, VoltAgent/awesome-design-md, no Wise branding).
- [x] AC-9 No create-next-app text, invented features, badges, real secrets, uids or emails. Every linked repo path exists. markdownlint clean; `npm run lint` passes.

## Design
`README.md` only. Sections: overview + features, security model, setup, scripts + testing, deploy, architecture, keyboard shortcuts, work tracking, design credit.

## Tests
| Test | Verifies | Type |
|---|---|---|
| `npx markdownlint-cli2 README.md` | AC-9 | CLI |
| every relative link in README resolves to an existing path | AC-6, AC-9 | script |
| env vars / scripts / CI jobs / shortcuts cross-checked against the code | AC-3, AC-4, AC-7 | manual |
| grep README for create-next-app, uids, emails | AC-9 | grep |
| `npm run lint` | AC-9 | CLI |

## Open questions
None.
