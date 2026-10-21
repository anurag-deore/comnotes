import { afterEach, describe, expect, test } from 'vitest';
import {
  addDays, activeDays, countWords, createdGrid, dayKey, dayLabel, gridLevel, gridSummary, isKnownDate, keyToDate,
  monthLabels, noteCounts, recentNotes, streaks, weekTotals, wordsWritten,
} from '@/lib/metrics';
import type { Note } from '@/types/note';

// Node re-reads TZ when it changes, so each test can pin a time zone
const ORIGINAL_TZ = process.env.TZ;
const setTZ = (tz: string) => {
  process.env.TZ = tz;
};
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const EPOCH = new Date(0);
const PAYLOAD = { v: 1, salt: 's', iv: 'i', ct: 'c' } as unknown as NonNullable<Note['encrypted']>;

// Local time; `at(2026, 10, 21)` is Oct 21 at noon
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

let seq = 0;
function note(fields: Partial<Note> = {}): Note {
  const date = fields.createdAt ?? at(2026, 10, 1);
  return {
    id: `n${++seq}`,
    title: '',
    content: '',
    rev: 0,
    createdAt: date,
    updatedAt: fields.updatedAt ?? date,
    deletedAt: null,
    archivedAt: null,
    locked: false,
    encrypted: null,
    ...fields,
  };
}
const locked = (fields: Partial<Note> = {}) => note({ locked: true, encrypted: PAYLOAD, ...fields });

describe('dayKey / addDays (AC-1)', () => {
  test('dayKey uses the local calendar day', () => {
    setTZ('America/New_York');
    // 02:30 UTC on Oct 21 is still Oct 20 in New York
    expect(dayKey(new Date('2026-10-21T02:30:00Z'))).toBe('2026-10-20');
    expect(dayKey(new Date('2026-10-21T04:30:00Z'))).toBe('2026-10-21');
    setTZ('Asia/Tokyo');
    expect(dayKey(new Date('2026-10-20T16:00:00Z'))).toBe('2026-10-21');
  });

  test('pads months and days', () => {
    setTZ('UTC');
    expect(dayKey(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
  });

  test('addDays rolls over months, years and leap days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-21', 0)).toBe('2026-10-21');
    expect(addDays('2026-10-21', -84)).toBe('2026-07-29');
  });

  test.each([
    ['Europe/Berlin', '2026-03-29'],
    ['Europe/Berlin', '2026-10-25'],
    ['America/New_York', '2026-03-08'],
    ['America/New_York', '2026-11-01'],
    ['America/Havana', '2026-03-08'],
  ])('a DST change in %s on %s neither skips nor repeats a day', (tz, change) => {
    setTZ(tz);
    const keys = [-1, 0, 1].map((n) => addDays(change, n));
    expect(new Set(keys).size).toBe(3);
    // Every hour of the transition day maps to that day
    const [y, m, d] = change.split('-').map(Number);
    for (let h = 0; h < 24; h++) expect(dayKey(new Date(y, m - 1, d, h))).toBe(change);
    // Local midnight of the day after is the next key, whether the day had 23, 24 or 25 hours
    expect(dayKey(new Date(y, m - 1, d + 1))).toBe(addDays(change, 1));
  });

  test('keyToDate gives that local day back, also on a midnight DST change', () => {
    setTZ('America/Havana');
    expect(dayKey(keyToDate('2026-03-08'))).toBe('2026-03-08');
    expect(keyToDate('2026-03-08').getDate()).toBe(8);
  });

  test('isKnownDate rejects the legacy epoch fallback and invalid dates', () => {
    expect(isKnownDate(EPOCH)).toBe(false);
    expect(isKnownDate(new Date(Number.NaN))).toBe(false);
    expect(isKnownDate(at(2026, 10, 21))).toBe(true);
  });
});

describe('noteCounts (AC-2)', () => {
  test('an empty list is all zeros', () => {
    expect(noteCounts([])).toEqual({ notes: 0, archived: 0, locked: 0, trash: 0 });
  });

  test('counts each view; locked counts notes and Archive, not Trash', () => {
    const d = at(2026, 10, 1);
    const notes = [
      note(), note(), locked(),
      note({ archivedAt: d }), locked({ archivedAt: d }),
      note({ deletedAt: d }), note({ deletedAt: d, archivedAt: d }), locked({ deletedAt: d }),
    ];
    expect(noteCounts(notes)).toEqual({ notes: 3, archived: 2, locked: 2, trash: 3 });
  });
});

