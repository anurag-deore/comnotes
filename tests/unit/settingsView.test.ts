// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { autoLockSummary } from '@/lib/lockSettings';
import type { NoteSearch } from '@/hooks/useNoteSearch';
import type { CommandState } from '@/lib/shortcuts';

vi.mock('@/lib/firebase', () => ({
  db: {}, offlineCacheEnabled: false, dropOfflineCache: vi.fn(), settlePendingWrites: vi.fn(),
}));
vi.mock('@/contexts/AutosaveContext', () => ({ useSaver: () => ({ saver: { flush: vi.fn() } }) }));

const { SettingsDialog } = await import('@/components/notes/SettingsDialog');
const { SidebarMenu } = await import('@/components/notes/SidebarMenu');
const { CommandPalette } = await import('@/components/notes/CommandPalette');

let root: Root | null = null;
let host: HTMLElement;

function render(element: ReturnType<typeof createElement>) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}
const rerender = (element: ReturnType<typeof createElement>) => act(() => root?.render(element));
// Radix moves focus back on close in a timeout
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)));
const keydown = (target: Element, key: string) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
});
const panel = () => document.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const byRole = (role: string) => [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)];
const named = (role: string, name: string) =>
  byRole(role).find((el) => (el.getAttribute('aria-label') ?? el.textContent)?.trim() === name);

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout: Radix's popper measures with ResizeObserver
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  document.body.replaceChildren();
  Reflect.deleteProperty(window, 'matchMedia');
});

function settings(overrides: Record<string, unknown> = {}) {
  const props = { open: true, onOpenChange: vi.fn(), onShowShortcuts: vi.fn(), onLock: vi.fn(), ...overrides };
  render(createElement(SettingsDialog, props));
  return props;
}

