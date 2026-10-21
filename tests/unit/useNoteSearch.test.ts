// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SEARCH_DEBOUNCE_MS, useNoteSearch, type NoteSearch } from '@/hooks/useNoteSearch';
import type { EncryptedPayload, NoteText } from '@/lib/noteCrypto';
import { NoteSearchIndex } from '@/lib/noteSearch';
import type { Note } from '@/types/note';

const DAY = new Date('2026-10-01T00:00:00.000Z');
const PAYLOAD: EncryptedPayload = { v: 1, kdf: 'PBKDF2-SHA256', iter: 1000, salt: 'c2FsdA==', iv: 'aXY=', ct: 'Y3Q=' };
const note = (id: string, title: string, content: string, extra: Partial<Note> = {}): Note => ({
  id, title, content, rev: 1, createdAt: DAY, updatedAt: DAY, deletedAt: null, archivedAt: null,
  locked: false, encrypted: null, ...extra,
});

const notes = [
  note('main', 'Plan', '<p>alpha</p>'),
  note('archived', 'Old plan', '<p>alpha</p>', { archivedAt: DAY }),
  note('trashed', 'Plan', '<p>alpha</p>', { deletedAt: DAY }),
  note('secret', '', '', { locked: true, encrypted: PAYLOAD }),
];

let root: Root | null = null;
let latest: NoteSearch;

const report = (search: NoteSearch) => {
  latest = search;
};

function Probe({ list, decrypted }: { list: Note[]; decrypted: Record<string, NoteText> }) {
  const search = useNoteSearch(list, decrypted);
  useEffect(() => report(search));
  return null;
}

function mount(decrypted: Record<string, NoteText> = {}) {
  root = createRoot(document.createElement('div'));
  act(() => root?.render(createElement(Probe, { list: notes, decrypted })));
  return (next: Record<string, NoteText>) => act(() => root?.render(createElement(Probe, { list: notes, decrypted: next })));
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
}));
const ids = () => latest.results.map((r) => r.note.id);

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
});

describe('useNoteSearch', () => {
  test('AC-7: results follow the debounced query; clearing is immediate', async () => {
    mount();
    act(() => latest.setQuery('alp'));
    expect(latest.searched).toBe('');
    await wait(SEARCH_DEBOUNCE_MS + 50);
    expect(latest.searched).toBe('alp');
    expect(latest.status).toBe('ready');
    expect(ids()).toEqual(['main']);
    act(() => latest.clear());
    expect(latest.query).toBe('');
    expect(latest.searched).toBe('');
    expect(latest.results).toEqual([]);
    expect(latest.status).toBe('idle');
  });

  test('AC-4: Include Archive adds archived notes, never trashed ones', async () => {
    mount();
    act(() => latest.setQuery('alpha'));
    await wait(SEARCH_DEBOUNCE_MS + 50);
    expect(ids()).toEqual(['main']);
    act(() => latest.setIncludeArchive(true));
    expect(ids().sort()).toEqual(['archived', 'main']);
    expect(latest.results.find((r) => r.note.id === 'archived')?.archived).toBe(true);
  });

  test('AC-5: a locked note is found only while decrypted, and shows no decrypted preview', async () => {
    const rerender = mount();
    act(() => latest.setQuery('bank'));
    await wait(SEARCH_DEBOUNCE_MS + 50);
    expect(ids()).toEqual([]);

    rerender({ secret: { title: 'Bank codes', content: '<p>pin 1234</p>' } });
    expect(ids()).toEqual(['secret']);
    const [hit] = latest.results;
    expect(hit.title.map((s) => s.text).join('')).toBe('Bank codes');
    expect(hit.snippet).toEqual([{ text: 'Encrypted', match: false }]);

    // The vault locked: the page clears its decrypted notes
    rerender({});
    expect(ids()).toEqual([]);
  });

  test('AC-5: unmounting (app lock) clears the index', async () => {
    const clear = vi.spyOn(NoteSearchIndex.prototype, 'clear');
    mount({ secret: { title: 'Bank', content: '' } });
    act(() => latest.setQuery('bank'));
    await wait(SEARCH_DEBOUNCE_MS + 50);
    expect(ids()).toEqual(['secret']);
    act(() => root?.unmount());
    root = null;
    expect(clear).toHaveBeenCalled();
  });
});
