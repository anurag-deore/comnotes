'use client';

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Archive, ArrowLeft, House, Lock, NotebookPen, Plus, Trash2, X } from 'lucide-react';
import type { Note } from '@/types/note';
import { Button, IconButton } from '@/components/ui/Button';
import { NoteListItem } from '@/components/notes/NoteListItem';
import { TrashView } from '@/components/notes/TrashView';
import { ArchiveView } from '@/components/notes/ArchiveView';
import type { NoteView } from '@/lib/noteViews';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { BackupDialog } from '@/components/notes/BackupDialog';
import { OfflineSetting } from '@/components/notes/OfflineSetting';
import { SearchField, SearchResults, optionId, searchSummary } from '@/components/notes/NoteSearch';
import type { NoteSearch, SearchResult } from '@/hooks/useNoteSearch';
import { searchKeyAction } from '@/lib/searchKeys';

export interface SidebarProps {
  notes: Note[];
  archivedNotes: Note[];
  trashedNotes: (Note & { deletedAt: Date })[];
  selectedId: string | null;
  now: Date;
  view: NoteView;
  onShowView: (view: NoteView) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onUnarchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (ids: string[]) => void;
  onLock: () => void;
  // Decrypted titles of locked notes, in memory only (CNOTE-7)
  unlockedTitles: Record<string, string>;
  // Search (CNOTE-18): shared by the desktop sidebar and the drawer
  search: NoteSearch;
  onOpenResult: (id: string) => void;
  // The mobile drawer passes its close button here
  headerAction?: ReactNode;
  // Home (CNOTE-23): closes the open note; active while Home shows
  onHome?: () => void;
  homeActive?: boolean;
}

const VIEW_NAMES: Record<NoteView, string> = { notes: 'Notes', archive: 'Archive', trash: 'Trash' };

// The result the arrow keys point at. It resets to none whenever the results change.
function useActiveResult(results: SearchResult[]) {
  const [active, setActive] = useState({ results, index: -1 });
  const index = active.results === results ? active.index : -1;
  return [index, (next: number) => setActive({ results, index: next })] as const;
}

// Notes list (or Archive, or Trash), the New note call to action, theme, Backup and Lock. Used by the
// desktop sidebar and the mobile drawer.
export function Sidebar({
  notes, archivedNotes, trashedNotes, selectedId, now, view, onShowView, onSelect, onCreate, onUnarchive, onRestore,
  onDeleteForever, onLock, unlockedTitles, search, onOpenResult, headerAction, onHome, homeActive,
}: SidebarProps) {
  const inputId = useId();
  const listboxId = useId();
  const { results } = search;
  const [activeIndex, setActiveIndex] = useActiveResult(results);
  const searching = search.query.trim() !== '';
  const summary = searchSummary(search);

  const moveTo = (index: number) => {
    setActiveIndex(index);
    document.getElementById(optionId(listboxId, index))?.scrollIntoView({ block: 'nearest' });
  };

  // Combobox keys (lib/searchKeys.ts): arrows move through the results, Enter opens one, Esc clears
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = searchKeyAction(event.key, activeIndex, results.length, search.query !== '');
    if (!action) return;
    event.preventDefault();
    if (action.type === 'clear') search.clear();
    else if (action.type === 'move') moveTo(action.index);
    else onOpenResult(results[action.index].note.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-3">
      <div className="flex items-center justify-between gap-2 px-2 pt-1">
        <span className="flex items-center gap-2 text-body-md font-black tracking-tight text-ink">
          <NotebookPen aria-hidden className="size-5" />
          ComNotes
        </span>
        <span className="flex items-center gap-1">
          {onHome && (
            <IconButton
              label="Home"
              icon={House}
              onClick={onHome}
              aria-current={homeActive ? 'page' : undefined}
              className={homeActive ? 'bg-primary-pale' : undefined}
            />
          )}
          {headerAction}
        </span>
      </div>

      <SearchField
        search={search}
        inputId={inputId}
        listboxId={listboxId}
        activeIndex={activeIndex}
        onKeyDown={onSearchKeyDown}
      />
      {/* Announces the result count once the debounced search has run */}
      <p role="status" className="sr-only">
        {searching && search.status !== 'loading' && search.searched ? summary : ''}
      </p>

      <Button variant="primary" onClick={onCreate} className="w-full">
        <Plus aria-hidden className="size-5" />
        New note
      </Button>

      <nav
        aria-label={searching ? 'Search results' : VIEW_NAMES[view]}
        data-motion-viewport
        className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1"
      >
        {searching ? (
          <SearchResults
            search={search}
            listboxId={listboxId}
            activeIndex={activeIndex}
            selectedId={selectedId}
            now={now}
            onOpen={onOpenResult}
            summary={summary}
          />
        ) : (
          <>
            {view !== 'notes' && (
              <Button variant="ghost" size="sm" onClick={() => onShowView('notes')} className="mb-2 -ml-1">
                <ArrowLeft aria-hidden className="size-4" />
                Back to notes
              </Button>
            )}
            {view === 'trash' ? (
              <TrashView notes={trashedNotes} now={now} onRestore={onRestore} onDeleteForever={onDeleteForever} />
            ) : view === 'archive' ? (
              <ArchiveView
                notes={archivedNotes}
                selectedId={selectedId}
                now={now}
                onSelect={onSelect}
                onUnarchive={onUnarchive}
                unlockedTitles={unlockedTitles}
              />
            ) : notes.length === 0 ? (
              <p className="px-2 text-body-sm text-body">No notes yet.</p>
            ) : (
              <ul role="list" aria-label={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`} className="flex flex-col gap-2">
                {notes.map((note) => (
                  <NoteListItem
                    key={note.id}
                    note={note}
                    active={note.id === selectedId}
                    now={now}
                    onSelect={onSelect}
                    unlockedTitle={unlockedTitles[note.id]}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </nav>

      {view === 'notes' && !searching && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => onShowView('archive')} className="min-w-0 flex-1">
            <Archive aria-hidden className="size-4 shrink-0" />
            Archive
            {archivedNotes.length > 0 && <span className="text-body">({archivedNotes.length})</span>}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onShowView('trash')} className="min-w-0 flex-1">
            <Trash2 aria-hidden className="size-4 shrink-0" />
            Trash
            {trashedNotes.length > 0 && <span className="text-body">({trashedNotes.length})</span>}
          </Button>
        </div>
      )}

      <ThemeSwitcher />

      <OfflineSetting />

      <BackupDialog />

      <Button variant="tertiary" size="sm" onClick={onLock} className="w-full">
        <Lock aria-hidden className="size-4" />
        Lock
      </Button>
    </div>
  );
}

export const DESKTOP = '(min-width: 768px)';

interface MobileSidebarProps extends SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

// Esc in the search field with a query clears the query (the field handles it), not the drawer
function keepDrawerForSearchEscape(event: globalThis.KeyboardEvent) {
  const field = event.target instanceof HTMLInputElement && event.target.closest('[role="search"]');
  if (field && event.target instanceof HTMLInputElement && event.target.value) event.preventDefault();
}

// Below 768px the sidebar is a slide-over (Radix Dialog: focus trap, Escape, overlay tap)
export function MobileSidebar({ open, onOpenChange, onOpenAutoFocus, onCloseAutoFocus, ...sidebar }: MobileSidebarProps) {
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
          id="notes-drawer"
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={keepDrawerForSearchEscape}
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
