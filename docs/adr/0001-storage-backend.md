# ADR 0001 – Storage backend: keep Firebase (Firestore + Firebase Auth)

**Status:** Accepted   **Date:** 2026-10-14   **Ticket:** [CNOTE-1](https://app.plane.so/nutriai/browse/CNOTE-1/)

## Context
ComNotes is a Next.js app hosted on Vercel's free tier. It talks to Firestore directly from the browser (`lib/firebase.ts`). Today:
- there is no auth and no security rules, so anyone with the config can read and write `notes`;
- the PIN is stored in plaintext at `pin/default` and checked in the browser;
- sync is a manual batch overwrite of every note (`syncNotes` in `app/notes/page.tsx`), which means last write wins with no conflict detection;
- there is no offline cache.

Constraints agreed for this decision: **one user on many devices**, **free tier only, indefinitely**, and **no self-run server**.

The criteria come from the ticket: browser-only access, per-user security rules, offline, conflict handling, E2E encryption fit, cost, and export/lock-in.

## Options compared

| Criterion | Firestore + Firebase Auth | Supabase | PocketBase | Local-first: Dexie (IndexedDB) + Dexie Cloud |
|---|---|---|---|---|
| Browser-only access | ✅ Web SDK, no server | ✅ JS client + PostgREST | ✅ JS SDK, but needs a server running somewhere | ✅ Dexie in browser, managed sync service |
| Per-user security rules | ✅ Rules on `request.auth.uid` | ✅ Postgres RLS | ✅ Collection API rules | ✅ Realm/role-based access built in |
| Offline | ✅ Built-in IndexedDB cache (`persistentLocalCache`, multi-tab manager); queued writes | ❌ None built in; must add a local store + sync | ❌ None built in | ✅ Offline-first by design |
| Conflict handling | ⚠️ Last write wins per document; app must detect conflicts (e.g. a revision field) | ⚠️ Same; DIY | ⚠️ Same; DIY | ✅ Sync engine merges per property |
| E2E encryption fit | ✅ Encrypt `content` client-side and store ciphertext; no server-side search, which we don't use | ✅ Same | ✅ Same | ✅ Same |
| Cost at our scale | ✅ Spark: 1 GiB, 50K reads and 20K writes per day, 50K Auth MAU, no card needed | ⚠️ Free tier: 500 MB, but **projects pause after 7 days of inactivity**, which is bad for a personal app used in bursts | ❌ Free only on a self-run or free-VPS host, which the constraints rule out | ✅ Free: 3 production users, 100 MB, 10 connections |
| Export / lock-in | ⚠️ Managed export needs Blaze; client-side export (CNOTE-19) is free. Proprietary API | ✅ Plain Postgres, `pg_dump` | ✅ SQLite file | ⚠️ Small vendor; self-hosting costs €3,495+ |
| Migration cost from today | ✅ None | ❌ Rewrite the data layer and move the data | ❌ Rewrite + hosting | ❌ Rewrite the data layer and move the data |

## Decision
**Keep Firebase.** Use Firestore with offline persistence, add Firebase Auth, and add owner-only security rules.

It is the only option that meets all three hard constraints (free indefinitely, no server, no pausing) without a rewrite. Its gaps are conflict detection and free export, and both are cheap to close in the app:
- **Conflicts:** add a revision field plus a client-side check (CNOTE-5).
- **Export:** do it client-side (CNOTE-19).

Dexie Cloud is the strongest alternative because it offers real offline-first sync with merging. It loses on vendor size, on its free-tier ceiling (100 MB, 3 users), and on the cost of a rewrite that nothing we need today requires.

**Lock-in mitigation:** keep all Firestore calls behind one notes data module, instead of the inline calls in `app/notes/page.tsx`. A later switch then touches a single file. Do this as part of CNOTE-5.

## Revisit if
- Firebase changes Spark so that Firestore or Auth needs a billing account.
- Conflicts become frequent enough that per-property merging matters more than a "keep both" prompt.
- Data grows past ~500 MB, or ComNotes becomes multi-user.

## Impact on other tickets
| Ticket | Effect |
|---|---|
| CNOTE-2 Auth + rules | Unchanged: Firebase Auth plus rules on `request.auth.uid`. Add `ownerId` to notes. |
| CNOTE-3 PIN redesign | Unchanged: the PIN becomes a local quick-unlock; delete `pin/default`. |
| CNOTE-5 Autosave + conflicts | Confirmed approach: per-note autosave, a `rev` counter checked against the server copy, a "keep both" prompt on conflict, and the data-access module. |
| CNOTE-7 Encrypted notes | Unchanged: encrypt `content` (and `title` for locked notes) client-side and store ciphertext. |
| CNOTE-20 Offline / PWA | Simplified: use `initializeFirestore` with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` instead of a custom store. |
| CNOTE-19 Export | Must be client-side, because managed export needs Blaze. |
| CNOTE-21 Migration | Backfill `ownerId` and `rev` on existing notes; no backend move. |

No ticket's scope grows. Notes have been added as comments on CNOTE-5, CNOTE-19 and CNOTE-20.

## Sources (checked 2026-10-14)
- Firebase pricing (Spark limits): https://firebase.google.com/pricing
- Firebase plans (quota shut-off; no card on Spark): https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firestore offline persistence (web, last write wins): https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firestore managed export needs Blaze: https://firebase.google.com/docs/firestore/manage-data/export-import
- Supabase pricing (500 MB; pause after 1 week inactive): https://supabase.com/pricing
- PocketBase hosting (self-hosted only): https://railway.com/deploy/pocketbase
- Dexie Cloud pricing (free: 3 users, 100 MB; on-prem €3,495): https://dexie.org/pricing
