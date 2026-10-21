// Notes saved by older versions of ComNotes, and what brings them to the current schema (CNOTE-21).
// Pure apart from the Quill conversion, which needs a DOM (browser, or jsdom in tests).
//
// History of a note document:
//   2025 (initial app): { title, content (Quill HTML), createdAt, updatedAt } with Timestamps
//   CNOTE-5: rev · CNOTE-6: deletedAt · CNOTE-7: encrypted · CNOTE-14: Tiptap HTML
//   CNOTE-21: schemaVersion 2 = every field present and valid, content is editor (Tiptap) HTML
//   CNOTE-17: archivedAt, optional within schemaVersion 2. Missing reads as null (not archived), so a
//     v2 note without it is complete and isn't migrated; new notes write it. No version bump: that
//     would ask every user to run the migration again for a field that changes nothing.
import { Timestamp, type DocumentData } from 'firebase/firestore';
import { sanitizeNoteHtml } from '@/lib/editorContent';

export const SCHEMA_VERSION = 2;

export interface MigrationPatch {
  title?: string;
  content?: string;
  rev?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: null;
  encrypted?: null;
  schemaVersion?: typeof SCHEMA_VERSION;
}

const isTimestamp = (value: unknown): value is Timestamp => value instanceof Timestamp;
const isRev = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isLocked = (data: DocumentData) => data.encrypted != null;
const isNewer = (data: DocumentData) => typeof data.schemaVersion === 'number' && data.schemaVersion > SCHEMA_VERSION;
const isCurrent = (data: DocumentData) => data.schemaVersion === SCHEMA_VERSION;

const EPOCH = new Date(0);

// A missing date falls back to the other one, then to the epoch: stable, so the list order and
// backup duplicate checks don't change from one read to the next
export function noteDates(data: DocumentData): { createdAt: Date; updatedAt: Date } {
  const created = isTimestamp(data.createdAt) ? data.createdAt.toDate() : null;
  const updated = isTimestamp(data.updatedAt) ? data.updatedAt.toDate() : null;
  return { createdAt: created ?? updated ?? EPOCH, updatedAt: updated ?? created ?? EPOCH };
}

// Cheap: field checks only. Content written before schemaVersion 2 may be Quill HTML, so a pre-v2
// note always needs it; v2 content is editor HTML by construction (editor saves, sanitised imports).
export function needsMigration(data: DocumentData): boolean {
  if (isNewer(data)) return false;
  if (!isCurrent(data)) return true;
  if (!isTimestamp(data.createdAt) || !isTimestamp(data.updatedAt)) return true;
  if (!isRev(data.rev)) return true;
  if (data.deletedAt !== null && !isTimestamp(data.deletedAt)) return true;
  if (data.encrypted === undefined) return true;
  return !isLocked(data) && (typeof data.title !== 'string' || typeof data.content !== 'string');
}

// The fields to write so the note is on the current schema, or null when there's nothing to do.
// rev and updatedAt are not bumped: the note reads the same, so open editors must not see a
// conflict and the list order stays. A locked note's title, content and ciphertext are not touched.
export function migrateNoteData(data: DocumentData, now: Date): MigrationPatch | null {
  if (isNewer(data)) return null;
  const patch: MigrationPatch = {};

  if (!isTimestamp(data.createdAt) || !isTimestamp(data.updatedAt)) {
    const fallback = Timestamp.fromDate(now);
    const created = isTimestamp(data.createdAt) ? data.createdAt : null;
    const updated = isTimestamp(data.updatedAt) ? data.updatedAt : null;
    if (!created) patch.createdAt = updated ?? fallback;
    if (!updated) patch.updatedAt = created ?? fallback;
  }
  if (!isRev(data.rev)) patch.rev = 0;
  // A Trash date is kept; anything else that isn't one reads as "not deleted" (see toNote)
  if (data.deletedAt !== null && !isTimestamp(data.deletedAt)) patch.deletedAt = null;
  if (data.encrypted === undefined) patch.encrypted = null;

  if (!isLocked(data)) {
    if (typeof data.title !== 'string') patch.title = '';
    const content = typeof data.content === 'string' ? data.content : '';
    // The editor's own load path: Quill conversion, then the note schema
    const converted = isCurrent(data) ? content : sanitizeNoteHtml(content);
    if (converted !== data.content) patch.content = converted;
  }

  if (!isCurrent(data)) patch.schemaVersion = SCHEMA_VERSION;
  return Object.keys(patch).length > 0 ? patch : null;
}
