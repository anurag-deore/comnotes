# CNOTE-23 – Dashboard + basic metrics

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-23/   **Branch:** cnote-23/dashboard   **Blocked by:** none (builds on CNOTE-6 trash, CNOTE-7 locked notes, CNOTE-13/15/16 design, CNOTE-17 archive, CNOTE-21 legacy dates)

**Spec agreed:** pre-approved by the user 2026-10-21 (approach and decisions given with the task).

## Goal
When no note is open, the main area shows a Home view instead of the old "No note open" card: recent notes, note counts (notes, archived, locked, in Trash), words written, a 12-week grid of notes created per day (with a per-week table), and the current and longest writing streak. A "Home" button in the sidebar header closes the open note and shows Home. Everything is computed in the browser from the notes list the page already has; no extra Firestore reads.

## Current state (from the code)
- `app/notes/page.tsx` keeps one live list (`localNotes`) and derives the main list, Archive and Trash via `lib/noteViews.ts`. With no selected note it shows an empty state ("No notes yet" with New note, or "No note open").
- Locked notes (CNOTE-7) have empty `title`/`content`; their decrypted text lives only in the page's in-memory `plain` map while the vault is unlocked.
- Legacy notes without dates get the other date, then the epoch (`noteDates`, CNOTE-21). The epoch means "unknown".
- Content is Tiptap HTML; `noteHtmlToText` (DOMParser, browser only) turns it into plain text without rendering it (CNOTE-12).

## Definitions (local time zone of the browser)
- **Day key:** `YYYY-MM-DD` from the date's local calendar fields. Day arithmetic works on the calendar date (UTC maths on the key), never by adding 24 h, so DST changes (23 h / 25 h days, midnight transitions) can't skip or repeat a day.
- **Unknown date:** the epoch (or an invalid date) is a legacy fallback and is ignored by every date-based metric. A date after `now` (pending server timestamp, clock skew) counts as today.
- **Counts:** Notes = main list (not archived, not in Trash); Archived = archived and not in Trash; Locked = locked and not in Trash (main list or Archive); In Trash = `deletedAt` set (archived or not).
- **Words written:** words in title + content of every note not in Trash (main list and Archive). A word is a whitespace-separated run containing at least one letter or digit (Unicode). Plain notes use `noteHtmlToText(content)`. A locked note counts only when its decrypted text is in memory; otherwise it is left out and Home says "Excludes N locked notes".
- **Active day:** a day on which at least one loaded note (any view, Trash included) was created or last updated. Only the latest update of each note is known, so earlier edit days of a note that was edited again later don't count.
- **Current streak:** consecutive active days ending today; if today isn't active yet, ending yesterday (the streak is still alive until today ends); otherwise 0.
- **Longest streak:** the longest run of consecutive active days ever (≥ current streak).
- **Created grid:** the last 12 weeks as columns (weeks start on Sunday), 7 rows (Sun–Sat); the last column holds today, days after today are empty. Each day counts notes created that day (any view, Trash included). Intensity level 0 for none, else 1–4 by quarter of the busiest day.
- **Recent notes:** the 5 most recently updated notes not in Trash (main list and Archive), newest first, id breaks ties.

## Scope
**In:** `lib/metrics.ts` (pure); `components/notes/HomeView.tsx` + `ActivityGrid.tsx`; Home shown when no note is selected; Home button in the sidebar header; tests.
**Out:** per-edit history (would need an edit log in Firestore); metrics over purged notes; charts beyond the grid; changing the initial selection on load (still the first note, CNOTE-17 AC-5); `firestore.rules` changes; new dependencies.

