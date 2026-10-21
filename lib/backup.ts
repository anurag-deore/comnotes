// The backup file format (CNOTE-19): a lossless JSON dump of every note, and the strict
// checks an imported file has to pass. Pure: no Firestore, no DOM.
import { isEncryptedPayload, type EncryptedPayload } from '@/lib/noteCrypto';
import type { Note, SealedText } from '@/types/note';

export const BACKUP_FORMAT = 'comnotes-backup';
// Version 2 (CNOTE-7) adds `encrypted` to every note; version 1 files still import
export const BACKUP_VERSION = 2;
const READABLE_VERSIONS = [1, 2];
// Larger files (or a notes.json that unzips larger) are refused before parsing
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_NOTES = 10_000;
// Firestore stores at most 1 MiB per document; leave room for the other fields
const MAX_NOTE_BYTES = 1_000_000;

export interface BackupNote {
  id: string;
  title: string;
  // Raw HTML exactly as stored (legacy notes: Quill HTML)
  content: string;
  rev: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // A locked note's ciphertext (title and content are then ''); null for a plain note
  encrypted: EncryptedPayload | null;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  notes: BackupNote[];
}

// A note read from a backup, ready to be written as a new note. A locked one keeps its id,
// because its ciphertext is bound to it.
export type ImportedNote = Pick<Note, 'title' | 'content' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  sealed: SealedText | null;
};

export type ParseResult = { ok: true; notes: ImportedNote[]; invalid: number } | { ok: false; error: string };

export const ERRORS = {
  tooLarge: 'This file is larger than 20 MB.',
  notJson: "This file isn't valid JSON.",
  notBackup: "This file isn't a ComNotes backup.",
  disallowedKeys: "This backup contains disallowed keys and can't be imported.",
  unexpectedFields: "This backup has unexpected fields and can't be imported.",
  damaged: 'This backup is incomplete or damaged.',
  tooManyNotes: 'This backup has more than 10,000 notes.',
} as const;

const BACKUP_KEYS = ['format', 'version', 'exportedAt', 'notes'];
const NOTE_KEYS_V1 = ['id', 'title', 'content', 'rev', 'createdAt', 'updatedAt', 'deletedAt'];
const NOTE_KEYS_V2 = [...NOTE_KEYS_V1, 'encrypted'];
// A Firestore document id: no slashes or dots, not __reserved__
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const RESERVED_ID = /^__.*__$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const toBackupNote = (note: Note): BackupNote => ({
  id: note.id,
  title: note.title,
  content: note.content,
  rev: note.rev,
  createdAt: note.createdAt.toISOString(),
  updatedAt: note.updatedAt.toISOString(),
  deletedAt: note.deletedAt ? note.deletedAt.toISOString() : null,
  encrypted: note.encrypted,
});

// Locked notes go in as ciphertext, never decrypted. One whose payload this version can't read
// is left out: without it the entry would import as an empty plain note.
export function buildBackup(notes: Note[], now: Date): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    notes: notes.filter((note) => !note.locked || note.encrypted).map(toBackupNote),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

