import { describe, expect, test } from 'vitest';
import { fuzzyScore, paletteCommands } from '@/lib/commandPalette';
import { COMMANDS, type CommandState } from '@/lib/shortcuts';
import { oppositeTheme } from '@/lib/theme';

const NO_NOTE: CommandState = { hasNote: false, noteArchived: false, noteLocked: false, noteReadable: false };
const OPEN_NOTE: CommandState = { hasNote: true, noteArchived: false, noteLocked: false, noteReadable: true };
const labels = (query: string, state: CommandState = OPEN_NOTE) => paletteCommands(COMMANDS, query, state).map((c) => c.label);

describe('fuzzyScore (AC-5)', () => {
  test('prefix > word start > substring > subsequence > no match', () => {
    const prefix = fuzzyScore('new', 'New note');
    const wordStart = fuzzyScore('note', 'New note');
    const substring = fuzzyScore('ote', 'New note');
    const subsequence = fuzzyScore('nwnt', 'New note');
    expect(prefix).not.toBeNull();
    expect(prefix!).toBeGreaterThan(wordStart!);
    expect(wordStart!).toBeGreaterThan(substring!);
    expect(substring!).toBeGreaterThan(subsequence!);
    expect(fuzzyScore('xyz', 'New note')).toBeNull();
  });

  test('case-insensitive, ignores surrounding space, empty matches everything', () => {
    expect(fuzzyScore('  NEW ', 'new note')).toEqual(fuzzyScore('new', 'New note'));
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  test('every word of the query has to match', () => {
    expect(fuzzyScore('new note', 'New note')).not.toBeNull();
    expect(fuzzyScore('new trash', 'New note')).toBeNull();
  });
});

describe('paletteCommands (AC-5)', () => {
  test('empty query lists every available command in registry order, without the palette itself', () => {
    const all = labels('');
    expect(all).not.toContain('Open command palette');
    expect(all[0]).toBe('Search notes');
    expect(all).toEqual(COMMANDS.filter((c) => c.inPalette !== false).map((c) => c.paletteLabel?.(OPEN_NOTE) ?? c.label));
  });

  test('commands needing an open note are hidden without one', () => {
    const all = labels('', NO_NOTE);
    expect(all).not.toContain('Archive note');
    expect(all).not.toContain('Move note to Trash');
    expect(all).not.toContain('Lock note');
    expect(all).toContain('New note');
  });

  test('labels follow the open note', () => {
    expect(labels('', { ...OPEN_NOTE, noteArchived: true })).toContain('Unarchive note');
    expect(labels('', { ...OPEN_NOTE, noteLocked: true })).toContain('Remove lock');
  });

  test('filters and ranks by score, ties keep registry order', () => {
    expect(labels('new')[0]).toBe('New note');
    expect(labels('trash')).toEqual(['Show Trash', 'Move note to Trash']);
    expect(labels('zzz')).toEqual([]);
    expect(labels('settings')).toEqual(['Open settings']);
  });

  test('keywords match too, below a label match', () => {
    expect(labels('delete')).toEqual(['Move note to Trash']);
    expect(labels('dark')).toEqual(['Toggle light/dark theme']);
    expect(labels('logout')).toEqual(['Lock ComNotes']);
    expect(labels('backup')).toEqual(['Open settings']);
  });
});

describe('oppositeTheme (AC-3)', () => {
  test('flips the shown theme', () => {
    expect(oppositeTheme('light')).toBe('dark');
    expect(oppositeTheme('dark')).toBe('light');
  });
});
