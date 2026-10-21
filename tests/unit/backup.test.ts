import { describe, expect, test } from 'vitest';
import {
  BACKUP_FORMAT, BACKUP_VERSION, MAX_BACKUP_BYTES, MAX_BACKUP_NOTES, backupFileName, buildBackup, chunkBatches,
  parseBackup, planImport, type BackupNote, type ImportedNote,
} from '@/lib/backup';
import type { Note } from '@/types/note';

const note = (over: Partial<Note> = {}): Note => ({
  id: 'a', title: 'Shopping', content: '<p>milk</p>', rev: 3,
  createdAt: new Date('2026-01-02T03:04:05.006Z'), updatedAt: new Date('2026-02-03T04:05:06.007Z'), deletedAt: null,
  ...over,
});

const backupNote = (over: Partial<BackupNote> = {}): BackupNote => ({
  id: 'a', title: 'Shopping', content: '<p>milk</p>', rev: 3,
  createdAt: '2026-01-02T03:04:05.006Z', updatedAt: '2026-02-03T04:05:06.007Z', deletedAt: null,
  ...over,
});

const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '2026-10-21T00:00:00.000Z', notes: [backupNote()], ...over });

const imported = (over: Partial<ImportedNote> = {}): ImportedNote => ({
  title: 'Shopping', content: '<p>milk</p>',
  createdAt: new Date('2026-01-02T03:04:05.006Z'), updatedAt: new Date('2026-02-03T04:05:06.007Z'), deletedAt: null,
  ...over,
});

const expectError = (text: string, message: RegExp) => {
  const result = parseBackup(text);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(message);
};

describe('buildBackup / parseBackup', () => {
  test('AC-3: the backup has the format header and every note with ISO dates, Trash included', () => {
    const now = new Date('2026-10-21T10:00:00.000Z');
    const trashed = note({ id: 'b', title: 'Old', deletedAt: new Date('2026-10-01T00:00:00.000Z') });
    const backup = buildBackup([note(), trashed], now);

    expect(backup).toEqual({
      format: 'comnotes-backup', version: 1, exportedAt: '2026-10-21T10:00:00.000Z',
      notes: [backupNote(), backupNote({ id: 'b', title: 'Old', deletedAt: '2026-10-01T00:00:00.000Z' })],
    });
  });

  test('AC-3/AC-9: build → JSON → parse round-trips every field but the id and rev', () => {
    const notes = [
      note({ content: '<ul><li data-list="checked">legacy quill</li></ul>' }),
      note({ id: 'b', title: '', content: '', rev: 0, deletedAt: new Date('2026-10-01T00:00:00.000Z') }),
    ];
    const result = parseBackup(JSON.stringify(buildBackup(notes, new Date())));
    expect(result).toEqual({
      ok: true,
      invalid: 0,
      notes: notes.map(({ title, content, createdAt, updatedAt, deletedAt }) => ({ title, content, createdAt, updatedAt, deletedAt })),
    });
  });

  test('AC-3: content is kept byte for byte', () => {
    const content = '<p class="ql-align-center">a&nbsp;b <script>x</script></p>';
    expect(buildBackup([note({ content })], new Date()).notes[0].content).toBe(content);
  });
});

