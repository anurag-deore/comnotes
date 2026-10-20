'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { FileText, NotebookPen, Plus } from 'lucide-react';
import {
  createNote, deleteNotesForever, purgeExpiredTrash, restoreNote, subscribeNotes, trashNote,
} from '@/lib/notes';
import { useAutosave } from '@/hooks/useAutosave';
import { Note } from '@/types/note';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNow } from '@/hooks/useNow';
import { displayTitle } from '@/lib/noteDisplay';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileSidebar, Sidebar } from '@/components/notes/Sidebar';
import { EditorPane, SidebarButtons } from '@/components/notes/EditorPane';
import { NotesSkeleton } from '@/components/notes/NotesSkeleton';
import { animateListChange } from '@/lib/listMotion';
import { noteListsChanged, prefersReducedMotion, runViewTransition } from '@/lib/motion';
import { browserStorage, readSidebarHidden, writeSidebarHidden } from '@/lib/sidebarPreference';

export default function NotesPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  // The latest list, ahead of React state while an animated update waits for its View Transition
  const notesRef = useRef<Note[]>([]);
  // Store only the ID of the selected note
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Desktop: sidebar hidden by the user (remembered in this browser). Phones: the notes drawer is open.
  // Read on the client only matters after loading, as the skeleton doesn't show the sidebar.
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => readSidebarHidden(browserStorage()));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  // A just-created note whose title gets focus
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);
  const now = useNow();
  // Set when the drawer closes because a note was opened, so focus goes to the note, not the menu button
  const drawerClosedByNavigation = useRef(false);

  // Every change to the notes goes through here. Adding, removing or re-ordering rows animates
  // (View Transition, lib/listMotion.ts); edits that keep the order are applied as usual.
  const commitNotes = useCallback((update: (prev: Note[]) => Note[], animate = true) => {
    const prev = notesRef.current;
    const next = update(prev);
    notesRef.current = next;
    if (!animate || !noteListsChanged(prev, next)) {
      setLocalNotes(next);
      return;
    }
    // The transition applies the latest list, so updates made while it starts aren't lost
    animateListChange(() => flushSync(() => setLocalNotes(notesRef.current)));
  }, []);

  // On a conflict the server version replaces ours and our version shows up as a copy
  const { status, change, draft } = useAutosave(({ server, copy }) => {
    commitNotes(prevNotes => [
      copy,
      ...prevNotes.filter(note => note.id !== copy.id).map(note => (note.id === server.id ? server : note)),
    ]);
    toast.error(`"${server.title}" was changed elsewhere. Your version was saved as "${copy.title}".`);
  }, (dropped) => {
    toast.error(`"${dropped.title}" no longer exists, so its unsaved changes were discarded.`);
  });

  const activeNotes = useMemo(() => localNotes.filter(note => !note.deletedAt), [localNotes]);
  const trashedNotes = useMemo(
    () => localNotes.filter((note): note is Note & { deletedAt: Date } => note.deletedAt !== null),
    [localNotes],
  );

  // Derive the selected note from the notes not in Trash, so trashed notes can't be edited
  const selectedNote = useMemo(() => {
    return activeNotes.find(note => note.id === selectedNoteId) || null;
  }, [activeNotes, selectedNoteId]);

  // Keep the list live; changes from other tabs and devices arrive here
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    let isFirstSnapshot = true;
    return subscribeNotes(
      (serverNotes) => {
        // A note with unsaved edits shows them until its save lands, even after a lock and unlock.
        // Drafts carry no deletedAt, so the server decides whether the note is in Trash.
        // The first load isn't animated: the skeleton is showing
        commitNotes(() => serverNotes.map(note => ({ ...note, ...draft(note.id) })), !isFirstSnapshot);
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          // Select the first note by default, only on initial load
          setSelectedNoteId(serverNotes.find(note => !note.deletedAt)?.id ?? null);
          setIsLoading(false);
          purgeExpiredTrash(serverNotes).catch(error => console.error('Error purging trash:', error));
        }
      },
      (error) => {
        setIsLoading(false);
        toast.error('Failed to load notes');
        console.error('Error loading notes:', error);
      },
    );
  }, [router, isAuthenticated, draft, commitNotes]);

  // Applies an edit locally and queues an autosave of just that note
  const updateSelectedNote = (fields: Partial<Pick<Note, 'title' | 'content'>>) => {
    if (!selectedNote) return;
    const updated = { ...selectedNote, ...fields };
    commitNotes(prevNotes => prevNotes.map(note => (note.id === updated.id ? updated : note)));
    change({ id: updated.id, title: updated.title, content: updated.content, rev: updated.rev });
  };

  // Handles changes in the editor content
  const handleEditorChange = (content: string) => updateSelectedNote({ content });

  // Handles changes to the note title input
  const handleTitleChange = (newTitle: string) => updateSelectedNote({ title: newTitle });

  // A no-op when the drawer is closed; opening it resets the flag
  const closeDrawerForNavigation = useCallback(() => {
    drawerClosedByNavigation.current = true;
    setIsDrawerOpen(false);
  }, []);

  // Creates a new note in Firebase, opens it and focuses its title. Only a failure toasts.
  const createNewNote = async () => {
    try {
      const createdNote = await createNote();
      commitNotes(prevNotes => [createdNote, ...prevNotes.filter(note => note.id !== createdNote.id)]);
      setSelectedNoteId(createdNote.id);
      setFocusTitleId(createdNote.id);
      setShowTrash(false);
      closeDrawerForNavigation();
    } catch (error) {
      console.error('Error creating note:', error);
      toast.error('Failed to create note');
    }
  };

  // Restores a note from Trash and selects it
  const restore = (id: string) => {
    setSelectedNoteId(id);
    restoreNote(id).catch(error => {
      console.error('Error restoring note:', error);
      toast.error('Failed to restore note');
    });
  };

  // Moves the selected note to Trash. Unsaved edits keep saving to it, so restoring brings them back.
  // The live snapshot shows the change at once and rolls it back if the write fails.
  const deleteSelectedNote = () => {
    if (!selectedNote) return;
    const { id } = selectedNote;
    const title = displayTitle(selectedNote.title);
    const index = activeNotes.findIndex(note => note.id === id);
    setSelectedNoteId((activeNotes[index + 1] ?? activeNotes[index - 1])?.id ?? null);
    trashNote(id).catch(error => {
      console.error('Error moving note to Trash:', error);
      toast.error('Failed to move note to Trash');
    });
    toast(t => (
      <span className="flex items-center gap-3">
        <span className="min-w-0 truncate">Moved &quot;{title}&quot; to Trash</span>
        <button
          type="button"
          onClick={() => {
            toast.dismiss(t.id);
            restore(id);
          }}
          className="-my-2 min-h-11 shrink-0 rounded-sm px-2 font-semibold text-ink underline underline-offset-2"
        >
          Undo
        </button>
      </span>
    ));
  };

  const deleteForever = (ids: string[]) => {
    deleteNotesForever(ids).catch(error => {
      console.error('Error deleting notes:', error);
      toast.error('Failed to delete notes');
    });
  };

  // Selecting a note on a phone also closes the drawer. Stable, so list rows can skip re-rendering.
  const handleNoteSelect = useCallback((id: string) => {
    setSelectedNoteId(id);
    closeDrawerForNavigation();
  }, [closeDrawerForNavigation]);

  // After the drawer closes: a new note keeps focus on its title; an opened note focuses the editor area
  const onDrawerCloseAutoFocus = (event: Event) => {
    if (!drawerClosedByNavigation.current) return;
    drawerClosedByNavigation.current = false;
    event.preventDefault();
    const main = document.getElementById('note-editor');
    if (main && !main.contains(document.activeElement)) main.focus();
  };

  const clearFocusTitle = useCallback(() => setFocusTitleId(null), []);

  // Hide/show the desktop sidebar: it slides while the editor card resizes (instant with reduced motion)
  const toggleSidebar = () => {
    const hidden = !isSidebarHidden;
    writeSidebarHidden(browserStorage(), hidden);
    runViewTransition(() => flushSync(() => setIsSidebarHidden(hidden)), {
      doc: document,
      reduced: prefersReducedMotion(window),
      kind: 'sidebar',
    });
  };

  if (isLoading) return <NotesSkeleton />;

  const sidebarProps = {
    notes: activeNotes,
    trashedNotes,
    selectedId: selectedNoteId,
    now,
    showTrash,
    onShowTrash: setShowTrash,
    onSelect: handleNoteSelect,
    onCreate: () => void createNewNote(),
    onRestore: restore,
    onDeleteForever: deleteForever,
    onLock: () => void logout(),
  };
  const toggles = {
    sidebarHidden: isSidebarHidden,
    onToggleSidebar: toggleSidebar,
    onOpenDrawer: () => {
      drawerClosedByNavigation.current = false;
      setIsDrawerOpen(true);
    },
  };

  return (
    <div className="flex h-dvh animate-app-in bg-canvas-soft text-ink">
      <a
        href="#note-editor"
        className="sr-only z-50 rounded-md bg-canvas px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to note
      </a>

      <aside id="notes-sidebar" hidden={isSidebarHidden} className="w-72 shrink-0 flex-col max-md:hidden md:flex lg:w-80">
        <Sidebar {...sidebarProps} />
      </aside>
      <MobileSidebar
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onCloseAutoFocus={onDrawerCloseAutoFocus}
        {...sidebarProps}
      />

      <main
        id="note-editor"
        tabIndex={-1}
        className={`flex min-w-0 flex-1 flex-col outline-none md:py-3 md:pr-3 ${isSidebarHidden ? 'md:pl-3' : ''}`}
      >
        {selectedNote ? (
          <EditorPane
            note={selectedNote}
            status={status}
            focusTitle={focusTitleId === selectedNote.id}
            onTitleFocused={clearFocusTitle}
            onTitleChange={handleTitleChange}
            onContentChange={handleEditorChange}
            onTrash={deleteSelectedNote}
            {...toggles}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-canvas md:rounded-xl">
            <div className="flex shrink-0 items-center gap-1 px-2 py-2 md:px-4">
              <SidebarButtons {...toggles} />
            </div>
            <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
              {activeNotes.length === 0 ? (
                <EmptyState
                  icon={NotebookPen}
                  title="No notes yet"
                  className="w-full max-w-md"
                  action={
                    <Button variant="primary" onClick={() => void createNewNote()}>
                      <Plus aria-hidden className="size-5" />
                      New note
                    </Button>
                  }
                >
                  Write your first note. It saves as you type.
                </EmptyState>
              ) : (
                <EmptyState icon={FileText} title="No note open" className="w-full max-w-md">
                  Pick a note from the list, or create a new one.
                </EmptyState>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
