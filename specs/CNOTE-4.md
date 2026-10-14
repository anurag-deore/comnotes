# CNOTE-4 – Upgrade Next.js, React and deps to patched versions

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-4/   **Branch:** cnote-4/patch-deps   **Blocked by:** none

## Goal
ComNotes runs on Next.js / React versions with no known advisories. `npm audit` is clean (or every remaining item is documented as unfixable without a major bump), and the app still lints and builds.

## Scope
In: patch/minor upgrades within current majors — `next` 15.3.1 → 15.5.27, `eslint-config-next` 15.3.1 → 15.5.27, `react`/`react-dom` → 19.3.x, `@types/react*`, `firebase` → 11.10.x, other direct deps to latest in-range; `npm audit fix` for transitive deps; lockfile regenerated.
Out: major bumps (Next 16, Firebase 12/13, lucide 1.x, @tiptap 3, dotenv 18) — not needed to clear advisories; the broken `export`/`deploy` scripts (`next export` was removed in Next 14) — separate ticket if wanted.

## Acceptance criteria
- [x] AC-1 `next` and `eslint-config-next` are pinned to 15.5.27 (fixes every open Next advisory, incl. the critical RCE ones; this is npm audit's own fix target).
- [x] AC-2 `react` and `react-dom` resolve to the latest 19.x (19.3.0).
- [x] AC-3 `npm audit --omit=dev` reports 0 critical and 0 high. Remaining dev-only high (`braces` via `eslint-config-next`, no patched release exists) and production lows (`quill` 2.0.3 XSS in HTML export, no patched release) are listed in the PR.
- [x] AC-4 `npm run lint` passes.
- [x] AC-5 `npm run build` succeeds.
- [x] AC-6 Production build serves `/` and `/notes` with 200 and the PIN screen renders. Note load/save is a manual check with real Firebase env (none available in CI/worktree).

## Design
- `package.json`: version bumps above; `overrides` for `@grpc/grpc-js` ^1.14.6 (via firebase) and `postcss` ^8.5.30 (via next) — same-major patches; `package-lock.json` regenerated via `npm install` + `npm audit fix` (no `--force`).
- `next.config.ts`: only touched if the build breaks (e.g. migrate deprecated `images.domains` → `remotePatterns`).
- No Firestore schema/rules changes.

## Tests
| Test | Verifies | Type |
|---|---|---|
| `npm ls next react react-dom eslint-config-next` shows target versions | AC-1, AC-2 | command |
| `npm audit --omit=dev --audit-level=high` exits 0 | AC-3 | command |
| `npm run lint` | AC-4 | command |
| `npm run build` | AC-5 | command |
| `next start` + curl `/`, `/notes` → 200, PIN input present | AC-6 | command |
| PIN → open/edit note with real Firebase env | AC-6 | manual |

## Open questions
- Assumption: stay on Next 15 (15.5.27 clears every Next advisory). Next 16 would be a separate, non-security upgrade.
- No unit test runner exists; this ticket adds no app code, so verification is via the commands above rather than adding Vitest.
