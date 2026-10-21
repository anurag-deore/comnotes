'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Settings, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { OfflineSetting } from '@/components/notes/OfflineSetting';
import { BackupDialog } from '@/components/notes/BackupDialog';

// Theme, offline copy and backup, kept out of the sidebar so the notes list has the room
export function SettingsDialog({ triggerClassName }: { triggerClassName?: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size="sm" className={triggerClassName}>
          <Settings aria-hidden className="size-4 shrink-0" />
          Settings
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-canvas p-6 text-ink shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-display-xs">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} className="-mt-2 -mr-3" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Theme, offline copy and backup</Dialog.Description>

          <section aria-labelledby="settings-appearance" className="mt-6">
            <h3 id="settings-appearance" className="text-caption font-semibold text-body">Appearance</h3>
            <ThemeSwitcher className="mt-2 bg-canvas-soft" />
          </section>

          <section aria-labelledby="settings-offline" className="mt-6">
            <h3 id="settings-offline" className="text-caption font-semibold text-body">This device</h3>
            <OfflineSetting className="mt-2 bg-canvas-soft" />
          </section>

          <section aria-labelledby="settings-backup" className="mt-6">
            <h3 id="settings-backup" className="text-caption font-semibold text-body">Backup</h3>
            <p className="mt-1 text-body-sm text-body">Download all notes, or import a backup as new notes.</p>
            <BackupDialog triggerClassName="mt-3 w-full" />
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
