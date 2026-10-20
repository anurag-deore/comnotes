'use client';

import { useEffect, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, Lock, NotebookPen, Plus, Trash2, X } from 'lucide-react';
import type { Note } from '@/types/note';
import { Button, IconButton } from '@/components/ui/Button';
import { NoteListItem } from '@/components/notes/NoteListItem';
import { TrashView } from '@/components/notes/TrashView';

export interface SidebarProps {
  notes: Note[];
  trashedNotes: (Note & { deletedAt: Date })[];
  selectedId: string | null;
  now: Date;
  showTrash: boolean;
  onShowTrash: (show: boolean) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRestore: (id: string) => void;
  onDeleteForever: (ids: string[]) => void;
  onLock: () => void;
  // The mobile drawer passes its close button here
  headerAction?: ReactNode;
}

// Notes list (or Trash), the New note call to action and Lock. Used by the desktop
// sidebar and the mobile drawer.
export function Sidebar({
  notes, trashedNotes, selectedId, now, showTrash, onShowTrash, onSelect, onCreate, onRestore, onDeleteForever, onLock,
  headerAction,
}: SidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-3">
      <div className="flex items-center justify-between gap-2 px-2 pt-1">
        <span className="flex items-center gap-2 text-body-md font-black tracking-tight text-ink">
          <NotebookPen aria-hidden className="size-5" />
          ComNotes
        </span>
        {headerAction}
      </div>

      <Button variant="primary" onClick={onCreate} className="w-full">
        <Plus aria-hidden className="size-5" />
        New note
      </Button>

      <nav aria-label={showTrash ? 'Trash' : 'Notes'} data-motion-viewport className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {showTrash ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => onShowTrash(false)} className="mb-2 -ml-1">
              <ArrowLeft aria-hidden className="size-4" />
              Back to notes
            </Button>
            <TrashView notes={trashedNotes} now={now} onRestore={onRestore} onDeleteForever={onDeleteForever} />
          </>
        ) : notes.length === 0 ? (
          <p className="px-2 text-body-sm text-body">No notes yet.</p>
        ) : (
          <ul role="list" aria-label={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`} className="flex flex-col gap-2">
            {notes.map((note) => (
              <NoteListItem key={note.id} note={note} active={note.id === selectedId} now={now} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </nav>

      <div className="flex gap-2">
        {!showTrash && (
          <Button variant="secondary" size="sm" onClick={() => onShowTrash(true)} className="flex-1">
            <Trash2 aria-hidden className="size-4" />
            Trash
            {trashedNotes.length > 0 && <span className="text-body">({trashedNotes.length})</span>}
          </Button>
        )}
        <Button variant="tertiary" size="sm" onClick={onLock} className="flex-1">
          <Lock aria-hidden className="size-4" />
          Lock
        </Button>
      </div>
    </div>
  );
}

const DESKTOP = '(min-width: 768px)';

interface MobileSidebarProps extends SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

// Below 768px the sidebar is a slide-over (Radix Dialog: focus trap, Escape, overlay tap)
export function MobileSidebar({ open, onOpenChange, onCloseAutoFocus, ...sidebar }: MobileSidebarProps) {
  // Growing past the breakpoint shows the persistent sidebar, so the drawer closes
  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(DESKTOP);
    const onChange = () => {
      if (query.matches) onOpenChange(false);
    };
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [open, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] bg-canvas-soft shadow-raised data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in md:hidden"
        >
          <Dialog.Title className="sr-only">Notes</Dialog.Title>
          <Sidebar
            {...sidebar}
            headerAction={
              <Dialog.Close asChild>
                <IconButton label="Close notes list" icon={X} />
              </Dialog.Close>
            }
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
