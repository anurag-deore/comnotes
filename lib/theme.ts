// Theme preference (CNOTE-15). Pure: storage is passed in, so this is unit-tested without a browser.
// The colours themselves are the tokens in app/globals.css; dark redefines them under data-theme="dark".

export const THEME_STORAGE_KEY = 'comnotes:theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type Theme = Exclude<ThemePreference, 'system'>;

export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.find((pref) => pref === value) ?? 'system';
}

export function serializeThemePreference(pref: ThemePreference): string {
  return pref;
}

// The theme actually shown: System follows the OS
export function resolveTheme(pref: ThemePreference, systemDark: boolean): Theme {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

// The theme a light/dark toggle switches to (CNOTE-24)
export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

// Storage can be missing or throw (private mode, blocked site data); that just means "System"
export function readThemePreference(storage: Pick<Storage, 'getItem'> | null): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

// Returns whether the choice was remembered; the theme still applies for this page either way
export function writeThemePreference(storage: Pick<Storage, 'setItem'> | null, pref: ThemePreference): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THEME_STORAGE_KEY, serializeThemePreference(pref));
    return true;
  } catch {
    return false;
  }
}

// Runs in <head> before the body paints (app/layout.tsx), so the first frame is already in the
// right theme. Plain ES5-ish, self-contained, and it must never throw.
export const THEME_INIT_SCRIPT = `(function () {
  var pref = null;
  try { pref = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (e) {}
  var dark = pref === 'dark';
  if (pref !== 'light' && pref !== 'dark') {
    try { dark = window.matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)}).matches; } catch (e) {}
  }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();`;
