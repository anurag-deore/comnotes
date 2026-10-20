'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  createNote, deleteNotesForever, purgeExpiredTrash, restoreNote, subscribeNotes, trashNote,
} from '@/lib/notes';
import type { SaveStatus } from '@/lib/autosave';
import { useAutosave } from '@/hooks/useAutosave';
import { Note } from '@/types/note';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

// The editor needs the DOM, so it only renders in the browser
const NoteEditor = dynamic(() => import('@/app/components/NoteEditor'), {
  ssr: false,
  loading: () => <div>Loading editor...</div>,
});

const saveLabel = (status: SaveStatus) => {
  if (status === 'pending' || status === 'saving') return 'Saving…';
  if (status === 'saved') return 'Saved';
  if (status === 'error') return navigator.onLine ? 'Save failed – retrying' : 'Offline – not saved';
  return '';
};

export default function NotesPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  // Store only the ID of the selected note
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  // Note id (or 'all' for Empty trash) waiting for the user to confirm a permanent delete
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // On a conflict the server version replaces ours and our version shows up as a copy
  const { status, change, draft } = useAutosave(({ server, copy }) => {
    setLocalNotes(prevNotes => [
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

  // Title input value, derived from the selected note
  const localTitle = selectedNote?.title ?? '';

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
        setLocalNotes(serverNotes.map(note => ({ ...note, ...draft(note.id) })));
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
  }, [router, isAuthenticated, draft]);

  // Applies an edit locally and queues an autosave of just that note
  const updateSelectedNote = (fields: Partial<Pick<Note, 'title' | 'content'>>) => {
    if (!selectedNote) return;
    const updated = { ...selectedNote, ...fields };
    setLocalNotes(prevNotes => prevNotes.map(note => (note.id === updated.id ? updated : note)));
    change({ id: updated.id, title: updated.title, content: updated.content, rev: updated.rev });
  };

  // Handles changes in the editor content
  const handleEditorChange = (content: string) => updateSelectedNote({ content });

  // Handles changes to the note title input
  const handleTitleChange = (newTitle: string) => updateSelectedNote({ title: newTitle });

  // Creates a new note in Firebase and updates local state
  const createNewNote = async () => {
    const createToast = toast.loading('Creating new note...');

    try {
      const createdNote = await createNote();
      setLocalNotes(prevNotes => [createdNote, ...prevNotes.filter(note => note.id !== createdNote.id)]);
      // Set the ID of the newly created note as selected
      setSelectedNoteId(createdNote.id);

      toast.success('Note created successfully', { id: createToast });
    } catch (error) {
      console.error('Error creating note:', error);
      toast.error('Failed to create note', { id: createToast });
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
    const { id, title } = selectedNote;
    const index = activeNotes.findIndex(note => note.id === id);
    setSelectedNoteId((activeNotes[index + 1] ?? activeNotes[index - 1])?.id ?? null);
    trashNote(id).catch(error => {
      console.error('Error moving note to Trash:', error);
      toast.error('Failed to move note to Trash');
    });
    toast(t => (
      <span>
        Moved &quot;{title}&quot; to Trash{' '}
        <button
          onClick={() => {
            toast.dismiss(t.id);
            restore(id);
          }}
          className="ml-2 font-medium text-indigo-600 hover:underline"
        >
          Undo
        </button>
      </span>
    ));
  };

  const deleteForever = (ids: string[]) => {
    setConfirmingDelete(null);
    deleteNotesForever(ids).catch(error => {
      console.error('Error deleting notes:', error);
      toast.error('Failed to delete notes');
    });
  };

  // Handles selecting a note from the sidebar list
  const handleNoteSelect = (note: Note) => {
    // Set the ID of the selected note
    setSelectedNoteId(note.id);
  };

  // Helper function to format dates
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white text-gray-900">
      {/* Sidebar */}
      <div className={`${isSidebarCollapsed ? 'w-0' : 'w-64'} bg-gray-50 border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col overflow-hidden`}>
        <div className={`p-4 space-y-2`}>
          <button
            onClick={createNewNote}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
            title="New Note"
          >
            New Note
          </button>
          <button
            onClick={() => void logout()}
            className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-100 transition-colors"
            title="Lock"
          >
            Lock
          </button>
          <button
            onClick={() => {
              setShowTrash(!showTrash);
              setConfirmingDelete(null);
            }}
            className="w-full py-1 px-4 rounded-md text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {showTrash ? '← Back to notes' : `Trash (${trashedNotes.length})`}
          </button>
        </div>
        {showTrash ? (
          <div className="overflow-y-auto flex-1">
            {trashedNotes.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Trash is empty. Notes are deleted for good after 30 days.</p>
            ) : (
              <div className="px-4 pb-2 text-sm">
                {confirmingDelete === 'all' ? (
                  <span>
                    Delete all forever?{' '}
                    <button onClick={() => deleteForever(trashedNotes.map(note => note.id))} className="text-red-600 hover:underline">
                      Delete
                    </button>{' '}
                    <button onClick={() => setConfirmingDelete(null)} className="text-gray-600 hover:underline">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmingDelete('all')} className="text-red-600 hover:underline">
                    Empty trash
                  </button>
                )}
              </div>
            )}
            {trashedNotes.map((note) => (
              <div key={note.id} className="p-4 border-t border-gray-200">
                <h3 className="font-medium text-gray-900 truncate">{note.title}</h3>
                <p className="text-sm text-gray-500 truncate">Deleted {formatDate(note.deletedAt)}</p>
                <div className="mt-1 text-sm space-x-3">
                  {confirmingDelete === note.id ? (
                    <>
                      <span>Delete forever?</span>
                      <button onClick={() => deleteForever([note.id])} className="text-red-600 hover:underline">Delete</button>
                      <button onClick={() => setConfirmingDelete(null)} className="text-gray-600 hover:underline">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => restore(note.id)} className="text-indigo-600 hover:underline">Restore</button>
                      <button onClick={() => setConfirmingDelete(note.id)} className="text-red-600 hover:underline">
                        Delete forever
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto h-[calc(100vh-8rem)] flex-1">
            {activeNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => handleNoteSelect(note)}
                className={`relative p-4 cursor-pointer hover:bg-gray-100 transition-colors ${selectedNoteId && selectedNoteId === note.id ? 'bg-blue-200' : '' // Compare IDs
                  }`}
              >
                <h3 className="font-medium text-gray-900 truncate">
                  {note.title}
                </h3>
                <p className="text-sm text-gray-500 truncate">
                  {formatDate(note.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col h-screen">
        {selectedNote ? ( // Use the derived selectedNote
          <div className="flex flex-col h-full">
            <div className="flex items-center border-b border-gray-200">
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="p-4 hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-600"
                title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              >
                {isSidebarCollapsed ? '→' : '←'}
              </button>
              <input
                type="text"
                value={localTitle} // Use localTitle for the input value
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-2xl font-bold p-4 flex-1 focus:outline-none focus:border-indigo-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Enter note title"
              />
              <span
                className={`px-4 text-sm whitespace-nowrap ${status === 'error' ? 'text-red-600' : 'text-gray-500'}`}
                role="status"
              >
                {saveLabel(status)}
              </span>
              <button
                onClick={deleteSelectedNote}
                className="px-4 py-2 mr-2 text-sm text-red-600 rounded-md hover:bg-red-50 transition-colors"
                title="Move to Trash"
              >
                Delete
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {selectedNoteId && ( // Only render the editor if a note ID is selected
                <NoteEditor
                  // One editor per note, so switching notes never carries content across
                  key={selectedNoteId}
                  // Pass the content from the derived selectedNote
                  value={selectedNote.content}
                  onChange={handleEditorChange}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a note or create a new one
          </div>
        )}
      </div>
    </div>
  );
}