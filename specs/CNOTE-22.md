# CNOTE-22 – Remove unused dependencies and dead code

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-22/   **Branch:** cnote-22/unused-deps   **Blocked by:** none

**Spec agreed:** pre-approved by the user 2026-10-21 (scope and constraints given with the task).

## Goal
The repo carries only code, files, config and dependencies the app actually uses. Nothing a user sees changes.

## Current state (checked against main at 5d1d2bc)
The ticket was written before CNOTE-12/13/15/16 landed, so most items are already resolved or no longer true.

| Ticket item | Status | Evidence / action |
|---|---|---|
| `@radix-ui/react-dialog` unused | Now used, kept | Mobile drawer, `components/notes/Sidebar.tsx` (CNOTE-13) |
| `@radix-ui/react-separator` unused | Now used, kept | `components/editor/Toolbar.tsx` (CNOTE-13) |
| `@tiptap/pm` unused | Kept (required peer) | Peer dependency of `@tiptap/core`, `@tiptap/react`, `@tiptap/extension-list` and the starter-kit extensions; Tiptap's install docs list it explicitly |
| `clsx`, `tailwind-merge` unused | Now used, kept | `lib/cn.ts`, imported by 7 components (CNOTE-13 re-added them) |
| `dotenv` (if init-pin goes) | Already gone | Not in `package.json`; no `scripts/` dir or init-pin script |
| Delete `SimpleEditor.tsx` | Already gone | File no longer exists |
| Duplicate auth redirect in `app/notes/page.tsx` | Still present → remove | `app/notes/layout.tsx` redirects and renders nothing while signed out, so the page's `if (!isAuthenticated) router.push('/')` never runs |
| Deprecated `images.domains` in `next.config.ts` | Already gone; leftover `images.remotePatterns` → remove | Config allows `fonts.googleapis.com` for `next/image`, but nothing uses `next/image`; fonts load via `next/font/google` |
| Verify with depcheck | Done | See Tools below |

Also found:
- `public/{file,globe,next,vercel,window}.svg` are Create Next App boilerplate, referenced nowhere → remove.
- `next dev` (16.4) writes an untracked `AGENTS.md` into the repo root whenever it detects a coding agent, and re-creates it if deleted.

## Tools
- **depcheck** reports only `@tailwindcss/postcss` and `tailwindcss` as unused devDependencies. Both are false positives: they're loaded by `postcss.config.mjs` (string plugin name) and `@import "tailwindcss"` in `app/globals.css`.
- **knip** (6.42) is used for dead code because depcheck only checks dependencies, not files or exports. Default run: no issues (deps, files, exports, types). `--production` lists 6 exports + 1 type only used by unit tests (`isAllowedImageSrc`, `withScheme`, `REDUCED_MOTION_QUERY`, `listOrderChanged`, `toNote`, `SIDEBAR_HIDDEN_KEY`, `serializeThemePreference`, `TransitionDocument`); they are tested helpers, kept.

## Scope
In: the items marked remove above; disable Next's agent-rules generation.
Out: dependency upgrades; CNOTE-19 export/import deps (fflate/turndown), owned by that ticket.

## Acceptance criteria
- [x] AC-1 Every runtime and dev dependency is used (depcheck/knip findings checked; only config-loaded false positives remain). `@tiptap/pm` stays as a required Tiptap peer.
- [x] AC-2 No unused files: `SimpleEditor.tsx` absent; unused `public/*.svg` boilerplate removed; knip reports no unused files or exports.
- [x] AC-3 `app/notes/page.tsx` no longer has its own auth redirect; `app/notes/layout.tsx` is the single guard. Signed-out visits to `/notes` still go to `/`.
- [x] AC-4 `next.config.ts` has no stale `images` config (no `domains`, no unused `remotePatterns`).
- [x] AC-5 `next.config.ts` sets `agentRules: false` so `next dev` no longer writes `AGENTS.md` into the repo (and removes the generated one on its next run).
- [x] AC-6 No behaviour change: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; `npm@11.19 ci` succeeds; dev server serves `/` and `/notes` with 200 and no server errors.

## Design
- `next.config.ts`: drop `images`; add `agentRules: false` (option exists since Next 16.3, documented in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/agentRules.md`; typed in `NextConfig`).
- `app/notes/page.tsx`: remove `useRouter`, `isAuthenticated` and the redirect branch from the notes subscription effect; its deps become `[draft, commitNotes]`.
- Delete `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`.
- No `package.json` / lockfile change (no dependency is unused).

### AGENTS.md decision
Disabled via `agentRules: false` rather than committed. The generated block only points agents at `node_modules/next/dist/docs/`; committing it means a machine-written file that `next dev` keeps rewriting on every Next upgrade, while disabling keeps the tree clean with no generated files. Trade-off: agents no longer get the "read the bundled Next docs" hint automatically; if wanted back, commit a hand-written `AGENTS.md`/`CLAUDE.md` note instead of the managed block.

## Tests
No new tests: nothing new is built, and the removed code paths were unreachable. Verified by the existing suite, lint, typecheck, build, and a dev-server smoke check.

| Check | Verifies | Type |
|---|---|---|
| `npx depcheck`, `npx knip` | AC-1, AC-2 | static |
| `npm test` (unit suite) | AC-6 | vitest |
| `npm run lint`, `npm run typecheck`, `npm run build` | AC-3, AC-4, AC-5, AC-6 | static/build |
| `next dev -p 3200`; `curl /` and `/notes` → 200 | AC-3, AC-6 | smoke |

## Open questions
None.