describe('countWords (AC-3)', () => {
  test('counts whitespace-separated runs with a letter or digit', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('Hello, world!')).toBe(2);
    expect(countWords('one — two - three ... 4')).toBe(4);
    expect(countWords("don't stop\nbelievin'\tnow")).toBe(4);
  });

  test('counts Unicode letters', () => {
    expect(countWords('Grüße aus Köln')).toBe(3);
    expect(countWords('Привет мир')).toBe(2);
    expect(countWords('🙂 🎉')).toBe(0);
  });
});

describe('wordsWritten (AC-3, AC-9)', () => {
  // Stands in for noteHtmlToText: strips tags, like the real one, without a DOM
  const toText = (html: string) => html.replace(/<[^>]*>/g, ' ');

  test('an empty list writes no words', () => {
    expect(wordsWritten([], {}, toText)).toEqual({ words: 0, counted: 0, excludedLocked: 0 });
  });

  test('sums title and content of notes and Archive, not Trash', () => {
    const d = at(2026, 10, 1);
    const notes = [
      note({ title: 'Two words', content: '<p>three more words</p>' }),
      note({ title: '', content: '<h1>Heading</h1><p>body</p>', archivedAt: d }),
      note({ title: 'Trashed note', content: '<p>not counted at all</p>', deletedAt: d }),
    ];
    expect(wordsWritten(notes, {}, toText)).toEqual({ words: 7, counted: 2, excludedLocked: 0 });
  });

  test('locked notes count only with decrypted text, otherwise they are excluded and reported', () => {
    const open = locked();
    const shut = locked();
    const trashedShut = locked({ deletedAt: at(2026, 10, 1) });
    const decrypted = { [open.id]: { title: 'Secret plan', content: '<p>one two</p>' } };
    expect(wordsWritten([open, shut, trashedShut, note({ title: 'Plain' })], decrypted, toText)).toEqual({
      words: 5, counted: 2, excludedLocked: 1,
    });
  });

  test('a locked note never reads its stored (empty) fields', () => {
    const stray = locked({ title: 'should not count', content: 'nor this' });
    expect(wordsWritten([stray], {}, toText)).toEqual({ words: 0, counted: 0, excludedLocked: 1 });
  });
});

