import type { EncryptedPayload } from '@/lib/noteCrypto';

export interface Note {
  id: string;
  // Empty for a locked note: its title and content are only in `encrypted`
  title: string;
  content: string;
  // Bumped on every save; a save only applies if the server still has the rev it started from
  rev: number;
  createdAt: Date;
  updatedAt: Date;
  // Set while the note is in Trash
  deletedAt: Date | null;
  // Set while the note is archived (CNOTE-17): out of the main list and search, still editable.
  // Kept when the note is trashed, so restoring it puts it back in Archive.
  archivedAt: Date | null;
  // Locked notes are encrypted in the browser (CNOTE-7). locked without encrypted means the stored
  // payload isn't one this version can read: the note stays locked and can't be opened.
  locked: boolean;
  encrypted: EncryptedPayload | null;
}

// A locked note's title and content, encrypted for (bound to) the note `noteId`
export interface SealedText {
  noteId: string;
  payload: EncryptedPayload;
}
