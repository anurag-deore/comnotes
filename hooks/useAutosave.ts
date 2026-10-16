'use client';

import { useEffect, useEffectEvent } from 'react';
import { useSaver, type Conflict } from '@/contexts/AutosaveContext';
import type { NoteDraft } from '@/lib/notes';

// A page's view of the shared autosaver; onConflict and onGone are called while the page is mounted
export function useAutosave(onConflict: (conflict: Conflict) => void, onGone: (draft: NoteDraft) => void) {
  const { saver, status, conflicts, gone } = useSaver();
  const handleConflict = useEffectEvent(onConflict);
  const handleGone = useEffectEvent(onGone);

  useEffect(() => {
    const conflictListener = (conflict: Conflict) => handleConflict(conflict);
    const goneListener = (draft: NoteDraft) => handleGone(draft);
    conflicts.add(conflictListener);
    gone.add(goneListener);
    return () => {
      conflicts.delete(conflictListener);
      gone.delete(goneListener);
    };
  }, [conflicts, gone]);

  return { status, change: saver.change, draft: saver.draft };
}
