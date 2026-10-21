import { describe, expect, test } from 'vitest';
import { migrationHeading, migrationProgress, migrationSummary } from '@/lib/migrationText';

describe('migration banner copy (CNOTE-21 AC-7, AC-9)', () => {
  test('heading counts the notes', () => {
    expect(migrationHeading(1, false)).toBe('1 older note needs updating');
    expect(migrationHeading(12, false)).toBe('12 older notes need updating');
    expect(migrationHeading(1_200, false)).toBe('1,200 older notes need updating');
  });

  test('after a partial run the heading says "still"', () => {
    expect(migrationHeading(1, true)).toBe('1 older note still needs updating');
    expect(migrationHeading(3, true)).toBe('3 older notes still need updating');
  });

  test('progress', () => {
    expect(migrationProgress(3, 12)).toBe('Updating 3 of 12 notes…');
    expect(migrationProgress(0, 1)).toBe('Updating 0 of 1 note…');
  });

  test('summary names what was skipped or failed', () => {
    expect(migrationSummary({ updated: 10, skipped: 2, failed: 0 })).toBe(
      'Updated 10 notes. 2 changed while updating; try again to update them.',
    );
    expect(migrationSummary({ updated: 0, skipped: 0, failed: 1 })).toBe(
      "Updated 0 notes. 1 couldn't be updated; check your connection and try again.",
    );
    expect(migrationSummary({ updated: 1, skipped: 1, failed: 3 })).toBe(
      "Updated 1 note. 1 changed while updating. 3 couldn't be updated; check your connection and try again.",
    );
  });

  test('the toast when everything is done', () => {
    expect(migrationSummary({ updated: 5, skipped: 0, failed: 0 })).toBe('Updated 5 notes');
    expect(migrationSummary({ updated: 1, skipped: 0, failed: 0 })).toBe('Updated 1 note');
  });
});
