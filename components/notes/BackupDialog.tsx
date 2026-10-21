'use client';

import { useId, useRef, useState, type ChangeEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Archive, Download, Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ERRORS, MAX_BACKUP_BYTES, backupFileName, parseBackup, planImport, type ImportedNote } from '@/lib/backup';
import { sanitizeNoteHtml } from '@/lib/editorContent';
import { ImportError, fetchAllNotes, importNotes } from '@/lib/notes';
import { Button, IconButton } from '@/components/ui/Button';

type Phase = 'idle' | 'exporting' | 'reading' | 'confirm' | 'importing';

interface ImportPlan {
  fileName: string;
  create: ImportedNote[];
  duplicates: number;
  invalid: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// Zip and Markdown code (fflate, @tiptap/markdown) loads only when a backup is made or read
const loadBackupZip = () => import('@/lib/backupZip');

// aria-disabled rather than disabled while busy, so the focused button keeps focus
const BUSY_AWARE = 'mt-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

// Lets the busy state paint before synchronous work (zipping, converting) starts
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function downloadFile(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start the download after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Backup: export every note as a zip (notes.json + Markdown), or import a backup as new notes (CNOTE-19)
export function BackupDialog() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [written, setWritten] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const errorId = `${id}-error`;
  const busy = phase === 'exporting' || phase === 'reading' || phase === 'importing';

  const reset = () => {
    setPhase('idle');
    setError(null);
    setPlan(null);
    setWritten(0);
  };

  // Can't be dismissed while it works, so a write isn't left half-reported
  const onOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    setOpen(next);
  };

  const fail = (message: string) => {
    setError(message);
    setPhase('idle');
  };

  const exportBackup = async () => {
    setError(null);
    setPhase('exporting');
    try {
      await nextFrame();
      const [{ buildBackupZip }, notes] = await Promise.all([loadBackupZip(), fetchAllNotes()]);
      const now = new Date();
      downloadFile(buildBackupZip(notes, now), backupFileName(now), 'application/zip');
      setPhase('idle');
      toast.success('Backup downloaded');
    } catch (cause) {
      console.error('Error exporting notes:', cause);
      fail("Couldn't create the backup. Check your connection and try again.");
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Choosing the same file again should still fire a change
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_BACKUP_BYTES) {
      fail(ERRORS.tooLarge);
      return;
    }
    setPhase('reading');
    try {
      const { readBackupText } = await loadBackupZip();
      const read = readBackupText(new Uint8Array(await file.arrayBuffer()));
      if (!read.ok) return fail(read.error);
      const parsed = parseBackup(read.text);
      if (!parsed.ok) return fail(parsed.error);
      await nextFrame();
      const existing = await fetchAllNotes();
      const { create, duplicates } = planImport(parsed.notes, existing, sanitizeNoteHtml);
      setPlan({ fileName: file.name, create, duplicates, invalid: parsed.invalid });
      setPhase('confirm');
    } catch (cause) {
      console.error('Error reading backup:', cause);
      fail("Couldn't read this backup. Check your connection and try again.");
    }
  };

  const cancelImport = () => {
    setPlan(null);
    setPhase('idle');
    requestAnimationFrame(() => importButtonRef.current?.focus());
  };

  const runImport = async () => {
    if (!plan) return;
    const total = plan.create.length;
    setWritten(0);
    setPhase('importing');
    try {
      const count = await importNotes(plan.create, setWritten);
      toast.success(`Imported ${plural(count, 'note')}`);
      reset();
      setOpen(false);
    } catch (cause) {
      console.error('Error importing notes:', cause);
      const done = cause instanceof ImportError ? cause.written : 0;
      setPlan(null);
      fail(
        `Import stopped after ${done.toLocaleString()} of ${plural(total, 'note')}. ` +
          'Try again: notes already imported are skipped as duplicates.',
      );
      requestAnimationFrame(() => importButtonRef.current?.focus());
    }
  };

  const statusText = {
    idle: '',
    exporting: 'Preparing your backup…',
    reading: 'Checking the backup…',
    confirm: '',
    importing: `Importing ${written.toLocaleString()} of ${plural(plan?.create.length ?? 0, 'note')}…`,
  }[phase];

