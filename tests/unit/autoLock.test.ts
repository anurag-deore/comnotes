import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAutoLock, flushThenLock } from '@/lib/autoLock';

const IDLE = 5000;
const HIDDEN = 1000;

let onLock: ReturnType<typeof vi.fn<() => void>>;
const setup = () => createAutoLock({ idleMs: IDLE, hiddenMs: HIDDEN, onLock });

beforeEach(() => {
  vi.useFakeTimers();
  onLock = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('idle', () => {
  test('AC-1: locks after idleMs without activity, not before', () => {
    setup();
    vi.advanceTimersByTime(IDLE - 1);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  test('AC-1: activity pushes the deadline back', () => {
    const lock = setup();
    vi.advanceTimersByTime(4000);
    lock.activity();
    vi.advanceTimersByTime(4000);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  test('AC-3: activity events schedule no extra timers', () => {
    const lock = setup();
    const timers = vi.getTimerCount();
    for (let i = 0; i < 1000; i++) lock.activity();
    expect(vi.getTimerCount()).toBe(timers);
  });
});

describe('hidden', () => {
  test('AC-2: locks after hiddenMs hidden', () => {
    const lock = setup();
    lock.visibility(true);
    vi.advanceTimersByTime(HIDDEN);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  test('AC-2: becoming visible before hiddenMs cancels it', () => {
    const lock = setup();
    lock.visibility(true);
    vi.advanceTimersByTime(HIDDEN - 1);
    lock.visibility(false);
    vi.advanceTimersByTime(HIDDEN);
    expect(onLock).not.toHaveBeenCalled();
  });

  test('AC-2: returning after a missed hidden deadline locks at once', () => {
    const lock = setup();
    lock.visibility(true);
    // A throttled background tab: the clock moves but the timer hasn't fired yet
    vi.setSystemTime(Date.now() + HIDDEN);
    lock.visibility(false);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  test('AC-2: returning after a missed idle deadline locks at once', () => {
    const lock = setup();
    vi.setSystemTime(Date.now() + IDLE);
    lock.visibility(false);
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});

describe('lifecycle', () => {
  test('AC-8: onLock fires once and then all timers stop', () => {
    const lock = setup();
    lock.visibility(true);
    vi.advanceTimersByTime(IDLE * 2);
    lock.visibility(false);
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('AC-8: dispose stops all timers', () => {
    const lock = setup();
    lock.visibility(true);
    lock.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(IDLE * 2);
    expect(onLock).not.toHaveBeenCalled();
  });
});

describe('flushThenLock', () => {
  let lock: ReturnType<typeof vi.fn<() => Promise<void>>>;
  beforeEach(() => {
    lock = vi.fn(async () => {});
  });

  test('AC-5: flushes, then locks', async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => { order.push('flush'); return true; });
    lock.mockImplementation(async () => { order.push('lock'); });
    await expect(flushThenLock(flush, lock, 3000)).resolves.toBe(true);
    expect(order).toEqual(['flush', 'lock']);
  });

  test('AC-5: locks when the flush leaves drafts unsaved', async () => {
    await expect(flushThenLock(async () => false, lock, 3000)).resolves.toBe(false);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  test('AC-5: locks when the flush rejects', async () => {
    await expect(flushThenLock(() => Promise.reject(new Error('x')), lock, 3000)).resolves.toBe(false);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  test('AC-5: locks after the timeout when the flush hangs', async () => {
    const done = flushThenLock(() => new Promise<boolean>(() => {}), lock, 3000);
    await vi.advanceTimersByTimeAsync(2999);
    expect(lock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(done).resolves.toBe(false);
    expect(lock).toHaveBeenCalledTimes(1);
  });
});