describe('activeDays / streaks (AC-4)', () => {
  const NOW = at(2026, 10, 21, 15);
  const on = (d: number, fields: Partial<Note> = {}) => note({ createdAt: at(2026, 10, d), ...fields });
  const run = (notes: Note[], now = NOW) => streaks(activeDays(notes, now), now);

  test('no notes, no streak', () => {
    expect(run([])).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  test('an ongoing streak including today', () => {
    expect(run([on(19), on(20), on(21)])).toEqual({ current: 3, longest: 3, activeToday: true });
  });

  test('a streak ending yesterday is still current until today ends', () => {
    expect(run([on(18), on(19), on(20)])).toEqual({ current: 3, longest: 3, activeToday: false });
  });

  test('a gap of a full day breaks the streak', () => {
    expect(run([on(17), on(18), on(19)])).toEqual({ current: 0, longest: 3, activeToday: false });
  });

  test('longest streak is kept when the current one is shorter', () => {
    const notes = [on(1), on(2), on(3), on(4), on(10), on(20), on(21)];
    expect(run(notes)).toEqual({ current: 2, longest: 4, activeToday: true });
  });

  test('several notes on one day count once', () => {
    expect(run([on(21), on(21), on(21)])).toEqual({ current: 1, longest: 1, activeToday: true });
  });

  test('an update day counts as well as the creation day', () => {
    const edited = note({ createdAt: at(2026, 9, 1), updatedAt: at(2026, 10, 21, 9) });
    expect(run([edited, on(20)])).toEqual({ current: 2, longest: 2, activeToday: true });
    expect(activeDays([edited], NOW)).toEqual(new Set(['2026-09-01', '2026-10-21']));
  });

  test('legacy notes with unknown (epoch) dates are ignored', () => {
    const legacy = note({ createdAt: EPOCH, updatedAt: EPOCH });
    expect(activeDays([legacy], NOW).size).toBe(0);
    expect(run([legacy, on(21)])).toEqual({ current: 1, longest: 1, activeToday: true });
  });

  test('a date after now (pending timestamp, clock skew) counts as today', () => {
    const ahead = note({ createdAt: at(2026, 10, 22, 0, 5) });
    expect(activeDays([ahead], NOW)).toEqual(new Set(['2026-10-21']));
  });

  test('trashed and archived notes still count as activity', () => {
    const d = at(2026, 10, 21);
    expect(run([on(20, { deletedAt: d }), on(21, { archivedAt: d })]).current).toBe(2);
  });

  test('just after midnight, yesterday keeps the streak alive', () => {
    setTZ('Europe/Berlin');
    const now = new Date(2026, 9, 22, 0, 1);
    expect(run([on(21)], now)).toEqual({ current: 1, longest: 1, activeToday: false });
  });

  test('a streak spanning a DST change counts each day once', () => {
    setTZ('Europe/Berlin');
    // Clocks go back on Sun Oct 25 2026 (a 25 h day)
    const now = new Date(2026, 9, 26, 8);
    const notes = [24, 25, 26].map((d) => note({ createdAt: new Date(2026, 9, d, 0, 30) }));
    expect(run(notes, now)).toEqual({ current: 3, longest: 3, activeToday: true });
  });

  test('the streak follows the local time zone', () => {
    // 23:30 on Oct 20 in New York is Oct 21 in UTC
    const late = new Date('2026-10-21T03:30:00Z');
    const now = new Date('2026-10-21T16:00:00Z');
    setTZ('America/New_York');
    expect(streaks(activeDays([note({ createdAt: late })], now), now)).toEqual({ current: 1, longest: 1, activeToday: false });
    setTZ('UTC');
    expect(streaks(activeDays([note({ createdAt: late })], now), now)).toEqual({ current: 1, longest: 1, activeToday: true });
  });
});

describe('createdGrid / weekTotals / gridLevel (AC-5)', () => {
  // Wed Oct 21 2026
  const NOW = at(2026, 10, 21, 15);

  test('12 week columns of 7 days, today in the last column at its weekday, later days empty', () => {
    const grid = createdGrid([], NOW);
    expect(grid.weeks).toHaveLength(12);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    const last = grid.weeks[11];
    expect(last[0]?.key).toBe('2026-10-18');
    expect(last[3]?.key).toBe('2026-10-21');
    expect(last.slice(4)).toEqual([null, null, null]);
    expect(grid.weeks[0][0]?.key).toBe('2026-08-02');
    expect(grid.max).toBe(0);
    expect(grid.total).toBe(0);
  });

  test('every day of the range appears once, in order', () => {
    const keys = createdGrid([], NOW).weeks.flat().filter((c) => c !== null).map((c) => c.key);
    expect(keys).toHaveLength(7 * 11 + 4);
    keys.slice(1).forEach((key, i) => expect(key).toBe(addDays(keys[i], 1)));
  });

  test('a Saturday fills the last column; a Sunday starts it', () => {
    expect(createdGrid([], at(2026, 10, 24)).weeks[11].every((c) => c !== null)).toBe(true);
    const sunday = createdGrid([], at(2026, 10, 25)).weeks[11];
    expect(sunday[0]?.key).toBe('2026-10-25');
    expect(sunday.slice(1).every((c) => c === null)).toBe(true);
  });

  test('counts notes created per day, in any view; unknown and out-of-range dates are left out', () => {
    const d = at(2026, 10, 1);
    const notes = [
      note({ createdAt: at(2026, 10, 21, 9) }),
      note({ createdAt: at(2026, 10, 21, 23, 59), deletedAt: d }),
      note({ createdAt: at(2026, 10, 20), archivedAt: d }),
      note({ createdAt: at(2026, 8, 2, 0, 1) }),
      note({ createdAt: at(2026, 8, 1) }),
      note({ createdAt: EPOCH, updatedAt: EPOCH }),
      // Only updated in range: not a creation
      note({ createdAt: at(2026, 1, 1), updatedAt: at(2026, 10, 21) }),
    ];
    const grid = createdGrid(notes, NOW);
    expect(grid.weeks[11][3]).toEqual({ key: '2026-10-21', count: 2 });
    expect(grid.weeks[11][2]).toEqual({ key: '2026-10-20', count: 1 });
    expect(grid.weeks[0][0]).toEqual({ key: '2026-08-02', count: 1 });
    expect(grid.max).toBe(2);
    expect(grid.total).toBe(4);
  });

  test('a week containing a DST change still has 7 consecutive days', () => {
    setTZ('America/New_York');
    // Clocks go back on Sun Nov 1 2026
    const grid = createdGrid([note({ createdAt: new Date(2026, 10, 1, 1, 30) })], new Date(2026, 10, 7, 20));
    const last = grid.weeks[11];
    expect(last.map((c) => c?.key)).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ]);
    expect(last[0]?.count).toBe(1);
  });

  test('weekTotals sums each column with its first day', () => {
    const notes = [at(2026, 10, 18), at(2026, 10, 21), at(2026, 10, 21), at(2026, 10, 12)].map((createdAt) => note({ createdAt }));
    const totals = weekTotals(createdGrid(notes, NOW));
    expect(totals).toHaveLength(12);
    expect(totals[11]).toEqual({ start: '2026-10-18', count: 3 });
    expect(totals[10]).toEqual({ start: '2026-10-11', count: 1 });
    expect(totals[0]).toEqual({ start: '2026-08-02', count: 0 });
  });

  test('gridLevel: 0 for none, then quarters of the busiest day', () => {
    expect(gridLevel(0, 0)).toBe(0);
    expect(gridLevel(0, 8)).toBe(0);
    expect(gridLevel(1, 8)).toBe(1);
    expect(gridLevel(2, 8)).toBe(1);
    expect(gridLevel(3, 8)).toBe(2);
    expect(gridLevel(6, 8)).toBe(3);
    expect(gridLevel(8, 8)).toBe(4);
    expect(gridLevel(1, 1)).toBe(4);
  });
});

