# CNOTE-1 – Evaluate storage backend: is Firebase still the right choice?

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-1/   **Branch:** cnote-1/storage-backend-adr   **Blocked by:** none

## Goal
A written, dated decision on which storage backend ComNotes builds on, with the reasoning laid out against the ticket's criteria. Downstream tickets (CNOTE-2 auth + rules, CNOTE-3 PIN, CNOTE-5 sync/conflicts, CNOTE-7 encryption, CNOTE-20 offline, CNOTE-19 export, CNOTE-21 migration) can start from it without re-opening the question.

## Current state (from the code)
- Firestore only, via the client SDK (`lib/firebase.ts`). No Firebase Auth, no security rules in the repo.
- Collections: `notes` (title, content HTML, createdAt, updatedAt; one global collection, no owner field) and `pin/default` (plaintext PIN, compared in the browser in `components/PinLock.tsx`).
- Sync is manual: `syncNotes` in `app/notes/page.tsx` batch-overwrites every local note (last write wins, no conflict detection). No offline persistence enabled.
- Single user in practice. Deploy script targets Firebase Hosting via static export; CNOTE-10 plans Vercel.

## Scope
In: compare Firestore, Supabase, PocketBase and at least one local-first option (IndexedDB + a sync layer); score each on the ticket's criteria; recommend one; note what the choice means for CNOTE-2/3/5/7/20/21.
Out: implementing auth, rules, sync, encryption or migration (those are CNOTE-2, 5, 7, 21). No production data is moved.

## Acceptance criteria
- [x] AC-1 `docs/adr/0001-storage-backend.md` exists and compares Firestore, Supabase, PocketBase and a local-first option (IndexedDB + sync).
- [x] AC-2 Each option is assessed on all seven ticket criteria: browser-only access, per-user security rules, offline, conflict handling, E2E encryption fit, cost, export/lock-in.
- [x] AC-3 Cost and feature claims cite current vendor docs/pricing pages (checked 2026-10), with links.
- [x] AC-4 The ADR states one decision (keep Firebase or switch) with its main trade-offs and what would make us revisit it.
- [x] AC-5 The ADR lists the impact on CNOTE-2, 3, 5, 7, 20, 21; any ticket whose scope changes is updated in Plane (or a new ticket is created) and linked from the ADR.

## Design
- New file `docs/adr/0001-storage-backend.md`: context, options, criteria matrix, decision, consequences, per-ticket impact, sources.
- No app code changes.

## Tests
Research task: no automated tests. Verification is a review of the ADR against AC-1…AC-5, plus `npm run lint` / `npm run build` still passing (unchanged code).

## Assumptions (agreed 2026-10-14)
- Hosting is Vercel (free); no own server. Self-hosted options (PocketBase) count only if a free managed host exists.
- One user (the owner) across many devices.
- Free tier only, indefinitely.
