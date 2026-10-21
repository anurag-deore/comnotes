'use client';

import { useRef, type ComponentType, type SVGProps } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Archive, Lock, Settings, Settings2, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import type { NoteView } from '@/lib/noteViews';

export interface SidebarMenuProps {
  archivedCount: number;
  trashedCount: number;
  onShowView: (view: NoteView) => void;
  onOpenSettings: () => void;
  onLock: () => void;
}

const ITEM =
  'flex min-h-11 cursor-default items-center gap-3 rounded-lg px-3 text-body-sm font-semibold text-ink outline-none ' +
  'select-none transition-colors data-highlighted:bg-canvas-soft';

function Item({ icon: Icon, label, count, onSelect }: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  count?: number;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      textValue={label}
      aria-label={count ? `${label} (${count})` : undefined}
      className={ITEM}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? <span className="pl-4 font-normal text-body tabular-nums">{count}</span> : null}
    </DropdownMenu.Item>
  );
}

// The gear beside the logo: Archive, Trash, Settings and Lock. Used by the sidebar and the drawer.
export function SidebarMenu({ archivedCount, trashedCount, onShowView, onOpenSettings, onLock }: SidebarMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Settings opens once the menu has closed and focus is back on the gear, so closing Settings
  // returns focus here instead of to a menu item that no longer exists
  const afterClose = useRef<(() => void) | null>(null);

  const onCloseAutoFocus = (event: Event) => {
    const run = afterClose.current;
    if (!run) return;
    afterClose.current = null;
    event.preventDefault();
    triggerRef.current?.focus();
    run();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild ref={triggerRef}>
        <IconButton label="Menu" icon={Settings} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          className="z-50 min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) rounded-xl bg-canvas p-1.5 text-ink shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <Item icon={Archive} label="Archive" count={archivedCount} onSelect={() => onShowView('archive')} />
          <Item icon={Trash2} label="Trash" count={trashedCount} onSelect={() => onShowView('trash')} />
          <Item
            icon={Settings2}
            label="Settings"
            onSelect={() => {
              afterClose.current = onOpenSettings;
            }}
          />
          <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-canvas-soft" />
          <Item icon={Lock} label="Lock" onSelect={onLock} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
