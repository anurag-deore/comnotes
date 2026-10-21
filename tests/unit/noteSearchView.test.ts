// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SearchField, SearchResults, searchSummary } from '@/components/notes/NoteSearch';
import type { NoteSearch, SearchResult } from '@/hooks/useNoteSearch';
import { highlightSegments, snippetSegments } from '@/lib/searchHighlight';
import type { Note } from '@/types/note';

const DAY = new Date('2026-10-01T00:00:00.000Z');
const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id, title: '', content: '', rev: 1, createdAt: DAY, updatedAt: DAY, deletedAt: null, archivedAt: null,
  locked: false, encrypted: null, ...extra,
});

const hostileTitle = '<script>alert(1)</script> plan';
const hostileText = '<img src=x onerror="alert(2)"> the plan for <b>Friday</b>';
const results: SearchResult[] = [
  {
    note: note('a'),
    archived: false,
    title: highlightSegments(hostileTitle, ['plan']),
    snippet: snippetSegments(hostileText, ['plan'], 120),
  },
  { note: note('b', { archivedAt: DAY }), archived: true, title: highlightSegments('Plan B', ['plan']), snippet: [] },
];

const search = (overrides: Partial<NoteSearch> = {}): NoteSearch => ({
  query: 'plan', setQuery: vi.fn(), clear: vi.fn(), prepare: vi.fn(), includeArchive: false,
  setIncludeArchive: vi.fn(), searched: 'plan', total: results.length, results, status: 'ready', ...overrides,
});

let root: Root | null = null;
let host: HTMLElement;

function render(element: ReturnType<typeof createElement>) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

describe('search results rendering (AC-6, AC-8)', () => {
  test('markup in titles and snippets is shown as text, matches as <mark>', () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const el = render(createElement(SearchResults, {
      search: search(), listboxId: 'lb', activeIndex: 0, selectedId: null, now: DAY, onOpen: vi.fn(), summary: '2 results',
    }));
    expect(el.querySelector('script, img, b')).toBeNull();
    expect(el.textContent).toContain(hostileTitle);
    expect(el.textContent).toContain(hostileText);
    expect([...el.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['plan', 'plan', 'Plan']);
    expect(alert).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test('a listbox of options with the active one selected and archived ones tagged', () => {
    const onOpen = vi.fn();
    const el = render(createElement(SearchResults, {
      search: search(), listboxId: 'lb', activeIndex: 1, selectedId: 'a', now: DAY, onOpen, summary: '2 results',
    }));
    const options = [...el.querySelectorAll('[role="listbox"] [role="option"]')];
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(options.map((o) => o.id)).toEqual(['lb-option-0', 'lb-option-1']);
    expect(options[1].textContent).toContain('Archived');
    act(() => (options[1] as HTMLElement).click());
    expect(onOpen).toHaveBeenCalledWith('b');
  });

  test('empty state when nothing matches', () => {
    const el = render(createElement(SearchResults, {
      search: search({ results: [], total: 0 }), listboxId: 'lb', activeIndex: -1, selectedId: null, now: DAY,
      onOpen: vi.fn(), summary: 'No results',
    }));
    expect(el.textContent).toContain('No matching notes');
    expect(el.textContent).toContain('include Archive');
  });
});

describe('search field (AC-8, AC-9)', () => {
  test('a labelled combobox in a search landmark, pointing at the active option', () => {
    const el = render(createElement(SearchField, {
      search: search(), inputId: 'in', listboxId: 'lb', activeIndex: 1, onKeyDown: vi.fn(),
    }));
    const landmark = el.querySelector('[role="search"]');
    const input = el.querySelector('input');
    expect(landmark).not.toBeNull();
    expect(el.querySelector('label[for="in"]')?.textContent).toBe('Search notes');
    expect(input?.getAttribute('role')).toBe('combobox');
    expect(input?.getAttribute('aria-expanded')).toBe('true');
    expect(input?.getAttribute('aria-controls')).toBe('lb');
    expect(input?.getAttribute('aria-activedescendant')).toBe('lb-option-1');
    expect(el.querySelector('button[aria-label="Clear search"]')).not.toBeNull();
  });

  test('collapsed without a query', () => {
    const el = render(createElement(SearchField, {
      search: search({ query: '' }), inputId: 'in', listboxId: 'lb', activeIndex: -1, onKeyDown: vi.fn(),
    }));
    const input = el.querySelector('input');
    expect(input?.getAttribute('aria-expanded')).toBe('false');
    expect(input?.hasAttribute('aria-controls')).toBe(false);
    expect(input?.hasAttribute('aria-activedescendant')).toBe(false);
    expect(el.querySelector('button[aria-label="Clear search"]')).toBeNull();
  });
});

describe('searchSummary (AC-8)', () => {
  test('counts for the live region', () => {
    expect(searchSummary(search())).toBe('2 results');
    expect(searchSummary(search({ total: 1 }))).toBe('1 result');
    expect(searchSummary(search({ total: 0, results: [] }))).toBe('No results');
    expect(searchSummary(search({ total: 80 }))).toBe('80 results, showing the first 2');
    expect(searchSummary(search({ status: 'loading' }))).toBe('Searching…');
    expect(searchSummary(search({ status: 'error' }))).toBe('Search is not available.');
  });
});
