# CNOTE-15 – Themes (light/dark/system) and fonts

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-15/   **Branch:** cnote-15/themes   **Blocked by:** CNOTE-13 (Done, 8c35fdd), CNOTE-16 (Done, 702228a)

**Spec agreed:** pre-approved by the user 2026-10-20 (scope, fonts, palette direction and constraints given with the task).

## Goal
ComNotes can be light, dark or follow the system, chosen from a Light / Dark / System control in the sidebar footer and remembered in this browser. The page opens in the right theme with no flash, native controls and scrollbars match it, and switching crossfades calmly (instantly with reduced motion). Everything — notes list, editor content (code, quotes, links, checklists, selection), toolbar, link popover, toasts, PIN screen — reads well in both. The UI stays in Inter; note content is set in Open Sans, a reading face.

## Current state (from the code)
- CNOTE-13 already replaced the Georama URL import with Inter via `next/font/google` (`--font-inter`, 400/600/900); nothing mentions Georama any more. Nothing to fix there beyond adding the reading font.
- `app/globals.css` defines role tokens on `:root` only (light); the comment says dark mode redefines these variables and nothing else. No `color-scheme`, no `::selection` style.
- Components use only token utilities (grep for hex/`rgb(`/`bg-white`/`text-black`/grey palettes finds only the token definitions). `AppToaster` styles toasts with `var(--canvas)` / `var(--ink)` / `var(--positive)` / `var(--negative)`.
- `--negative-deep` is used both as text on light surfaces and as the danger button hover fill under `--on-negative` text; `--positive-deep` is text on canvas. Dark values must work for both uses.
- Popover, toasts and the drawer rely on `--elevation-raised` (a soft shadow) to stand off the card; on near-black a shadow alone is invisible.

## Scope
**In:** dark palette (redefining existing tokens only), theme preference (light/dark/system, default system) persisted in `localStorage`, pre-paint theme application, `color-scheme`, live follow of OS changes while on System, Light/Dark/System switcher in the sidebar footer, smooth theme crossfade, editor/selection theming, Open Sans reading font, contrast test over the tokens.
**Out:** a per-account (Firestore) theme preference; a theme switcher on the PIN screen (it follows the stored choice/system); custom accent colours.

## Acceptance criteria
- [x] AC-1 Dark palette: `:root[data-theme="dark"]` redefines only existing tokens (no new colour roles): near-black olive surfaces (page/`--canvas-soft` `#121410`, cards/`--canvas` `#1b1d18`), light sage `--ink`, AA body/mute greys, lime `--primary #9fe870` kept with ink-dark `--on-primary`, dark-green `--primary-pale`, semantic positive/negative/warning tuned for dark, darker `--overlay`, and `--elevation-raised` with a hairline so raised surfaces stand off the card.
- [x] AC-2 Contrast: in both themes, `--ink` and `--body` on `--canvas`, `--canvas-soft` and `--primary-pale` ≥ 4.5:1; `--on-primary` on `--primary`/`--primary-hover`, `--on-negative` on `--negative`/`--negative-deep`, `--negative-deep` on `--canvas`/`--canvas-soft`/`--negative-pale`, `--positive-deep` on `--canvas` ≥ 4.5:1; `--mute` (placeholder) on `--canvas` ≥ 3:1; `--negative` (invalid input border) and `--ink` (input border, focus ring) on `--canvas` ≥ 3:1. Checked by a unit test that reads the values from `globals.css`.
- [x] AC-3 Preference: `light` / `dark` / `system`, default `system`, stored under `comnotes:theme` in `localStorage`; read/write wrapped in try/catch; anything unknown reads as `system`; with storage blocked the choice still applies for the session.
- [x] AC-4 No flash: an inline script in `<head>` (React string child in the server root layout, no `dangerouslySetInnerHTML`) sets `data-theme="light|dark"` on `<html>` from the stored preference and `prefers-color-scheme` before first paint; it never throws (blocked storage, no `matchMedia`). `<html>` has `suppressHydrationWarning` for that attribute only. `color-scheme` follows the theme so native controls, checkboxes and scrollbars match.
- [x] AC-5 System: while the preference is System, an OS light/dark change re-themes the open page without reload; a change made in another tab is picked up too.
- [x] AC-6 Switcher: a "Theme" radio group (Light / Dark / System, lucide icons + visible labels) in the sidebar footer (desktop sidebar and mobile drawer stay in sync); one tab stop, arrow keys move and select, `aria-checked` on the current choice, visible focus ring, 44px touch targets.
- [x] AC-7 Transition: a switch crossfades the page with `--motion-base` via a View Transition (`data-motion="theme"`); instant with reduced motion, without View Transitions, or when the resolved theme doesn't change; no transition on initial load.
- [x] AC-8 Editor and chrome: code blocks, inline code, quotes, links, task checkboxes, rules, text selection (`::selection` from the lime token), title placeholder, toolbar (pressed/hover), link popover, toasts and the PIN screen use tokens only and are legible in both themes. No hardcoded colours outside the token definitions.
- [x] AC-9 Fonts: UI stays Inter (`--font-inter`, `font-sans`); note content (`.note-editor`) and the sidebar note preview use Open Sans via `next/font/google` (400/600/700, normal + italic) exposed as `--font-reading` / `font-reading`.
- [x] AC-10 Pure logic is unit-tested: parse/serialize preference, resolve system, storage read/write with throwing/missing storage, the init script run against fake document/storage/matchMedia, the switcher's arrow-key movement, and the contrast pairs.
- [x] AC-11 No new dependencies; no eslint-disable, ts-ignore, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`.
- [x] AC-12 Behaviour unchanged (autosave, Trash, lock, motion from CNOTE-16); `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; dev server serves `/` and `/notes` with 200, no server errors, and the HTML carries the theme script and `suppressHydrationWarning`-ed `<html>`.

