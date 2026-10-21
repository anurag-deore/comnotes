// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { SCHEMA_VERSION, migrateNoteData, needsMigration, noteDates } from '@/lib/migration';
import { PBKDF2_ITERATIONS, bytesToBase64, type EncryptedPayload } from '@/lib/noteCrypto';

const ts = (ms: number) => Timestamp.fromMillis(ms);
const NOW = new Date(1_000_000);

const payload = (): EncryptedPayload => ({
  v: 1, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITERATIONS,
  salt: bytesToBase64(new Uint8Array(16).fill(1)),
  iv: bytesToBase64(new Uint8Array(12).fill(2)),
  ct: bytesToBase64(new Uint8Array(40).fill(3)),
});

// A note as this version writes it
const current = (extra: Record<string, unknown> = {}) => ({
  title: 'T', content: '<p>hello</p>', rev: 3, createdAt: ts(1), updatedAt: ts(2), deletedAt: null, encrypted: null,
  schemaVersion: SCHEMA_VERSION, ...extra,
});

// What the original app (initial commit, Quill 1) wrote: no rev, deletedAt, encrypted or schemaVersion
const ORIGINAL = { title: 'Groceries', content: '<p>milk</p>', createdAt: ts(10), updatedAt: ts(20) };

const QUILL1_LISTS =
  '<ul><li>b1</li><li class="ql-indent-1">b1a</li></ul>' +
  '<ul data-checked="true"><li>done</li></ul><ul data-checked="false"><li>todo</li></ul>' +
  '<pre class="ql-syntax" spellcheck="false">line 1\nline 2\n</pre>';
const QUILL2_SEMANTIC =
  '<ul><li data-list="checked">done</li></ul><pre data-language="plain">\nconst a = 1;\n</pre>' +
  '<p class="ql-align-center">two&nbsp;&nbsp;spaces</p>';

describe('needsMigration (AC-2)', () => {
  test('a note in the current schema does not need it', () => {
    expect(needsMigration(current())).toBe(false);
    expect(needsMigration(current({ deletedAt: ts(5) }))).toBe(false);
    expect(needsMigration(current({ title: '', content: '', encrypted: payload() }))).toBe(false);
  });

  test('the original 2025 shape needs it', () => {
    expect(needsMigration(ORIGINAL)).toBe(true);
  });

  test.each([
    ['no schemaVersion', { schemaVersion: undefined }],
    ['schemaVersion 1', { schemaVersion: 1 }],
    ['no updatedAt', { updatedAt: undefined }],
    ['no createdAt', { createdAt: undefined }],
    ['a date that is not a Timestamp', { updatedAt: '2025-04-23T10:00:00Z' }],
    ['no rev', { rev: undefined }],
    ['a negative rev', { rev: -1 }],
    ['a fractional rev', { rev: 1.5 }],
    ['no deletedAt', { deletedAt: undefined }],
    ['a deletedAt that is not a Timestamp', { deletedAt: 'yesterday' }],
    ['no encrypted', { encrypted: undefined }],
    ['a non-string title', { title: 3 }],
    ['no title', { title: undefined }],
    ['no content', { content: undefined }],
  ])('%s needs it', (_label, change) => {
    const data: Record<string, unknown> = current(change);
    for (const [key, value] of Object.entries(change)) if (value === undefined) delete data[key];
    expect(needsMigration(data)).toBe(true);
  });

  test('a locked note is not judged by its (empty) title and content', () => {
    const locked: Record<string, unknown> = current({ encrypted: payload() });
    delete locked.title;
    delete locked.content;
    expect(needsMigration(locked)).toBe(false);
  });

  test('a note from a newer schema is left alone', () => {
    expect(needsMigration({ schemaVersion: SCHEMA_VERSION + 1 })).toBe(false);
  });
});

describe('noteDates (AC-1)', () => {
  test('each date falls back to the other, then to the epoch', () => {
    expect(noteDates({ createdAt: ts(1), updatedAt: ts(2) })).toEqual({ createdAt: new Date(1), updatedAt: new Date(2) });
    expect(noteDates({ createdAt: ts(5) })).toEqual({ createdAt: new Date(5), updatedAt: new Date(5) });
    expect(noteDates({ updatedAt: ts(7) })).toEqual({ createdAt: new Date(7), updatedAt: new Date(7) });
    expect(noteDates({ createdAt: 'x', updatedAt: null })).toEqual({ createdAt: new Date(0), updatedAt: new Date(0) });
  });
});

