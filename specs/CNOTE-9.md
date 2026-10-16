# CNOTE-9 – GitHub Actions CI: lint, typecheck, build, rules tests (with CNOTE-27)

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-9/ and https://app.plane.so/nutriai/browse/CNOTE-27/   **Branch:** cnote-9/ci   **Blocked by:** none

Spec agreed: autonomous loop approved by user 2026-10-16

## Goal
Every PR and every push to `main` is checked automatically: lint, typecheck, unit tests, build, and the Firestore security rules tests in the emulator. A PR can't be merged until all of them are green. This also finally runs the rules tests from CNOTE-3 (CNOTE-27), which never ran because they need JDK 21+.

## Current state (from the code)
- No `.github/` directory, so nothing runs on PRs.
- `npm run lint`, `npm test` (unit) and `npm run build` exist. There is no typecheck script.
- `npm run test:rules` runs `tests/rules/firestore.rules.test.ts` through `firebase emulators:exec` (firebase-tools 15 from devDependencies), which needs JDK 21+. Only JDK 17 is available locally, so CNOTE-3's AC-7 was deferred to CNOTE-27.
- `next build` already works without Firebase env vars (auth is created lazily).

## Scope
**In:**
- `.github/workflows/ci.yml` on `pull_request` and `push` to `main`.
- A `typecheck` npm script (`tsc --noEmit`).
- Rules tests in CI on Temurin JDK 21; fix any failures at the root.
- README note on CI and the typecheck script.
- Exact command for making the checks required (branch protection), for the user to run.

**Out:**
- Changing repo settings myself. Branch protection is a manual step (below).
- Fixing the broken `export`/`deploy` scripts (CNOTE-10).
- Deploying anything from CI.
- Installing JDK 21 locally (no system software installs here; the local run is a manual follow-up).

## Acceptance criteria
- [ ] AC-1 `.github/workflows/ci.yml` runs on every pull request and on push to `main`, with separate jobs `lint`, `typecheck`, `unit-tests`, `build` and `rules-tests`.
- [ ] AC-2 `npm run typecheck` runs `tsc --noEmit` and passes.
- [ ] AC-3 The `build` job passes with no Firebase env vars or secrets.
- [ ] AC-4 The `rules-tests` job installs Temurin JDK 21, uses firebase-tools from devDependencies, and runs `npm run test:rules`; all 5 rules tests pass in CI. (CNOTE-27; also satisfies CNOTE-3 AC-7.)
- [ ] AC-5 `firestore.rules` still allows only the owner uid on `notes/{id}` and denies everything else; `ownerUid()` still returns the `'REPLACE_WITH_OWNER_UID'` placeholder.
- [ ] AC-6 A newer push to the same ref cancels the run in progress (`concurrency`). Actions are pinned to major versions. npm is cached, and so is the emulator jar.
- [ ] AC-7 No hacks: no `continue-on-error`, no skipped tests, no eslint-disable, no npm overrides.
- [ ] AC-8 `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass locally.
- [ ] AC-9 (manual, user) Branch protection on `main` requires the five checks (command below).
- [ ] AC-10 (manual, user) `npm run test:rules` passes locally on JDK 21+ (CNOTE-27 "locally").

## Design
- One workflow, five parallel jobs, each `checkout` + `setup-node` (Node 24 LTS, matching `@types/node` 24, `cache: npm`) + `npm ci`.
- `rules-tests` adds `actions/setup-java` (temurin, 21) and caches `~/.cache/firebase/emulators` keyed on `package-lock.json`, so the emulator jar is only downloaded when firebase-tools changes.
- `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true`; `permissions: contents: read`.
- Job names are the check names used for branch protection.

## Tests
| Test | Verifies | Type |
|---|---|---|
| CI run on the PR: all five jobs green | AC-1, AC-3, AC-4, AC-6 | GitHub Actions |
| `npm run typecheck` locally and in CI | AC-2 | local + CI |
| rules tests: anon read/write denied, other user denied, owner allowed, owner denied on `pin/default` | AC-4, AC-5 | vitest + emulator in CI |
| grep workflow for `continue-on-error`/`skip` | AC-7 | manual |
| local `npm test`, `lint`, `typecheck`, `build` | AC-8 | local |

## Manual steps for the user
Make the checks required on `main` (run once, after this PR's first CI run so the check names exist):

```bash
gh api -X PUT repos/anurag-deore/comnotes/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "unit-tests", "build", "rules-tests"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

Run the rules tests locally once JDK 21+ is installed (e.g. `brew install --cask temurin@21`):

```bash
JAVA_HOME=$(/usr/libexec/java_home -v 21) npm run test:rules
```

## Assumptions / open questions
- First CI run failed at `npm ci` in every job: Node 24.21's npm 11.19 found `@emnapi/core`/`@emnapi/runtime` (optional deps of the wasm fallbacks of sharp and tailwind oxide) missing from `package-lock.json`; local npm 11.6 didn't check this. Fixed by re-syncing the lock with `npx npm@11.19.0 install --package-lock-only` (additive entries only, no version changes to installed packages).
- The tests read the owner uid from `firestore.rules`, so with the placeholder they authenticate as `REPLACE_WITH_OWNER_UID` and still prove the rule. When the user commits a real uid locally, the tests follow it.
- `strict: true` makes PRs be up to date with `main` before merge; drop it if that is too strict for a single-owner repo.
- Branch protection on a private repo needs a paid GitHub plan; on a public repo it is free.
