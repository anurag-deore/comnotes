import { describe, expect, test } from 'vitest';
import { nextFocusIndex, nextRadioIndex } from '@/lib/rovingFocus';

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

describe('nextRadioIndex (CNOTE-15 AC-6)', () => {
  test('all four arrows move and wrap', () => {
    expect(nextRadioIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(nextRadioIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(nextRadioIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(nextRadioIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(nextRadioIndex(1, 'ArrowLeft', 3)).toBe(0);
  });
  test('Home and End jump to the ends; other keys are not handled', () => {
    expect(nextRadioIndex(1, 'Home', 3)).toBe(0);
    expect(nextRadioIndex(1, 'End', 3)).toBe(2);
    expect(nextRadioIndex(1, ' ', 3)).toBeNull();
    expect(nextRadioIndex(1, 'Tab', 3)).toBeNull();
  });
});
