# CNOTE-18 – Search across notes

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-18/   **Branch:** cnote-18/search   **Blocked by:** none (builds on CNOTE-7 locked notes, CNOTE-12 no HTML sinks, CNOTE-13/15/16 design, CNOTE-17 archive)

**Spec agreed:** pre-approved by the user 2026-10-21 (approach and constraints given with the task).

## Goal
A search field sits at the top of the sidebar (desktop and the phone drawer). Typing searches the titles and the plain text of your notes, finds words by prefix and with small typos, and replaces the list with ranked results whose matching words are highlighted. Archived notes can be included with one toggle. Locked notes are searched only while they are unlocked, and only in memory. Arrow keys move through the results, Enter opens one, Esc clears the search.

## Current state (from the code)
- `app/notes/page.tsx` keeps every note in one live list (`localNotes`) and derives the main list with `visibleNotes(localNotes)` (CNOTE-17: not archived, not trashed) and Archive with `visibleNotes(localNotes, 'archive')`.
- Locked notes (CNOTE-7) store empty `title`/`content` and an `encrypted` payload. While the vault has a key, the page already decrypts **every** locked note it can into `plain` (memory only) and clears `plain` when the vault locks. The sidebar shows decrypted titles via `unlockedTitles`.
- App lock (`logout`) locks the vault and unmounts the notes page (`app/notes/layout.tsx`).
- Note content is Tiptap HTML; `noteHtmlToText` (DOMParser, inert) is the only way to turn it into text (CNOTE-12). ESLint bans `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` assignment and `insertAdjacentHTML`.
- `Sidebar` is rendered twice: the desktop `<aside>` and the `MobileSidebar` drawer (Radix Dialog, which closes on Esc).

