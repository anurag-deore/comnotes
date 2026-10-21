import { describe, expect, test } from 'vitest';
import { searchKeyAction } from '@/lib/searchKeys';

describe('searchKeyAction (AC-9)', () => {
  test('arrows move through the results and wrap', () => {
    expect(searchKeyAction('ArrowDown', -1, 3, true)).toEqual({ type: 'move', index: 0 });
    expect(searchKeyAction('ArrowDown', 2, 3, true)).toEqual({ type: 'move', index: 0 });
    expect(searchKeyAction('ArrowUp', -1, 3, true)).toEqual({ type: 'move', index: 2 });
    expect(searchKeyAction('ArrowUp', 0, 3, true)).toEqual({ type: 'move', index: 2 });
    expect(searchKeyAction('ArrowUp', 2, 3, true)).toEqual({ type: 'move', index: 1 });
  });

  test('Enter opens the active result, or the first when none is active', () => {
    expect(searchKeyAction('Enter', 1, 3, true)).toEqual({ type: 'open', index: 1 });
    expect(searchKeyAction('Enter', -1, 3, true)).toEqual({ type: 'open', index: 0 });
  });

  test('Esc clears a query and is left alone without one', () => {
    expect(searchKeyAction('Escape', 1, 3, true)).toEqual({ type: 'clear' });
    expect(searchKeyAction('Escape', -1, 0, true)).toEqual({ type: 'clear' });
    expect(searchKeyAction('Escape', -1, 0, false)).toBeNull();
  });

  test('without results or a query, and for other keys, the field keeps the key', () => {
    expect(searchKeyAction('ArrowDown', -1, 0, true)).toBeNull();
    expect(searchKeyAction('Enter', -1, 0, true)).toBeNull();
    expect(searchKeyAction('ArrowDown', -1, 3, false)).toBeNull();
    expect(searchKeyAction('Home', 1, 3, true)).toBeNull();
    expect(searchKeyAction('a', 1, 3, true)).toBeNull();
  });
});
