'use client';

import { useId, useState } from 'react';
import toast from 'react-hot-toast';
import { useSaver } from '@/contexts/AutosaveContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { dropOfflineCache, offlineCacheEnabled, settlePendingWrites } from '@/lib/firebase';
import { changeOfflineCache, writeOfflineCache, type OfflineCacheChange } from '@/lib/offlineSetting';
import { isOnline } from '@/lib/onlineStatus';
import { browserStorage } from '@/lib/sidebarPreference';
import { cn } from '@/lib/cn';

// How long queued writes get to reach the server before the change is refused
const SETTLE_TIMEOUT_MS = 10_000;

const FAILURES: Record<Exclude<OfflineCacheChange, 'done'>, string> = {
  offline: 'Connect to the internet to change this.',
  unsaved: "Some changes haven't saved yet. Try again in a moment.",
  storage: "This browser couldn't save the setting.",
};

// "Keep notes available offline on this device" (CNOTE-20): a switch, per device. Firestore picks its
// cache when the page loads, so a change reloads (and so locks) the app.
export function OfflineSetting() {
  // What Firestore is using now; changes only take effect through the reload below
  const on = offlineCacheEnabled;
  const [busy, setBusy] = useState(false);
  const { saver } = useSaver();
  const online = useOnlineStatus();
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const result = await changeOfflineCache(!on, {
      isOnline: () => isOnline(),
      settle: async () => (await saver.flush()) && settlePendingWrites(SETTLE_TIMEOUT_MS),
      write: (next) => writeOfflineCache(browserStorage(), next),
      clearCache: dropOfflineCache,
      reload: () => window.location.reload(),
    });
    if (result === 'done') return;
    setBusy(false);
    toast.error(FAILURES[result]);
  };

  return (
    <div className="flex items-start gap-3 rounded-xl bg-canvas p-3">
      <div className="min-w-0 flex-1">
        <span id={labelId} className="block text-body-sm font-semibold text-ink">
          Keep notes available offline on this device
        </span>
        <span id={descriptionId} className="mt-0.5 block text-body-sm text-body">
          Keeps a copy in this browser, readable on this device even while ComNotes is locked (locked notes
          stay encrypted). Turn off on shared devices. Changing it locks ComNotes
          {online ? '' : ' and needs a connection'}.
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        aria-disabled={busy || !online}
        onClick={() => void toggle()}
        className="-m-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cn(
            'flex h-6 w-10 items-center rounded-full p-0.5 transition-colors',
            on ? 'bg-ink' : 'bg-mute',
          )}
        >
          <span
            className={cn(
              'size-5 rounded-full transition-transform motion-reduce:transition-none',
              'bg-canvas',
              on && 'translate-x-4',
            )}
          />
        </span>
      </button>
    </div>
  );
}
