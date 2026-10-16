// The only place that talks to Firestore about notes (ADR 0001)
import {
  addDoc, collection, doc, DocumentData, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp,
  updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Note } from '@/types/note';

// What the editor sends to be saved: the local fields plus the rev they were based on
export type NoteDraft = Pick<Note, 'id' | 'title' | 'content' | 'rev'>;

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

const toDate = (value: unknown) => (value instanceof Timestamp ? value.toDate() : new Date());

// Notes written before CNOTE-5 have no rev and count as rev 0; notes before CNOTE-6 have no deletedAt
export function toNote(id: string, data: DocumentData): Note {
  return {
    id,
    title: data.title,
    content: data.content ?? '',
    rev: data.rev ?? 0,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toDate() : null,
  };
}

// Live list, newest first; returns the unsubscribe function
export function subscribeNotes(onNotes: (notes: Note[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    query(notesRef(), orderBy('updatedAt', 'desc')),
    (snapshot) => onNotes(snapshot.docs.map((d) => toNote(d.id, d.data({ serverTimestamps: 'estimate' })))),
    onError,
  );
}

export async function createNote(): Promise<Note> {
  const data = { title: 'Untitled Note', content: '', rev: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
  const ref = await addDoc(notesRef(), data);
  return toNote(ref.id, data);
}

// Saves one note if nobody else saved it since draft.rev; otherwise keeps both versions.
// A note in Trash still saves and stays in Trash.
export function saveNote(draft: NoteDraft): Promise<SaveResult> {
  return runTransaction(db, async (tx): Promise<SaveResult> => {
    const ref = doc(db, 'notes', draft.id);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return { status: 'gone' };

    const server = toNote(snapshot.id, snapshot.data());
    if (server.rev !== draft.rev) {
      const copyRef = doc(notesRef());
      const copy = {
        title: `${draft.title} (conflict copy)`, content: draft.content, rev: 0,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      };
      tx.set(copyRef, copy);
      return { status: 'conflict', server, copy: toNote(copyRef.id, copy) };
    }

    const rev = draft.rev + 1;
    tx.update(ref, { title: draft.title, content: draft.content, rev, updatedAt: serverTimestamp() });
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