## Decisions
- **Library: MiniSearch 7** (zero deps, TS types, ~6 kB gz core). It keeps an inverted index with prefix and fuzzy matching, per-field boosts and BM25-style ranking, and supports `add` / `replace` / `discard` by id, so edits update one document instead of rebuilding. Fuse.js scans every document on each query with bitap matching, which is slow and noisy on long bodies and has no incremental index; FlexSearch is larger and its typings and highlighting are weaker. MiniSearch is **lazy-loaded** with `import('minisearch')` the first time the field gets focus or a query, so it is not in the main bundle.
- **Indexed fields:** `title` (boost ×3) and `text` = `noteHtmlToText(content)`. Query options: prefix on, fuzzy 0.2 for terms longer than 3 characters, terms combined with AND (every word must match somewhere).
- **Incremental updates:** the index keeps, per note id, the title, content HTML and view it was built from. `sync(sources)` adds new notes, replaces changed ones (only those run `noteHtmlToText` again), and discards notes that are gone. Sync runs only while a query is active, so typing in the editor costs nothing when you aren't searching; the next search catches up incrementally.
- **Debounce:** the field updates at once; the search runs 150 ms after the last keystroke (pure `debounce` in `lib/debounce.ts`). Clearing is immediate.
- **Scope:** trashed notes are never indexed. Results default to the main list (`noteView === 'notes'`); an "Include Archive" toggle adds archived notes. **Trash is out**: trashed notes can't be opened (they're read-only in Trash), so a Trash result would be a dead end.
- **Locked notes:** never index ciphertext. A locked note is indexed only when the page has its decrypted text (`plain`), using that title and content. Search doesn't decrypt anything itself: it reuses what the page already decrypted when the vault was unlocked (CNOTE-7 decrypts every locked note on unlock, one AES-GCM decrypt per note, so search adds no crypto cost). When the vault locks, the search hook drops every locked document from the index at once (vault subscription), and the page's `plain` clears too. App lock unmounts the page and the index is cleared. Results show a locked note's decrypted title only while unlocked (same as the list); the snippet stays the "Encrypted" placeholder, because CNOTE-7 never puts decrypted text in a preview. Vault lock rebuilds the index without locked notes instead of `discard`ing them, since MiniSearch keeps a discarded document's words until it vacuums.
- **Never persisted:** the index is a plain object in React state of the notes page. No `localStorage`, `IndexedDB`, `toJSON` or service-worker cache.
- **Highlighting without HTML:** `lib/searchHighlight.ts` turns plain text plus the matched terms into segments `{ text, match }`; components render them as text and `<mark>` elements. Words are found with the same tokenisation MiniSearch uses (split on whitespace and punctuation, lowercase compare). A snippet is a window of about 120 characters around the first matching word in the body, with `…` where cut; title-only matches show the start of the body.
- **UI:** `components/notes/NoteSearch.tsx` at the top of the sidebar (under the brand row, above New note): a `role="search"` landmark with a labelled `type="search"` input (combobox pattern: `aria-controls` the results listbox, `aria-activedescendant` for the active option, `aria-expanded` while a query is active), a Clear button, and the Include Archive toggle (shown while searching). While a query is active the results listbox replaces the notes list/Archive/Trash in the sidebar's nav. Each option shows the highlighted title, the highlighted snippet, the relative time, a lock icon for locked notes and an "Archived" tag. A polite `role="status"` live region announces "N results" / "No results" (after the debounce, so it doesn't chatter).
- **While searching** the Archive/Trash buttons and Back to notes are hidden (the nav shows results), at most 50 results render (the summary says when more matched), and New note clears the query so the new note is visible.
- **Keyboard** (`lib/searchKeys.ts`, pure): in the field, ArrowDown/ArrowUp move the active result (wrapping), Home/End are left to the text field, Enter opens the active result (or the first one), Esc clears the query (and, inside the drawer, doesn't close the drawer while there is a query; a second Esc closes it). Opening a result selects the note, keeps the query, and moves focus to the note (desktop) or closes the drawer (phone, existing behaviour).
- **Focus hook for CNOTE-24:** `lib/searchFocus.ts` exports `requestSearchFocus()` (dispatches `comnotes:focus-search` on `window`) and `onSearchFocusRequest(listener)`. The notes page listens: on desktop it shows the sidebar if hidden and focuses/selects the desktop field; on phones it opens the drawer and focuses the drawer's field. No shortcut is bound yet.
- **Motion:** the results list fades in (`animate-fade-in`, opacity only, so reduced motion keeps it as is per CNOTE-16); no movement. List View Transitions don't run for results (rows have no `data-motion-row`).
- **Both themes:** tokens only; `<mark>` uses `bg-primary-pale text-ink font-semibold` (meets contrast in light and dark, not colour-only).

## Scope
**In:** MiniSearch dependency (lazy); pure index wrapper, highlight/snippet builder, debounce, focus-request helper; `useNoteSearch` hook; search field + results in the sidebar and drawer; Include Archive toggle; locked-note handling; tests.
**Out:** keyboard shortcut to focus search (`/`, Cmd+K — CNOTE-24); searching Trash (see Decisions); search in the editor (find in note); persisting the index or recent searches; server-side search.

## Acceptance criteria
- [x] AC-1 MiniSearch is loaded on demand (`import('minisearch')`) the first time search is used, not in the main bundle. The index covers title (boosted) and `noteHtmlToText(content)`.
- [x] AC-2 The index updates incrementally: new notes are added, changed notes replaced (text re-extracted only for changed ones), removed/trashed notes discarded, unchanged notes untouched.
- [x] AC-3 Ranking: a title match ranks above a body-only match of the same word. Prefix ("gro" → "groceries") and fuzzy ("grocries" → "groceries") queries match; multi-word queries need every word.
- [x] AC-4 By default results include only main-list notes; archived notes are included only with the Include Archive toggle; trashed notes never appear.
- [x] AC-5 Locked notes: ciphertext is never indexed; a locked note is searchable (title + content) only while its decrypted text is in memory; vault lock removes every locked note from the index immediately; app lock clears the index. Nothing is written to `localStorage`/`IndexedDB`.
- [x] AC-6 Highlight/snippet builder is a pure function returning `{ text, match }` segments; HTML-looking text like `<script>` stays literal text; matching is case-insensitive per word; snippets are trimmed around the first match with `…`.
- [x] AC-7 Typing is debounced (150 ms); clearing is immediate.
- [x] AC-8 UI: search field at the top of the sidebar with `role="search"`, a visible-to-AT label, Clear button; while a query is active the results replace the list, with highlighted title and snippet rendered as React elements (no HTML injection); a polite live region announces the result count; empty and loading states.
- [x] AC-9 Keyboard: ArrowDown/ArrowUp move through results (`aria-activedescendant`), Enter opens the active (or first) result, Esc clears the query; in the drawer Esc with a query clears it instead of closing the drawer.
- [x] AC-10 `requestSearchFocus()` focuses the visible search field (showing the desktop sidebar or opening the drawer when needed).
- [x] AC-11 Works in the mobile drawer and in both themes; tokens only; 44 px targets; results fade in, no movement with reduced motion.
- [x] AC-12 No `eslint-disable`, `ts-ignore`, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`; `firestore.rules` unchanged.
- [x] AC-13 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; `/` and `/notes` return 200 from `next dev`; `npm@11.19 ci` succeeds with the updated lockfile.

## Design
- `package.json`: `minisearch` dependency.
- `lib/noteSearch.ts` (new): `SearchSource`, `searchSources(notes, decrypted)` (pure: skips trash, skips locked notes without decrypted text, never reads `encrypted`), `NoteSearchIndex` (wraps a MiniSearch constructor: `sync`, `search(query, { includeArchive })`, `dropLocked`, `clear`, `size`), `loadNoteSearchIndex()` (dynamic import).
- `lib/searchHighlight.ts` (new, pure): `highlightSegments(text, terms)`, `snippetSegments(text, terms, maxLength)`.
- `lib/debounce.ts` (new, pure): `debounce(fn, wait)` with `cancel`.
- `lib/searchKeys.ts` (new, pure): `searchKeyAction(key, active, count, hasQuery)`.
- `lib/searchFocus.ts` (new): `FOCUS_SEARCH_EVENT`, `requestSearchFocus(target?)`, `onSearchFocusRequest(listener, target?)`.
- `hooks/useNoteSearch.ts` (new): query + debounced query, lazy index load, sync while a query is active, vault-lock drop, cleanup on unmount; returns results with segments.
- `components/notes/NoteSearch.tsx` (new): field, Clear, Include Archive toggle, live region, results listbox.
- `components/notes/Sidebar.tsx`: renders the search field and swaps the nav content for results while searching; `MobileSidebar` keeps the drawer open on Esc while a query is active and can focus the field on open.
- `app/notes/page.tsx`: `useNoteSearch` with `localNotes` and `plain`; passes search props to both sidebars; open-result handler; focus-request listener.

## Tests
| Test | Verifies | Type |
|---|---|---|
| loader returns a working index; index covers title + extracted text | AC-1 | vitest (jsdom) |
| sync add / replace / discard counts; unchanged notes not re-extracted | AC-2 | vitest (jsdom) |
| title boost ranking; prefix; fuzzy; AND | AC-3 | vitest (jsdom) |
| default excludes archived; includeArchive includes; trash never | AC-4 | vitest (jsdom) |
| searchSources: locked without decrypted excluded, never ciphertext; with decrypted included; dropLocked clears them; clear empties | AC-5 | vitest (jsdom) |
| useNoteSearch-style vault flow: vault lock event drops locked docs (createVault + subscribe) | AC-5 | vitest (jsdom) |
| highlight/snippet segments, `<script>` literal, case-insensitive, ellipses | AC-6 | vitest |
| debounce with fake timers: last call wins, cancel | AC-7 | vitest |
| requestSearchFocus / onSearchFocusRequest | AC-10 | vitest |
| searchKeyAction: wrap, Enter active/first, Esc clear | AC-9 | vitest |
| SearchResults/SearchField render: `<script>`/`<img>` text stays text, `<mark>` per match, listbox/options/aria-selected, combobox attributes, empty state, summary | AC-6, AC-8, AC-9 | vitest (jsdom, react-dom) |
| useNoteSearch: debounced query, immediate clear, Include Archive, locked note only while decrypted (placeholder snippet), cleared on unmount | AC-4, AC-5, AC-7 | vitest (jsdom, react-dom) |
| field, results, keyboard, drawer, themes, focus request | AC-8–AC-11 | manual check (dev server; real Firebase env needed for data) |

Verification (2026-10-21): 494 unit tests, lint, typecheck and build pass; MiniSearch builds into its own lazy chunk (5.8 kB gz) and isn't in the notes page chunk; `npm@11.19 ci` succeeds; `next dev` on :3100 serves `/` and `/notes` with 200 and no server errors. UI ACs (8–11) are checked through component tests, the code and the build; a visual pass in both themes and the phone drawer needs a signed-in session with real Firebase config and is still to do.

## Open questions
None. Assumptions: results keep the list's order only as a tie-break (MiniSearch score first); the query survives opening a result until cleared.
