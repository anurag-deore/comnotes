# CNOTE-10 – Gate Vercel production deploys on CI; remove dead deploy scripts

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-10/   **Branch:** cnote-10/vercel-gating   **Blocked by:** CNOTE-9 (CI, merged)

Spec agreed: autonomous loop approved by user 2026-10-16

## Goal
Production only gets code that passed CI, PRs keep getting preview deploys, and the repo no longer has deploy scripts that can't work.

## Changed scope (user decision 2026-10-16)
The ticket asked for GitHub Actions deploys with the Vercel CLI (`VERCEL_TOKEN`/ORG/PROJECT secrets) and a Firestore rules deploy from CI. The user decided: "If Vercel [gating] is paid, use GitHub Actions deploys, else keep Vercel."

- Vercel Deployment Checks are not paid-only. The changelog says "Deployment Checks are available for all projects connected to GitHub repositories" (https://vercel.com/changelog/block-vercel-deployment-promotions-with-github-actions), and the docs page lists no plan restriction (https://vercel.com/docs/deployment-checks, re-checked 2026-10-16). So we **keep the Vercel Git integration**. It already builds previews for PRs and production for `main`, and the Firebase env vars are already set in Vercel. No `VERCEL_TOKEN`, no deploy workflow.
- Production promotion is gated on the CI jobs with Deployment Checks, a Vercel dashboard setting the user turns on (steps below).
- Firestore rules are deployed **by hand**. The real owner uid is pasted locally and never committed, so CI can't deploy them. The repo keeps `REPLACE_WITH_OWNER_UID`.

## Current state (from the code)
- `package.json` has `"export": "next build && next export"` (`next export` was removed in Next.js 14) and `"deploy": "npm run export && firebase deploy"`. Both fail.
- `firebase.json` has only `firestore.rules` and the emulator config, which the rules tests need. No `hosting` section, no `.firebaserc`, no `output: 'export'` in `next.config.ts`.
- README's "Deploy on Vercel" section is the create-next-app boilerplate. The PIN setup tells the user to run `npx firebase deploy --only firestore:rules`, with nothing stopping a deploy of the placeholder.

## Scope
**In:**
- Remove the `export` and `deploy` scripts.
- Add a `deploy:rules` script that refuses (exit 1, clear message) while `firestore.rules` still has `REPLACE_WITH_OWNER_UID`, and otherwise runs `firebase deploy --only firestore:rules`.
- README: how deploys work, the Deployment Checks setup, manual rules deploy.

**Out:**
- GitHub Actions deploys, Vercel CLI, Vercel secrets.
- Deploying Firestore rules from CI.
- Changing Vercel or Firebase settings myself. They are manual steps (below).

## Acceptance criteria
- [x] AC-1 `package.json` has no `export` or `deploy` script, and nothing else in the repo references `next export` or Firebase Hosting.
- [x] AC-2 `firebase.json` keeps the `firestore` and `emulators` config, so `npm run test:rules` still works (CI `rules-tests` green).
- [x] AC-3 `npm run deploy:rules` exits non-zero with a clear message while `firestore.rules` contains `REPLACE_WITH_OWNER_UID`, without calling firebase.
- [x] AC-4 `firestore.rules` still returns `'REPLACE_WITH_OWNER_UID'`.
- [x] AC-5 README explains: PRs get Vercel previews, `main` gets a production build that is only promoted once the five CI checks pass, the Deployment Checks setup, and the manual rules deploy.
- [ ] AC-6 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass locally, and all five CI jobs pass on the PR.
- [ ] AC-7 (manual, user) Deployment Checks on in Vercel for `lint`, `typecheck`, `unit-tests`, `build`, `rules-tests`, with automatic production aliasing on.

## Design
- Vercel for GitHub does the builds; GitHub Actions only checks. Vercel reads the check runs for the production commit and holds the alias to the production domain until all five pass. If one fails, the build stays unpromoted ("Force Promote" in the dashboard bypasses this).
- `deploy:rules` is one line of shell in `package.json`: `grep` for the placeholder, print the message and `exit 1` if it is there, otherwise `firebase deploy --only firestore:rules`. The project is passed as `npm run deploy:rules -- --project <id>`.

## Tests
| Test | Verifies | Type |
|---|---|---|
| `grep -rn "next export\|hosting"` outside node_modules | AC-1 | manual |
| CI `rules-tests` green | AC-2 | CI |
| `npm run deploy:rules -- --project demo-x` on the placeholder exits 1 with the message | AC-3 | local |
| `grep REPLACE_WITH_OWNER_UID firestore.rules` | AC-4 | manual |
| Read README | AC-5 | manual |
| local checks + `gh pr checks` | AC-6 | local + CI |

## Manual steps for the user
1. Vercel → project → Settings → Environments → Production: make sure automatic aliasing for production is on.
2. Vercel → project → Settings → Build and Deployment → Deployment Checks → **Add Checks** → provider **GitHub** → select `lint`, `typecheck`, `unit-tests`, `build`, `rules-tests` → save.
3. Rules deploy (when they change): paste the owner uid into `firestore.rules`, run `npm run deploy:rules -- --project <project-id>`, then `git restore firestore.rules`.

## Assumptions / open questions
- Vercel matches checks by job name, so renaming a CI job means updating the Deployment Checks list.
- Deployment Checks only gate production. Previews still deploy straight away, which is fine because they aren't on the custom domain.
- `deploy:rules` uses POSIX shell (`grep`, `exit`). It works on macOS/Linux. Windows isn't a target for this repo.
