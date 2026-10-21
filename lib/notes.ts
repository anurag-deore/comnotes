// The only place that talks to Firestore about notes (ADR 0001)
import {
  addDoc, collection, doc, DocumentData, getDocs, onSnapshot, runTransaction, serverTimestamp, Timestamp,
  updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { chunkBatches, utf8Length, type ImportedNote } from '@/lib/backup';
import { SCHEMA_VERSION, migrateNoteData, needsMigration, noteDates } from '@/lib/migration';
import { isEncryptedPayload, type EncryptedPayload, type NoteText } from '@/lib/noteCrypto';
import type { Note, SealedText } from '@/types/note';

// What the editor sends to be saved: the local fields plus the rev they were based on. A locked
// note's draft is encrypted before it gets here (CNOTE-7): title and content are '' and the text
// is in `sealed`, so the autosaver never holds or writes the plaintext.
export type NoteDraft = Pick<Note, 'id' | 'title' | 'content' | 'rev'> & { sealed?: SealedText };

// Re-encrypts a locked note's text for another note id (lib/vault.ts); throws without the key
export interface NoteKeys {
  reseal(payload: EncryptedPayload, fromId: string, toId: string, edit?: (text: NoteText) => NoteText): Promise<EncryptedPayload>;
}

export type SaveResult =
  | { status: 'saved'; rev: number }
  | { status: 'conflict'; server: Note; copy: Note }
  // The note was deleted for good, so there is nothing left to save to
  | { status: 'gone' };

// Notes in Trash longer than this are deleted for good when the list loads
export const TRASH_DAYS = 30;
// Firestore's limit on writes per batch
const BATCH_LIMIT = 500;

const notesRef = () => collection(db, 'notes');

// Notes written before CNOTE-5 have no rev and count as rev 0; notes before CNOTE-6 have no deletedAt.
// A missing date falls back to the other one, then to the epoch (CNOTE-21).
// A locked note shows no title or content outside its ciphertext, even if a stray one is stored.
export function toNote(id: string, data: DocumentData): Note {
  const locked = data.encrypted != null;
  return {
    id,
    title: !locked && typeof data.title === 'string' ? data.title : '',
    content: locked ? '' : (data.content ?? ''),
    rev: data.rev ?? 0,
    ...noteDates(data),
    deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toDate() : null,
    locked,
    encrypted: locked && isEncryptedPayload(data.encrypted) ? data.encrypted : null,
  };
}

// The stored fields of a locked note: nothing readable outside the ciphertext
const lockedFields = (payload: EncryptedPayload) => ({ title: '', content: '', encrypted: payload });
const plainFields = (title: string, content: string) => ({ title, content, encrypted: null });
// What every new note starts with besides its text and dates: the whole current schema (CNOTE-21)
const newNoteFields = { rev: 0, deletedAt: null, schemaVersion: SCHEMA_VERSION } as const;

function resealer(keys: NoteKeys | undefined) {
  if (!keys) throw new Error('A locked note needs its key to be copied');
  return keys;
}

const conflictTitle = (title: string) => `${title} (conflict copy)`;

// Newest first; the id keeps notes edited at the same moment in a stable order
const compareNotes = (a: Note, b: Note) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Live list, newest first; returns the unsubscribe function. The whole collection, sorted here:
// a query ordered by updatedAt would leave out older documents that don't have it (CNOTE-21).
export function subscribeNotes(onNotes: (notes: Note[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    notesRef(),
    (snapshot) => onNotes(snapshot.docs.map((d) => toNote(d.id, d.data({ serverTimestamps: 'estimate' }))).sort(compareNotes)),
    onError,
  );
}

// Every document's id and data in one read, no orderBy (see subscribeNotes). A pending server
// timestamp reads as its estimate, so a note being saved doesn't look like it has no date.
async function readAllNotes() {
  const snapshot = await getDocs(notesRef());
  return snapshot.docs.map((d) => ({ id: d.id, data: d.data({ serverTimestamps: 'estimate' }) }));
}

// Every note, Trash and older documents included, for a backup
export async function fetchAllNotes(): Promise<Note[]> {
  return (await readAllNotes()).map(({ id, data }) => toNote(id, data));
}

// A note saved by an older version, and the rev it had when it was found
export interface LegacyNote {
  id: string;
  rev: unknown;
}

// Notes that aren't on the current schema yet (CNOTE-21)
export async function findLegacyNotes(): Promise<LegacyNote[]> {
  return (await readAllNotes()).filter(({ data }) => needsMigration(data)).map(({ id, data }) => ({ id, rev: data.rev }));
}

export type MigrateOutcome = 'updated' | 'changed' | 'gone' | 'current';

// Brings one note to the current schema, unless it was edited (rev changed) or deleted since it
// was found. The patch comes from the fresh read, so nothing written meanwhile is undone.
export function migrateNote(id: string, rev: unknown, now: Date): Promise<MigrateOutcome> {
  return runTransaction(db, async (tx): Promise<MigrateOutcome> => {
    const ref = doc(db, 'notes', id);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return 'gone';
    const data = snapshot.data();
    if (data.rev !== rev) return 'changed';
    const patch = migrateNoteData(data, now);
    if (!patch) return 'current';
    tx.update(ref, patch);
    return 'updated';
  });
}

export interface MigrationResult {
  updated: number;
  // Edited, deleted or already updated meanwhile
  skipped: number;
  failed: number;
}

// Notes migrated at once: quick for a few hundred notes without flooding the connection
const MIGRATION_CONCURRENCY = 5;

// Migrates the notes findLegacyNotes found, each in its own transaction. Never throws.
export async function migrateNotes(
  legacy: LegacyNote[], now = new Date(), onProgress?: (done: number) => void,
): Promise<MigrationResult> {
  const result: MigrationResult = { updated: 0, skipped: 0, failed: 0 };
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < legacy.length) {
      const { id, rev } = legacy[next++];
      try {
        const outcome = await migrateNote(id, rev, now);
        if (outcome === 'updated') result.updated += 1;
        else result.skipped += 1;
      } catch (error) {
        console.error('Error updating note:', error);
        result.failed += 1;
      }
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MIGRATION_CONCURRENCY, legacy.length) }, worker));
  return result;
}

