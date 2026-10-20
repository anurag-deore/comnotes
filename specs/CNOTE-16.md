# CNOTE-16 – Animations and micro-interactions

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-16/   **Branch:** cnote-16/animations   **Blocked by:** CNOTE-13 (Done, merged at 8c35fdd)

**Spec agreed:** pre-approved by the user 2026-10-20 (scope and constraints given with the task).

## Goal
ComNotes moves calmly and quickly: notes slide into place when they are created, trashed, restored or re-sorted; the desktop sidebar slides away and comes back (and stays the way you left it); the drawer slides in and out; the PIN card eases in, shakes on a wrong PIN, and the app fades in after unlocking; the save indicator crossfades between "Saving…" and "Saved"; buttons, toasts, the link popover and the drawer respond with short, soft motion. With "reduce motion" on, nothing moves: lists and the sidebar change instantly and everything else only fades.

## Current state (from the code)
- `app/globals.css` has `drawer-in` and `fade-in` keyframes (200 ms ease-out) and a blanket `prefers-reduced-motion` rule that zeroes every animation and transition, fades included.
- The mobile drawer (Radix Dialog) slides in but disappears instantly; the link popover fades in and disappears instantly.
- The desktop sidebar is toggled with the `hidden` attribute (no motion, not remembered across reloads).
- Note rows appear, vanish and re-order instantly; the list re-orders live on `updatedAt` from the Firestore snapshot.
- PIN card has no motion; a wrong PIN only shows the error text.
- `SaveStatus` swaps its label instantly.
- Buttons use `transition-colors` at Tailwind's default 150 ms; no press feedback.
- Toasts use react-hot-toast's default spring (≈350 ms in, 400 ms out).

## Scope
**In:** motion tokens; list enter/exit/reorder (notes and Trash); desktop sidebar collapse animation + per-viewer persistence; drawer and popover enter/exit; PIN card enter, wrong-PIN shake, fade into the app; save indicator crossfade; button hover/press; toast enter/exit; reduced-motion handling for all of it.
**Out:** page-to-page route transitions via Next's experimental view-transition flag (experimental; not needed for one route change); dark mode (CNOTE-15).