// comnotes-backup-YYYY-MM-DD.zip, in local time
export function backupFileName(date: Date): string {
  return `comnotes-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Exactly these keys, no more, no fewer
const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isPlainObject(value)) return false;
  return Object.keys(value).some((key) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(value[key]));
}

// A strict ISO-8601 UTC timestamp that names a real moment (no 30 February)
function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19) === value.slice(0, 19) ? date : null;
}

export const utf8Length = (text: string) => new TextEncoder().encode(text).length;

function parseNote(value: unknown, version: number): ImportedNote | null {
  if (!isPlainObject(value) || !hasExactKeys(value, version === 1 ? NOTE_KEYS_V1 : NOTE_KEYS_V2)) return null;
  const { id, title, content, rev, deletedAt } = value;
  if (typeof id !== 'string' || id === '' || typeof title !== 'string' || typeof content !== 'string') return null;
  if (typeof rev !== 'number' || !Number.isSafeInteger(rev) || rev < 0) return null;
  const createdAt = parseIsoDate(value.createdAt);
  const updatedAt = parseIsoDate(value.updatedAt);
  const deleted = deletedAt === null ? null : parseIsoDate(deletedAt);
  if (!createdAt || !updatedAt || (deletedAt !== null && !deleted)) return null;
  if (utf8Length(title) + utf8Length(content) > MAX_NOTE_BYTES) return null;
  const encrypted = value.encrypted ?? null;
  if (encrypted === null) return { title, content, createdAt, updatedAt, deletedAt: deleted, sealed: null };
  // Locked: only ciphertext, and an id it can be written back under
  if (!isEncryptedPayload(encrypted) || title !== '' || content !== '') return null;
  if (!DOC_ID.test(id) || RESERVED_ID.test(id)) return null;
  return { title, content, createdAt, updatedAt, deletedAt: deleted, sealed: { noteId: id, payload: encrypted } };
}

// Whole-file problems reject the file; a bad note is counted and skipped
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: ERRORS.tooLarge };

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: ERRORS.notJson };
  }

  if (!isPlainObject(value) || value.format !== BACKUP_FORMAT) return { ok: false, error: ERRORS.notBackup };
  if (hasForbiddenKey(value)) return { ok: false, error: ERRORS.disallowedKeys };
  const { version } = value;
  if (typeof version !== 'number' || !READABLE_VERSIONS.includes(version)) {
    const named = typeof version === 'number' && Number.isSafeInteger(version) ? ` ${version}` : '';
    return { ok: false, error: `This backup's version${named} isn't supported.` };
  }
  if (!hasExactKeys(value, BACKUP_KEYS)) return { ok: false, error: ERRORS.unexpectedFields };
  if (!Array.isArray(value.notes) || !parseIsoDate(value.exportedAt)) return { ok: false, error: ERRORS.damaged };
  if (value.notes.length > MAX_BACKUP_NOTES) return { ok: false, error: ERRORS.tooManyNotes };

  const notes: ImportedNote[] = [];
  let invalid = 0;
  for (const raw of value.notes) {
    const note = parseNote(raw, version);
    if (note) notes.push(note);
    else invalid += 1;
  }
  return { ok: true, notes, invalid };
}

const duplicateKey = (title: string, createdAt: Date, content: string) =>
  JSON.stringify([title, createdAt.getTime(), content]);

// New notes to write, with content run through `sanitize` (the editor's load path). A note
// is a duplicate when an existing note, or one earlier in the file, has the same title,
// createdAt and content (raw or sanitised, so a second import of the same backup adds nothing).
// A locked note is written under its own id, so it is a duplicate when that id is taken: import
// never overwrites. Its ciphertext isn't sanitised (it isn't HTML).
export function planImport(imported: ImportedNote[], existing: Note[], sanitize: (html: string) => string) {
  const seen = new Set(existing.map((note) => duplicateKey(note.title, note.createdAt, note.content)));
  const ids = new Set(existing.map((note) => note.id));
  const create: ImportedNote[] = [];
  let duplicates = 0;
  for (const note of imported) {
    if (note.sealed) {
      if (ids.has(note.sealed.noteId)) duplicates += 1;
      else {
        ids.add(note.sealed.noteId);
        create.push(note);
      }
      continue;
    }
    const content = sanitize(note.content);
    const raw = duplicateKey(note.title, note.createdAt, note.content);
    const clean = duplicateKey(note.title, note.createdAt, content);
    if (seen.has(raw) || seen.has(clean)) {
      duplicates += 1;
      continue;
    }
    seen.add(raw).add(clean);
    create.push({ ...note, content });
  }
  return { create, duplicates };
}

// Splits writes into Firestore batches: at most maxCount writes and about maxBytes each
// (a request is capped at 10 MiB). An item over maxBytes gets a batch of its own.
export function chunkBatches<T>(items: T[], sizeOf: (item: T) => number, maxCount = 500, maxBytes = 8_000_000): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = sizeOf(item);
    if (current.length > 0 && (current.length >= maxCount || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
