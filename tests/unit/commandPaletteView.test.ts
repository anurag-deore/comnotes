// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommandPalette } from '@/components/notes/CommandPalette';
import { ShortcutsHelp } from '@/components/notes/ShortcutsHelp';
import type { NoteSearch, SearchResult } from '@/hooks/useNoteSearch';
import { highlightSegments } from '@/lib/searchHighlight';
import { COMMANDS, type CommandState } from '@/lib/shortcuts';
import type { Note } from '@/types/note';

const DAY = new Date('2026-10-01T00:00:00.000Z');
const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id, title: '', content: '', rev: 1, createdAt: DAY, updatedAt: DAY, deletedAt: null, archivedAt: null,
  locked: false, encrypted: null, ...extra,
});
const OPEN_NOTE: CommandState = { hasNote: true, noteArchived: false, noteLocked: false, noteReadable: true };

const hits: SearchResult[] = [
  { note: note('a'), archived: false, title: highlightSegments('<b>Plan</b> trip', ['plan']), snippet: [] },
  { note: note('b', { archivedAt: DAY }), archived: true, title: highlightSegments('Old plan', ['plan']), snippet: [] },
];

const search = (find = vi.fn((query: string) => (query.includes('plan') ? hits : []))): NoteSearch => ({
  query: '', setQuery: vi.fn(), clear: vi.fn(), prepare: vi.fn(), includeArchive: false, setIncludeArchive: vi.fn(),
  searched: '', total: 0, results: [], status: 'idle', find,
});

let root: Root | null = null;
let host: HTMLElement;

function render(element: ReturnType<typeof createElement>) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}

const input = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!;
const options = () => [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')];
const type = (value: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input(), value);
  input().dispatchEvent(new Event('input', { bubbles: true }));
});
const press = (key: string, extra: KeyboardEventInit = {}) => act(() => {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
});

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout, so no scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function palette(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true, onOpenChange: vi.fn(), state: OPEN_NOTE, mac: true, search: search(), now: DAY,
    onRun: vi.fn(), onOpenNote: vi.fn(), ...overrides,
  };
  render(createElement(CommandPalette, props));
  return props;
}

describe('command palette (AC-5, AC-6)', () => {
  test('a combobox over a listbox of commands with shortcut hints; loads search on open', () => {
    const props = palette();
    expect(props.search.prepare).toHaveBeenCalled();
    const field = input();
    expect(field.getAttribute('aria-expanded')).toBe('true');
    const listbox = document.getElementById(field.getAttribute('aria-controls')!);
    expect(listbox?.getAttribute('role')).toBe('listbox');
    const rows = options();
    expect(rows[0].textContent).toContain('Search notes');
    expect(rows.map((r) => r.textContent).join(' ')).not.toContain('Open command palette');
    expect(rows.find((r) => r.textContent?.includes('New note'))?.textContent).toContain('⌥⌘N');
    expect(field.getAttribute('aria-activedescendant')).toBe(rows[0].id);
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
  });

  test('typing filters; arrows move (wrapping) and Enter runs the active command', () => {
    const props = palette();
    type('theme');
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('Toggle light/dark theme')]);
    type('');
    const count = options().length;
    press('ArrowUp');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[count - 1].id);
    press('ArrowDown');
    press('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1].id);
    press('Enter');
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onRun).toHaveBeenCalledWith(COMMANDS.filter((c) => c.inPalette !== false)[1].id);
  });

  test('notes from the search index follow the commands; markup stays text; archived tagged', () => {
    const props = palette();
    type('plan');
    expect(props.search.find).toHaveBeenCalledWith('plan', expect.any(Number));
    const rows = options();
    const noteRows = rows.filter((r) => r.dataset.kind === 'note');
    expect(noteRows).toHaveLength(2);
    expect(noteRows[0].textContent).toContain('<b>Plan</b> trip');
    expect(document.querySelector('[role="listbox"] b')).toBeNull();
    expect(noteRows[1].textContent).toContain('Archived');
    act(() => noteRows[1].click());
    expect(props.onOpenNote).toHaveBeenCalledWith('b');
  });

  test('nothing matches: an empty state, Enter does nothing', () => {
    const props = palette();
    type('zzzz');
    expect(options()).toEqual([]);
    expect(document.body.textContent).toContain('No matching commands or notes');
    press('Enter');
    expect(props.onRun).not.toHaveBeenCalled();
  });

  test('Mod+K inside the palette closes it (Ctrl+K off Mac)', () => {
    const props = palette({ mac: false });
    press('k', { metaKey: true });
    expect(props.onOpenChange).not.toHaveBeenCalled();
    press('k', { ctrlKey: true });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  test('a command that moves focus keeps it; otherwise focus returns to where it was', async () => {
    const before = document.createElement('button');
    const elsewhere = document.createElement('input');
    document.body.append(before, elsewhere);
    before.focus();
    let open = true;
    const props: Record<string, unknown> = {
      state: OPEN_NOTE, mac: true, search: search(), now: DAY, onOpenNote: vi.fn(),
      onOpenChange: (next: boolean) => {
        open = next;
        act(() => root?.render(createElement(CommandPalette, { ...props, open } as never)));
      },
      onRun: (id: string) => {
        if (id === 'search') elsewhere.focus();
      },
    };
    render(createElement(CommandPalette, { ...props, open } as never));
    expect(document.activeElement).toBe(input());
    press('Enter');
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(open).toBe(false);
    expect(document.activeElement).toBe(elsewhere);

    before.focus();
    open = true;
    act(() => root?.render(createElement(CommandPalette, { ...props, open } as never)));
    type('theme');
    press('Enter');
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(document.activeElement).toBe(before);
    before.remove();
    elsewhere.remove();
  });

  test('hidden commands: no note open, no note commands', () => {
    palette({ state: { hasNote: false, noteArchived: false, noteLocked: false, noteReadable: false } });
    const text = options().map((o) => o.textContent).join(' ');
    expect(text).not.toContain('Archive note');
    expect(text).not.toContain('Move note to Trash');
    expect(text).toContain('New note');
  });
});

describe('shortcuts help (AC-7)', () => {
  test('lists every command with a binding, platform-aware', () => {
    render(createElement(ShortcutsHelp, { open: true, onOpenChange: vi.fn(), mac: true }));
    const dialog = document.querySelector('[role="dialog"]')!;
    for (const command of COMMANDS.filter((c) => c.keys.length > 0)) expect(dialog.textContent).toContain(command.label);
    expect(dialog.textContent).not.toContain('Show Archive');
    expect(dialog.textContent).toContain('⌥⌘N');
    expect(dialog.textContent).toContain('With a note open');
    expect(dialog.querySelectorAll('kbd').length).toBeGreaterThan(10);
  });

  test('Ctrl labels off Mac', () => {
    render(createElement(ShortcutsHelp, { open: true, onOpenChange: vi.fn(), mac: false }));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Ctrl');
    expect(dialog.textContent).not.toContain('⌘');
  });
});
