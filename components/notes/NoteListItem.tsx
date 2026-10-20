'use client';

import { memo, useMemo } from 'react';
import type { Note } from '@/types/note';
import { displayTitle, formatRelativeTime, notePreview } from '@/lib/noteDisplay';
import { cn } from '@/lib/cn';

interface NoteListItemProps {
  note: Note;
  active: boolean;
  now: Date;
  onSelect: (id: string) => void;
}

// A sidebar row: white card; the open note gets the lime indicator, an ink outline and aria-current
export const NoteListItem = memo(function NoteListItem({ note, active, now, onSelect }: NoteListItemProps) {
  const preview = useMemo(() => notePreview(note.content), [note.content]);

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
          <span className="truncate text-body-sm font-semibold text-ink">{displayTitle(note.title)}</span>
          <time dateTime={note.updatedAt.toISOString()} title={note.updatedAt.toLocaleString()} className="shrink-0 text-caption text-body">
            {formatRelativeTime(note.updatedAt, now)}
          </time>
        </span>
        <span className="truncate font-reading text-body-sm text-body">{preview}</span>
      </button>
    </li>
  );
});