describe('parseBackup rejects bad files (AC-8)', () => {
  test('not JSON', () => expectError('{nope', /isn't valid JSON/));
  test('not an object', () => expectError('[]', /isn't a ComNotes backup/));
  test('null', () => expectError('null', /isn't a ComNotes backup/));
  test('wrong format', () => expectError(file({ format: 'other-app' }), /isn't a ComNotes backup/));
  test('missing format', () => expectError(JSON.stringify({ version: 1, exportedAt: '2026-10-21T00:00:00.000Z', notes: [] }), /isn't a ComNotes backup/));
  test('newer version', () => expectError(file({ version: 2 }), /version 2 isn't supported/));
  test('version as a string', () => expectError(file({ version: '1' }), /version isn't supported/));
  test('unknown top-level key', () => expectError(file({ extra: true }), /unexpected fields/));
  test('notes not an array', () => expectError(file({ notes: {} }), /damaged/));
  test('bad exportedAt', () => expectError(file({ exportedAt: 'yesterday' }), /damaged/));
  test('too many notes', () =>
    expectError(file({ notes: Array.from({ length: MAX_BACKUP_NOTES + 1 }, () => backupNote()) }), /more than 10,000 notes/));
  test('oversized text', () => expectError(' '.repeat(MAX_BACKUP_BYTES + 1), /larger than 20 MB/));

  test.each(['__proto__', 'constructor', 'prototype'])('%s key at the top level', (key) =>
    expectError(file().replace('{', `{"${key}":{"polluted":true},`), /disallowed keys/));

  test.each(['__proto__', 'constructor', 'prototype'])('%s key inside a note', (key) =>
    expectError(file({ notes: [JSON.parse(JSON.stringify(backupNote()).replace('{', `{"${key}":{"x":1},`))] }), /disallowed keys/));

  test('nothing is polluted by a __proto__ key', () => {
    parseBackup(file().replace('{', '{"__proto__":{"polluted":true},'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('parseBackup per-note validation (AC-9)', () => {
  test.each([
    ['title not a string', { title: 5 }],
    ['content not a string', { content: null }],
    ['negative rev', { rev: -1 }],
    ['fractional rev', { rev: 1.5 }],
    ['id missing', { id: undefined }],
    ['id not a string', { id: 7 }],
    ['createdAt not ISO', { createdAt: '2026-01-02' }],
    ['updatedAt impossible date', { updatedAt: '2026-02-30T00:00:00.000Z' }],
    ['deletedAt a number', { deletedAt: 0 }],
    ['an extra key', { color: 'red' }],
    ['too big', { content: 'x'.repeat(1_000_001) }],
  ])('%s → counted invalid, the valid note still imports', (_, over) => {
    const bad = { ...backupNote(), ...over };
    const result = parseBackup(file({ notes: [bad, backupNote({ title: 'Good' })] }));
    expect(result).toMatchObject({ ok: true, invalid: 1, notes: [{ title: 'Good' }] });
  });

  test('a note that is not an object is invalid', () => {
    expect(parseBackup(file({ notes: ['x', null, [], backupNote()] }))).toMatchObject({ ok: true, invalid: 3 });
  });

  test('ISO dates without milliseconds are accepted', () => {
    const result = parseBackup(file({ notes: [backupNote({ createdAt: '2026-01-02T03:04:05Z' })] }));
    expect(result).toMatchObject({ ok: true, invalid: 0, notes: [{ createdAt: new Date('2026-01-02T03:04:05Z') }] });
  });
});

describe('planImport (AC-12)', () => {
  const sanitize = (html: string) => html.replace(/<script>.*?<\/script>/g, '');

  test('content is sanitised and new notes are planned', () => {
    const plan = planImport([imported({ content: '<p>hi</p><script>x</script>' })], [], sanitize);
    expect(plan).toEqual({ create: [imported({ content: '<p>hi</p>' })], duplicates: 0 });
  });

  test('an existing note with the same title, createdAt and content is skipped', () => {
    expect(planImport([imported()], [note()], sanitize)).toEqual({ create: [], duplicates: 1 });
  });

  test('an existing note matching the sanitised content (an earlier import) is skipped', () => {
    const plan = planImport([imported({ content: '<p>milk</p><script>x</script>' })], [note()], sanitize);
    expect(plan.duplicates).toBe(1);
  });

  test('existing notes in Trash count as well', () => {
    expect(planImport([imported()], [note({ deletedAt: new Date() })], sanitize).duplicates).toBe(1);
  });

  test('a repeat inside the same file is skipped', () => {
    expect(planImport([imported(), imported()], [], sanitize)).toEqual({ create: [imported()], duplicates: 1 });
  });

  test.each([
    ['title', { title: 'Shopping 2' }],
    ['createdAt', { createdAt: new Date('2026-01-02T03:04:05.007Z') }],
    ['content', { content: '<p>eggs</p>' }],
  ])('a different %s is not a duplicate', (_, over) => {
    expect(planImport([imported(over)], [note()], sanitize).create).toHaveLength(1);
  });
});

describe('backupFileName (AC-2)', () => {
  test('uses the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('comnotes-backup-2026-01-05.zip');
    expect(backupFileName(new Date(2026, 11, 31, 0, 0))).toBe('comnotes-backup-2026-12-31.zip');
  });
});

describe('chunkBatches (AC-14)', () => {
  test('splits by count', () => {
    const chunks = chunkBatches(Array.from({ length: 1001 }, (_, i) => i), () => 1);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 1]);
  });

  test('splits by size, and an item bigger than the limit gets a batch of its own', () => {
    expect(chunkBatches([4, 4, 4, 20, 1], (n) => n, 500, 10)).toEqual([[4, 4], [4], [20], [1]]);
  });

  test('nothing in, nothing out', () => {
    expect(chunkBatches([], () => 1)).toEqual([]);
  });
});
