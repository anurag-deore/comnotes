// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { daysLeftInTrash, displayTitle, formatRelativeTime, notePreview } from '@/lib/noteDisplay';

describe('displayTitle (AC-3)', () => {
  test('keeps a real title, trimmed', () => {
    expect(displayTitle('  Plan  ')).toBe('Plan');
  });
  test('blank title reads as Untitled', () => {
    expect(displayTitle('')).toBe('Untitled');
    expect(displayTitle('   ')).toBe('Untitled');
  });
});

describe('notePreview (AC-3)', () => {
  test('shows note HTML as plain text with collapsed whitespace', () => {
    expect(notePreview('<h1>Plan</h1><p>buy <strong>milk</strong></p><ul><li>eggs</li></ul>')).toBe('Plan buy milk eggs');
  });
  test('never keeps markup or script text', () => {
    expect(notePreview('<p>hi</p><script>alert(1)</script><img src=x onerror="alert(2)">')).toBe('hi');
  });
  test('truncates long text with an ellipsis', () => {
    const preview = notePreview(`<p>${'word '.repeat(60)}</p>`, 20);
    expect(preview.length).toBeLessThanOrEqual(20);
    expect(preview.endsWith('…')).toBe(true);
  });
  test('empty note says so', () => {
    expect(notePreview('')).toBe('No content');
    expect(notePreview('<p></p>')).toBe('No content');
  });
});

describe('formatRelativeTime (AC-3)', () => {
  const now = new Date(2026, 9, 20, 15, 0, 0); // Tue 20 Oct 2026, 15:00 local

  test.each([
    [new Date(2026, 9, 20, 14, 59, 30), 'Just now'],
    [new Date(2026, 9, 20, 15, 5, 0), 'Just now'], // clock skew: future reads as now
    [new Date(2026, 9, 20, 14, 55, 0), '5 min ago'],
    [new Date(2026, 9, 20, 12, 0, 0), '3 h ago'],
    [new Date(2026, 9, 20, 0, 30, 0), '14 h ago'],
    [new Date(2026, 9, 19, 23, 0, 0), 'Yesterday'],
    [new Date(2026, 9, 16, 9, 0, 0), 'Fri'],
    [new Date(2026, 9, 3, 9, 0, 0), 'Oct 3'],
    [new Date(2025, 11, 31, 9, 0, 0), 'Dec 31, 2025'],
  ])('%s → %s', (date, expected) => {
    expect(formatRelativeTime(date, now)).toBe(expected);
  });
});

describe('daysLeftInTrash (AC-6)', () => {
  const now = new Date(2026, 9, 20, 12, 0, 0);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  test('just trashed has the full period left', () => {
    expect(daysLeftInTrash(now, now, 30)).toBe(30);
  });
  test('partial days round up', () => {
    expect(daysLeftInTrash(daysAgo(10.5), now, 30)).toBe(20);
  });
  test('expired never goes below 0', () => {
    expect(daysLeftInTrash(daysAgo(29.9), now, 30)).toBe(1);
    expect(daysLeftInTrash(daysAgo(45), now, 30)).toBe(0);
  });
});
