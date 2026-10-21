import { describe, expect, test, vi } from 'vitest';
import { connectionMessage, isOnline, subscribeOnline } from '@/lib/onlineStatus';

describe('isOnline (CNOTE-20 AC-10)', () => {
  test('follows navigator.onLine', () => {
    expect(isOnline({ onLine: true })).toBe(true);
    expect(isOnline({ onLine: false })).toBe(false);
  });

  test('counts as online without a navigator (server rendering)', () => {
    expect(isOnline(undefined)).toBe(true);
  });
});

describe('subscribeOnline (CNOTE-20 AC-10)', () => {
  test('listens to online and offline, and stops on unsubscribe', () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    const unsubscribe = subscribeOnline(target, onChange);
    target.dispatchEvent(new Event('offline'));
    target.dispatchEvent(new Event('online'));
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    target.dispatchEvent(new Event('offline'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('connectionMessage (CNOTE-20 AC-10)', () => {
  test('online shows nothing', () => {
    expect(connectionMessage({ online: true, unsaved: true, reconnected: false })).toBeNull();
  });

  test('offline with unsaved changes says they will save later', () => {
    expect(connectionMessage({ online: false, unsaved: true, reconnected: false })).toEqual({
      title: 'Offline',
      detail: "Changes will save when you're back online",
    });
  });

  test('offline with nothing unsaved says open notes stay available', () => {
    expect(connectionMessage({ online: false, unsaved: false, reconnected: false })).toEqual({
      title: 'Offline',
      detail: 'Notes you have open stay available',
    });
  });

  test('just reconnected says so', () => {
    expect(connectionMessage({ online: true, unsaved: true, reconnected: true })).toEqual({ title: 'Back online', detail: null });
  });
});
