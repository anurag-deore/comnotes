'use client';

import { useSyncExternalStore } from 'react';
import { isOnline, subscribeOnline } from '@/lib/onlineStatus';

const subscribe = (onChange: () => void) => subscribeOnline(window, onChange);

// navigator.onLine, kept current by online/offline events; online while server rendering (CNOTE-20)
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, () => isOnline(), () => true);
}
