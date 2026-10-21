'use client';

import { AlertCircle, Check, CloudOff, Loader2 } from 'lucide-react';
import type { SaveStatus as Status } from '@/lib/autosave';
import { saveStatusView } from '@/lib/saveStatus';
import { cn } from '@/lib/cn';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const TONES = {
  idle: { className: '', icon: null },
  busy: { className: 'text-body', icon: Loader2 },
  positive: { className: 'text-positive-deep', icon: Check },
  negative: { className: 'text-negative-deep', icon: AlertCircle },
  offline: { className: 'text-body', icon: CloudOff },
};

// Inline autosave state, announced politely; saving never raises a toast
export function SaveStatus({ status }: { status: Status }) {
  const online = useOnlineStatus();
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
        <span className={cn((tone === 'negative' || tone === 'offline') && 'max-sm:sr-only')}>{label}</span>
      </span>
    </span>
  );
}
