import { describe, expect, test, vi } from 'vitest';
import {
  OFFLINE_CACHE_KEY, changeOfflineCache, readOfflineCache, writeOfflineCache, type OfflineCacheDeps,
} from '@/lib/offlineSetting';

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

describe('offline cache setting storage (CNOTE-20 AC-2)', () => {
  test('on by default, also without storage or when storage throws', () => {
    expect(readOfflineCache(memoryStorage())).toBe(true);
    expect(readOfflineCache(null)).toBe(true);
    expect(readOfflineCache(blockedStorage)).toBe(true);
  });

  test('round-trips on and off', () => {
    const storage = memoryStorage();
    expect(writeOfflineCache(storage, false)).toBe(true);
    expect(storage.map.get(OFFLINE_CACHE_KEY)).toBe('0');
    expect(readOfflineCache(storage)).toBe(false);
    expect(writeOfflineCache(storage, true)).toBe(true);
    expect(storage.map.get(OFFLINE_CACHE_KEY)).toBe('1');
    expect(readOfflineCache(storage)).toBe(true);
  });

  test('an unexpected stored value reads as on', () => {
    const storage = memoryStorage();
    storage.map.set(OFFLINE_CACHE_KEY, 'nope');
    expect(readOfflineCache(storage)).toBe(true);
  });

  test('reports a write that throws or has no storage', () => {
    expect(writeOfflineCache(blockedStorage, false)).toBe(false);
    expect(writeOfflineCache(null, false)).toBe(false);
  });
});

function deps(overrides: Partial<OfflineCacheDeps> = {}) {
  const calls: string[] = [];
  const base: OfflineCacheDeps = {
    isOnline: () => true,
    settle: vi.fn(async () => {
      calls.push('settle');
      return true;
    }),
    write: vi.fn((on: boolean) => {
      calls.push(`write:${on}`);
      return true;
    }),
    clearCache: vi.fn(async () => {
      calls.push('clear');
    }),
    reload: vi.fn(() => {
      calls.push('reload');
    }),
  };
  return { calls, deps: { ...base, ...overrides } };
}

describe('changeOfflineCache (CNOTE-20 AC-3)', () => {
  test('offline: changes nothing', async () => {
    const { calls, deps: d } = deps({ isOnline: () => false });
    await expect(changeOfflineCache(false, d)).resolves.toBe('offline');
    expect(calls).toEqual([]);
  });

  test('unsaved changes: changes nothing', async () => {
    const { calls, deps: d } = deps({ settle: async () => false });
    await expect(changeOfflineCache(false, d)).resolves.toBe('unsaved');
    expect(calls).toEqual([]);
  });

  test('a setting that cannot be stored: no clear, no reload', async () => {
    const { calls, deps: d } = deps({ write: () => false });
    await expect(changeOfflineCache(false, d)).resolves.toBe('storage');
    expect(calls).toEqual(['settle']);
  });

  test('off: settles, stores, clears the cache, then reloads', async () => {
    const { calls, deps: d } = deps();
    await expect(changeOfflineCache(false, d)).resolves.toBe('done');
    expect(calls).toEqual(['settle', 'write:false', 'clear', 'reload']);
  });

  test('off: a failed clear still reloads (the next load clears again)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { calls, deps: d } = deps({
      clearCache: async () => {
        throw new Error('failed-precondition');
      },
    });
    await expect(changeOfflineCache(false, d)).resolves.toBe('done');
    expect(calls).toEqual(['settle', 'write:false', 'reload']);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test('on: settles, stores and reloads without clearing', async () => {
    const { calls, deps: d } = deps();
    await expect(changeOfflineCache(true, d)).resolves.toBe('done');
    expect(calls).toEqual(['settle', 'write:true', 'reload']);
  });
});
