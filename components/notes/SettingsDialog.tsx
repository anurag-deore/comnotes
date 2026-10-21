'use client';

import { useSyncExternalStore, type ComponentType, type ReactNode, type SVGProps } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Separator from '@radix-ui/react-separator';
import * as Tabs from '@radix-ui/react-tabs';
import { Database, Lock, Settings2, ShieldCheck, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { OfflineSetting } from '@/components/notes/OfflineSetting';
import { BackupDialog } from '@/components/notes/BackupDialog';
import { DESKTOP } from '@/components/notes/Sidebar';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { autoLockSummary } from '@/lib/lockSettings';

export type SettingsTab = 'general' | 'data' | 'security';

export const SETTINGS_TABS: readonly { id: SettingsTab; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'data', label: 'Data controls', icon: Database },
  { id: 'security', label: 'Security', icon: ShieldCheck },
];

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The category shown when the dialog opens
  initialTab?: SettingsTab;
  onShowShortcuts: () => void;
  onLock: () => void;
}

// The category list is a column from 768px up and a scrolling row below, so arrow keys follow it
function subscribeDesktop(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const isDesktop = () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches;

// Label and optional description on the left, the control on the right (below it when narrow)
function SettingRow({ label, description, children }: { label: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-0 flex-1 basis-32">
        <p className="text-body-sm font-semibold text-ink">{label}</p>
        {description && <p className="mt-0.5 text-body-sm text-body">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Pane({ value, title, children }: { value: SettingsTab; title: string; children: ReactNode }) {
  return (
    <Tabs.Content value={value} className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-4 outline-none md:pt-4">
      <h3 className="text-body-md font-semibold">{title}</h3>
      <div className="mt-1 divide-y divide-canvas-soft">{children}</div>
    </Tabs.Content>
  );
}

// Settings window: categories on the left, the chosen category's rows on the right. Opened from the
// sidebar menu and the command palette, so focus goes back to whatever had it.
export function SettingsDialog({ open, onOpenChange, initialTab = 'general', onShowShortcuts, onLock }: SettingsDialogProps) {
  const { onOpenAutoFocus, onCloseAutoFocus } = useReturnFocus();
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => true);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-canvas text-ink shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in md:h-[min(32rem,calc(100dvh-2rem))]"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 py-2 pr-3 pl-6">
            <Dialog.Title className="text-display-xs">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Theme, shortcuts, offline copy, backup and locking</Dialog.Description>
          <Separator.Root decorative className="h-px shrink-0 bg-canvas-soft" />

          {/* Mounted per opening, so it starts on initialTab every time */}
          <Tabs.Root
            defaultValue={initialTab}
            orientation={desktop ? 'vertical' : 'horizontal'}
            className="flex min-h-0 flex-1 flex-col md:flex-row"
          >
            <Tabs.List
              aria-label="Settings categories"
              className="flex shrink-0 gap-1 overflow-x-auto p-3 max-md:border-b max-md:border-canvas-soft md:w-48 md:flex-col md:overflow-visible"
            >
              {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 text-body-sm font-semibold whitespace-nowrap text-body transition-colors hover:bg-canvas-soft hover:text-ink data-[state=active]:bg-canvas-soft data-[state=active]:text-ink"
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Pane value="general" title="General">
              <SettingRow label="Theme">
                <ThemeSwitcher className="w-full bg-canvas-soft sm:w-auto" />
              </SettingRow>
              <SettingRow label="Keyboard shortcuts">
                {/* Opens on top, so closing it comes back here */}
                <Button variant="secondary" size="sm" onClick={onShowShortcuts}>
                  View<span className="sr-only"> keyboard shortcuts</span>
                </Button>
              </SettingRow>
            </Pane>

            <Pane value="data" title="Data controls">
              <OfflineSetting variant="row" className="py-4" />
              <SettingRow label="Backup" description="Download all notes, or import a backup as new notes.">
                <BackupDialog />
              </SettingRow>
            </Pane>

            <Pane value="security" title="Security">
              <SettingRow label="Lock ComNotes" description={autoLockSummary()}>
                <Button variant="tertiary" size="sm" onClick={onLock}>
                  <Lock aria-hidden className="size-4 shrink-0" />
                  Lock now
                </Button>
              </SettingRow>
              <SettingRow
                label="Locked notes"
                description="One passphrase for all locked notes. It's never stored, so a lost passphrase can't be recovered."
              />
            </Pane>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
