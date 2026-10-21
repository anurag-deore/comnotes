// Which sidebar view a note belongs to (CNOTE-17). Pure: no Firestore, no DOM.
// Trash wins: an archived note moved to Trash shows only in Trash, and keeps archivedAt so
// restoring it puts it back in Archive.
import type { Note } from '@/types/note';

export type NoteView = 'notes' | 'archive' | 'trash';

type Placed = Pick<Note, 'deletedAt' | 'archivedAt'>;

export function noteView(note: Placed): NoteView {
  if (note.deletedAt !== null) return 'trash';
  return note.archivedAt !== null ? 'archive' : 'notes';
}

// The notes shown in one view, in the order given. The default, the main list, is also what
// search (CNOTE-18) looks through, so archived and trashed notes are hidden there unless asked for.
export function visibleNotes<T extends Placed>(notes: readonly T[], view: NoteView = 'notes'): T[] {
  return notes.filter((note) => noteView(note) === view);
}
