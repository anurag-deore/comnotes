// Pure helpers for showing locked notes (CNOTE-7): placeholders instead of plaintext, and the
// autosaver's unsaved drafts laid over server notes. No crypto, no Firestore, no DOM.
import type { NoteDraft } from '@/lib/notes';
import { displayTitle } from '@/lib/noteDisplay';
import type { Note } from '@/types/note';

export const LOCKED_TITLE = 'Locked note';
// The list preview of a locked note; decrypted text never goes into a preview
export const LOCKED_PREVIEW = 'Encrypted';

// A note with unsaved edits shows them until its save lands (CNOTE-8 AC-7). A locked note's
// draft carries ciphertext only, so the note shows as locked with the latest payload.
export function withDraft(note: Note, draft: NoteDraft | undefined): Note {
  if (!draft) return note;
  if (!draft.sealed) {
    return { ...note, title: draft.title, content: draft.content, rev: draft.rev, locked: false, encrypted: null };
  }
  // Still bound to the note it was moved from after a conflict; the save re-encrypts it
  if (draft.sealed.noteId !== note.id) return note;
  return { ...note, title: '', content: '', rev: draft.rev, locked: true, encrypted: draft.sealed.payload };
}

// List title: a locked note's real title only once it was decrypted in this session
export function listTitle(note: Note, decryptedTitle?: string): string {
  if (!note.locked) return displayTitle(note.title);
  return decryptedTitle === undefined ? LOCKED_TITLE : displayTitle(decryptedTitle);
}

// Trash rows and toasts never show a locked note's title
export function noteLabel(note: Note): string {
  return note.locked ? LOCKED_TITLE : displayTitle(note.title);
}
