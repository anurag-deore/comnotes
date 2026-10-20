// Browser glue for the theme (CNOTE-15): the current preference as a tiny external store for
// useSyncExternalStore, applying it to <html>, and following the OS and other tabs. The decisions
// are in lib/theme.ts (tested); the first paint is handled by THEME_INIT_SCRIPT in app/layout.tsx.

import { prefersReducedMotion, runViewTransition } from '@/lib/motion';
import { browserStorage } from '@/lib/sidebarPreference';
import {
  DARK_SCHEME_QUERY, THEME_STORAGE_KEY, parseThemePreference, readThemePreference, resolveTheme, writeThemePreference,
  type ThemePreference,
} from '@/lib/theme';

// Kept in memory too, so the choice holds for this page when storage is blocked
let current: ThemePreference | null = null;
const listeners = new Set<() => void>();

function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches;
}

// Sets data-theme on <html>; crossfades when the shown theme actually changes (instant with
// reduced motion or without View Transitions)
function apply(pref: ThemePreference) {
  const root = document.documentElement;
  const theme = resolveTheme(pref, systemDark());
  if (root.dataset.theme === theme) return;
  runViewTransition(() => {
    root.dataset.theme = theme;
  }, { doc: document, reduced: prefersReducedMotion(window), kind: 'theme' });
}

function update(pref: ThemePreference) {
  current = pref;
  apply(pref);
  listeners.forEach((listener) => listener());
}

export function getThemePreference(): ThemePreference {
  current ??= readThemePreference(browserStorage());
  return current;
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setThemePreference(pref: ThemePreference): void {
  writeThemePreference(browserStorage(), pref);
  update(pref);
}

// Follows OS light/dark changes while on System, and choices made in other tabs. Returns cleanup.
export function watchTheme(): () => void {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : null;
  const onSystemChange = () => apply(getThemePreference());
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) update(parseThemePreference(event.newValue));
  };
  query?.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);
  return () => {
    query?.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}
