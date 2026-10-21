// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import MiniSearch from 'minisearch';
import {
  NoteSearchIndex, dropLockedOnVaultLock, loadNoteSearchIndex, searchSources, type SearchSource,
} from '@/lib/noteSearch';
import { createVault } from '@/lib/vault';
import type { EncryptedPayload } from '@/lib/noteCrypto';
import type { Note } from '@/types/note';

const DAY = new Date('2026-10-01T00:00:00.000Z');
const PAYLOAD: EncryptedPayload = {
  v: 1, kdf: 'PBKDF2-SHA256', iter: 1000, salt: 'c2FsdA==', iv: 'aXY=', ct: 'Y2lwaGVydGV4dA==',
};

const note = (id: string, title: string, content: string, extra: Partial<Note> = {}): Note => ({
  id, title, content, rev: 1, createdAt: DAY, updatedAt: DAY, deletedAt: null, archivedAt: null,
  locked: false, encrypted: null, ...extra,
});

const source = (id: string, title: string, html: string, extra: Partial<SearchSource> = {}): SearchSource => ({
  id, title, html, view: 'notes', locked: false, ...extra,
});

const ids = (index: NoteSearchIndex, query: string, includeArchive = false) =>
  index.search(query, { includeArchive }).map((hit) => hit.id);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loading (AC-1)', () => {
  test('loadNoteSearchIndex imports MiniSearch on demand and returns an empty index', async () => {
    const index = await loadNoteSearchIndex();
    expect(index.size).toBe(0);
    index.sync([source('a', 'Groceries', '<p>milk</p>')]);
    expect(ids(index, 'milk')).toEqual(['a']);
  });

  test('indexes the title and the plain text of the HTML content', () => {
    const index = new NoteSearchIndex(MiniSearch);
    index.sync([source('a', 'Trip plan', '<h1>Day one</h1><p>Visit the <strong>harbour</strong></p>')]);
    expect(ids(index, 'trip')).toEqual(['a']);
    expect(ids(index, 'harbour')).toEqual(['a']);
    // Tags are markup, not words
    expect(ids(index, 'strong')).toEqual([]);
    const [hit] = index.search('harbour', { includeArchive: false });
    expect(hit.text).toBe('Day one Visit the harbour');
    expect(hit.title).toBe('Trip plan');
  });
});

describe('incremental updates (AC-2)', () => {
  test('adds new notes, replaces changed ones, discards removed ones and leaves the rest', () => {
    const toText = vi.fn((html: string) => html.replace(/<[^>]+>/g, ' ').trim());
    const index = new NoteSearchIndex(MiniSearch, toText);

    expect(index.sync([source('a', 'Alpha', '<p>apple</p>'), source('b', 'Beta', '<p>banana</p>')]))
      .toEqual({ added: 2, replaced: 0, removed: 0 });
    expect(toText).toHaveBeenCalledTimes(2);

    toText.mockClear();
    expect(index.sync([source('a', 'Alpha', '<p>apple</p>'), source('b', 'Beta', '<p>cherry</p>')]))
      .toEqual({ added: 0, replaced: 1, removed: 0 });
    // Only the changed note's HTML is turned into text again
    expect(toText).toHaveBeenCalledTimes(1);
    expect(ids(index, 'banana')).toEqual([]);
    expect(ids(index, 'cherry')).toEqual(['b']);

    toText.mockClear();
    expect(index.sync([source('b', 'Beta', '<p>cherry</p>')])).toEqual({ added: 0, replaced: 0, removed: 1 });
    expect(toText).not.toHaveBeenCalled();
    expect(ids(index, 'apple')).toEqual([]);
    expect(index.size).toBe(1);
  });

  test('a title-only change is replaced without extracting the content again', () => {
    const toText = vi.fn((html: string) => html.replace(/<[^>]+>/g, ''));
    const index = new NoteSearchIndex(MiniSearch, toText);
    index.sync([source('a', 'Old', '<p>body</p>')]);
    toText.mockClear();
    expect(index.sync([source('a', 'New', '<p>body</p>')])).toEqual({ added: 0, replaced: 1, removed: 0 });
    expect(toText).not.toHaveBeenCalled();
    expect(ids(index, 'new')).toEqual(['a']);
    expect(ids(index, 'old')).toEqual([]);
  });

  test('moving a note to Archive replaces it so the filter follows', () => {
    const index = new NoteSearchIndex(MiniSearch);
    index.sync([source('a', 'Alpha', '')]);
    expect(index.sync([source('a', 'Alpha', '', { view: 'archive' })])).toEqual({ added: 0, replaced: 1, removed: 0 });
    expect(ids(index, 'alpha')).toEqual([]);
    expect(ids(index, 'alpha', true)).toEqual(['a']);
  });
});

