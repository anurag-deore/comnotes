'use client';

import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { unlock } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';

export default function PinLock() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { lockedForInactivity } = useAuth();
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsUnlocking(true);

    // On success the auth state change redirects to /notes
    try {
      await unlock(pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsUnlocking(false);
    }
  };

  const describedBy = [lockedForInactivity && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      {/* Auth form card: sage card on white, labelled input with an ink border */}
      <div className="w-full max-w-sm rounded-xl bg-canvas-soft p-6 md:p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-canvas">
          <Lock aria-hidden className="size-6 text-ink" />
        </span>
        <h1 className="mt-6 text-display-xs text-ink">Unlock ComNotes</h1>
        {lockedForInactivity && (
          <p id={hintId} className="mt-1 text-body-sm text-body">
            Locked after inactivity.
          </p>
        )}
        <form className="mt-6" onSubmit={handleSubmit} noValidate>
          <label htmlFor={inputId} className="block text-body-sm font-semibold text-ink">
            PIN
          </label>
          <input
            id={inputId}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="mt-2 block w-full rounded-md border border-ink bg-canvas px-4 py-3 text-body-md text-ink aria-invalid:border-negative"
          />
          {error && (
            <p id={errorId} role="alert" className="mt-2 text-body-sm text-negative-deep">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={isUnlocking} className="mt-6 w-full">
            {isUnlocking ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </div>
    </main>
  );
}
