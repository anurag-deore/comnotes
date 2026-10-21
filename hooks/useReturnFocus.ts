'use client';

import { useRef } from 'react';

interface Entry {
  previous: HTMLElement | null;
}

// Dialogs using this hook that are open now
const openDialogs = new Set<Entry>();

// Radix Dialog returns focus to its Dialog.Trigger. Dialogs opened from the keyboard (CNOTE-24) or a
// menu have none, so this remembers what had focus on open and puts it back on close — unless
// whatever ran on close already moved focus somewhere (a command, another dialog).
export function useReturnFocus() {
  const entry = useRef<Entry>({ previous: null });
  const onOpenAutoFocus = () => {
    entry.current.previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.add(entry.current);
  };
  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    const self = entry.current;
    const { previous } = self;
    openDialogs.delete(self);
    self.previous = null;
    const active = document.activeElement;
    if (!active || active === document.body) {
      if (previous?.isConnected) previous.focus();
      return;
    }
    // A dialog opened as this one closed (Settings from the palette) took focus while this one was
    // still on screen; it returns focus where this one would have
    const container = event.target instanceof Node ? event.target : null;
    for (const other of openDialogs) {
      const stale = !other.previous || other.previous === document.body || !other.previous.isConnected
        || container?.contains(other.previous) === true;
      if (stale) other.previous = previous;
    }
  };
  return { onOpenAutoFocus, onCloseAutoFocus };
}