## Acceptance criteria
- [x] AC-1 `dayKey` gives the local calendar day; `addDays` moves by calendar days across DST changes (including a midnight transition) without skipping or repeating a day.
- [x] AC-2 `noteCounts` returns notes / archived / locked / trash as defined above; empty list gives zeros.
- [x] AC-3 `countWords` counts words as defined (Unicode, punctuation-only runs ignored); `wordsWritten` sums title + content of non-trashed notes, uses decrypted text for locked notes when given, and otherwise excludes them and reports how many.
- [x] AC-4 `activeDays`/`streaks`: current streak counts back from today, or from yesterday when today isn't active, else 0; longest streak is the longest run; unknown dates are ignored; future dates count as today; created and updated days both count.
- [x] AC-5 `createdGrid` returns 12 week columns × 7 days, today in the last column at its weekday row, later days null, counts per day of created notes, unknown dates ignored, a DST week still has 7 distinct consecutive days; `weekTotals` sums each column; `gridLevel` maps counts to 0–4.
- [x] AC-6 `recentNotes` returns up to 5 non-trashed notes newest first (archived included), id breaking ties.
- [x] AC-7 With no note open the main area shows Home: heading, New note, stat tiles (counts, words, streaks), the created grid and recent notes. With no notes at all it keeps the "No notes yet" message and New note.
- [x] AC-8 The sidebar header (desktop and drawer) has a "Home" button (44 px, `aria-current="page"` while Home shows) that closes the open note; on phones it also closes the drawer and focus moves to the main area.
- [x] AC-9 Locked notes never leak: recent rows show "Locked note" and "Encrypted" unless decrypted this session; words exclude locked notes without decrypted text and say "Excludes N locked notes".
- [x] AC-10 The grid is an SVG with `role="img"`, a title and a text summary; a per-week table is available (`<details>`); colours are design tokens (both themes); nothing animates beyond the reduced-motion-safe fade.
- [x] AC-11 Metrics are memoised and computed from a deferred copy of the notes only while Home is shown, so typing in the editor never recomputes them.
- [x] AC-12 `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass; `/` and `/notes` return 200 from `next dev`.

## Design
- `lib/metrics.ts` (new, pure, no DOM): `dayKey`, `addDays`, `isKnownDate`, `noteCounts`, `countWords`, `wordsWritten(notes, decrypted, toText)`, `activeDays`, `streaks`, `createdGrid`, `weekTotals`, `gridLevel`, `recentNotes`. `toText` is injected (the component passes `noteHtmlToText`), so tests run without a DOM.
- `components/notes/ActivityGrid.tsx` (new): hand-rolled SVG heatmap (rects, `fill-*` token utilities, per-cell `<title>`), legend, `<details>` table of weekly totals.
- `components/notes/HomeView.tsx` (new): header with the sidebar toggles and New note; stat tiles; grid; recent notes via `NoteListItem`. `useDeferredValue` + `useMemo`.
- `components/notes/Sidebar.tsx`: optional `onHome` / `homeActive` props, one icon button in the header row (kept small to avoid conflicts with CNOTE-18's search).
- `app/notes/page.tsx`: renders `HomeView` in place of the empty states; passes `onHome` (clear selection, close drawer) and the decrypted texts.

## Tests
| Test | Verifies | Type |
|---|---|---|
| dayKey/addDays in America/New_York, Europe/Berlin, America/Havana (midnight DST), month/year rollover | AC-1 | vitest |
| noteCounts: empty, each view, locked in archive/trash | AC-2 | vitest |
| countWords / wordsWritten: empty, punctuation, Unicode, trash excluded, archive included, locked with/without text | AC-3, AC-9 | vitest |
| streaks: empty, ongoing today, ongoing from yesterday, broken, longest vs current, legacy epoch ignored, future date, updated-only days, DST span | AC-4 | vitest |
| createdGrid / weekTotals / gridLevel: shape, today position, future nulls, counts, DST week, levels | AC-5 | vitest |
| recentNotes: limit, order, ties, trash excluded, archived kept | AC-6 | vitest |
| Home view, Home button, drawer, both themes, phone width | AC-7, AC-8, AC-10 | manual check (dev server; real Firebase env needed for data) |

Verification (2026-10-21): 535 unit tests (44 new in `tests/unit/metrics.test.ts`), lint, typecheck and build pass; `next dev` on :3200 serves `/` and `/notes` with 200 and no server errors. UI ACs (7–11) are checked through the code and build; a visual pass in both themes and at phone width needs a signed-in session with real Firebase config and is still to do.

## Open questions
None. Assumptions: weeks start on Sunday (as GitHub's grid); the streak uses each note's last update only (no edit history is stored).
