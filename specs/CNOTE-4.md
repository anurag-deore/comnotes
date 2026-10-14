# CNOTE-4 – Upgrade Next.js, React and deps to patched versions

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-4/   **Branch:** cnote-4/patch-deps   **Blocked by:** none

## Goal
ComNotes runs on the latest release of every dependency, with no advisory left that a dependency upgrade can fix, and the app still lints and builds.

## Scope
In: every direct dep on its latest release (user decision 2026-10-14, superseding the original patch-only scope) — `next`/`eslint-config-next` 16.4.0, `react`/`react-dom` 19.3.0, `firebase` 13.0.0, `lucide-react` 1.57.0, `@tiptap/pm` 3.32.0, `dotenv` 18.0.8, `eslint` 10.12.0; Next 16 migration (ESLint CLI, flat config, `images.remotePatterns`).
Out: Firebase's vulnerable grpc-js until upstream fixes it (CNOTE-26); the broken `export`/`deploy` scripts (`next export` was removed in Next 14).

## Acceptance criteria
- [x] AC-1 Every direct dependency is on its latest release, except: `typescript` 6.0.3 (TS 7 is unsupported by typescript-eslint) and `@types/node` 24.x (matches the Node 24 runtime).
- [x] AC-2 `react` and `react-dom` resolve to the latest 19.x (19.3.0).
- [x] AC-3 `npm audit` reports 0 critical, and every remaining advisory has no upstream fix in a released version (no forced `overrides`), listed in the PR: prod high `@grpc/grpc-js` 1.9.16 via `firebase` 13.0.0 (follow-up CNOTE-26); dev-only high `braces` via `eslint-config-next`; prod low `quill` 2.0.3.
- [x] AC-4 `npm run lint` (now `eslint .`) passes.
- [x] AC-5 `npm run build` succeeds.
- [x] AC-6 Production build serves `/` and `/notes` with 200 and the PIN screen renders. Note load/save is a manual check with real Firebase env (none available in CI/worktree).

## Design
- `package.json`: all deps to latest; `next`/`eslint-config-next` exact-pinned; no `overrides` (user decision); `lint` → `eslint .` (`next lint` removed in Next 16); `dev` drops `--turbopack` (default in 16); `@eslint/eslintrc` removed.
- `eslint.config.mjs`: native flat config from `eslint-config-next/core-web-vitals` + `/typescript`.
- `next.config.ts`: `images.domains` → `images.remotePatterns`.
- `tsconfig.json`: Next 16's auto-update (`jsx: react-jsx`, `.next/dev/types` include).
- `notes/page.tsx`: title input value derived from the selected note (`localTitle` state + sync effect removed — every write already went to the note); `QuillEditor` loaded via `next/dynamic({ ssr: false })`.
- `QuillEditor.tsx`: `mounted` state/effect guard removed (client-only loading now handled by `next/dynamic`). Satisfies the new `react-hooks/set-state-in-effect` rule without disables.
- No Firestore schema/rules changes.

## Tests
| Test | Verifies | Type |
|---|---|---|
| `npm ls --depth=0` vs `npm view <pkg> version` | AC-1, AC-2 | command |
| `tsc --noEmit` | AC-5 | command |
| `npm audit --audit-level=critical` exits 0; remaining items match the list in AC-3 | AC-3 | command |
| `npm run lint` | AC-4 | command |
| `npm run build` | AC-5 | command |
| `next start` + curl `/`, `/notes` → 200, PIN input present | AC-6 | command |
| PIN → open/edit note, rename title, switch notes, create note — with real Firebase env | AC-6 | manual |

## Open questions
- Resolved: upgrade to latest majors (user, 2026-10-14) rather than staying on Next 15.
- No unit test runner exists; this ticket adds no app code, so verification is via the commands above rather than adding Vitest.
