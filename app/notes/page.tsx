'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, onSnapshot, addDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Note } from '@/types/note';
import SimpleEditor from '@/app/components/SimpleEditor';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function NotesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [localTitle, setLocalTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const initialLoadDone = useRef(false);

  // Load notes from Firebase on initial load
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    const q = query(collection(db, 'notes'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date()
        };
      }) as Note[];
      setLocalNotes(notesData);
      setIsLoading(false);
      
      // Only show the initial load toast once
      if (!initialLoadDone.current) {
        toast.success('Notes loaded successfully');
        initialLoadDone.current = true;
      }
    }, (error) => {
      setIsLoading(false);
      toast.error('Failed to load notes');
      console.error('Error loading notes:', error);
    });

    return () => unsubscribe();
  }, [router, isAuthenticated]);

  const handleEditorChange = (content: string) => {
    if (selectedNote) {
      const updatedNotes = localNotes.map(note => {
        if (note.id === selectedNote.id) {
          return {
            ...note,
            content: content
          };
        }
        return note;
      });
      setLocalNotes(updatedNotes);
      setSelectedNote({
        ...selectedNote,
        content: content
      });
    }
  };

  const syncNotes = async () => {
    setIsSyncing(true);
    const syncToast = toast.loading('Syncing notes...');
    
    try {
      // Use batch write to update all notes at once
      const batch = writeBatch(db);
      
      localNotes.forEach(note => {
        const noteRef = doc(db, 'notes', note.id);
        batch.update(noteRef, {
          title: note.title,
          content: note.content || '', // Ensure content is never undefined
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

  const createNewNote = async () => {
    const createToast = toast.loading('Creating new note...');
    
    try {
      const newNote = {
        title: 'Untitled Note',
        content: '',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(collection(db, 'notes'), newNote);
      const createdNote = { 
        ...newNote, 
        id: docRef.id,
        createdAt: newNote.createdAt.toDate(),
        updatedAt: newNote.updatedAt.toDate()
      };
      
      setLocalNotes([createdNote, ...localNotes]);
      setSelectedNote(createdNote);
      setLocalTitle('Untitled Note');
      toast.success('Note created successfully', { id: createToast });
    } catch (error) {
      console.error('Error creating note:', error);
      toast.error('Failed to create note', { id: createToast });
    }
  };

  const handleTitleChange = (newTitle: string) => {
    if (selectedNote) {
      setLocalTitle(newTitle);
      const updatedNotes = localNotes.map(note => {
        if (note.id === selectedNote.id) {
          return {
            ...note,
            title: newTitle
          };
        }
        return note;
      });
      setLocalNotes(updatedNotes);
      setSelectedNote({
        ...selectedNote,
        title: newTitle
      });
    }
  };

  const handleNoteSelect = (note: Note) => {
    setSelectedNote(note);
    setLocalTitle(note.title);
  };

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
      <div className="w-64 bg-gray-50 border-r border-gray-200">
        <div className="p-4 space-y-2">
          <button
            onClick={createNewNote}
            disabled={isSyncing}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            New Note
          </button>
          <button
            onClick={syncNotes}
            disabled={isSyncing}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? 'Syncing...' : 'Sync Notes'}
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-8rem)]">
          {localNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => handleNoteSelect(note)}
              className={`p-4 cursor-pointer hover:bg-gray-100 transition-colors ${
                selectedNote?.id === note.id ? 'bg-gray-100' : ''
              }`}
            >
              <h3 className="font-medium truncate text-gray-900">{note.title}</h3>
              <p className="text-sm text-gray-500 truncate">
                {formatDate(note.updatedAt)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col h-screen">
        {selectedNote ? (
          <div className="flex flex-col h-full">
            <input
              type="text"
              value={localTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="text-2xl font-bold p-4 border-b border-gray-200 focus:outline-none focus:border-indigo-500 bg-white text-gray-900 placeholder-gray-400"
              placeholder="Enter note title"
            />
            <div className="flex-1 overflow-y-auto">
              <SimpleEditor
                value={selectedNote.content}
                onChange={handleEditorChange}
              />
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