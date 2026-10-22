'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { OFFLINE_UNLOCK_MESSAGE, unlock } from '@/lib/auth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuth } from '@/contexts/AuthContext';
import { Button, IconButton } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { autoLockSummary } from '@/lib/lockSettings';
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
  const [showPin, setShowPin] = useState(false);
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

  const describedBy = [hintId, error && errorId].filter(Boolean).join(' ');

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-canvas">
      {/* Watercolor across the bottom, behind the card, fading into the page towards the top. It's drawn
          a little wider and lower than the page so its ragged sides and bottom edge are cut off. Already
          a small WebP, so served as is (and cached offline by the service worker) */}
      <Image
        src="/images/pin-scenery.webp"
        alt=""
        aria-hidden
        width={1699}
        height={926}
        unoptimized
        className="pointer-events-none absolute bottom-0 left-1/2 -z-10 h-auto w-[max(112%,56rem)] max-w-none -translate-x-1/2 translate-y-[16%] opacity-(--scenery-opacity) [filter:var(--scenery-filter)] [mask-image:linear-gradient(to_top,black_35%,transparent_85%)]"
      />

      <header className="flex justify-center px-4 pt-8 md:pt-10">
        <Logo className="h-16 w-auto text-ink md:h-20" />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pt-6 pb-[clamp(3rem,12vh,8rem)]">
        <div ref={cardRef} className="w-full max-w-sm animate-card-in rounded-xl bg-canvas p-6 shadow-raised md:p-8">
          <h1 className="text-display-xs text-ink">Unlock ComNotes</h1>
          <p id={hintId} className="mt-1 text-body-sm text-body">
            {lockedForInactivity ? 'Locked after inactivity. Enter your PIN to continue.' : 'Enter your PIN to open your notes.'}
          </p>
          {/* The PIN is checked on Firebase's servers, so unlocking needs the network (CNOTE-20) */}
          {!online && error !== OFFLINE_UNLOCK_MESSAGE && (
            <p role="status" className="mt-3 rounded-md bg-canvas-soft px-3 py-2 text-body-sm text-body">
              {OFFLINE_UNLOCK_MESSAGE}
            </p>
          )}
          <form className="mt-6" onSubmit={handleSubmit} noValidate>
            <label htmlFor={inputId} className="block text-body-sm font-semibold text-ink">
              PIN
            </label>
            <div className="relative mt-2">
              <input
                ref={inputRef}
                id={inputId}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                className="block w-full rounded-md border border-ink bg-canvas py-3 pr-14 pl-4 text-body-md text-ink aria-invalid:border-negative"
              />
              <IconButton
                label={showPin ? 'Hide PIN' : 'Show PIN'}
                icon={showPin ? EyeOff : Eye}
                aria-pressed={showPin}
                onClick={() => setShowPin((shown) => !shown)}
                className="absolute top-1/2 right-0.5 -translate-y-1/2"
              />
            </div>
            {error && (
              <p id={errorId} role="alert" className="mt-2 text-body-sm text-negative-deep">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={isUnlocking} className="mt-6 w-full">
              {isUnlocking ? 'Unlocking…' : 'Unlock'}
            </Button>
          </form>
          <p className="mt-4 flex items-start gap-2 text-caption text-body">
            <Lock aria-hidden className="mt-px size-3.5 shrink-0" />
            {autoLockSummary()}
          </p>
        </div>
      </div>
    </main>
  );
}
