'use client';

import { useId, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { noteVault, passphraseStrength, type LockedSample, type Strength } from '@/lib/vault';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

// setup: no locked note exists yet, so the passphrase can't be checked and is typed twice.
// verify: checked by decrypting an existing locked note. remove: confirm Remove lock.
export type LockDialogMode = 'setup' | 'verify' | 'remove';

interface LockDialogProps {
  mode: LockDialogMode | null;
  // An existing locked note to check the passphrase against (verify)
  sample: LockedSample | null;
  onClose: () => void;
  // The vault now has a key (setup / verify), or the user confirmed Remove lock
  onConfirm: () => void;
}

const STRENGTH: Record<Strength, { label: string; width: string; className: string }> = {
  weak: { label: 'Weak', width: 'w-1/3', className: 'bg-negative' },
  fair: { label: 'Fair', width: 'w-2/3', className: 'bg-warning' },
  strong: { label: 'Strong', width: 'w-full', className: 'bg-positive' },
};

const MISMATCH = "The passphrases don't match.";

const FIELD =
  'mt-2 block w-full rounded-md border border-ink bg-canvas px-4 py-3 text-body-md text-ink aria-invalid:border-negative';

const TITLES: Record<LockDialogMode, string> = {
  setup: 'Set a passphrase for locked notes',
  verify: 'Enter your passphrase',
  remove: 'Remove lock?',
};

const DESCRIPTIONS: Record<LockDialogMode, string> = {
  setup: 'Locked notes are encrypted on this device before they are saved. One passphrase opens all of them.',
  verify: 'The note is encrypted with the passphrase you use for locked notes.',
  remove: 'The title and text will be saved unencrypted again and can be read without the passphrase.',
};

// Lock note / Remove lock dialog (CNOTE-7). The passphrase lives in this component's state only
// until it is used, and is never stored.
export function LockDialog({ mode, sample, onClose, onConfirm }: LockDialogProps) {
  // The last open mode, so the content stays put while the dialog animates out
  const [shown, setShown] = useState(mode);
  if (mode && mode !== shown) setShown(mode);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const strength = STRENGTH[passphraseStrength(passphrase)];

  const reset = () => {
    setPassphrase('');
    setConfirmation('');
    setError('');
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const finish = () => {
    reset();
    onConfirm();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!passphrase) return setError('Enter a passphrase.');
    if (mode === 'setup' && passphrase !== confirmation) return setError(MISMATCH);
    setError('');
    setBusy(true);
    try {
      // Deriving the key takes about half a second on purpose (600 000 PBKDF2 rounds)
      const ok = mode === 'setup' ? await noteVault.setup(passphrase) : sample ? await noteVault.unlock(passphrase, sample) : false;
      if (ok) return finish();
      setBusy(false);
      setError(mode === 'setup' ? 'Locking was interrupted. Try again.' : 'Wrong passphrase.');
    } catch (cause) {
      console.error('Error deriving key:', cause);
      setBusy(false);
      setError("Couldn't use this passphrase. Try again.");
    }
  };

  const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined;

  return (
    <Dialog.Root open={mode !== null} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-busy={busy}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-canvas p-6 text-ink shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          {shown && (
            <>
              <div className="flex items-start justify-between gap-4">
                <Dialog.Title className="text-display-xs">{TITLES[shown]}</Dialog.Title>
                <Dialog.Close asChild>
                  <IconButton label="Close" icon={X} disabled={busy} className="-mt-2 -mr-3" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="mt-1 text-body-sm text-body">{DESCRIPTIONS[shown]}</Dialog.Description>

              {shown === 'remove' ? (
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button size="sm" variant="secondary" autoFocus>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button size="sm" variant="primary" onClick={finish}>
                    Remove lock
                  </Button>
                </div>
              ) : (
                <form className="mt-6" onSubmit={(event) => void submit(event)} noValidate>
                  {shown === 'setup' && (
                    <div className="mb-6 flex gap-3 rounded-md bg-warning px-4 py-3 text-body-sm text-warning-content">
                      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <p>
                        <strong>There is no way to recover a forgotten passphrase.</strong> It isn&apos;t stored anywhere, so if
                        you forget it, or mistype it now, your locked notes are lost for good. Write it down somewhere safe.
                      </p>
                    </div>
                  )}
                  <label htmlFor={`${id}-passphrase`} className="block text-body-sm font-semibold">
                    Passphrase
                  </label>
                  <input
                    id={`${id}-passphrase`}
                    type="password"
                    autoComplete={shown === 'setup' ? 'new-password' : 'current-password'}
                    autoFocus
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    aria-invalid={error && error !== MISMATCH ? true : undefined}
                    aria-describedby={describedBy(shown === 'setup' && hintId, !!error && errorId)}
                    className={FIELD}
                  />
                  {shown === 'setup' && (
                    <>
                      <div id={hintId} className="mt-2 text-body-sm text-body">
                        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-canvas-soft">
                          <div
                            className={cn(
                              'h-full rounded-full transition-[width,background-color]',
                              passphrase ? [strength.width, strength.className] : 'w-0',
                            )}
                          />
                        </div>
                        <p className="mt-1">
                          {passphrase && <span className="font-semibold text-ink">{strength.label}. </span>}
                          Use 4 or more random words, or 16+ characters.
                        </p>
                      </div>
                      <label htmlFor={`${id}-confirm`} className="mt-4 block text-body-sm font-semibold">
                        Type it again
                      </label>
                      <input
                        id={`${id}-confirm`}
                        type="password"
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        aria-invalid={error === MISMATCH ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        className={FIELD}
                      />
                    </>
                  )}
                  {error && (
                    <p id={errorId} role="alert" className="mt-2 text-body-sm text-negative-deep">
                      {error}
                    </p>
                  )}
                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={close}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" variant="primary" aria-disabled={busy || undefined}>
                      {busy && <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />}
                      {busy ? 'Locking…' : 'Lock note'}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