describe('ranking and matching (AC-3)', () => {
  const index = new NoteSearchIndex(MiniSearch);
  index.sync([
    source('body', 'Weekend', '<p>Remember the groceries on Saturday</p>'),
    source('title', 'Groceries', '<p>milk, eggs</p>'),
    source('other', 'Work', '<p>quarterly report</p>'),
  ]);

  test('a title match ranks above a body-only match', () => {
    expect(ids(index, 'groceries')).toEqual(['title', 'body']);
  });

  test('prefix and fuzzy matches', () => {
    expect(ids(index, 'gro')).toEqual(['title', 'body']);
    // One letter missing, one wrong
    expect(ids(index, 'grocries')).toEqual(['title', 'body']);
    expect(ids(index, 'quartarly')).toEqual(['other']);
    expect(ids(index, 'zzz')).toEqual([]);
  });

  test('every word of a multi-word query has to match', () => {
    expect(ids(index, 'groceries saturday')).toEqual(['body']);
    expect(ids(index, 'milk report')).toEqual([]);
  });

  test('hits carry the matched document terms for highlighting', () => {
    const [hit] = index.search('gro', { includeArchive: false });
    expect(hit.terms).toEqual(['groceries']);
  });

  test('a blank query finds nothing', () => {
    expect(ids(index, '   ')).toEqual([]);
  });
});

describe('scope (AC-4)', () => {
  const notes = [
    note('main', 'Plan', '<p>alpha</p>'),
    note('archived', 'Plan', '<p>alpha</p>', { archivedAt: DAY }),
    note('trashed', 'Plan', '<p>alpha</p>', { deletedAt: DAY }),
    note('both', 'Plan', '<p>alpha</p>', { archivedAt: DAY, deletedAt: DAY }),
  ];

  test('trashed notes are never sources', () => {
    expect(searchSources(notes, {}).map((s) => [s.id, s.view])).toEqual([['main', 'notes'], ['archived', 'archive']]);
  });

  test('archived notes only with includeArchive, trash never', () => {
    const index = new NoteSearchIndex(MiniSearch);
    index.sync(searchSources(notes, {}));
    expect(ids(index, 'alpha')).toEqual(['main']);
    expect(ids(index, 'alpha', true).sort()).toEqual(['archived', 'main']);
  });
});

describe('locked notes (AC-5)', () => {
  const locked = note('secret', '', '', { locked: true, encrypted: PAYLOAD });
  const unreadable = note('broken', '', '', { locked: true, encrypted: null });
  const plainNote = note('open', 'Shopping', '<p>bread</p>');

  test('a locked note without decrypted text is not a source, and ciphertext never is', () => {
    const sources = searchSources([locked, unreadable, plainNote], {});
    expect(sources.map((s) => s.id)).toEqual(['open']);
    expect(JSON.stringify(sources)).not.toContain(PAYLOAD.ct);
  });

  test('a decrypted locked note is searched by its decrypted title and content', () => {
    const decrypted = { secret: { title: 'Bank codes', content: '<p>vault pin</p>' } };
    const sources = searchSources([locked, plainNote], decrypted);
    expect(sources).toContainEqual({ id: 'secret', title: 'Bank codes', html: '<p>vault pin</p>', view: 'notes', locked: true });
    const index = new NoteSearchIndex(MiniSearch);
    index.sync(sources);
    expect(ids(index, 'bank')).toEqual(['secret']);
    expect(ids(index, 'pin')).toEqual(['secret']);
    expect(index.search('pin', { includeArchive: false })[0].locked).toBe(true);
  });

  test('once the decrypted text is gone the next sync removes the note', () => {
    const index = new NoteSearchIndex(MiniSearch);
    index.sync(searchSources([locked, plainNote], { secret: { title: 'Bank', content: '' } }));
    index.sync(searchSources([locked, plainNote], {}));
    expect(ids(index, 'bank')).toEqual([]);
  });

  test('dropLocked removes every locked document and keeps the rest', () => {
    const index = new NoteSearchIndex(MiniSearch);
    index.sync([source('secret', 'Bank', '<p>pin</p>', { locked: true }), source('open', 'Bank holiday', '')]);
    index.dropLocked();
    expect(ids(index, 'bank')).toEqual(['open']);
    expect(index.size).toBe(1);
    // A later sync with the decrypted text adds it back
    index.sync([source('secret', 'Bank', '<p>pin</p>', { locked: true }), source('open', 'Bank holiday', '')]);
    expect(ids(index, 'pin')).toEqual(['secret']);
  });

  test('locking the vault drops locked documents at once', async () => {
    const vault = createVault({ iterations: 1000 });
    await vault.setup('correct horse battery staple');
    const index = new NoteSearchIndex(MiniSearch);
    index.sync([source('secret', 'Bank', '', { locked: true }), source('open', 'Bank holiday', '')]);
    const stop = dropLockedOnVaultLock(index, vault);

    vault.lock();
    expect(ids(index, 'bank')).toEqual(['open']);

    stop();
    index.sync([source('secret', 'Bank', '', { locked: true }), source('open', 'Bank holiday', '')]);
    await vault.setup('another passphrase here');
    vault.lock();
    // Unsubscribed: nothing dropped
    expect(ids(index, 'bank').sort()).toEqual(['open', 'secret']);
  });

  test('clear empties the index (app lock)', () => {
    const index = new NoteSearchIndex(MiniSearch);
    index.sync([source('secret', 'Bank', '', { locked: true }), source('open', 'Bank holiday', '')]);
    index.clear();
    expect(index.size).toBe(0);
    expect(ids(index, 'bank')).toEqual([]);
  });

  test('the index never touches browser storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const index = new NoteSearchIndex(MiniSearch);
    index.sync([source('secret', 'Bank', '<p>pin</p>', { locked: true })]);
    index.search('bank', { includeArchive: true });
    index.dropLocked();
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});
