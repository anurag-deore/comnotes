# CNOTE-13 – UI/UX revamp: design system, layout, mobile, accessibility

> Styling source: `docs/design/DESIGN.md`, a Wise-inspired design language from github.com/VoltAgent/awesome-design-md, adapted here for a notes app (no Wise branding, name, logo or font).

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-13/   **Branch:** cnote-13/ui-revamp   **Blocked by:** CNOTE-14 (Done, merged at 7027eb7)

**Spec agreed:** pre-approved by the user 2026-10-20 (design guide supplied, scope and constraints given with the task).

## Goal
ComNotes looks and behaves like one designed product: a sage page with white rounded cards, Inter type, a single lime accent for the main action, quiet inline save status instead of toast noise, a usable phone layout with a slide-over notes list, and an interface that can be driven entirely by keyboard and screen reader. Nothing the app did before changes: autosave, conflict copies, Trash with undo/restore/purge, auto-lock and the Lock button, the leave-page warning and the live list all work as they did.

## Current state (from the code)
- `app/notes/page.tsx` (~320 lines) holds state, data wiring and all markup: indigo/gray Tailwind classes, a collapsible `w-64` sidebar (no mobile layout), date-only rows, Trash inline in the sidebar, an editor header with title input, save label and Delete.
- `app/components/NoteEditor.tsx` has a plain toolbar (all buttons tabbable, no grouping) and `window.prompt` for links.
- `app/globals.css` imports Georama from Google Fonts by URL, has default Next `--background/--foreground` tokens (with a dark-mode block the UI doesn't use) and minimal `.note-editor` rules in gray/indigo.
- `components/PinLock.tsx`: white card with shadow, indigo button, input with placeholder only (no label), error not announced.
- Toasts: default react-hot-toast look at top-right; creating a note fires a loading toast and a success toast.
- `clsx`, `tailwind-merge` and `@radix-ui/react-separator` are dependencies but nothing imports them.
- Tailwind is v4 (`@tailwindcss/postcss`, `@import "tailwindcss"`), so tokens go in `@theme`.

## Scope
**In:**
- Design tokens (CSS variables by role) and Tailwind v4 theme mapping; Inter via `next/font/google`.
- Small component set: `Button`/`IconButton`, `Skeleton`, `EmptyState`, `SaveStatus`, notes `Sidebar` (+ mobile drawer), `NoteListItem`, `TrashView`, `EditorPane`, editor `Toolbar` and `LinkPopover`.
- New layout, empty and loading states, quieter toasts, PIN screen restyle.
- Mobile (<768 px) slide-over notes list; persistent (collapsible) sidebar at ≥768 px.
- Keyboard focus, ARIA, landmarks, reduced motion, AA contrast.
- Tiptap content styles scoped to `.note-editor`.

**Out (deferred):**
- Dark mode (CNOTE-15). Tokens are structured so it only redefines the variables.
- Marketing parts of the guide (hero bands, display-mega type, footer).
- Bubble menu: none exists today; adding one is a feature, not a restyle (follow-up with slash commands).
- Search, tags, dashboard (later tickets).

## Acceptance criteria
- [x] AC-1 Tokens: `app/globals.css` defines role-named CSS variables on `:root` (canvas, canvas-soft, ink, body, mute, primary, on-primary, primary-pale, positive/warning/negative families, radii sm 8 / md 12 / lg 16 / xl 24 / full) and maps them in Tailwind v4 `@theme inline`, so components only use token utilities (`bg-canvas-soft`, `text-ink`, `rounded-xl` …) and CNOTE-15 can add dark mode by redefining the `:root` variables. Spacing stays on Tailwind's 4 px base. No hard-coded hex colours in components.
- [x] AC-2 Font is Inter (400/600/900) via `next/font/google`; the Georama URL import is gone. No Wise name, logo or font appears in the UI.
- [x] AC-3 Layout: sage page; sidebar with "New note" (lime primary), note rows as white rounded cards showing title (blank → "Untitled"), a one-line plain-text preview and a relative time; the active row has a lime indicator plus an ink outline and `aria-current`. Main area is a large white `rounded-xl` editor card with the title at 24/600 and body at 16/24. Lime is used only for the main CTA and the active indicator; secondary buttons are canvas-soft, tertiary are ink outline; "Saved" uses the positive family, never lime.
- [x] AC-4 Editor: toolbar restyled with tokens, grouped with separators, follows the ARIA toolbar pattern (one tab stop, arrow/Home/End move focus, `aria-pressed` state). Links are edited in an accessible Radix popover (labelled input, Apply/Remove, Escape closes, focus returns to the editor) instead of `window.prompt`; only http/https/mailto are accepted, with an inline error otherwise. Headings, lists, task lists, code, quotes and links are styled via a scoped stylesheet using tokens.
- [x] AC-5 PIN screen uses the auth-form-card style (canvas-soft card on white, labelled text input with 1 px ink border, `rounded-md`), autofocuses the input, and announces errors (`role="alert"`, `aria-invalid`, `aria-describedby`).
- [x] AC-6 States: loading shows skeletons (sidebar rows + editor card) with an accessible "Loading notes" status; the editor chunk shows a skeleton while loading; empty states use the empty-state card (no notes yet → New note action; nothing selected; empty Trash). Trash rows show when each note will be deleted for good.
- [x] AC-7 Toasts: restyled (white, `rounded-xl`, small, bottom-centre). Creating a note shows no toast (only on failure). Saving never toasts; save status is shown inline (`Saving…` / `Saved` / error) in a polite live region. Undo-on-delete, conflict, gone and failure toasts stay.
- [x] AC-8 Mobile (<768 px): the sidebar becomes a Radix Dialog slide-over opened by a labelled toggle button and closed by its close button, Escape, overlay tap, choosing a note, creating a note, or the viewport growing to ≥768 px. The editor is full-width. Touch targets are ≥44 px. At ≥768 px the sidebar is persistent and can be hidden/shown (`aria-expanded`).
- [x] AC-9 Accessibility: visible 2 px focus outline with offset on every interactive element; every icon-only button has an `aria-label`; landmarks (`nav` for the notes list, `main` for the editor) and a skip link; the note list is a `role="list"` of buttons; everything is keyboard reachable; `prefers-reduced-motion` disables animations and transitions; text meets AA (secondary text uses `body`; `mute` only for placeholders on large text and decoration; never white text on lime).
- [x] AC-10 All behaviour is unchanged: autosave + inline status, conflict copy, Trash/undo/restore/delete forever/empty trash/30-day purge, auto-lock and Lock button, leave-page warning, live list from the one subscription.
- [x] AC-11 Pure logic added is unit-tested: relative time, title/preview derivation, days left in Trash, save-status view, link input normalisation, toolbar keyboard navigation.
- [x] AC-12 `@radix-ui/react-popover` added (lockfile written by npm 11.19, `npm ci` with 11.19 passes). No unused deps left (`clsx`/`tailwind-merge` used by `cn`, `@radix-ui/react-separator` by the toolbar). No eslint-disable, ts-ignore, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`.
- [x] AC-13 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; `npm run dev` serves `/` and `/notes` with 200 and no server-side errors.

## Design
**Tokens (`app/globals.css`)**
- `:root` holds raw role variables: `--canvas #fff`, `--canvas-soft #e8ebe6`, `--ink #0e0f0c`, `--body #454745`, `--mute #868685`, `--primary #9fe870`, `--primary-hover #cdffad`, `--on-primary #0e0f0c`, `--primary-pale #e2f6d5`, `--positive #2ead4b`, `--positive-deep #054d28`, `--warning #ffd11a`, `--warning-content #4a3b1c`, `--negative #d03238`, `--negative-deep #a72027`, `--negative-pale` (tint for hover), `--overlay` (drawer scrim), `--shadow-toast`.
- `@theme inline` maps them to `--color-*`, sets `--radius-sm/md/lg/xl`, `--font-sans: var(--font-inter)`, and text tokens `display-xs` 24/31.2/600/-0.48, `body-md` 16/24, `body-sm` 14/20, `caption` 12/16. `--animate-drawer-in` + keyframes.
- Base layer: `body` canvas-soft/ink; `:focus-visible` 2 px ink outline, offset 2 px; reduced-motion block.
- `.note-editor` scoped content styles (headings, lists, task list with checkbox accent, quote with primary-pale rule, code/pre on canvas-soft, links underlined ink, images).
- `lib/cn.ts`: `clsx` + `tailwind-merge` extended with the custom text sizes so `text-display-xs` and `text-ink` don't collide.

**Components**
- `components/ui/Button.tsx` – `Button` (variants primary | secondary | tertiary | ghost | danger; sizes md | sm; min-h 44 px) and `IconButton` (required `label` → `aria-label` + `title`).
- `components/ui/Skeleton.tsx`, `components/ui/EmptyState.tsx`.
- `components/notes/Sidebar.tsx` – header (wordmark "ComNotes", New note), `nav` list or `TrashView`, footer (Trash with count, Lock). `MobileSidebar` wraps it in Radix Dialog (title "Notes"); closes on `(min-width: 768px)` match.
- `components/notes/NoteListItem.tsx`, `components/notes/TrashView.tsx`, `components/notes/SaveStatus.tsx`, `components/notes/EditorPane.tsx` (header: sidebar toggles, title input, status, Move to Trash; toolbar + content from `NoteEditor`), `components/notes/NotesSkeleton.tsx`.
- `components/editor/NoteEditor.tsx` (moved from `app/components/`), `components/editor/Toolbar.tsx`, `components/editor/ToolbarButton.tsx`, `components/editor/LinkPopover.tsx` (with an empty selection, inserts the address as linked text).
- `app/notes/page.tsx` keeps the data/state wiring and composes the components. `useNow(60 s)` (`hooks/useNow.ts`) refreshes relative times. When the drawer closes because a note was opened or created, focus goes to the note (title for a new note) instead of back to the menu button.
- `app/layout.tsx`: Inter, metadata title "ComNotes", restyled `Toaster`.

**Pure helpers (tested)**
- `lib/noteDisplay.ts`: `displayTitle`, `notePreview` (via `noteHtmlToText`, truncated), `formatRelativeTime(date, now)`, `daysLeftInTrash(deletedAt, now, days)`.
- `lib/saveStatus.ts`: `saveStatusView(status, online)` → `{ label, tone }`.
- `lib/editorLink.ts`: `withScheme`, `parseLinkInput(input)` → remove | set(href) | invalid.
- `lib/rovingFocus.ts`: `nextFocusIndex(current, key, count)`.

**Deps:** + `@radix-ui/react-popover`. No Firestore schema or rules changes.

## Tests
| Test | Verifies | Type |
|---|---|---|
| noteDisplay: blank title → Untitled; preview strips HTML, collapses space, truncates; empty → "No content" | AC-3, AC-11 | vitest + jsdom |
| noteDisplay: relative time (just now, min, h, Yesterday, weekday, same year, other year, future) | AC-3, AC-11 | vitest |
| noteDisplay: days left in Trash (fresh, partial day, expired → 0) | AC-6, AC-11 | vitest |
| saveStatus: idle/pending/saving/saved/error online/offline → label + tone (saved = positive) | AC-7, AC-11 | vitest |
| editorLink: empty → remove; bare host → https; mailto kept; javascript:/data: invalid | AC-4, AC-11 | vitest |
| rovingFocus: arrows wrap, Home/End, other keys ignored | AC-4, AC-11 | vitest |
| existing suites (autosave, notes, auth, autoLock, editor, quillToTiptap, noteHtml) still pass | AC-10 | vitest |
| grep for hex colours in components, Georama, Wise, innerHTML | AC-1, AC-2, AC-12 | grep |
| lint, typecheck, build, dev curl | AC-13 | CLI |

## Manual browser checks (real Firebase env)
- Desktop: PIN screen look, wrong PIN error announced, unlock; sidebar rows (title/preview/time), active indicator; New note focuses the title, no toast; typing → "Saving…" → "Saved" (green check); hide/show sidebar.
- Toolbar: Tab lands once, arrows move, buttons toggle (`aria-pressed`); link popover: add `example.com`, edit, remove, `javascript:alert(1)` shows error, Escape returns focus to the text.
- Trash: Move to Trash → Undo toast restores; Trash view shows days left; Restore; Delete forever confirm/cancel; Empty trash.
- Conflict copy (edit in two tabs) toast; auto-lock after idle; Lock button; leave-page warning while saving.
- Mobile (DevTools 375 px and a real phone): toggle opens the slide-over, focus is trapped, Escape/overlay/close/selecting a note closes it; editor full width; toolbar scrolls horizontally; targets ≥44 px; rotating/resizing to ≥768 px closes the drawer.
- Keyboard only: skip link, every control reachable, focus ring visible on sage, white and lime.
- OS "reduce motion" on: drawer and skeletons don't animate.
- Screen reader smoke test (VoiceOver): landmarks, list count, current note, save status announcements.

## Assumptions
- "Unlock" on the PIN screen is that screen's main CTA, so it uses the lime primary (the notes screen keeps lime for "New note" only).
- `mute` (#868685) is 3.6:1 on white, so it is only used for the title placeholder (24 px/600 is large text, 3:1 needed) and decoration; all readable secondary text uses `body`.
- No DOM tests for components (no RTL in the repo, not added); behaviour lives in tested `lib/` helpers and is checked by hand.