## Design
**Why an inline string-child script and not `next-themes` or `next/script`.**
- `next/script` with `strategy="beforeInteractive"` in the App Router does not emit a blocking tag: it pushes the script onto `self.__next_s` and Next's bootstrap appends it after the main chunk loads (`next/dist/client/app-bootstrap.js`), i.e. potentially after first paint — the wrong-theme flash this ticket is about. A plain `<script src>` in `<head>` is a synchronous script, which `@next/next/no-sync-scripts` (error in `core-web-vitals`) forbids.
- `next-themes` (0.4.6, last release March 2025) injects its script from a client component with `dangerouslySetInnerHTML`; React 19 warns in dev about script tags rendered by components, and it adds a dependency for ~20 lines of logic.
- React supports a plain string as a `<script>`'s children (it escapes `</script` when streaming). Rendered from the server root layout's `<head>`, it is in the initial HTML and runs before the body paints; it hydrates in place (no client-side script creation). The string is a constant from our code, not user HTML, so the CNOTE-12 HTML-sink bans are untouched and stay on.

**Tokens (`app/globals.css`)**
- `:root { color-scheme: light }`, `:root[data-theme="dark"] { color-scheme: dark; …dark values }`. One dark block; the script and the client resolve System to `light`/`dark`, so the CSS needs no duplicated `prefers-color-scheme` block. (Without JS the app doesn't run at all, so the light default is enough.)
- Dark values: canvas `#1b1d18`, canvas-soft `#121410`, overlay `rgb(0 0 0 / 0.6)`, ink `#e8ebe6`, body `#b5b9b1`, mute `#868a83`, primary `#9fe870`, primary-hover `#cdffad`, on-primary `#0e0f0c`, primary-pale `#24361a`, positive `#4cc46a`, positive-deep `#8fe0a2`, warning `#ffd11a`, warning-content `#4a3b1c`, negative `#f0686d`, negative-deep `#ffa3a6`, negative-pale `#3a1517`, on-negative `#0e0f0c`, elevation `0 0 0 1px rgb(232 235 230 / 0.1), 0 8px 24px rgb(0 0 0 / 0.5)`. (`--focus-ring: var(--ink)` follows.) The page keeps the light mode's structure — cards one step lighter than the page — so `--canvas-soft` stays the page and the inset (code, hover, dividers) colour.
- `@theme inline`: `--font-reading: var(--font-open-sans), system-ui, sans-serif`. Base layer: `::selection { background-color: color-mix(in srgb, var(--primary) 40%, transparent) }`.
- `.note-editor` gets `font-reading`.
- Theme crossfade: `html[data-motion="theme"]::view-transition-new(root)` fades in with `--motion-base` / ease-move over the old snapshot (old stays put); the global "root doesn't animate" rule from CNOTE-16 still holds for every other kind.

**Logic**
- `lib/theme.ts` (pure, tested): `THEME_STORAGE_KEY`, `THEME_PREFERENCES`, `DARK_SCHEME_QUERY`, `parseThemePreference`, `serializeThemePreference`, `resolveTheme(pref, systemDark)`, `readThemePreference(storage)`, `writeThemePreference(storage, pref)` (try/catch), and `THEME_INIT_SCRIPT` (self-contained string, same key/query constants, everything in try/catch).
- `lib/themeStore.ts` (browser glue): module store for the current preference (seeded from storage, kept in memory when storage is blocked), `subscribe`/`getSnapshot` for `useSyncExternalStore`, `setThemePreference(pref)` writes storage and applies the resolved theme to `<html>` inside `runViewTransition(kind: 'theme')` only when the resolved theme changes, and a `watchTheme()` that follows `matchMedia` (when System) and `storage` events from other tabs.
- `components/ui/ThemeSync.tsx` (client, renders nothing): calls `watchTheme()` once; mounted in `app/layout.tsx` so the PIN screen follows OS changes too.
- `lib/rovingFocus.ts`: `nextRadioIndex` (radio groups also move with Up/Down) reusing `nextFocusIndex`.
- `components/ui/ThemeSwitcher.tsx`: `role="radiogroup" aria-label="Theme"`, three `role="radio"` buttons with `aria-checked`, roving tabindex, arrows/Home/End move + select; `useSyncExternalStore(subscribe, getSnapshot, () => 'system')`. Placed in `Sidebar` above the Trash/Lock row.
- `app/layout.tsx`: Open Sans (`variable: '--font-open-sans'`), `<html suppressHydrationWarning>`, `<head><script>{THEME_INIT_SCRIPT}</script></head>`, `<ThemeSync />`.
- `NoteListItem` preview line: `font-reading`.

**Deps:** none. No Firestore changes.

## Tests
| Test | Verifies | Type |
|---|---|---|
| theme: parse (valid, unknown, null) and serialize round-trip | AC-3, AC-10 | vitest |
| theme: resolveTheme for light/dark/system × systemDark | AC-3, AC-5, AC-10 | vitest |
| theme: read/write with memory, throwing and null storage | AC-3, AC-10 | vitest |
| theme: init script sets data-theme from storage, follows matchMedia for system/unknown, survives throwing storage and missing matchMedia | AC-4, AC-10 | vitest |
| rovingFocus: nextRadioIndex — all four arrows wrap, Home/End, other keys → null | AC-6, AC-10 | vitest |
| themeContrast: WCAG ratios of the AC-2 pairs read from globals.css, both themes; dark block only redefines `:root` tokens | AC-1, AC-2, AC-10 | vitest |
| existing suites still pass | AC-12 | vitest |
| grep: no hex/rgb/grey palette utilities outside token definitions; no eslint-disable/ts-ignore/innerHTML; package.json deps unchanged | AC-8, AC-11 | grep |
| lint, typecheck, build, dev curl `/` and `/notes` (script + attributes in HTML) | AC-4, AC-12 | CLI |

## Verification (2026-10-20)
- `npm test` 15 files / 197 tests pass (incl. 36 contrast checks over both themes); `npm run lint`, `npm run typecheck`, `npm run build` pass; `/`, `/_not-found`, `/notes` still static.
- Dev on :3100: `/` and `/notes` 200, no server errors; `<html>` carries both font variables, the `<head>` script is served verbatim (quotes unescaped) and, extracted from the HTML and run against fakes, sets `data-theme="dark"` from storage.
- Not yet run (no browser/Firebase env in the worktree): visual pass of both themes, switcher keyboard/screen-reader pass, hydration console check, OS theme flip while on System.

## Open questions
None. Assumption: the reading font also suits the one-line note preview in the sidebar (it is note content); the title stays in the UI face since it sits in the chrome header.
