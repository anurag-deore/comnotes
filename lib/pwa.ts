// Colours the browser and the installed app use outside the page (CNOTE-20), from the design tokens
// in app/globals.css (tests/unit/manifest.test.ts keeps them in step): the splash background is
// --canvas, the browser chrome --canvas-soft of the light or dark theme.
export const APP_COLORS = {
  background: '#ffffff',
  light: '#e8ebe6',
  dark: '#121410',
} as const;
