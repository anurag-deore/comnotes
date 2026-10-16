'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createNote, subscribeNotes } from '@/lib/notes';
import type { SaveStatus } from '@/lib/autosave';
import { useAutosave } from '@/hooks/useAutosave';
import { Note } from '@/types/note';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

// Quill needs the DOM, so the editor only renders in the browser
const QuillEditor = dynamic(() => import('@/app/components/QuillEditor'), {
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
  const { isAuthenticated } = useAuth();
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  // Store only the ID of the selected note
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // On a conflict the server version replaces ours and our version shows up as a copy
  const { status, change, isDirty } = useAutosave(({ server, copy }) => {
    setLocalNotes(prevNotes => [
      copy,
      ...prevNotes.filter(note => note.id !== copy.id).map(note => (note.id === server.id ? server : note)),
    ]);
    toast.error(`"${server.title}" was changed elsewhere. Your version was saved as "${copy.title}".`);
  });

  // Derive the selected note object from localNotes based on selectedNoteId
  const selectedNote = useMemo(() => {
    return localNotes.find(note => note.id === selectedNoteId) || null;
  }, [localNotes, selectedNoteId]);

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
        // A note with unsaved local edits keeps our copy until its save lands
        setLocalNotes(prevNotes =>
          serverNotes.map(note => (isDirty(note.id) && prevNotes.find(prev => prev.id === note.id)) || note)
        );
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          // Select the first note by default, only on initial load
          setSelectedNoteId(serverNotes[0]?.id ?? null);
          setIsLoading(false);
        }
      },
      (error) => {
        setIsLoading(false);
        toast.error('Failed to load notes');
        console.error('Error loading notes:', error);
      },
    );
  }, [router, isAuthenticated, isDirty]);

  // Applies an edit locally and queues an autosave of just that note
  const updateSelectedNote = (fields: Partial<Pick<Note, 'title' | 'content'>>) => {
    if (!selectedNote) return;
    const updated = { ...selectedNote, ...fields };
    setLocalNotes(prevNotes => prevNotes.map(note => (note.id === updated.id ? updated : note)));
    change({ id: updated.id, title: updated.title, content: updated.content, rev: updated.rev });
  };

  // Handles changes in the Quill editor content
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
        </div>
        <div className="overflow-y-auto h-[calc(100vh-8rem)] flex-1">
          {localNotes.map((note) => (
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
            </div>
            <div className="flex-1 overflow-y-auto">
              {selectedNoteId && ( // Only render Quill if a note ID is selected
                <QuillEditor
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