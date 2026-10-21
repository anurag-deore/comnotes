import { describe, expect, test } from 'vitest';
import { noteView, visibleNotes } from '@/lib/noteViews';

const DAY = new Date('2026-10-01T00:00:00.000Z');
const note = (id: string, { archived = false, trashed = false } = {}) => ({
  id, archivedAt: archived ? DAY : null, deletedAt: trashed ? DAY : null,
});

describe('noteView (CNOTE-17 AC-4)', () => {
  test('a note is in the notes list, Archive or Trash', () => {
    expect(noteView(note('a'))).toBe('notes');
    expect(noteView(note('a', { archived: true }))).toBe('archive');
    expect(noteView(note('a', { trashed: true }))).toBe('trash');
  });

  test('AC-9: Trash wins over Archive', () => {
    expect(noteView(note('a', { archived: true, trashed: true }))).toBe('trash');
  });
});

describe('visibleNotes (CNOTE-17 AC-4, AC-5)', () => {
  const notes = [
    note('live1'), note('arch1', { archived: true }), note('trash1', { trashed: true }),
    note('both', { archived: true, trashed: true }), note('live2'), note('arch2', { archived: true }),
  ];
  const ids = (list: { id: string }[]) => list.map((n) => n.id);

  test('the notes list (the default, for search) hides archived and trashed notes, in order', () => {
    expect(ids(visibleNotes(notes))).toEqual(['live1', 'live2']);
    expect(ids(visibleNotes(notes, 'notes'))).toEqual(['live1', 'live2']);
  });

  test('Archive shows archived notes that are not in Trash', () => {
    expect(ids(visibleNotes(notes, 'archive'))).toEqual(['arch1', 'arch2']);
  });

  test('Trash shows every trashed note, archived ones included', () => {
    expect(ids(visibleNotes(notes, 'trash'))).toEqual(['trash1', 'both']);
  });
});