describe('migrateNoteData (AC-3)', () => {
  test('the original shape gets rev, deletedAt, encrypted and schemaVersion; dates and text stay', () => {
    expect(migrateNoteData(ORIGINAL, NOW)).toEqual({ rev: 0, deletedAt: null, encrypted: null, schemaVersion: 2 });
  });

  test('a missing updatedAt comes from createdAt, and vice versa', () => {
    expect(migrateNoteData({ ...ORIGINAL, updatedAt: undefined }, NOW)).toMatchObject({ updatedAt: ts(10) });
    expect(migrateNoteData({ ...ORIGINAL, createdAt: undefined }, NOW)).toMatchObject({ createdAt: ts(20) });
    const patch = migrateNoteData({ ...ORIGINAL, createdAt: 'nope', updatedAt: undefined }, NOW);
    expect(patch).toMatchObject({ createdAt: ts(NOW.getTime()), updatedAt: ts(NOW.getTime()) });
  });

  test('existing valid fields are not in the patch', () => {
    const patch = migrateNoteData(current({ schemaVersion: undefined }), NOW);
    expect(patch).toEqual({ schemaVersion: 2 });
  });

  test('rev, title and content are repaired', () => {
    expect(migrateNoteData({ ...ORIGINAL, rev: 'x', title: 7, content: null }, NOW)).toMatchObject({
      rev: 0, title: '', content: '',
    });
  });

  test('a trashed note keeps its deletedAt; a bad one reads as not deleted', () => {
    expect(migrateNoteData({ ...ORIGINAL, deletedAt: ts(30) }, NOW)).not.toHaveProperty('deletedAt');
    expect(migrateNoteData({ ...ORIGINAL, deletedAt: 'x' }, NOW)).toMatchObject({ deletedAt: null });
  });

  test('Quill 1 lists, checklists and code become editor HTML', () => {
    const patch = migrateNoteData({ ...ORIGINAL, content: QUILL1_LISTS }, NOW);
    expect(patch?.content).toBeDefined();
    const html = patch!.content!;
    expect(html).not.toMatch(/ql-|data-checked="(true|false)"><li>|spellcheck/);
    expect(html).toContain('<ul><li><p>b1</p><ul><li><p>b1a</p></li></ul></li></ul>');
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('<pre><code>line 1\nline 2</code></pre>');
  });

  test('Quill 2 semantic checklists, code, alignment and nbsp become editor HTML', () => {
    const html = migrateNoteData({ ...ORIGINAL, content: QUILL2_SEMANTIC }, NOW)!.content!;
    expect(html).not.toMatch(/ql-|data-list|data-language/);
    expect(html).toContain('<li data-checked="true" data-type="taskItem">');
    expect(html).toContain('<pre><code>const a = 1;</code></pre>');
    expect(html).toContain('<p style="text-align: center;">two &nbsp;spaces</p>');
  });

  test('editor HTML that is already current is not rewritten', () => {
    const tiptap = '<p>Hi <strong>there</strong></p><ul data-type="taskList"><li data-checked="false" data-type="taskItem">' +
      '<label><input type="checkbox"><span></span></label><div><p>x</p></div></li></ul>';
    const once = migrateNoteData({ ...ORIGINAL, content: tiptap }, NOW)!;
    const html = once.content ?? tiptap;
    expect(migrateNoteData({ ...ORIGINAL, content: html }, NOW)).not.toHaveProperty('content');
  });

  test('scripts and handlers the editor would drop are dropped', () => {
    const html = migrateNoteData({ ...ORIGINAL, content: '<p onclick="x()">a</p><script>alert(1)</script>' }, NOW)!.content;
    expect(html).toBe('<p>a</p>');
  });

  test('a locked note: ciphertext, title and content untouched', () => {
    const encrypted = payload();
    const locked = { title: '', content: '<p class="ql-align-center">x</p>', encrypted, createdAt: ts(1), updatedAt: ts(2) };
    expect(migrateNoteData(locked, NOW)).toEqual({ rev: 0, deletedAt: null, schemaVersion: 2 });
  });

  test('a current note, or one from a newer schema, needs no patch', () => {
    expect(migrateNoteData(current(), NOW)).toBeNull();
    expect(migrateNoteData({ schemaVersion: 3 }, NOW)).toBeNull();
  });

  test('v2 content is not converted again', () => {
    expect(migrateNoteData(current({ content: '<p class="ql-align-center">x</p>' }), NOW)).toBeNull();
  });
});

describe('idempotency (AC-4)', () => {
  test.each([
    ['original', ORIGINAL],
    ['no dates', { title: 'x', content: QUILL1_LISTS }],
    ['quill 2', { ...ORIGINAL, content: QUILL2_SEMANTIC, deletedAt: ts(4) }],
    ['locked', { title: '', content: '', encrypted: payload(), createdAt: ts(1) }],
    ['bad fields', { title: 1, content: 2, rev: -3, deletedAt: 'x', updatedAt: ts(9) }],
  ])('%s: migrating the result again changes nothing', (_label, data) => {
    const migrated = { ...data, ...migrateNoteData(data, NOW) };
    expect(needsMigration(migrated)).toBe(false);
    expect(migrateNoteData(migrated, new Date(NOW.getTime() + 1))).toBeNull();
  });
});
