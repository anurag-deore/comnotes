'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createAutosaver, type Autosaver, type SaveStatus } from '@/lib/autosave';
import { saveNote, type SaveResult } from '@/lib/notes';

export type Conflict = Extract<SaveResult, { status: 'conflict' }>;

interface AutosaveContextType {
  saver: Autosaver;
  status: SaveStatus;
  conflicts: Set<(conflict: Conflict) => void>;
}

const AutosaveContext = createContext<AutosaveContextType | null>(null);

// One autosaver for the whole app, so drafts survive the notes page unmounting on lock (CNOTE-8)
export function AutosaveProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [conflicts] = useState(() => new Set<(conflict: Conflict) => void>());
  const [saver] = useState(() => createAutosaver({
    save: saveNote,
    delayMs: 1000,
    retryMs: 5000,
    onStatus: setStatus,
    onConflict: (conflict) => conflicts.forEach((listener) => listener(conflict)),
  }));

  useEffect(() => {
    // The browser can't wait for the save, so ask the user to stay while it finishes
    const guard = (event: BeforeUnloadEvent) => {
      if (!saver.hasPending()) return;
      event.preventDefault();
      void saver.flush();
    };
    window.addEventListener('beforeunload', guard);
    return () => {
      window.removeEventListener('beforeunload', guard);
      saver.dispose();
    };
  }, [saver]);

  return (
    <AutosaveContext.Provider value={{ saver, status, conflicts }}>
      {children}
    </AutosaveContext.Provider>
  );
}

export function useSaver() {
  const context = useContext(AutosaveContext);
  if (!context) {
    throw new Error('useSaver must be used within an AutosaveProvider');
  }
  return context;
}
