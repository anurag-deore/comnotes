'use client';

import { useEffect, useState } from 'react';
import { createAutosaver, type SaveStatus } from '@/lib/autosave';
import { saveNote, type SaveResult } from '@/lib/notes';

type Conflict = Extract<SaveResult, { status: 'conflict' }>;

// One autosaver per mounted notes page; flush() is what auto-lock (CNOTE-8) should await.
// onConflict is captured once, so it must only use stable things like state setters.
export function useAutosave(onConflict: (conflict: Conflict) => void) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saver] = useState(() => createAutosaver({
    save: saveNote,
    delayMs: 1000,
    retryMs: 5000,
    onStatus: setStatus,
    onConflict,
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
      void saver.flush();
    };
  }, [saver]);

  return { status, change: saver.change, flush: saver.flush, isDirty: saver.isDirty };
}
