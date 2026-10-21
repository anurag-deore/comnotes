'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Loader2, Lock, Trash2 } from 'lucide-react';
import type { Note } from '@/types/note';
import { noteVault } from '@/lib/vault';
import { LOCKED_TITLE } from '@/lib/lockedNotes';
import { Button, IconButton } from '@/components/ui/Button';
import { SidebarButtons, type SidebarToggles } from '@/components/notes/EditorPane';

// needs-passphrase: no key for this note yet. decrypting: key present, decryption running.
// failed: the key didn't open it (damaged). unreadable: payload from a newer version.
export type LockedState = 'needs-passphrase' | 'decrypting' | 'failed' | 'unreadable';

interface LockedNotePaneProps extends SidebarToggles {
  note: Note;
  state: LockedState;
  onTrash: () => void;
  // The passphrase was right; the page decrypts the note and moves focus into it
  onUnlocked: () => void;
}

const MESSAGES: Record<Exclude<LockedState, 'needs-passphrase'>, string> = {
  decrypting: 'Decrypting…',
  failed: "This note couldn't be decrypted. It may be damaged.",
  unreadable: "This note was locked with a newer version of ComNotes and can't be opened here.",
};

// A locked note that isn't decrypted yet (CNOTE-7): the unlock form in place of the editor
export function LockedNotePane({ note, state, onTrash, onUnlocked, ...toggles }: LockedNotePaneProps) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !note.encrypted) return;
    if (!passphrase) {
      setError('Enter your passphrase.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      // On success the page decrypts the note and swaps this pane for the editor
      if (await noteVault.unlock(passphrase, { id: note.id, payload: note.encrypted })) {
        setPassphrase('');
        onUnlocked();
        return;
      }
      setError('Wrong passphrase.');
      inputRef.current?.select();
    } catch (cause) {
      console.error('Error deriving key:', cause);
      setError("Couldn't use this passphrase. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas md:rounded-xl">
      <header className="flex shrink-0 items-center gap-1 border-b border-canvas-soft px-2 py-2 md:gap-3 md:px-4">
        <SidebarButtons {...toggles} />
        <h1 className="min-w-0 flex-1 truncate px-2 py-1 text-display-xs text-ink">{LOCKED_TITLE}</h1>
        <IconButton
          label="Move to Trash"
          icon={Trash2}
          onClick={onTrash}
          className="hover:bg-negative-pale hover:text-negative-deep"
        />
      </header>
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
        <div className="w-full max-w-sm animate-card-in rounded-xl bg-canvas-soft p-6">
          <span className="flex size-12 items-center justify-center rounded-full bg-canvas">
            <Lock aria-hidden className="size-6 text-ink" />
          </span>
          <h2 className="mt-4 text-body-md font-semibold text-ink">This note is locked</h2>
          {state === 'needs-passphrase' ? (
            <form className="mt-4" onSubmit={(event) => void submit(event)} noValidate>
              <label htmlFor={`${id}-passphrase`} className="block text-body-sm font-semibold text-ink">
                Passphrase
              </label>
              <input
                ref={inputRef}
                id={`${id}-passphrase`}
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : `${id}-hint`}
                className="mt-2 block w-full rounded-md border border-ink bg-canvas px-4 py-3 text-body-md text-ink aria-invalid:border-negative"
              />
              {error ? (
                <p id={`${id}-error`} role="alert" className="mt-2 text-body-sm text-negative-deep">
                  {error}
                </p>
              ) : (
                <p id={`${id}-hint`} className="mt-2 text-body-sm text-body">
                  Asked once per session. Locking the app forgets it.
                </p>
              )}
              <Button type="submit" variant="primary" aria-disabled={busy || undefined} className="mt-4 w-full">
                {busy && <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />}
                {busy ? 'Unlocking…' : 'Unlock note'}
              </Button>
            </form>
          ) : (
            <p role="status" className="mt-2 text-body-sm text-body">
              {MESSAGES[state]}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
