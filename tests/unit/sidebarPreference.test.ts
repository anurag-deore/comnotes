import { describe, expect, test } from 'vitest';
import { SIDEBAR_HIDDEN_KEY, readSidebarHidden, writeSidebarHidden } from '@/lib/sidebarPreference';

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

describe('sidebar preference (AC-3)', () => {
  test('shown by default', () => {
    expect(readSidebarHidden(memoryStorage())).toBe(false);
    expect(readSidebarHidden(null)).toBe(false);
  });

  test('round-trips the hidden state', () => {
    const storage = memoryStorage();
    writeSidebarHidden(storage, true);
    expect(storage.map.get(SIDEBAR_HIDDEN_KEY)).toBe('1');
    expect(readSidebarHidden(storage)).toBe(true);
    writeSidebarHidden(storage, false);
    expect(readSidebarHidden(storage)).toBe(false);
  });

  test('ignores unexpected stored values', () => {
    const storage = memoryStorage();
    storage.map.set(SIDEBAR_HIDDEN_KEY, 'yes');
    expect(readSidebarHidden(storage)).toBe(false);
  });

  test('blocked or missing storage never throws', () => {
    expect(readSidebarHidden(blockedStorage)).toBe(false);
    expect(() => writeSidebarHidden(blockedStorage, true)).not.toThrow();
    expect(() => writeSidebarHidden(null, true)).not.toThrow();
  });
});
