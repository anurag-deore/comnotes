'use client';

import { memo, useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { Note } from '@/types/note';
import { formatRelativeTime, notePreview } from '@/lib/noteDisplay';
import { LOCKED_PREVIEW, listTitle } from '@/lib/lockedNotes';
import { cn } from '@/lib/cn';

interface NoteListItemProps {
  note: Note;
  active: boolean;
  now: Date;
  onSelect: (id: string) => void;
  // A locked note's title once decrypted this session (CNOTE-7)
  unlockedTitle?: string;
}

// A sidebar row: white card; the open note gets the lime indicator, an ink outline and aria-current
// A locked note shows a placeholder preview, never decrypted text
export const NoteListItem = memo(function NoteListItem({ note, active, now, onSelect, unlockedTitle }: NoteListItemProps) {
  const preview = useMemo(() => (note.locked ? LOCKED_PREVIEW : notePreview(note.content)), [note.locked, note.content]);

  return (
    <li data-motion-row={note.id}>
      <button
        type="button"
        onClick={() => onSelect(note.id)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'relative flex w-full flex-col gap-0.5 overflow-hidden rounded-sm border bg-canvas py-3 pr-4 pl-5 text-left',
          'transition-[color,background-color,border-color,scale] motion-safe:active:scale-[0.98]',
          active ? 'border-ink' : 'border-transparent hover:border-canvas-soft hover:bg-primary-pale/40',
        )}
      >
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-1.5 transition-colors', active ? 'bg-primary' : 'bg-transparent')}
        />
        <span className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-body-sm font-semibold text-ink">
            {note.locked && <Lock aria-hidden className="size-3.5 shrink-0" />}
            {note.locked && <span className="sr-only">Locked: </span>}
            <span className="truncate">{listTitle(note, unlockedTitle)}</span>
          </span>
          <time dateTime={note.updatedAt.toISOString()} title={note.updatedAt.toLocaleString()} className="shrink-0 text-caption text-body">
            {formatRelativeTime(note.updatedAt, now)}
          </time>
        </span>
        <span className="truncate font-reading text-body-sm text-body">{preview}</span>
      </button>
    </li>
  );
});
