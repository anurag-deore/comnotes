// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildBackupZip, readBackupText } from '@/lib/backupZip';
import { MAX_BACKUP_BYTES, parseBackup } from '@/lib/backup';
import type { Note } from '@/types/note';

const note = (over: Partial<Note> = {}): Note => ({
  id: 'a', title: 'Plan', content: '<p>hello</p>', rev: 2,
  createdAt: new Date('2026-01-02T03:04:05.006Z'), updatedAt: new Date('2026-02-03T04:05:06.007Z'), deletedAt: null, archivedAt: null,
  locked: false, encrypted: null, ...over,
});

const NOW = new Date('2026-10-21T10:00:00.000Z');

describe('buildBackupZip (AC-2, AC-3, AC-7)', () => {
  const notes = [
    note(),
    note({ id: 'b', title: 'Old', deletedAt: new Date('2026-10-01T00:00:00.000Z'), content: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>' }),
  ];

  test('contains notes.json and the Markdown tree', () => {
    const files = unzipSync(buildBackupZip(notes, NOW));
    expect(Object.keys(files).sort()).toEqual([
      'markdown/assets/old-1.png', 'markdown/plan.md', 'markdown/trash/old.md', 'notes.json',
    ]);
    expect(strFromU8(files['markdown/plan.md'])).toMatch(/^---\ntitle: "Plan"\n[\s\S]*\n---\n\nhello\n$/);
  });

  test('notes.json is the full, pretty-printed backup', () => {
    const json = JSON.parse(strFromU8(unzipSync(buildBackupZip(notes, NOW))['notes.json']));
    expect(json).toMatchObject({ format: 'comnotes-backup', version: 3, exportedAt: '2026-10-21T10:00:00.000Z' });
    expect(json.notes.map((n: { id: string }) => n.id)).toEqual(['a', 'b']);
    expect(json.notes[1].content).toBe(notes[1].content);
  });

  test('an empty account still exports', () => {
    expect(Object.keys(unzipSync(buildBackupZip([], NOW)))).toEqual(['notes.json']);
  });
});

describe('readBackupText (AC-8)', () => {
  test('reads notes.json out of an exported zip, which then parses', () => {
    const result = readBackupText(buildBackupZip([note()], NOW));
    expect(result.ok).toBe(true);
    if (result.ok) expect(parseBackup(result.text)).toMatchObject({ ok: true, notes: [{ title: 'Plan' }] });
  });

  test('reads a plain JSON file and strips a BOM', () => {
    expect(readBackupText(strToU8('﻿{"a":1}'))).toEqual({ ok: true, text: '{"a":1}' });
  });

  test('a zip without notes.json at its root is rejected', () => {
    const zip = zipSync({ 'backup/notes.json': strToU8('{}'), 'other.txt': strToU8('x') });
    expect(readBackupText(zip)).toEqual({ ok: false, error: expect.stringMatching(/no notes\.json/) });
  });

  test('an oversized notes.json inside a zip is rejected without inflating it', () => {
    const zip = zipSync({ 'notes.json': new Uint8Array(MAX_BACKUP_BYTES + 1) }, { level: 9 });
    expect(zip.length).toBeLessThan(MAX_BACKUP_BYTES);
    expect(readBackupText(zip)).toEqual({ ok: false, error: expect.stringMatching(/larger than 20 MB/) });
  });

  test('an oversized file is rejected', () => {
    expect(readBackupText(new Uint8Array(MAX_BACKUP_BYTES + 1))).toEqual({ ok: false, error: expect.stringMatching(/larger than 20 MB/) });
  });

  test('invalid UTF-8 is rejected', () => {
    expect(readBackupText(Uint8Array.of(0x7b, 0xff, 0x7d))).toEqual({ ok: false, error: expect.stringMatching(/isn't valid JSON/) });
  });

  test('a corrupt zip is rejected', () => {
    expect(readBackupText(Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 1, 2, 3))).toEqual({ ok: false, error: expect.stringMatching(/couldn't be read/) });
  });
});