// Thrown when an import stops part-way; the batches before it were written
export class ImportError extends Error {
  constructor(readonly written: number, options?: ErrorOptions) {
    super(`Import stopped after ${written} notes`, options);
    this.name = 'ImportError';
  }
}

// Writes notes from a backup as new documents (new ids, rev 0, the backup's timestamps).
// Never touches existing notes. Resolves to how many were written.
export async function importNotes(notes: ImportedNote[], onProgress?: (written: number) => void) {
  let written = 0;
  // Approximate bytes per write, so a batch stays under Firestore's request size limit
  const sizeOf = (note: ImportedNote) =>
    utf8Length(note.title) + utf8Length(note.content) + (note.sealed?.payload.ct.length ?? 0) + 300;
  const chunks = chunkBatches(notes, sizeOf, BATCH_LIMIT);
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    // A locked note keeps its id: its ciphertext is bound to it (CNOTE-7)
    chunk.forEach((note) => batch.set(note.sealed ? doc(db, 'notes', note.sealed.noteId) : doc(notesRef()), {
      ...(note.sealed ? lockedFields(note.sealed.payload) : plainFields(note.title, note.content)),
      rev: 0,
      createdAt: Timestamp.fromDate(note.createdAt),
      updatedAt: Timestamp.fromDate(note.updatedAt),
      deletedAt: note.deletedAt ? Timestamp.fromDate(note.deletedAt) : null,
      schemaVersion: SCHEMA_VERSION,
    }));
    try {
      await batch.commit();
    } catch (error) {
      throw new ImportError(written, { cause: error });
    }
    written += chunk.length;
    onProgress?.(written);
  }
  return written;
}

export async function createNote(): Promise<Note> {
  const data = { ...plainFields('Untitled Note', ''), ...newNoteFields, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
  const ref = await addDoc(notesRef(), data);
  return toNote(ref.id, data);
}

// Saves one note if nobody else saved it since draft.rev; otherwise keeps both versions.
// A note in Trash still saves and stays in Trash. A locked note's draft is written as the
// ciphertext it carries; its conflict copy is re-encrypted for the copy (CNOTE-7), which needs
// `keys`: without them the save throws and is retried, it never falls back to plaintext.
// A plain draft clears `encrypted`, which is how Remove lock is saved. The update doesn't stamp
// schemaVersion: it doesn't fill in an older note's other fields, so that note stays visible to the
// migration (CNOTE-21); a current note stays current.
export function saveNote(draft: NoteDraft, keys?: NoteKeys): Promise<SaveResult> {
  const { sealed } = draft;
  return runTransaction(db, async (tx): Promise<SaveResult> => {
    const ref = doc(db, 'notes', draft.id);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return { status: 'gone' };

    const server = toNote(snapshot.id, snapshot.data());
    if (server.rev !== draft.rev) {
      const copyRef = doc(notesRef());
      const now = Timestamp.now();
      const text = sealed
        ? lockedFields(await resealer(keys).reseal(sealed.payload, sealed.noteId, copyRef.id, (t) => ({ ...t, title: conflictTitle(t.title) })))
        : plainFields(conflictTitle(draft.title), draft.content);
      tx.set(copyRef, { ...text, ...newNoteFields, createdAt: now, updatedAt: now });
      const copy: Note = {
        id: copyRef.id, title: text.title, content: text.content, rev: 0, createdAt: now.toDate(), updatedAt: now.toDate(),
        deletedAt: null, locked: !!sealed, encrypted: text.encrypted,
      };
      return { status: 'conflict', server, copy };
    }

    const rev = draft.rev + 1;
    let fields;
    if (!sealed) fields = plainFields(draft.title, draft.content);
    else if (sealed.noteId === draft.id) fields = lockedFields(sealed.payload);
    // Edits the saver moved to a conflict copy were encrypted for the original note
    else fields = lockedFields(await resealer(keys).reseal(sealed.payload, sealed.noteId, draft.id));
    tx.update(ref, { ...fields, rev, updatedAt: serverTimestamp() });
    return { status: 'saved', rev };
  });
}

// Soft delete; rev and updatedAt stay as they are so open editors don't conflict
export function trashNote(id: string) {
  return updateDoc(doc(db, 'notes', id), { deletedAt: serverTimestamp() });
}

export function restoreNote(id: string) {
  return updateDoc(doc(db, 'notes', id), { deletedAt: null });
}

export async function deleteNotesForever(ids: string[]) {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ids.slice(i, i + BATCH_LIMIT).forEach((id) => batch.delete(doc(db, 'notes', id)));
    await batch.commit();
  }
}

// No server to schedule this, so the client purges old trash; resolves to how many were deleted
export async function purgeExpiredTrash(notes: Note[], now = new Date()) {
  const cutoff = now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000;
  const expired = notes.filter((note) => note.deletedAt && note.deletedAt.getTime() < cutoff).map((note) => note.id);
  await deleteNotesForever(expired);
  return expired.length;
}
