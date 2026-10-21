'use client';

import { useRef } from 'react';

// Radix Dialog returns focus to its Dialog.Trigger. Dialogs opened from the keyboard (CNOTE-24) have
// none, so this remembers what had focus on open and puts it back on close — unless whatever ran
// on close already moved focus somewhere (a command, another dialog).
export function useReturnFocus() {
  const previous = useRef<HTMLElement | null>(null);
  const onOpenAutoFocus = () => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    const active = document.activeElement;
    if ((!active || active === document.body) && previous.current?.isConnected) previous.current.focus();
    previous.current = null;
  };
  return { onOpenAutoFocus, onCloseAutoFocus };
}