describe('recentNotes (AC-6)', () => {
  test('up to 5 notes not in Trash, newest first, archived included, id breaking ties', () => {
    const d = at(2026, 10, 1);
    const same = at(2026, 10, 20);
    const notes = [
      note({ id: 'old', updatedAt: at(2026, 9, 1) }),
      note({ id: 'trash', updatedAt: at(2026, 10, 21), deletedAt: d }),
      note({ id: 'arch', updatedAt: at(2026, 10, 19), archivedAt: d }),
      note({ id: 'b', updatedAt: same }),
      note({ id: 'a', updatedAt: same }),
      note({ id: 'new', updatedAt: at(2026, 10, 21, 9) }),
      note({ id: 'legacy', createdAt: EPOCH, updatedAt: EPOCH }),
      locked({ id: 'lock', updatedAt: at(2026, 10, 10) }),
    ];
    expect(recentNotes(notes).map((n) => n.id)).toEqual(['new', 'a', 'b', 'arch', 'lock']);
    expect(recentNotes(notes, 2).map((n) => n.id)).toEqual(['new', 'a']);
    expect(recentNotes([])).toEqual([]);
  });

  test('does not reorder the given list', () => {
    const notes = [note({ id: 'x', updatedAt: at(2026, 1, 1) }), note({ id: 'y', updatedAt: at(2026, 2, 1) })];
    recentNotes(notes);
    expect(notes.map((n) => n.id)).toEqual(['x', 'y']);
  });
});

describe('grid labels and summary (AC-5, AC-10)', () => {
  const NOW = at(2026, 10, 21, 15);

  test('dayLabel formats a day key', () => {
    expect(dayLabel('2026-10-21')).toBe('Wed, Oct 21');
  });

  test('monthLabels marks columns where a new month starts', () => {
    // Columns start Aug 2, 9, …, Aug 30, Sep 6, …, Sep 27, Oct 4, …
    expect(monthLabels(createdGrid([], NOW))).toEqual([
      { column: 0, label: 'Aug' },
      { column: 5, label: 'Sep' },
      { column: 9, label: 'Oct' },
    ]);
  });

  test('the first column is not labelled when the second starts a new month', () => {
    // Columns start Aug 30, Sep 6, …
    const grid = createdGrid([], at(2026, 11, 21));
    expect(grid.weeks[0][0]?.key).toBe('2026-08-30');
    expect(monthLabels(grid)[0]).toEqual({ column: 1, label: 'Sep' });
  });

  test('gridSummary states the total and the busiest day', () => {
    expect(gridSummary(createdGrid([], NOW))).toBe('No notes created in the last 12 weeks.');
    const notes = [at(2026, 10, 3), at(2026, 10, 3), at(2026, 10, 20)].map((createdAt) => note({ createdAt }));
    expect(gridSummary(createdGrid(notes, NOW))).toBe(
      '3 notes created in the last 12 weeks. Busiest day: Sat, Oct 3, 2 notes.',
    );
    expect(gridSummary(createdGrid([note({ createdAt: at(2026, 10, 20) })], NOW))).toBe(
      '1 note created in the last 12 weeks. Busiest day: Tue, Oct 20, 1 note.',
    );
  });
});
