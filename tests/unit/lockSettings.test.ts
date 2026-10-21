import { describe, expect, test } from 'vitest';
import { HIDDEN_LOCK_MS, IDLE_LOCK_MS, autoLockSummary } from '@/lib/lockSettings';

describe('autoLockSummary', () => {
  test('defaults to the auto-lock constants', () => {
    expect(autoLockSummary()).toBe(autoLockSummary(IDLE_LOCK_MS, HIDDEN_LOCK_MS));
    expect(autoLockSummary(5 * 60_000, 60_000)).toBe('Locks by itself after 5 minutes idle or 1 minute in the background.');
  });

  test('whole minutes in minutes, anything else in seconds, singular for one', () => {
    expect(autoLockSummary(2 * 60_000, 30_000)).toBe('Locks by itself after 2 minutes idle or 30 seconds in the background.');
    expect(autoLockSummary(90_000, 1000)).toBe('Locks by itself after 90 seconds idle or 1 second in the background.');
  });
});
