'use client';

import { useEffect, useState, useRef, useMemo } from 'react'; // Import useMemo
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, getDocs, addDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Note } from '@/types/note';
import QuillEditor from '@/app/components/QuillEditor';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function NotesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  // Store only the ID of the selected note
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string>(''); // local state for title input
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const initialFetchAndSelectDone = useRef(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Derive the selected note object from localNotes based on selectedNoteId
  const selectedNote = useMemo(() => {
    return localNotes.find(note => note.id === selectedNoteId) || null;
  }, [localNotes, selectedNoteId]);

  // Load notes from Firebase on initial load (fetch once)
  useEffect(() => {
    if (initialFetchAndSelectDone.current) {
      return;
    }

    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    const fetchNotes = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, 'notes'), orderBy('updatedAt', 'desc'));
        const querySnapshot = await getDocs(q);

        const notesData = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date()
          };
        }) as Note[];

        setLocalNotes(notesData);

        // Select the first note by default if notes exist, ONLY on initial load
        if (notesData.length > 0) {
          // Set the ID of the selected note
          setSelectedNoteId(notesData[0].id);
          // Also initialize the local title state
          setLocalTitle(notesData[0].title);
        } else {
          setSelectedNoteId(null);
          setLocalTitle('');
        }

        setIsLoading(false);
        initialFetchAndSelectDone.current = true;
        toast.success('Notes loaded successfully');

      } catch (error) {
        setIsLoading(false);
        toast.error('Failed to load notes');
        console.error('Error loading notes:', error);
      }
    };

    fetchNotes();

  }, [router, isAuthenticated]); // Dependencies remain the same

  // Effect to update localTitle when the selected note changes (e.g. user clicks a different note)
  // This is needed because localTitle state manages the input value separately.
  useEffect(() => {
    if (selectedNote) {
      setLocalTitle(selectedNote.title);
    } else {
      setLocalTitle('');
    }
  }, [selectedNote]);


  // Handles changes in the Quill editor content
  const handleEditorChange = (content: string) => {
    if (selectedNoteId) {
      // Update local state for the selected note's content based on ID
      setLocalNotes(prevNotes =>
        prevNotes.map(note => {
          if (note.id === selectedNoteId) {
            return {
              ...note,
              content: content
            };
          }
          return note;
        })
      );
      // No need to call setSelectedNote here, as selectedNote is derived
    }
  };

  // Syncs local changes back to Firebase
  const syncNotes = async () => {
    setIsSyncing(true);
    const syncToast = toast.loading('Syncing notes...');

    try {
      const batch = writeBatch(db);

      // Iterate through the localNotes and prepare updates for the batch
      localNotes.forEach(note => {
        const noteRef = doc(db, 'notes', note.id);
        batch.update(noteRef, {
          title: note.title,
          content: note.content || '',
          updatedAt: Timestamp.now(),
        });
      });

      await batch.commit();
      toast.success('Notes synced successfully', { id: syncToast });
    } catch (error) {
      console.error('Error syncing notes:', error);
      toast.error('Failed to sync notes', { id: syncToast });
    } finally {
      setIsSyncing(false);
    }
  };

  // Creates a new note in Firebase and updates local state
  const createNewNote = async () => {
    const createToast = toast.loading('Creating new note...');

    try {
      const newNoteData = {
        title: 'Untitled Note',
        content: '',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(collection(db, 'notes'), newNoteData);

      const createdNote: Note = {
        id: docRef.id,
        ...newNoteData,
        createdAt: newNoteData.createdAt.toDate(),
        updatedAt: newNoteData.updatedAt.toDate()
      };

      setLocalNotes([createdNote, ...localNotes]);
      // Set the ID of the newly created note as selected
      setSelectedNoteId(createdNote.id);
      // Update local title state
      setLocalTitle('Untitled Note');

      toast.success('Note created successfully', { id: createToast });
    } catch (error) {
      console.error('Error creating note:', error);
      toast.error('Failed to create note', { id: createToast });
    }
  };

  // Handles changes to the note title input
  const handleTitleChange = (newTitle: string) => {
    setLocalTitle(newTitle); // Update local state for the input value

    if (selectedNoteId) {
      // Update local state for the selected note's title based on ID
      setLocalNotes(prevNotes =>
        prevNotes.map(note => {
          if (note.id === selectedNoteId) {
            return {
              ...note,
              title: newTitle
            };
          }
          return note;
        })
      );
      // No need to call setSelectedNote here, as selectedNote is derived
    }
  };

  // Handles selecting a note from the sidebar list
  const handleNoteSelect = (note: Note) => {
    // Set the ID of the selected note
    setSelectedNoteId(note.id);
    // localTitle will be updated by the useEffect triggered by selectedNote change
  };

  // Helper function to format dates
  const formatDate = (date: Date | Timestamp | null | undefined) => {
    if (!date) return 'No date';
    const jsDate = date instanceof Timestamp ? date.toDate() : date;
    if (!(jsDate instanceof Date)) return 'Invalid date';
    return jsDate.toLocaleDateString('en-US', {
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
            disabled={isSyncing}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="New Note"
          >
            New Note
          </button>
          <button
            onClick={syncNotes}
            disabled={isSyncing || localNotes.length === 0}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sync Notes"
          >
            {isSyncing ? 'Syncing...' : 'Sync Notes'}
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