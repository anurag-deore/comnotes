import { describe, expect, test, vi } from 'vitest';
import {
  REDUCED_MOTION_QUERY, cssDurationMs, isInView, listOrderChanged, noteListsChanged, prefersReducedMotion, runViewTransition, viewTransitionName,
  type TransitionDocument,
} from '@/lib/motion';

const fakeWindow = (reduce: boolean) => ({
  matchMedia: (query: string) => ({ matches: query === REDUCED_MOTION_QUERY && reduce }),
});

describe('prefersReducedMotion (AC-8)', () => {
  test('follows the reduced-motion media query', () => {
    expect(prefersReducedMotion(fakeWindow(true))).toBe(true);
    expect(prefersReducedMotion(fakeWindow(false))).toBe(false);
  });
  test('no window or no matchMedia means full motion', () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });
});

describe('cssDurationMs (AC-1)', () => {
  test('reads ms and s token values', () => {
    expect(cssDurationMs(' 240ms', 0)).toBe(240);
    expect(cssDurationMs('0.18s', 0)).toBe(180);
  });
  test('falls back when the token is missing or unreadable', () => {
    expect(cssDurationMs('', 200)).toBe(200);
    expect(cssDurationMs('fast', 200)).toBe(200);
  });
});

describe('listOrderChanged (AC-2)', () => {
  test('same ids in the same order: no change', () => {
    expect(listOrderChanged(['a', 'b'], ['a', 'b'])).toBe(false);
    expect(listOrderChanged([], [])).toBe(false);
  });
  test('reorder, add and remove are changes', () => {
    expect(listOrderChanged(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(listOrderChanged(['a'], ['c', 'a'])).toBe(true);
    expect(listOrderChanged(['a', 'b'], ['a'])).toBe(true);
    expect(listOrderChanged([], ['a'])).toBe(true);
  });
});

describe('noteListsChanged (AC-2)', () => {
  const note = (id: string, trashed = false) => ({ id, deletedAt: trashed ? new Date(0) : null });

  test('content edits keep both lists as they are', () => {
    expect(noteListsChanged([note('a'), note('b'), note('t', true)], [note('a'), note('b'), note('t', true)])).toBe(false);
  });
  test('re-sorting the notes list is a change', () => {
    expect(noteListsChanged([note('a'), note('b')], [note('b'), note('a')])).toBe(true);
  });
  test('moving to Trash, restoring and deleting forever are changes', () => {
    expect(noteListsChanged([note('a'), note('b')], [note('a'), note('b', true)])).toBe(true);
    expect(noteListsChanged([note('a'), note('b', true)], [note('a'), note('b')])).toBe(true);
    expect(noteListsChanged([note('a'), note('t', true)], [note('a')])).toBe(true);
  });
});

describe('viewTransitionName (AC-2)', () => {
  test('prefixes the id', () => {
    expect(viewTransitionName('note', 'Ab12_x-9')).toBe('note-Ab12_x-9');
  });
  test('replaces characters that are not valid in an identifier', () => {
    expect(viewTransitionName('note', 'a b/c.d:é')).toBe('note-a_b_c_d__');
  });
});

describe('isInView (AC-2)', () => {
  const viewport = { top: 100, bottom: 300 };
  test('overlapping rows are in view', () => {
    expect(isInView({ top: 120, bottom: 180 }, viewport)).toBe(true);
    expect(isInView({ top: 80, bottom: 120 }, viewport)).toBe(true);
    expect(isInView({ top: 280, bottom: 340 }, viewport)).toBe(true);
  });
  test('rows above, below or only touching the edge are not', () => {
    expect(isInView({ top: 20, bottom: 80 }, viewport)).toBe(false);
    expect(isInView({ top: 320, bottom: 380 }, viewport)).toBe(false);
    expect(isInView({ top: 40, bottom: 100 }, viewport)).toBe(false);
    expect(isInView({ top: 300, bottom: 360 }, viewport)).toBe(false);
  });
});

describe('runViewTransition (AC-2, AC-3, AC-8)', () => {
  const makeDoc = (withApi: boolean, visibilityState: DocumentVisibilityState = 'visible') => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const dataset: Record<string, string | undefined> = {};
    const doc: TransitionDocument = {
      visibilityState,
      documentElement: { dataset },
      ...(withApi && {
        startViewTransition: vi.fn((update: () => void) => {
          update();
          return { finished };
        }),
      }),
    };
    return { doc, dataset, finish: () => finish() };
  };

  test('without the API the update runs at once', () => {
    const { doc } = makeDoc(false);
    const update = vi.fn();
    expect(runViewTransition(update, { doc, reduced: false })).toBeNull();
    expect(update).toHaveBeenCalledOnce();
  });

  test('reduced motion skips the transition', () => {
    const { doc } = makeDoc(true);
    const update = vi.fn();
    expect(runViewTransition(update, { doc, reduced: true })).toBeNull();
    expect(update).toHaveBeenCalledOnce();
    expect(doc.startViewTransition).not.toHaveBeenCalled();
  });

  test('a hidden page skips the transition', () => {
    const { doc } = makeDoc(true, 'hidden');
    const update = vi.fn();
    expect(runViewTransition(update, { doc, reduced: false })).toBeNull();
    expect(update).toHaveBeenCalledOnce();
    expect(doc.startViewTransition).not.toHaveBeenCalled();
  });

  test('no document: the update still runs', () => {
    const update = vi.fn();
    expect(runViewTransition(update, { doc: undefined, reduced: false })).toBeNull();
    expect(update).toHaveBeenCalledOnce();
  });

  test('with the API the update runs inside a transition tagged with its kind until it finishes', async () => {
    const { doc, dataset, finish } = makeDoc(true);
    const update = vi.fn();
    const transition = runViewTransition(update, { doc, reduced: false, kind: 'sidebar' });
    expect(transition).not.toBeNull();
    expect(doc.startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(dataset.motion).toBe('sidebar');
    finish();
    await transition?.finished;
    await Promise.resolve();
    expect(dataset.motion).toBeUndefined();
  });

  test('an older transition finishing leaves a newer one tagged', async () => {
    const dataset: Record<string, string | undefined> = {};
    const finishers: (() => void)[] = [];
    const doc: TransitionDocument = {
      visibilityState: 'visible',
      documentElement: { dataset },
      startViewTransition: (update: () => void) => {
        update();
        return { finished: new Promise<void>((resolve) => finishers.push(resolve)) };
      },
    };
    const older = runViewTransition(vi.fn(), { doc, reduced: false, kind: 'sidebar' });
    const newer = runViewTransition(vi.fn(), { doc, reduced: false, kind: 'sidebar' });
    finishers[0]();
    await older?.finished;
    await Promise.resolve();
    expect(dataset.motion).toBe('sidebar');
    finishers[1]();
    await newer?.finished;
    await Promise.resolve();
    expect(dataset.motion).toBeUndefined();
  });
});
