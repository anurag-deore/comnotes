'use client';

import { useId } from 'react';
import { Download, History, Loader2, X } from 'lucide-react';
import type { MigrationResult } from '@/lib/notes';
import type { MigrationPhase } from '@/hooks/useNoteMigration';
import { migrationHeading, migrationProgress, migrationSummary } from '@/lib/migrationText';
import { Button, IconButton } from '@/components/ui/Button';

interface MigrationBannerProps {
  count: number;
  phase: MigrationPhase;
  done: number;
  // The last run, when it left notes behind
  result: MigrationResult | null;
  onExport: () => void;
  onUpdate: () => void;
  onDismiss: () => void;
}

// aria-disabled rather than disabled while busy, so the focused button keeps focus
const BUSY_AWARE = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

// "N older notes need updating", with Download backup and Update now (CNOTE-21)
export function MigrationBanner({ count, phase, done, result, onExport, onUpdate, onDismiss }: MigrationBannerProps) {
  const id = useId();
  const busy = phase !== 'idle';
  let status = '';
  if (phase === 'updating') status = migrationProgress(done, count);
  else if (phase === 'exporting') status = 'Preparing your backup…';
  else if (result) status = migrationSummary(result);

  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
      className="mx-2 mt-2 shrink-0 animate-fade-in rounded-xl bg-primary-pale p-4 text-ink md:mx-0 md:mt-0 md:mb-3"
    >
      <div className="flex items-start gap-3">
        <History aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-body-md font-semibold">
            {migrationHeading(count, result !== null)}
          </h2>
          <p className="mt-1 text-body-sm text-body">
            They were saved by an earlier version of ComNotes. Updating fills in missing details and converts old
            formatting; they&apos;ll look the same. You can download a backup first.
          </p>
          <p role="status" className="mt-2 text-body-sm font-semibold empty:hidden">
            {status}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="tertiary"
              size="sm"
              className={BUSY_AWARE}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onExport();
              }}
            >
              {phase === 'exporting' ? (
                <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
              ) : (
                <Download aria-hidden className="size-4" />
              )}
              Download backup
            </Button>
            <Button
              variant="primary"
              size="sm"
              className={BUSY_AWARE}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onUpdate();
              }}
            >
              {phase === 'updating' && <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />}
              {phase === 'updating' ? 'Updating…' : result ? 'Try again' : 'Update now'}
            </Button>
          </div>
        </div>
        <IconButton
          label="Hide until next time"
          icon={X}
          disabled={busy}
          onClick={onDismiss}
          className="-mt-2 -mr-2 hover:bg-canvas"
        />
      </div>
    </section>
  );
}
