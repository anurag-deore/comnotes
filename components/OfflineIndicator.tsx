'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSaver } from '@/contexts/AutosaveContext';
import { connectionMessage } from '@/lib/onlineStatus';

const RECONNECTED_MS = 3000;

// A quiet pill while offline, and "Back online" for a moment after (CNOTE-20). The live region is
// always mounted so screen readers hear each change; pointer events pass through to the page.
export function OfflineIndicator() {
  const online = useOnlineStatus();
  const { status } = useSaver();
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onOnline = () => {
      setReconnected(true);
      clearTimeout(timer);
      timer = setTimeout(() => setReconnected(false), RECONNECTED_MS);
    };
    const onOffline = () => {
      clearTimeout(timer);
      setReconnected(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const message = connectionMessage({ online, unsaved: status !== 'idle' && status !== 'saved', reconnected });
  const Icon = online ? Wifi : CloudOff;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-50 flex justify-center px-4 md:inset-x-auto md:top-auto md:right-4 md:bottom-4 md:px-0"
    >
      {message && (
        <span
          key={message.title}
          className="flex max-w-full animate-fade-in items-center gap-2 rounded-full bg-ink px-4 py-2 text-body-sm text-canvas shadow-raised"
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span>
            <span className="font-semibold">{message.title}</span>
            {message.detail && <span>. {message.detail}</span>}
          </span>
        </span>
      )}
    </div>
  );
}
