// Home view metrics (CNOTE-23), computed in the browser from the notes list already loaded.
// Pure: no Firestore, no DOM (HTML-to-text is passed in). Days are the browser's local calendar
// days; see specs/CNOTE-23.md for the exact definitions.
import { noteView } from '@/lib/noteViews';
import type { NoteText } from '@/lib/noteCrypto';
import type { Note } from '@/types/note';

// `YYYY-MM-DD`, local calendar day. Sorts and compares as a string.
export type DayKey = string;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Calendar arithmetic on the key itself (UTC has no DST), so a 23 h or 25 h local day, or a
// transition at midnight, can't skip or repeat a day
const keyToUtc = (key: DayKey) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const utcToKey = (ms: number) => {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export function addDays(key: DayKey, days: number): DayKey {
  return utcToKey(keyToUtc(key) + days * DAY_MS);
}

// 0 = Sunday … 6 = Saturday
const weekday = (key: DayKey) => new Date(keyToUtc(key)).getUTCDay();

// Legacy notes without dates read as the epoch (CNOTE-21): that date is unknown, not 1970
export function isKnownDate(date: Date): boolean {
  const time = date.getTime();
  return Number.isFinite(time) && time > 0;
}

// The day an event happened; a date after now (pending server timestamp, clock skew) is today
const eventDay = (date: Date, now: Date): DayKey => dayKey(date > now ? now : date);

export interface NoteCounts {
  // The main list: not archived, not in Trash
  notes: number;
  archived: number;
  // Locked notes in the main list or Archive
  locked: number;
  trash: number;
}

type Counted = Pick<Note, 'deletedAt' | 'archivedAt' | 'locked'>;

export function noteCounts(notes: readonly Counted[]): NoteCounts {
  const counts: NoteCounts = { notes: 0, archived: 0, locked: 0, trash: 0 };
  for (const note of notes) {
    const view = noteView(note);
    if (view === 'trash') {
      counts.trash++;
      continue;
    }
    if (view === 'archive') counts.archived++;
    else counts.notes++;
    if (note.locked) counts.locked++;
  }
  return counts;
}

// A word is a whitespace-separated run with at least one letter or digit, so "—" or "..." don't count
const WORD = /[\p{L}\p{N}]/u;

export function countWords(text: string): number {
  let words = 0;
  for (const token of text.split(/\s+/)) if (WORD.test(token)) words++;
  return words;
}

export interface WordStats {
  words: number;
  // Notes whose words are included
  counted: number;
  // Locked notes left out because their text isn't decrypted in this session
  excludedLocked: number;
}

type Worded = Pick<Note, 'id' | 'title' | 'content' | 'deletedAt' | 'archivedAt' | 'locked'>;

// Title + content of every note not in Trash. A locked note's stored fields are empty, so it counts
// only through `decrypted` (memory only, CNOTE-7); otherwise it is left out and reported.
export function wordsWritten(
  notes: readonly Worded[],
  decrypted: Readonly<Record<string, NoteText | undefined>>,
  toText: (html: string) => string,
): WordStats {
  const stats: WordStats = { words: 0, counted: 0, excludedLocked: 0 };
  for (const note of notes) {
    if (note.deletedAt !== null) continue;
    const text = note.locked ? decrypted[note.id] : note;
    if (!text) {
      stats.excludedLocked++;
      continue;
    }
    stats.words += countWords(text.title) + countWords(toText(text.content));
    stats.counted++;
  }
  return stats;
}

type Dated = Pick<Note, 'createdAt' | 'updatedAt'>;

// Days on which a note (any view, Trash included) was created or last updated
export function activeDays(notes: readonly Dated[], now: Date): Set<DayKey> {
  const days = new Set<DayKey>();
  for (const note of notes) {
    if (isKnownDate(note.createdAt)) days.add(eventDay(note.createdAt, now));
    if (isKnownDate(note.updatedAt)) days.add(eventDay(note.updatedAt, now));
  }
  return days;
}

export interface Streaks {
  // Consecutive active days ending today, or yesterday while today has no activity yet
  current: number;
  longest: number;
  activeToday: boolean;
}

export function streaks(days: ReadonlySet<DayKey>, now: Date): Streaks {
  const today = dayKey(now);
  const activeToday = days.has(today);
  let current = 0;
  for (let day = activeToday ? today : addDays(today, -1); days.has(day); day = addDays(day, -1)) current++;

  let longest = 0;
  for (const day of days) {
    // Only count from the first day of each run
    if (days.has(addDays(day, -1))) continue;
    let length = 1;
    while (days.has(addDays(day, length))) length++;
    longest = Math.max(longest, length);
  }
  return { current, longest, activeToday };
}

export interface GridCell {
  key: DayKey;
  // Notes created that day
  count: number;
}

export interface CreatedGrid {
  // Columns are weeks (oldest first), rows Sunday to Saturday; days after today are null
  weeks: (GridCell | null)[][];
  // The busiest day's count, for shading
  max: number;
  total: number;
}

export const GRID_WEEKS = 12;

// Notes created per day over the last `weeks` weeks, GitHub-style, today in the last column
export function createdGrid(notes: readonly Dated[], now: Date, weeks = GRID_WEEKS): CreatedGrid {
  const today = dayKey(now);
  const lastStart = addDays(today, -weekday(today));
  const firstDay = addDays(lastStart, -7 * (weeks - 1));

  const created = new Map<DayKey, number>();
  for (const note of notes) {
    if (!isKnownDate(note.createdAt)) continue;
    const key = eventDay(note.createdAt, now);
    if (key < firstDay) continue;
    created.set(key, (created.get(key) ?? 0) + 1);
  }

  let max = 0;
  let total = 0;
  const columns = Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day): GridCell | null => {
      const key = addDays(firstDay, week * 7 + day);
      if (key > today) return null;
      const count = created.get(key) ?? 0;
      max = Math.max(max, count);
      total += count;
      return { key, count };
    }),
  );
  return { weeks: columns, max, total };
}

