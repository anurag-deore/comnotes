'use client';

import { useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { nextRadioIndex } from '@/lib/rovingFocus';
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';
import { getThemePreference, setThemePreference, subscribeThemePreference } from '@/lib/themeStore';
import { cn } from '@/lib/cn';

const OPTIONS: Record<ThemePreference, { label: string; icon: LucideIcon }> = {
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
  system: { label: 'System', icon: Monitor },
};

// Light / Dark / System as an ARIA radio group: one tab stop, arrows move and select (CNOTE-15)
export function ThemeSwitcher({ className }: { className?: string }) {
  // The server doesn't know the stored choice; the client reads it after hydration
  const value = useSyncExternalStore(subscribeThemePreference, getThemePreference, () => 'system' as const);
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextRadioIndex(THEME_PREFERENCES.indexOf(value), event.key, THEME_PREFERENCES.length);
    if (next === null) return;
    event.preventDefault();
    setThemePreference(THEME_PREFERENCES[next]);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
      className={cn('grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1', className)}
    >
      {THEME_PREFERENCES.map((pref) => {
        const { label, icon: Icon } = OPTIONS[pref];
        const checked = pref === value;
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => setThemePreference(pref)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-body-sm font-semibold',
              'transition-[color,background-color,scale] motion-safe:active:scale-[0.97]',
              checked ? 'bg-ink text-canvas' : 'text-body hover:bg-canvas-soft hover:text-ink',
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
