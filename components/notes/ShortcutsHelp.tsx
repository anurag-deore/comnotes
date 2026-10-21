'use client';

import { Fragment } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { COMMAND_GROUPS, COMMANDS } from '@/lib/shortcuts';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { IconButton } from '@/components/ui/Button';
import { Keys } from '@/components/ui/Kbd';

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mac: boolean;
}

// Every command with a shortcut, from the registry (CNOTE-24), grouped, with this platform's keys
export function ShortcutsHelp({ open, onOpenChange, mac }: ShortcutsHelpProps) {
  // Opened by a key or the palette, not a Dialog.Trigger
  const { onOpenAutoFocus, onCloseAutoFocus } = useReturnFocus();
  const groups = COMMAND_GROUPS
    .map((group) => ({ group, commands: COMMANDS.filter((c) => c.group === group && c.keys.length > 0) }))
    .filter(({ commands }) => commands.length > 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-canvas p-6 text-ink shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-display-xs">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} className="-mt-2 -mr-3" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-body-sm text-body">
            Keys without {mac ? '⌘' : 'Ctrl'} or {mac ? '⌥' : 'Alt'} don&apos;t apply while you type in a field or the editor.
          </Dialog.Description>

          {groups.map(({ group, commands }) => (
            <section key={group} aria-labelledby={`shortcuts-${group}`} className="mt-6">
              <h3 id={`shortcuts-${group}`} className="text-caption font-semibold text-body">{group}</h3>
              <dl className="mt-2 divide-y divide-canvas-soft">
                {commands.map((command) => (
                  <div key={command.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                    <dt className="text-body-sm">
                      {command.label}
                      {command.hint && <span className="block text-caption text-body">{command.hint}</span>}
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {command.keys.map((keys, i) => (
                        <Fragment key={keys}>
                          {i > 0 && <span className="text-caption text-body">or</span>}
                          <Keys keys={keys} mac={mac} />
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
