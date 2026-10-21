// Connectivity as the browser reports it (CNOTE-20). navigator.onLine can say "online" on a network
// with no internet; then saves fail as before and the autosaver's retry applies.

type ConnectionTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

// Without a navigator (server rendering) we count as online
export function isOnline(nav: { onLine?: boolean } | undefined = typeof navigator === 'undefined' ? undefined : navigator) {
  return nav?.onLine !== false;
}

// Calls onChange on every online/offline event; returns the unsubscribe function
export function subscribeOnline(target: ConnectionTarget, onChange: () => void) {
  target.addEventListener('online', onChange);
  target.addEventListener('offline', onChange);
  return () => {
    target.removeEventListener('online', onChange);
    target.removeEventListener('offline', onChange);
  };
}

interface ConnectionState {
  online: boolean;
  // The autosaver holds changes that haven't reached the server
  unsaved: boolean;
  // Came back online a moment ago
  reconnected: boolean;
}

// What the offline pill says, or null when there's nothing to say
export function connectionMessage({ online, unsaved, reconnected }: ConnectionState) {
  if (!online) {
    return {
      title: 'Offline',
      detail: unsaved ? "Changes will save when you're back online" : 'Notes you have open stay available',
    };
  }
  return reconnected ? { title: 'Back online', detail: null } : null;
}
