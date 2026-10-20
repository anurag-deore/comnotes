import { describe, expect, test } from 'vitest';
import {
  DARK_SCHEME_QUERY, THEME_INIT_SCRIPT, THEME_PREFERENCES, THEME_STORAGE_KEY, parseThemePreference, readThemePreference,
  resolveTheme, serializeThemePreference, writeThemePreference,
} from '@/lib/theme';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
};

const blockedStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('theme preference (AC-3)', () => {
  test('parses the three choices; anything else is system', () => {
    expect(THEME_PREFERENCES).toEqual(['light', 'dark', 'system']);
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('Dark')).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
  });

  test('serialize round-trips', () => {
    for (const pref of THEME_PREFERENCES) expect(parseThemePreference(serializeThemePreference(pref))).toBe(pref);
  });

  test('resolves system from the OS scheme (AC-5)', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  test('read/write round-trip through storage', () => {
    const storage = memoryStorage();
    expect(readThemePreference(storage)).toBe('system');
    writeThemePreference(storage, 'dark');
    expect(storage.map.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference(storage)).toBe('dark');
  });

  test('blocked or missing storage never throws', () => {
    expect(readThemePreference(blockedStorage)).toBe('system');
    expect(readThemePreference(null)).toBe('system');
    expect(writeThemePreference(blockedStorage, 'dark')).toBe(false);
    expect(writeThemePreference(null, 'dark')).toBe(false);
    expect(writeThemePreference(memoryStorage(), 'dark')).toBe(true);
  });
});

// Runs the exact script string shipped in <head> against fakes
function runInitScript({ stored, systemDark, storageThrows = false, noMatchMedia = false }: {
  stored?: string | null;
  systemDark?: boolean;
  storageThrows?: boolean;
  noMatchMedia?: boolean;
}) {
  const root = { dataset: {} as Record<string, string> };
  const storage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('SecurityError');
      return key === THEME_STORAGE_KEY ? stored ?? null : null;
    },
  };
  const matchMedia = noMatchMedia
    ? undefined
    : (query: string) => ({ matches: query === DARK_SCHEME_QUERY && Boolean(systemDark) });
  const win = { localStorage: storage, matchMedia };
  new Function('window', 'document', THEME_INIT_SCRIPT)(win, { documentElement: root });
  return root.dataset.theme;
}

describe('pre-paint init script (AC-4)', () => {
  test('applies an explicit choice regardless of the OS', () => {
    expect(runInitScript({ stored: 'dark', systemDark: false })).toBe('dark');
    expect(runInitScript({ stored: 'light', systemDark: true })).toBe('light');
  });

  test('system, unknown or missing follows prefers-color-scheme', () => {
    expect(runInitScript({ stored: 'system', systemDark: true })).toBe('dark');
    expect(runInitScript({ stored: null, systemDark: true })).toBe('dark');
    expect(runInitScript({ stored: 'purple', systemDark: false })).toBe('light');
  });

  test('blocked storage or no matchMedia still sets a theme and never throws', () => {
    expect(runInitScript({ storageThrows: true, systemDark: true })).toBe('dark');
    expect(runInitScript({ stored: null, noMatchMedia: true })).toBe('light');
    expect(runInitScript({ stored: 'dark', noMatchMedia: true })).toBe('dark');
  });

  test('is a self-contained string with no HTML in it', () => {
    expect(THEME_INIT_SCRIPT).not.toMatch(/<\/?script/i);
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });
});
