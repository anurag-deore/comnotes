'use client';

import { useEffect, useEffectEvent } from 'react';
import { useSaver, type Conflict } from '@/contexts/AutosaveContext';

// A page's view of the shared autosaver; onConflict is called while the page is mounted
export function useAutosave(onConflict: (conflict: Conflict) => void) {
  const { saver, status, conflicts } = useSaver();
  const handleConflict = useEffectEvent(onConflict);

  useEffect(() => {
    const listener = (conflict: Conflict) => handleConflict(conflict);
    conflicts.add(listener);
    return () => {
      conflicts.delete(listener);
    };
  }, [conflicts]);

  return { status, change: saver.change, draft: saver.draft };
}
