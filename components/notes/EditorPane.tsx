'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Lock, LockOpen, Menu, PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-react';
import type { Note } from '@/types/note';
import type { SaveStatus as Status } from '@/lib/autosave';
import { IconButton } from '@/components/ui/Button';
import { SaveStatus } from '@/components/notes/SaveStatus';
import { EditorSkeleton } from '@/components/notes/NotesSkeleton';

// The editor needs the DOM, so it only renders in the browser
const NoteEditor = dynamic(() => import('@/components/editor/NoteEditor'), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

export interface SidebarToggles {
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
  onOpenDrawer: () => void;
}

interface EditorPaneProps extends SidebarToggles {
  note: Note;
  status: Status;
  // Focus and select the title once, e.g. right after creating the note
  focusTitle: boolean;
  onTitleFocused: () => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onTrash: () => void;
  // Lock note, or Remove lock when the open note is locked (CNOTE-7)
  onToggleLock: () => void;
}

// Buttons that open the drawer (phones) or hide/show the sidebar (768px and up)
export function SidebarButtons({ sidebarHidden, onToggleSidebar, onOpenDrawer }: SidebarToggles) {
  return (
    <>
      <IconButton label="Open notes list" icon={Menu} onClick={onOpenDrawer} className="md:hidden" />
      <IconButton
        label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
        icon={sidebarHidden ? PanelLeftOpen : PanelLeftClose}
        aria-expanded={!sidebarHidden}
        aria-controls="notes-sidebar"
        onClick={onToggleSidebar}
        className="max-md:hidden"
      />
    </>
  );
}

// The open note: title, save status, Lock, Move to Trash, toolbar and content in one white card.
// For a locked note `note` carries the decrypted text, held in memory only.
export function EditorPane({
  note, status, focusTitle, onTitleFocused, onTitleChange, onContentChange, onTrash, onToggleLock, ...toggles
}: EditorPaneProps) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusTitle) return;
    titleRef.current?.focus();
    titleRef.current?.select();
    onTitleFocused();
  }, [focusTitle, onTitleFocused]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas md:rounded-xl">
      <header className="flex shrink-0 items-center gap-1 border-b border-canvas-soft px-2 py-2 md:gap-3 md:px-4">
        <SidebarButtons {...toggles} />
        <input
          ref={titleRef}
          type="text"
          value={note.title}
          onChange={(event) => onTitleChange(event.target.value)}
          aria-label="Note title"
          placeholder="Untitled"
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-display-xs text-ink placeholder:text-mute"
        />
        <SaveStatus status={status} />
        <IconButton
          label={note.locked ? 'Remove lock' : 'Lock note'}
          icon={note.locked ? LockOpen : Lock}
          onClick={onToggleLock}
        />
        <IconButton
          label="Move to Trash"
          icon={Trash2}
          onClick={onTrash}
          className="hover:bg-negative-pale hover:text-negative-deep"
        />
      </header>
      <NoteEditor
        // One editor per note, so switching notes never carries content across
        key={note.id}
        value={note.content}
        onChange={onContentChange}
      />
    </div>
  );
}
