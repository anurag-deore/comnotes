import { describe, expect, test } from 'vitest';
import { nextFocusIndex } from '@/lib/rovingFocus';

describe('nextFocusIndex (AC-4)', () => {
  test('arrows move and wrap', () => {
    expect(nextFocusIndex(0, 'ArrowRight', 5)).toBe(1);
    expect(nextFocusIndex(4, 'ArrowRight', 5)).toBe(0);
    expect(nextFocusIndex(0, 'ArrowLeft', 5)).toBe(4);
    expect(nextFocusIndex(3, 'ArrowLeft', 5)).toBe(2);
  });
  test('Home and End jump to the ends', () => {
    expect(nextFocusIndex(2, 'Home', 5)).toBe(0);
    expect(nextFocusIndex(2, 'End', 5)).toBe(4);
  });
  test('other keys are not handled', () => {
    expect(nextFocusIndex(2, 'Enter', 5)).toBeNull();
    expect(nextFocusIndex(2, 'ArrowDown', 5)).toBeNull();
  });
});
