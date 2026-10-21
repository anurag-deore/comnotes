'use client';

import { useId, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { OFFLINE_UNLOCK_MESSAGE, unlock } from '@/lib/auth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { cssDurationMs, prefersReducedMotion } from '@/lib/motion';

// A short, soft side-to-side shake for a wrong PIN; skipped with reduced motion
const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-3px)' },
  { transform: 'translateX(2px)' },
  { transform: 'translateX(0)' },
];

// Duration and easing come from the motion tokens in globals.css
function shakeOptions(): KeyframeAnimationOptions {
  const tokens = getComputedStyle(document.documentElement);
  return {
    duration: cssDurationMs(tokens.getPropertyValue('--motion-slow'), 240),
    easing: tokens.getPropertyValue('--motion-ease-move').trim() || 'ease-out',
  };
}

export default function PinLock() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { lockedForInactivity } = useAuth();
  const online = useOnlineStatus();
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Wrong PIN: shake the card and put the cursor back in the PIN, selected, ready to retype
  const rejectPin = () => {
    if (!prefersReducedMotion(window)) cardRef.current?.animate(SHAKE, shakeOptions());
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsUnlocking(true);

    // On success the auth state change redirects to /notes
    try {
      await unlock(pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      rejectPin();
    } finally {
      setIsUnlocking(false);
    }
  };

  const describedBy = [lockedForInactivity && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-canvas p-4">
      <Logo className="h-14 w-auto text-ink" />
      {/* Auth form card: sage card on white, labelled input with an ink border */}
      <div ref={cardRef} className="w-full max-w-sm animate-card-in rounded-xl bg-canvas-soft p-6 md:p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-canvas">
          <Lock aria-hidden className="size-6 text-ink" />
        </span>
        <h1 className="mt-6 text-display-xs text-ink">Unlock ComNotes</h1>
        {lockedForInactivity && (
          <p id={hintId} className="mt-1 text-body-sm text-body">
            Locked after inactivity.
          </p>
        )}
        {/* The PIN is checked on Firebase's servers, so unlocking needs the network (CNOTE-20) */}
        {!online && error !== OFFLINE_UNLOCK_MESSAGE && (
          <p role="status" className="mt-1 text-body-sm text-body">
            {OFFLINE_UNLOCK_MESSAGE}
          </p>
        )}
        <form className="mt-6" onSubmit={handleSubmit} noValidate>
          <label htmlFor={inputId} className="block text-body-sm font-semibold text-ink">
            PIN
          </label>
          <input
            ref={inputRef}
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
