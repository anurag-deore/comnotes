import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { debounce } from '@/lib/debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce (AC-7)', () => {
  test('runs once with the last arguments after the wait', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 150);
    debounced.call('g');
    vi.advanceTimersByTime(100);
    debounced.call('gr');
    vi.advanceTimersByTime(100);
    debounced.call('gro');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('gro');
  });

  test('cancel drops the pending call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 150);
    debounced.call('x');
    debounced.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    debounced.call('y');
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledWith('y');
  });
});