export interface WeekTotal {
  // The week's Sunday
  start: DayKey;
  count: number;
}

export function weekTotals(grid: CreatedGrid): WeekTotal[] {
  return grid.weeks.map((week) => ({
    start: week[0]?.key ?? '',
    count: week.reduce((sum, cell) => sum + (cell?.count ?? 0), 0),
  }));
}

export type GridLevel = 0 | 1 | 2 | 3 | 4;

// 0 for no notes, else 1–4 by quarter of the busiest day
export function gridLevel(count: number, max: number): GridLevel {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4)) as GridLevel;
}

type Recent = Pick<Note, 'id' | 'updatedAt' | 'deletedAt'>;

// The most recently updated notes not in Trash (Archive included), newest first
export function recentNotes<T extends Recent>(notes: readonly T[], limit = 5): T[] {
  return notes
    .filter((note) => note.deletedAt === null)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}

// A day key as a local Date (noon, so it is that day in every time zone rule), for display
export function keyToDate(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const monthName = (key: DayKey) => keyToDate(key).toLocaleDateString('en-US', { month: 'short' });

// "Wed, Oct 21"
export function dayLabel(key: DayKey): string {
  return keyToDate(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Month names over the grid's columns: where a week starts a new month. The first column is only
// labelled if the next one doesn't start another month, so two labels never overlap.
export function monthLabels(grid: CreatedGrid): { column: number; label: string }[] {
  const months = grid.weeks.map((week) => (week[0] ? monthName(week[0].key) : ''));
  return months.flatMap((label, column) => {
    const shows = column === 0 ? months[1] === label : months[column - 1] !== label;
    return shows && label ? [{ column, label }] : [];
  });
}

// One sentence for screen readers and the caption above the grid
export function gridSummary(grid: CreatedGrid): string {
  const weeks = grid.weeks.length;
  if (grid.total === 0) return `No notes created in the last ${weeks} weeks.`;
  const busiest = grid.weeks.flat().find((cell) => cell !== null && cell.count === grid.max);
  const peak = busiest ? ` Busiest day: ${dayLabel(busiest.key)}, ${plural(grid.max, 'note', 'notes')}.` : '';
  return `${plural(grid.total, 'note', 'notes')} created in the last ${weeks} weeks.${peak}`;
}
