---
name: plane-task
description: Use when the user pastes a Plane work-item link (app.plane.so/.../browse/CNOTE-12 or /projects/.../issues/<uuid>), types /plane-task <url>, or says "work on CNOTE-<n>" — to pick up that task and build it spec-first.
---

# Plane Task → Spec-Driven Development

## Overview

A Plane link is a work order. Turn it into a written spec grounded in the ticket and the current code, get the spec agreed, then implement it test-first on its own branch, and close the loop in Plane. The spec is written **before** any code and is the contract the tests verify.

Plane workspace `nutriai`, project: **ComNotes** (`CNOTE`, id `9ed8e92b-9062-427a-a172-8d17237f45d4`). State ids: Backlog `919bcaef-aade-4354-9f60-72cb69ec2d35`, Todo `9805092e-10d5-496a-b703-0f930c5dbcb8`, In Progress `1081c873-f16a-41fe-97ca-1f747d68686e`, Done `f0f1d1da-9509-4be6-ae79-79e0bd0fa78a`, Cancelled `8f1e47a9-b2f9-4124-9058-d713f0a95cfa`.

## Parsing the link

| Link shape | Extract |
|---|---|
| `https://app.plane.so/<ws>/browse/CNOTE-12/` | sequence id `CNOTE-12` |
| `https://app.plane.so/<ws>/projects/<project-uuid>/issues/<issue-uuid>/` | issue uuid |
| bare `CNOTE-12` | sequence id |

## Plane access

Load tools with `ToolSearch("+plane")`. If none load (session started before login), fall back to a one-off session:

```bash
claude -p "<instruction>" --allowedTools "mcp__plane__*" --output-format text
```

Use the fallback only for reads and state updates; never for code.

## Workflow

1. **Fetch** the work item: title, description, state, priority, labels, relations (blocked-by), existing comments. If a blocker is not Done, stop and tell the user.
2. **Ground** in the code: read the files the ticket touches and any related CNOTE tickets it depends on. If the item is vague and the code doesn't settle it, ask the user before writing the spec.
3. **Write the spec** to `specs/CNOTE-<n>.md` using the template below. Show it to the user and get agreement before step 4. The spec — not the Plane description — is the source of truth from here on.
4. **Start the task**: set the Plane item to In Progress; `git checkout main && git pull`; create branch `cnote-<n>/<short-slug>`.
5. **Implement** following the spec, one acceptance criterion at a time. **REQUIRED SUB-SKILL:** superpowers:test-driven-development. Each test names the AC it verifies. If no test runner exists yet, adding one (Vitest; Firestore emulator for rules) is part of the first task that needs it.
6. **Verify** with superpowers:verification-before-completion: all tests pass, `npm run lint` and `npm run build` succeed, every acceptance criterion in the spec is ticked.
7. **Close**: commit with `CNOTE-<n>` in the message, push the branch and open a PR (`gh pr create`) referencing the Plane item; merge into `main` once checks pass. Set the Plane item to Done and add a Plane comment: branch, PR/merge commit, criteria met, anything deferred.

## Spec template (`specs/CNOTE-<n>.md`)

```markdown
# CNOTE-<n> – <title>

**Plane:** <link>   **Branch:** cnote-<n>/<slug>   **Blocked by:** CNOTE-.. (or none)

## Goal
One paragraph: what exists when this is done, from the user's point of view.

## Scope
In: …   Out (deferred, with CNOTE id): …

## Acceptance criteria
- [ ] AC-1 Unauthenticated reads of /notes are rejected by Firestore rules.
- [ ] AC-2 Editing a note saves it within 2 s without pressing Sync.

## Design
Files/components touched, Firestore schema and rules changes, external calls.

## Tests
| Test | Verifies | Type |
|---|---|---|
| rules: rejects anon read | AC-1 | vitest + emulator |

## Open questions
Resolved before implementation starts, or listed as assumptions.
```

## Common mistakes

- Writing code before the spec is agreed. The spec is the deliverable of steps 1–3; stop there and wait.
- Inventing acceptance criteria. Every criterion comes from the ticket or from the user.
- Branching from a stale `main`, or committing on `main`.
- Closing in Plane without the comment. The comment is the audit trail.
- Marking Done with any acceptance criterion unticked. Unticked means not done; move the criterion to a new Plane item instead and say so.
