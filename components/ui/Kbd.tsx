import { Fragment, useSyncExternalStore } from 'react';
import { isMacPlatform, keyTokens } from '@/lib/shortcuts';
import { cn } from '@/lib/cn';

const noSubscription = () => () => undefined;

function currentPlatform(): string {
  const { userAgentData, platform } = navigator as Navigator & { userAgentData?: { platform?: string } };
  return userAgentData?.platform || platform || '';
}

// ⌘ on Apple platforms, Ctrl elsewhere (CNOTE-24). The server renders the non-Mac labels.
export function useIsMac(): boolean {
  return useSyncExternalStore(noSubscription, () => isMacPlatform(currentPlatform()), () => false);
}

// One binding as keycaps: ⌥ ⌘ N on Mac, Ctrl + Alt + N elsewhere
export function Keys({ keys, mac, className }: { keys: string; mac: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5', className)}>
      {keyTokens(keys, mac).map((token, i) => (
        <Fragment key={i}>
          {i > 0 && !mac && <span aria-hidden className="text-caption text-body">+</span>}
          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-canvas-soft bg-canvas px-1.5 font-sans text-caption font-semibold text-body">
            {token}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
