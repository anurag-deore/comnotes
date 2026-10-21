import { describe, expect, test, vi } from 'vitest';
import { FOCUS_SEARCH_EVENT, onSearchFocusRequest, requestSearchFocus } from '@/lib/searchFocus';

describe('search focus requests (AC-10)', () => {
  test('a request reaches listeners until they unsubscribe', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const stop = onSearchFocusRequest(listener, target);
    requestSearchFocus(target);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    requestSearchFocus(target);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('uses a namespaced event name', () => {
    const target = new EventTarget();
    const seen: string[] = [];
    target.addEventListener(FOCUS_SEARCH_EVENT, (event) => seen.push(event.type));
    requestSearchFocus(target);
    expect(seen).toEqual(['comnotes:focus-search']);
  });

  test('without a window it does nothing', () => {
    expect(() => requestSearchFocus(undefined)).not.toThrow();
    expect(onSearchFocusRequest(() => {}, undefined)()).toBeUndefined();
  });
});
