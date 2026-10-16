import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAutosaver, type SaveStatus } from '@/lib/autosave';
import type { NoteDraft, SaveResult } from '@/lib/notes';
import type { Note } from '@/types/note';

const draft = (id: string, content: string, rev = 0): NoteDraft => ({ id, title: `T ${id}`, content, rev });
const note = (id: string, rev: number, content = ''): Note => ({
  id, title: `T ${id}`, content, rev, createdAt: new Date(0), updatedAt: new Date(0),
});

// A save whose resolution the test controls
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let save: ReturnType<typeof vi.fn<(d: NoteDraft) => Promise<SaveResult>>>;
let statuses: SaveStatus[];
let onConflict: ReturnType<typeof vi.fn<(result: Extract<SaveResult, { status: 'conflict' }>) => void>>;

const setup = () => createAutosaver({
  save, delayMs: 1000, retryMs: 5000, onStatus: (s) => statuses.push(s), onConflict,
});

beforeEach(() => {
  vi.useFakeTimers();
  save = vi.fn(async (d: NoteDraft): Promise<SaveResult> => ({ status: 'saved', rev: d.rev + 1 }));
  statuses = [];
  onConflict = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  test('AC-3: rapid edits produce one save with the latest draft after the delay', async () => {
    const saver = setup();
    saver.change(draft('a', 'h'));
    await vi.advanceTimersByTimeAsync(500);
    saver.change(draft('a', 'he'));
    await vi.advanceTimersByTimeAsync(500);
    saver.change(draft('a', 'hello'));
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(draft('a', 'hello'));
  });

  test('AC-3: only dirty notes are saved', async () => {
    const saver = setup();
    saver.change(draft('a', 'x'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(save.mock.calls.map(([d]) => d.id)).toEqual(['a']);
  });

  test('AC-12: status goes pending, saving, saved', async () => {
    const saver = setup();
    saver.change(draft('a', 'x'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
    expect(saver.hasPending()).toBe(false);
  });
});

describe('rev handling', () => {
  test('AC-7: saves of one note never overlap and the next save uses the returned rev', async () => {
    const first = deferred<SaveResult>();
    save.mockImplementationOnce(() => first.promise);
    const saver = setup();

    saver.change(draft('a', 'one', 3));
    await vi.advanceTimersByTimeAsync(1000);
    saver.change(draft('a', 'two', 3));
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.isDirty('a')).toBe(true);

    first.resolve({ status: 'saved', rev: 4 });
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(draft('a', 'two', 4));
    expect(saver.isDirty('a')).toBe(false);
  });

  test('AC-7: a newer rev from the caller wins over the last saved rev', async () => {
    const saver = setup();
    saver.change(draft('a', 'one', 0));
    await saver.flush();
    saver.change(draft('a', 'two', 7));
    await saver.flush();
    expect(save).toHaveBeenLastCalledWith(draft('a', 'two', 7));
  });
});

describe('conflicts', () => {
  test('AC-5: reports the conflict and continues from the server rev', async () => {
    const result: SaveResult = { status: 'conflict', server: note('a', 5, 'theirs'), copy: note('c', 0) };
    save.mockResolvedValueOnce(result);
    const saver = setup();

    saver.change(draft('a', 'mine', 2));
    await saver.flush();
    expect(onConflict).toHaveBeenCalledWith(result);

    saver.change(draft('a', 'later', 2));
    await saver.flush();
    expect(save).toHaveBeenLastCalledWith(draft('a', 'later', 5));
  });

  test('AC-6: edits made while the conflicting save was in flight go to the conflict copy', async () => {
    const first = deferred<SaveResult>();
    save.mockImplementationOnce(() => first.promise);
    const saver = setup();

    saver.change(draft('a', 'mine', 2));
    await vi.advanceTimersByTimeAsync(1000);
    saver.change(draft('a', 'mine and more', 2));
    first.resolve({ status: 'conflict', server: note('a', 5), copy: note('c', 0) });
    await saver.flush();

    expect(save).toHaveBeenLastCalledWith({ id: 'c', title: 'T a', content: 'mine and more', rev: 0 });
    expect(saver.isDirty('a')).toBe(false);
  });
});

describe('failures', () => {
  test('AC-8: a failed save stays dirty, reports error and retries after retryMs', async () => {
    save.mockRejectedValueOnce(new Error('unavailable'));
    const saver = setup();

    saver.change(draft('a', 'x'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses.at(-1)).toBe('error');
    expect(saver.isDirty('a')).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('saved');
    expect(saver.hasPending()).toBe(false);
  });

  test('AC-8: an edit made during a failing save is kept over the failed draft', async () => {
    const first = deferred<SaveResult>();
    save.mockImplementationOnce(() => first.promise);
    const saver = setup();

    saver.change(draft('a', 'old'));
    await vi.advanceTimersByTimeAsync(1000);
    saver.change(draft('a', 'new'));
    first.reject(new Error('unavailable'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(draft('a', 'new'));
  });
});

describe('flush', () => {
  test('AC-9: saves pending edits immediately and resolves true', async () => {
    const saver = setup();
    saver.change(draft('a', 'x'));
    saver.change(draft('b', 'y'));
    await expect(saver.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  test('AC-9: resolves false when a save fails', async () => {
    save.mockRejectedValue(new Error('unavailable'));
    const saver = setup();
    saver.change(draft('a', 'x'));
    await expect(saver.flush()).resolves.toBe(false);
    expect(saver.hasPending()).toBe(true);
  });

  test('dispose cancels the pending timer', async () => {
    const saver = setup();
    saver.change(draft('a', 'x'));
    saver.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('draft', () => {
  test('CNOTE-8 AC-7: returns the pending draft, then the in-flight one, then nothing once saved', async () => {
    const first = deferred<SaveResult>();
    save.mockImplementationOnce(() => first.promise);
    const saver = setup();

    saver.change(draft('a', 'x'));
    expect(saver.draft('a')).toEqual(draft('a', 'x'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(saver.draft('a')).toEqual(draft('a', 'x'));

    saver.change(draft('a', 'xy'));
    expect(saver.draft('a')).toEqual(draft('a', 'xy'));

    first.resolve({ status: 'saved', rev: 1 });
    await saver.flush();
    expect(saver.draft('a')).toBeUndefined();
    expect(saver.draft('b')).toBeUndefined();
  });

  test('CNOTE-8 AC-6: a draft that failed to save is kept', async () => {
    save.mockRejectedValue(new Error('permission-denied'));
    const saver = setup();
    saver.change(draft('a', 'x'));
    await saver.flush();
    expect(saver.draft('a')).toEqual(draft('a', 'x'));
  });
});