  const trashed = plan?.create.filter((note) => note.deletedAt).length ?? 0;
  const locked = plan?.create.filter((note) => note.sealed).length ?? 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm" className="w-full">
          <Archive aria-hidden className="size-4" />
          Backup
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-busy={busy}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-canvas p-6 text-ink shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-display-xs">Backup</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} disabled={busy} className="-mt-2 -mr-3" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-body-sm text-body">
            Download all your notes, or add notes from a backup.
          </Dialog.Description>

          {phase === 'confirm' && plan ? (
            <section aria-labelledby={`${id}-confirm`} className="mt-6">
              <h3 id={`${id}-confirm`} className="text-body-md font-semibold break-words">
                {plan.create.length > 0 ? `Import from “${plan.fileName}”?` : 'Nothing new to import'}
              </h3>
              <ul className="mt-2 list-disc pl-5 text-body-sm text-body">
                <li>
                  {plural(plan.create.length, 'new note')} to add
                  {trashed > 0 && ` (${trashed.toLocaleString()} in Trash)`}
                </li>
                {locked > 0 && <li>{plural(locked, 'locked note')}, still encrypted with your passphrase</li>}
                {plan.duplicates > 0 && <li>{plural(plan.duplicates, 'duplicate')} skipped</li>}
                {plan.invalid > 0 && <li>{plural(plan.invalid, 'invalid entry', 'invalid entries')} ignored</li>}
              </ul>
              {plan.create.length > 0 && (
                <p className="mt-3 text-body-sm text-body">Imported notes are added as new notes. Nothing is overwritten.</p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                {plan.create.length > 0 ? (
                  <>
                    <Button size="sm" variant="secondary" autoFocus onClick={cancelImport}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => void runImport()}>
                      Import {plural(plan.create.length, 'note')}
                    </Button>
                  </>
                ) : (
                  <Dialog.Close asChild>
                    <Button size="sm" variant="secondary" autoFocus>
                      Close
                    </Button>
                  </Dialog.Close>
                )}
              </div>
            </section>
          ) : (
            <div className="mt-6 flex flex-col gap-6">
              <section aria-labelledby={`${id}-export`}>
                <h3 id={`${id}-export`} className="text-body-md font-semibold">Export</h3>
                <p className="mt-1 text-body-sm text-body">
                  One zip with every note, Trash included: <code>notes.json</code> for importing, and a Markdown file per note.
                  Locked notes stay encrypted.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className={BUSY_AWARE}
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    if (!busy) void exportBackup();
                  }}
                >
                  {phase === 'exporting' ? (
                    <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
                  ) : (
                    <Download aria-hidden className="size-4" />
                  )}
                  {phase === 'exporting' ? 'Exporting…' : 'Download backup'}
                </Button>
              </section>

              <section aria-labelledby={`${id}-import`}>
                <h3 id={`${id}-import`} className="text-body-md font-semibold">Import</h3>
                <p className="mt-1 text-body-sm text-body">
                  Choose a backup zip or its <code>notes.json</code> (up to 20 MB). Notes are added as new notes; duplicates are
                  skipped.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json,application/zip,application/json"
                  tabIndex={-1}
                  aria-hidden
                  className="sr-only"
                  onChange={(event) => void chooseFile(event)}
                />
                <Button
                  ref={importButtonRef}
                  variant="tertiary"
                  size="sm"
                  className={BUSY_AWARE}
                  aria-disabled={busy || undefined}
                  aria-describedby={error ? errorId : undefined}
                  onClick={() => {
                    if (!busy) fileInputRef.current?.click();
                  }}
                >
                  {phase === 'reading' || phase === 'importing' ? (
                    <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
                  ) : (
                    <Upload aria-hidden className="size-4" />
                  )}
                  {phase === 'importing' ? 'Importing…' : 'Choose file…'}
                </Button>
              </section>
            </div>
          )}

          <p role="status" className="mt-4 text-body-sm text-body empty:hidden">
            {statusText}
          </p>
          {error && (
            <p id={errorId} role="alert" className="mt-4 rounded-md bg-negative-pale px-4 py-3 text-body-sm text-negative-deep">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
