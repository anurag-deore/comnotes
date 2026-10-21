# CNOTE-32 – Update the login (PIN) screen

**Plane:** CNOTE-32   **Branch:** cnote-32/pin-screen   **Blocked by:** none

## Goal

The PIN screen looks like a proper sign-in page. The logo sits at the top and a centred card holds the PIN form. An illustration fills the bottom of the page, like the user's reference (a login card over a landscape, but without the trees). Bikō branding and per-user unlocking come later, in CNOTE-28 and CNOTE-30.

## Scope

In: layout, illustration, card copy, show/hide PIN, auto-lock hint, the states that already exist (error, offline, locked after inactivity, unlocking).
Out: rename (CNOTE-28), showing which user is unlocking (CNOTE-30), digit boxes (the PIN length isn't fixed).

## Acceptance criteria

- [x] AC-1 Logo centred at the top, and the PIN form in a centred card (`bg-canvas`, `shadow-raised`) over a full-width illustration along the bottom edge. The card overlaps the top of the illustration.
- [x] AC-2 The illustration is an inline SVG drawn from theme tokens (plus the logo's blue gradient), so it follows light and dark. It's decorative (`aria-hidden`, no pointer events) and its gradient ids are unique per instance.
- [x] AC-3 A Show PIN / Hide PIN button switches the field between password and text. It has `aria-pressed` and an accessible label. The field keeps `inputMode="numeric"`, `autoComplete="current-password"` and autofocus.
- [x] AC-4 The subtitle explains the state ("Enter your PIN…" or "Locked after inactivity…") and describes the input. The offline notice shows as a callout. Errors show as an alert, and the wrong-PIN shake is unchanged.
- [x] AC-5 The card shows the auto-lock timing, taken from `autoLockSummary()` in `lib/lockSettings.ts`.
- [x] AC-6 Lint, typecheck, unit tests and build all pass. No eslint-disable, ts-ignore or HTML injection.

## Design

- `components/PinScenery.tsx`: four layered hill paths at `viewBox 0 0 1440 520` with `preserveAspectRatio="xMidYMax slice"`. Fills, from back to front: the logo gradient at 22% opacity, primary → primary-pale at 55%, primary-pale, canvas-soft.
- `components/PinLock.tsx`: a full-height page made of a header (logo) and a centred card. The scenery is absolute at the bottom, behind everything (`-z-10`) and `clamp(14rem, 48vh, 32rem)` tall.

## Tests

| Test | Verifies | Type |
|---|---|---|
| Show/hide toggles type, label, aria-pressed | AC-3 | vitest + jsdom render |
| Field keeps numeric keyboard and autofill | AC-3 | vitest + jsdom render |
| Inactivity hint describes the input | AC-4 | vitest + jsdom render |
| Auto-lock timing from lib/lockSettings | AC-5 | vitest + jsdom render |
| Scenery is aria-hidden | AC-2 | vitest + jsdom render |

Manual checks:
- Done: light and dark on desktop in Chrome, and the show/hide toggle.
- Not done: phone width, because the browser window couldn't be resized.