describe('settings window', () => {
  test('categories as tabs; General has Theme and a shortcuts button', () => {
    const props = settings();
    const dialog = byRole('dialog')[0];
    expect(dialog.querySelector('h2')?.textContent).toBe('Settings');
    const list = byRole('tablist')[0];
    expect(list.getAttribute('aria-label')).toBe('Settings categories');
    expect(byRole('tab').map((tab) => tab.textContent)).toEqual(['General', 'Data controls', 'Security']);
    expect(named('tab', 'General')?.getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('h3')?.textContent).toBe('General');
    expect(panel().querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Theme');
    const view = [...panel().querySelectorAll('button')].find((b) => b.textContent === 'View keyboard shortcuts');
    act(() => view?.click());
    expect(props.onShowShortcuts).toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  test('Data controls: the offline switch and Backup as rows', () => {
    settings({ initialTab: 'data' });
    expect(panel().querySelector('h3')?.textContent).toBe('Data controls');
    const toggle = panel().querySelector('[role="switch"]')!;
    expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)?.textContent)
      .toBe('Keep notes available offline on this device');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(panel().textContent).toContain('Download all notes, or import a backup as new notes.');
    expect([...panel().querySelectorAll('button')].some((b) => b.textContent === 'Backup')).toBe(true);
  });

  test('Security: auto-lock timing from the constants, Lock now, and the passphrase note', () => {
    const props = settings({ initialTab: 'security' });
    expect(panel().textContent).toContain(autoLockSummary());
    expect(panel().textContent).toContain("It's never stored, so a lost passphrase can't be recovered.");
    act(() => [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Lock now')?.click());
    expect(props.onLock).toHaveBeenCalled();
  });

  test('vertical categories from 768px (Up/Down), a row below (Left/Right)', async () => {
    settings();
    expect(byRole('tablist')[0].getAttribute('aria-orientation')).toBe('horizontal');
    act(() => named('tab', 'General')?.focus());
    keydown(named('tab', 'General')!, 'ArrowRight');
    await settle();
    expect(named('tab', 'Data controls')?.getAttribute('aria-selected')).toBe('true');
    act(() => root?.unmount());

    window.matchMedia = ((query: string) => ({
      matches: query === '(min-width: 768px)', addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    settings();
    expect(byRole('tablist')[0].getAttribute('aria-orientation')).toBe('vertical');
    act(() => named('tab', 'General')?.focus());
    keydown(named('tab', 'General')!, 'ArrowDown');
    await settle();
    expect(named('tab', 'Data controls')?.getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('h3')?.textContent).toBe('Data controls');
  });
});

describe('sidebar menu', () => {
  function menu(overrides: Record<string, unknown> = {}) {
    const props = {
      archivedCount: 2, trashedCount: 0, onShowView: vi.fn(), onOpenSettings: vi.fn(), onLock: vi.fn(), ...overrides,
    };
    render(createElement(SidebarMenu, props));
    const trigger = host.querySelector('button')!;
    return { props, trigger, open: () => keydown(trigger, 'Enter') };
  }

  test('a gear named Menu opens Archive (count), Trash, Settings, then Lock after a separator', () => {
    const { trigger, open } = menu();
    expect(trigger.getAttribute('aria-label')).toBe('Menu');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    open();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = byRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label') ?? item.textContent)).toEqual([
      'Archive (2)', 'Trash', 'Settings', 'Lock',
    ]);
    expect(items[2].nextElementSibling?.getAttribute('role')).toBe('separator');
  });

  test('items call the handlers', () => {
    const { props, open } = menu();
    open();
    act(() => named('menuitem', 'Archive (2)')?.click());
    expect(props.onShowView).toHaveBeenCalledWith('archive');
    open();
    act(() => named('menuitem', 'Trash')?.click());
    expect(props.onShowView).toHaveBeenCalledWith('trash');
    open();
    act(() => named('menuitem', 'Lock')?.click());
    expect(props.onLock).toHaveBeenCalled();
  });

  test('Settings opens once the menu has closed, with focus back on the gear', async () => {
    const { props, trigger, open } = menu();
    open();
    act(() => named('menuitem', 'Settings')?.click());
    await settle();
    expect(byRole('menu')).toEqual([]);
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('settings focus', () => {
  test('closing returns focus to what had it when Settings opened (the gear)', async () => {
    const gear = document.createElement('button');
    document.body.append(gear);
    gear.focus();
    const props = { open: true, onOpenChange: vi.fn(), onShowShortcuts: vi.fn(), onLock: vi.fn() };
    render(createElement(SettingsDialog, props));
    expect(byRole('dialog')[0].contains(document.activeElement)).toBe(true);
    rerender(createElement(SettingsDialog, { ...props, open: false }));
    await settle();
    expect(document.activeElement).toBe(gear);
  });

  test('opened from the palette, closing returns focus to where the palette was opened', async () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const state: CommandState = { hasNote: false, noteArchived: false, noteLocked: false, noteReadable: false };
    const search = {
      query: '', setQuery: vi.fn(), clear: vi.fn(), prepare: vi.fn(), includeArchive: false, setIncludeArchive: vi.fn(),
      searched: '', total: 0, results: [], status: 'idle', find: vi.fn(() => []),
    } as NoteSearch;
    let paletteOpen = true;
    let settingsOpen = false;
    const view = () => createElement('div', null,
      createElement(CommandPalette, {
        open: paletteOpen, state, mac: true, search, onOpenNote: vi.fn(),
        onOpenChange: (next: boolean) => {
          paletteOpen = next;
          rerender(view());
        },
        onRun: (id: string) => {
          if (id === 'open-settings') settingsOpen = true;
          rerender(view());
        },
      }),
      createElement(SettingsDialog, {
        open: settingsOpen, onShowShortcuts: vi.fn(), onLock: vi.fn(),
        onOpenChange: (next: boolean) => {
          settingsOpen = next;
          rerender(view());
        },
      }));
    render(view());
    const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'settings');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    keydown(input, 'Enter');
    await settle();
    expect(settingsOpen).toBe(true);
    expect(byRole('dialog')[0].querySelector('h2')?.textContent).toBe('Settings');
    keydown(document.activeElement!, 'Escape');
    await settle();
    expect(settingsOpen).toBe(false);
    expect(document.activeElement).toBe(before);
  });
});
