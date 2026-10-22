# CNOTE-32 – Update the login (PIN) screen

**Plane:** CNOTE-32   **Branch:** cnote-32/pin-screen   **Blocked by:** none

## Goal

The PIN screen looks like a proper sign-in page. The logo sits at the top and a centred card holds the PIN form. A watercolor landscape (chosen by the user) fills the bottom of the page and fades to blank towards the top, like the user's reference. Bikō branding and per-user unlocking come later, in CNOTE-28 and CNOTE-30.

## Scope

In: layout, illustration, card copy, show/hide PIN, auto-lock hint, the states that already exist (error, offline, locked after inactivity, unlocking).
Out: rename (CNOTE-28), showing which user is unlocking (CNOTE-30), digit boxes (the PIN length isn't fixed).

## Acceptance criteria

- [x] AC-1 Logo centred at the top, and the PIN form in a centred card (`bg-canvas`, `shadow-raised`) over a full-width illustration along the bottom edge. The card overlaps the top of the illustration.
- [x] AC-2 The illustration is the user's watercolor (`public/images/pin-scenery.webp`, transparent sky). It's decorative (`alt=""`, `aria-hidden`, no pointer events), dimmed in dark mode through theme tokens, and cached offline by the service worker like the icons.
- [x] AC-3 A Show PIN / Hide PIN button switches the field between password and text. It has `aria-pressed` and an accessible label. The field keeps `inputMode="numeric"`, `autoComplete="current-password"` and autofocus.
- [x] AC-4 The subtitle explains the state ("Enter your PIN…" or "Locked after inactivity…") and describes the input. The offline notice shows as a callout. Errors show as an alert, and the wrong-PIN shake is unchanged.
- [x] AC-5 The card shows the auto-lock timing, taken from `autoLockSummary()` in `lib/lockSettings.ts`.
- [x] AC-6 Lint, typecheck, unit tests and build all pass. No eslint-disable, ts-ignore or HTML injection.

## Design

- `public/images/pin-scenery.webp`: the user's PNG (1699×926, transparent) re-encoded as WebP (about 300 kB). It's served as is (`unoptimized`), so it's a plain same-origin file the service worker can cache.
- `components/PinLock.tsx`: a full-height page with a header (logo) and a centred card. The picture is absolute at the bottom, behind everything (`-z-10`), `max(112%, 56rem)` wide and shifted down 16%, so its ragged sides and bottom edge fall off the page.
- `app/globals.css`: `--scenery-opacity` and `--scenery-filter`, plain in light and dimmed in dark, so the snow doesn't glare on near-black.
- `public/sw-routes.js`: `/images/` is network-first, like `/icons/`, so the PIN screen keeps its picture offline.
- Replaces the SVG hills (`components/PinScenery.tsx`, removed), which the user found too basic.

## Tests

| Test | Verifies | Type |
|---|---|---|
| Show/hide toggles type, label, aria-pressed | AC-3 | vitest + jsdom render |
| Field keeps numeric keyboard and autofill | AC-3 | vitest + jsdom render |
| Inactivity hint describes the input | AC-4 | vitest + jsdom render |
| Auto-lock timing from lib/lockSettings | AC-5 | vitest + jsdom render |
| Scenery is a decorative picture (alt="", aria-hidden) | AC-2 | vitest + jsdom render |
| /images/ is network-first in the service worker | AC-2 | vitest |

Manual checks (Chrome): light and dark on desktop, phone width (390px, no horizontal scroll), and the show/hide toggle.

The picture is a stock watercolor the user supplied; the user is responsible for its licence, since the repo is public.
