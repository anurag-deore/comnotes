'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import type { Note } from '@/types/note';
import { noteLabel } from '@/lib/lockedNotes';
import { IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { NoteListItem } from '@/components/notes/NoteListItem';

interface ArchiveViewProps {
  notes: Note[];
  selectedId: string | null;
  now: Date;
  onSelect: (id: string) => void;
  onUnarchive: (id: string) => void;
  // Decrypted titles of locked notes, in memory only (CNOTE-7)
  unlockedTitles: Record<string, string>;
}

// Archived notes (CNOTE-17): each opens like any note, and has Unarchive beside it
export function ArchiveView({ notes, selectedId, now, onSelect, onUnarchive, unlockedTitles }: ArchiveViewProps) {
  if (notes.length === 0) {
    return (
      <EmptyState icon={Archive} title="Archive is empty" className="bg-canvas py-10">
        Archived notes stay out of your notes list until you unarchive them.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-body-sm text-body">Archived notes stay out of your notes list. Open one to read or edit it.</p>
      <ul role="list" aria-label={`Archive, ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`} className="flex flex-col gap-2">
        {notes.map((note) => (
          <NoteListItem
            key={note.id}
            note={note}
            active={note.id === selectedId}
            now={now}
            onSelect={onSelect}
            unlockedTitle={unlockedTitles[note.id]}
            action={
              <IconButton
                label={`Unarchive “${noteLabel(note)}”`}
                icon={ArchiveRestore}
                onClick={() => onUnarchive(note.id)}
                className="hover:bg-canvas"
              />
            }
          />
        ))}
      </ul>
    </div>
  );
}
