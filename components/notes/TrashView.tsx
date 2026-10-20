'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Note } from '@/types/note';
import { TRASH_DAYS } from '@/lib/notes';
import { daysLeftInTrash, displayTitle, formatRelativeTime } from '@/lib/noteDisplay';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

type TrashedNote = Note & { deletedAt: Date };

interface TrashViewProps {
  notes: TrashedNote[];
  now: Date;
  onRestore: (id: string) => void;
  onDeleteForever: (ids: string[]) => void;
}

const daysLeftLabel = (days: number) => (days === 0 ? 'Deleted for good today' : `${days} ${days === 1 ? 'day' : 'days'} left`);

// Trashed notes with Restore / Delete forever and Empty trash. Permanent deletes are confirmed in place.
export function TrashView({ notes, now, onRestore, onDeleteForever }: TrashViewProps) {
  // Note id, or 'all' for Empty trash, waiting for the user to confirm
  const [confirming, setConfirming] = useState<string | null>(null);

  const deleteForever = (ids: string[]) => {
    setConfirming(null);
    onDeleteForever(ids);
  };

  if (notes.length === 0) {
    return (
      <EmptyState icon={Trash2} title="Trash is empty" className="bg-canvas py-10">
        Deleted notes stay here for {TRASH_DAYS} days.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-body-sm text-body">Notes are deleted for good after {TRASH_DAYS} days.</p>
      <div className="rounded-sm bg-canvas p-3">
        {confirming === 'all' ? (
          <div role="group" aria-label="Confirm empty trash" className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-body-sm font-semibold text-ink">Delete all {notes.length} forever?</span>
            <Button size="sm" variant="secondary" autoFocus onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={() => deleteForever(notes.map((note) => note.id))}>
              Delete all
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="w-full text-negative-deep" onClick={() => setConfirming('all')}>
            <Trash2 aria-hidden className="size-4" />
            Empty trash
          </Button>
        )}
      </div>
      <ul role="list" aria-label="Trash" className="flex flex-col gap-2">
        {notes.map((note) => (
          <li key={note.id} data-motion-row={note.id} className="rounded-sm bg-canvas px-4 py-3">
            <p className="truncate text-body-sm font-semibold text-ink">{displayTitle(note.title)}</p>
            <p className="text-caption text-body">
              <time dateTime={note.deletedAt.toISOString()} title={`Moved to Trash ${note.deletedAt.toLocaleString()}`}>
                {formatRelativeTime(note.deletedAt, now)}
              </time>
              {' · '}
              {daysLeftLabel(daysLeftInTrash(note.deletedAt, now, TRASH_DAYS))}
            </p>
            {confirming === note.id ? (
              <div role="group" aria-label={`Confirm deleting ${displayTitle(note.title)}`} className="mt-2 flex flex-wrap items-center gap-2">
                <span className="mr-auto text-body-sm font-semibold text-ink">Delete forever?</span>
                <Button size="sm" variant="secondary" autoFocus onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onClick={() => deleteForever([note.id])}>
                  Delete
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => onRestore(note.id)}>
                  Restore
                </Button>
                <Button size="sm" variant="ghost" className="text-negative-deep" onClick={() => setConfirming(note.id)}>
                  Delete forever
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
