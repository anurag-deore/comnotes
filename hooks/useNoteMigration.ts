'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { downloadBackup } from '@/lib/downloadBackup';
import { findLegacyNotes, migrateNotes, type LegacyNote, type MigrationResult } from '@/lib/notes';
import { migrationSummary } from '@/lib/migrationText';

export type MigrationPhase = 'idle' | 'exporting' | 'updating';

// Older notes (CNOTE-21): checked once per unlocked session once `ready` (the list has loaded),
// then updated only when the user asks. The banner shows while `legacy` isn't empty.
export function useNoteMigration(ready: boolean) {
  const [legacy, setLegacy] = useState<LegacyNote[]>([]);
  const [phase, setPhase] = useState<MigrationPhase>('idle');
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    findLegacyNotes().then(setLegacy, (error) => console.error('Error checking for older notes:', error));
  }, [ready]);

  const exportBackup = useCallback(async () => {
    setPhase('exporting');
    try {
      await downloadBackup();
      toast.success('Backup downloaded');
    } catch (error) {
      console.error('Error exporting notes:', error);
      toast.error("Couldn't create the backup. Check your connection and try again.");
    } finally {
      setPhase('idle');
    }
  }, []);

  // Resolves to how many notes still need it
  const update = useCallback(async () => {
    setPhase('updating');
    setDone(0);
    const outcome = await migrateNotes(legacy, new Date(), setDone);
    // Skipped or failed notes may still need it; a fresh check says which
    let remaining: LegacyNote[] = [];
    if (outcome.skipped || outcome.failed) {
      remaining = await findLegacyNotes().catch((error) => {
        console.error('Error checking for older notes:', error);
        return legacy;
      });
    }
    setLegacy(remaining);
    setResult(remaining.length ? outcome : null);
    setPhase('idle');
    if (!remaining.length && outcome.updated) toast.success(migrationSummary({ ...outcome, skipped: 0 }));
    return remaining.length;
  }, [legacy]);

  return {
    legacy: dismissed ? [] : legacy,
    phase,
    done,
    result,
    exportBackup,
    update,
    dismiss: () => setDismissed(true),
  };
}