## Acceptance criteria
- [x] AC-1 Motion tokens: `:root` defines `--motion-fast` 120 ms, `--motion-base` 180 ms, `--motion-slow` 240 ms and easings `--motion-ease-enter` (ease-out), `--motion-ease-exit` (ease-in), `--motion-ease-move` (standard); `@theme` maps them (Tailwind default transition duration/easing, `ease-enter/exit/move`, `animate-*`). Components use the tokens, not literal durations.
- [x] AC-2 Note list: a created or restored note enters (fade + small slide), a trashed or permanently deleted note exits (fade + slight shrink), and remaining rows glide to their new places, including the live re-order on `updatedAt` and Trash rows. Uses the View Transitions API where supported; elsewhere the list updates instantly (no errors). Only order/membership changes animate; edits that keep the order (every autosave) never start a transition.
- [x] AC-3 Desktop sidebar: Hide/Show slides the sidebar out/in while the editor card widens/narrows (View Transition; instant where unsupported). The choice is remembered per viewer in `localStorage` (read/write wrapped in try/catch; works with storage blocked). `aria-expanded`, `aria-controls` and focus are unchanged.
- [x] AC-4 Mobile drawer slides and fades in and out (overlay fades); Radix focus trap, Escape, overlay tap and return-focus behaviour are unchanged.
- [x] AC-5 Unlock screen: the card fades and scales in; a wrong PIN shakes the card (the error stays announced via `role="alert"`) and re-focuses/selects the PIN input; after unlocking the notes app (skeleton, then content) fades in.
- [x] AC-6 Save indicator: each change of state (Saving… / Saved / error) fades the new label in, the Saved check pops in subtly; pending→saving does not re-animate; it stays a polite `role="status"` region.
- [x] AC-7 Micro-interactions: buttons, icon buttons, toolbar buttons and note rows transition colour on hover with `--motion-fast` and press in slightly (scale 0.95 toolbar, 0.97 buttons, 0.98 rows); toasts enter (rise + fade) and exit (fade + shrink) with the tokens; the link popover scales/fades in and out from its trigger.
- [x] AC-8 Reduced motion: with `prefers-reduced-motion: reduce`, nothing translates, scales or shakes — moving keyframes are redefined as opacity-only (shake as a no-op), transform transitions are `motion-safe` only, list and sidebar View Transitions are skipped (instant), the spinner and skeleton pulse stay off. The reduced-motion check and the transition runner are pure, tested helpers.
- [x] AC-9 Only `transform` and `opacity` are animated (View Transition groups animate snapshot pseudo-elements, not layout). No layout shift during save-status changes beyond the existing label width.
- [x] AC-10 Behaviour unchanged: autosave + status, conflict copy, Trash/undo/restore/delete forever/empty trash/purge, auto-lock and Lock, leave-page warning, live list, focus management (drawer close → note, new note → title, popover close → editor).
- [x] AC-11 Pure logic is unit-tested: reduced-motion query, list order/membership change, view-transition name sanitising, in-viewport check, notes/Trash list change, CSS duration token parsing, transition runner (unsupported / reduced / hidden page / supported), sidebar preference read/write with blocked storage.
- [x] AC-12 No new dependencies (no motion library); no eslint-disable, ts-ignore, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`.
- [x] AC-13 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; dev server serves `/` and `/notes` with 200 and no server-side errors.

## Design
**No motion library.** Enter/exit/reorder of rows is exactly what the View Transitions API does (snapshots of old and new rows, groups morph between positions), and it handles exits without keeping removed rows mounted. Same-document View Transitions ship in Chrome/Edge 111+, Safari 18+ and Firefox 144+; elsewhere the update is applied instantly, which is today's behaviour. `motion` would add ~30 kB gz for layout/presence; not justified.

**Tokens (`app/globals.css`)**
- `:root`: `--motion-fast/base/slow`, `--motion-ease-enter: cubic-bezier(0.22, 1, 0.36, 1)`, `--motion-ease-exit: cubic-bezier(0.4, 0, 1, 1)`, `--motion-ease-move: cubic-bezier(0.2, 0, 0, 1)`.
- `@theme inline`: `--default-transition-duration`, `--default-transition-timing-function`, `--ease-enter/exit/move`, `--animate-*`: `fade-in`, `fade-out`, `drawer-in`, `drawer-out`, `pop-in`, `pop-out`, `card-in`, `app-in`.
- Keyframes at top level; a `prefers-reduced-motion: reduce` block redefines the moving keyframes (drawer, pop, card, rise, toast, row, sidebar, shake) as opacity-only (shake: no change). The blanket "zero every duration" rule is replaced by this, so fades remain and movement goes.
- View Transition styles: root snapshot doesn't animate (no full-page crossfade); `.note-row` groups move with `--motion-base`/ease-move, entering rows `row-in`, exiting `row-out`; `notes-sidebar` slides, `editor-pane` morphs with unscaled, top-left-anchored snapshots, clipped by its group.

**Helpers**
- `lib/motion.ts` (pure, tested): `REDUCED_MOTION_QUERY`, `prefersReducedMotion(win)`, `listOrderChanged(prev, next)`, `viewTransitionName(prefix, id)`, `isInView(rect, viewport)`, `runViewTransition(update, { doc, reduced, kind })` – calls `update` directly when unsupported/reduced/hidden, else `doc.startViewTransition(update)` with `data-motion=<kind>` on `<html>` until it finishes.
- `lib/listMotion.ts` (DOM glue): `animateListChange(update)` names only rows visible inside their scroll viewport (`[data-motion-row]` within `[data-motion-viewport]`; hidden copies are skipped, so the drawer and desktop sidebar never clash), runs the transition, names the new visible rows after the update, clears names when done.
- `lib/sidebarPreference.ts` (pure, tested): `SIDEBAR_HIDDEN_KEY`, `browserStorage()`, `readSidebarHidden(storage)`, `writeSidebarHidden(storage, hidden)`; all storage access in try/catch.

**Components**
- `app/notes/page.tsx`: all note-list updates go through `commitNotes(update)` (ref of the latest list); when the ids of active or trashed notes change order/membership (and not on first load) the commit runs in `animateListChange` with `flushSync(setLocalNotes(latest))`, else a plain `setLocalNotes`. Sidebar hidden state starts from `readSidebarHidden`, toggles inside `runViewTransition(kind: 'sidebar')` and is written back. Root wrapper `animate-fade-in`.
- `NoteListItem`, `TrashView` rows: `data-motion-row={id}`; Sidebar `nav`: `data-motion-viewport`.
- `Sidebar.tsx` drawer: `data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out`, overlay fade in/out (Radix Presence waits for exit animations).
- `LinkPopover`: `animate-pop-in`/`animate-pop-out` from `--radix-popover-content-transform-origin`.
- `PinLock`: card `animate-card-in`; wrong PIN → shake via Web Animations API with duration/easing read from the tokens (skipped when reduced), focus + select input. `NotesSkeleton`: `animate-fade-in`.
- `SaveStatus`: label/icon keyed by tone → `animate-fade-in`, check `animate-pop-in`.
- `Button`/`IconButton`/`ToolbarButton`/`NoteListItem`: `transition-[color,background-color,border-color,scale]`, `motion-safe:enabled:active:scale-[0.97]` (toolbar 0.95, rows 0.98).
- `components/ui/AppToaster.tsx` (client): `Toaster` rendering `ToastBar` with `toast-in`/`toast-out` animations; used by `app/layout.tsx`.

**Deps:** none added. No Firestore changes.

## Tests
| Test | Verifies | Type |
|---|---|---|
| motion: prefersReducedMotion true/false, missing window/matchMedia → false | AC-8, AC-11 | vitest |
| motion: listOrderChanged (same, reorder, add, remove, empty) | AC-2, AC-11 | vitest |
| motion: noteListsChanged (edit, re-sort, trash, restore, delete forever) | AC-2, AC-11 | vitest |
| motion: cssDurationMs (ms, s, missing, unreadable) | AC-1, AC-11 | vitest |
| motion: viewTransitionName sanitises ids, prefix kept | AC-2, AC-11 | vitest |
| motion: isInView overlap / above / below / edge-touching | AC-2, AC-11 | vitest |
| motion: runViewTransition unsupported / reduced / hidden → sync update, null; supported → startViewTransition, data-motion set then cleared | AC-2, AC-3, AC-8, AC-11 | vitest |
| sidebarPreference: default false, '1' → true, write, throwing/null storage safe | AC-3, AC-11 | vitest |
| existing suites still pass | AC-10 | vitest |
| grep: no literal ms durations in components, no eslint-disable/ts-ignore/innerHTML; package.json deps unchanged | AC-1, AC-12 | grep |
| lint, typecheck, build, dev curl | AC-13 | CLI |

## Manual browser checks (real Firebase env; not yet run — no Firebase env in the worktree)
- Chrome: New note → row slides in at top; Move to Trash → row fades out, rest glide up; Undo → back in; edit an older note → it glides to the top on first save; typing in the top note never flickers. Trash: Restore / Delete forever rows exit.
- Desktop: Hide sidebar → slides out, editor widens; reload → stays hidden; Show → slides in. Storage blocked (private window with site data blocked) → toggle still works.
- Phone width: drawer slides in and out; overlay fades; Escape / overlay / pick note still close it; focus goes to the note.
- PIN: card eases in; wrong PIN shakes, error read out, input re-selected; correct PIN → app fades in.
- Save status: Saving… → Saved crossfade; check pops.
- Toasts rise in, fade out; link popover scales in/out.
- OS "Reduce motion" on: no slide, scale or shake anywhere; lists and sidebar change instantly; fades only.
- Firefox < 144 / no View Transitions: everything works, lists change instantly.

## Assumptions
- The existing Hide/Show sidebar button is the collapse toggle; a new one is not needed.
- Fades are acceptable under reduced motion (WCAG 2.3.3 concerns movement), replacing CNOTE-13's blanket zero-duration rule.
