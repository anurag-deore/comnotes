'use client';

import { useSyncExternalStore } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import type { SaveStatus as Status } from '@/lib/autosave';
import { saveStatusView } from '@/lib/saveStatus';
import { cn } from '@/lib/cn';

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const TONES = {
  idle: { className: '', icon: null },
  busy: { className: 'text-body', icon: Loader2 },
  positive: { className: 'text-positive-deep', icon: Check },
  negative: { className: 'text-negative-deep', icon: AlertCircle },
};

// Inline autosave state, announced politely; saving never raises a toast
export function SaveStatus({ status }: { status: Status }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const { label, tone } = saveStatusView(status, online);
  const { className, icon: Icon } = TONES[tone];

  return (
    <span role="status" className={cn('flex shrink-0 items-center text-body-sm whitespace-nowrap', className)}>
      {/* Keyed by tone: each new state fades in (Saving… → Saved), pending → saving doesn't re-animate */}
      <span key={tone} className="flex animate-fade-in items-center gap-1.5">
        {Icon && (
          <Icon
            aria-hidden
            className={cn(
              'size-4',
              tone === 'busy' && 'motion-safe:animate-spin',
              tone === 'positive' && 'animate-pop-in text-positive',
            )}
          />
        )}
        {/* Short label on phones, where the header is tight */}
        <span className={cn(tone === 'negative' && 'max-sm:sr-only')}>{label}</span>
      </span>
    </span>
  );
}
