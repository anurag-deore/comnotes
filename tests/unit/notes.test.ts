import { beforeEach, describe, expect, test, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  class Timestamp {
    constructor(private readonly ms: number) {}
    toDate() { return new Date(this.ms); }
    static now() { return new Timestamp(1_000); }
    static fromDate(date: Date) { return new Timestamp(date.getTime()); }
  }
  return {
    Timestamp,
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    doc: vi.fn((parent: { path: string }, path?: string, id?: string) =>
      path ? { path: `${path}/${id}`, id } : { path: `${parent.path}/new-id`, id: 'new-id' }),
    query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })),
    orderBy: vi.fn((field: string, dir: string) => ({ orderBy: field, dir })),
    onSnapshot: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    waitForPendingWrites: vi.fn(async () => {}),
    writeBatch: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  };
});

vi.mock('firebase/firestore', () => firestore);
const db = vi.hoisted(() => ({ name: 'test-db' }));
vi.mock('@/lib/firebase', () => ({ db }));

import {
  archiveNote, createNote, deleteNotesForever, fetchAllNotes, findLegacyNotes, importNotes, migrateNote, migrateNotes, purgeExpiredTrash,
  restoreNote, saveNote, subscribeNotes, toNote, trashNote, unarchiveNote,
} from '@/lib/notes';
import { SCHEMA_VERSION, needsMigration } from '@/lib/migration';
import type { Note } from '@/types/note';
import { PBKDF2_ITERATIONS, bytesToBase64, type EncryptedPayload } from '@/lib/noteCrypto';
import { createVault } from '@/lib/vault';

const { Timestamp } = firestore;

// A well-formed payload as Firestore would hold it (no real key needed to read the shape)
const storedPayload = (): EncryptedPayload => ({
  v: 1, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITERATIONS,
  salt: bytesToBase64(new Uint8Array(16).fill(1)),
  iv: bytesToBase64(new Uint8Array(12).fill(2)),
  ct: bytesToBase64(new Uint8Array(40).fill(3)),
});

// A real vault with a generated passphrase; low iterations keep the tests fast
async function testVault() {
  const vault = createVault({ iterations: 1_000 });
  await vault.setup(bytesToBase64(crypto.getRandomValues(new Uint8Array(18))));
  return vault;
}

// Everything the transaction wrote, as one string to search for plaintext
const written = (tx: { update: { mock: { calls: unknown[][] } }; set: { mock: { calls: unknown[][] } } }) =>
  JSON.stringify([tx.update.mock.calls, tx.set.mock.calls]);

// Fake transaction over one stored note
function transactionWith(stored: Record<string, unknown> | undefined) {
  const tx = {
    get: vi.fn(async (ref: { id: string }) => ({
      id: ref.id, exists: () => stored !== undefined, data: () => stored,
    })),
    update: vi.fn(),
    set: vi.fn(),
  };
  firestore.runTransaction.mockImplementation(async (_db, fn) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toNote', () => {
  test('AC-2: a document without rev reads as rev 0 and Timestamps become Dates', () => {
    const n = toNote('a', { title: 'T', content: 'C', createdAt: new Timestamp(5), updatedAt: new Timestamp(9) });
    expect(n).toEqual({
      id: 'a', title: 'T', content: 'C', rev: 0, createdAt: new Date(5), updatedAt: new Date(9), deletedAt: null, archivedAt: null,
      locked: false, encrypted: null,
    });
  });

  test('CNOTE-7 AC-6: an encrypted payload makes the note locked; stray title/content are ignored', () => {
    const payload = storedPayload();
    expect(toNote('a', { title: '', content: '', encrypted: payload })).toMatchObject({
      locked: true, encrypted: payload, title: '', content: '',
    });
    expect(toNote('a', { title: 'leak', content: 'leak', encrypted: payload })).toMatchObject({ title: '', content: '' });
    expect(toNote('a', { title: 'T', encrypted: null })).toMatchObject({ locked: false, encrypted: null, title: 'T' });
  });

  test('CNOTE-7 AC-4: a payload this version cannot read keeps the note locked but unreadable', () => {
    expect(toNote('a', { encrypted: { ...storedPayload(), v: 2 } })).toMatchObject({ locked: true, encrypted: null });
    expect(toNote('a', { encrypted: 'garbage' })).toMatchObject({ locked: true, encrypted: null });
  });

  test('CNOTE-6 AC-1: missing or null deletedAt is not deleted; a Timestamp becomes a Date', () => {
    expect(toNote('a', { title: 'T' }).deletedAt).toBeNull();
    expect(toNote('a', { title: 'T', deletedAt: null }).deletedAt).toBeNull();
    expect(toNote('a', { title: 'T', deletedAt: new Timestamp(3) }).deletedAt).toEqual(new Date(3));
  });

  test('CNOTE-17 AC-1: missing, null or non-Timestamp archivedAt is not archived; a Timestamp becomes a Date', () => {
    expect(toNote('a', { title: 'T' }).archivedAt).toBeNull();
    expect(toNote('a', { title: 'T', archivedAt: null }).archivedAt).toBeNull();
    expect(toNote('a', { title: 'T', archivedAt: 'yesterday' }).archivedAt).toBeNull();
    expect(toNote('a', { title: 'T', archivedAt: new Timestamp(4) }).archivedAt).toEqual(new Date(4));
  });

  test('CNOTE-17 AC-1: a schemaVersion 2 note written before archive existed reads as not archived and needs no migration', () => {
    const data = {
      title: 'T', content: '<p>x</p>', rev: 1, createdAt: new Timestamp(1), updatedAt: new Timestamp(2), deletedAt: null,
      encrypted: null, schemaVersion: SCHEMA_VERSION,
    };
    expect(toNote('a', data)).toMatchObject({ archivedAt: null, deletedAt: null });
    expect(needsMigration(data)).toBe(false);
  });

  test('CNOTE-19 AC-4: a missing title reads as empty', () => {
    expect(toNote('a', {}).title).toBe('');
    expect(toNote('a', { title: 3 }).title).toBe('');
  });

  test('CNOTE-21 AC-1: a missing date falls back to the other one, then to the epoch (never "now")', () => {
    expect(toNote('a', { createdAt: new Timestamp(5) })).toMatchObject({ createdAt: new Date(5), updatedAt: new Date(5) });
    expect(toNote('a', { updatedAt: new Timestamp(7) })).toMatchObject({ createdAt: new Date(7), updatedAt: new Date(7) });
    expect(toNote('a', {})).toMatchObject({ createdAt: new Date(0), updatedAt: new Date(0) });
  });

  test('keeps an existing rev', () => {
    expect(toNote('a', { title: 'T', content: '', rev: 4 }).rev).toBe(4);
  });
});

describe('saveNote', () => {
  test('CNOTE-20 AC-6: waits for queued writes (e.g. a note created offline) before reading in the transaction', async () => {
    let done!: () => void;
    firestore.waitForPendingWrites.mockReturnValueOnce(new Promise<void>((resolve) => { done = resolve; }));
    transactionWith({ title: 'Old', content: 'old', rev: 0 });
    const saving = saveNote({ id: 'a', title: 'New', content: 'new', rev: 0 });
    await Promise.resolve();
    expect(firestore.waitForPendingWrites).toHaveBeenCalledWith(db);
    expect(firestore.runTransaction).not.toHaveBeenCalled();
    done();
    await expect(saving).resolves.toEqual({ status: 'saved', rev: 1 });
  });

  test('AC-4: matching rev writes title, content, rev + 1 and a server timestamp', async () => {
    const tx = transactionWith({ title: 'Old', content: 'old', rev: 2 });
    const result = await saveNote({ id: 'a', title: 'New', content: 'new', rev: 2 });

    expect(result).toEqual({ status: 'saved', rev: 3 });
    expect(firestore.runTransaction).toHaveBeenCalledWith(db, expect.any(Function));
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/a' }), {
      title: 'New', content: 'new', encrypted: null, rev: 3, updatedAt: 'SERVER_TIMESTAMP',
    });
    expect(tx.set).not.toHaveBeenCalled();
  });

  test('AC-2/AC-4: a note without rev is saved from base rev 0', async () => {
    const tx = transactionWith({ title: 'Old', content: 'old' });
    await expect(saveNote({ id: 'a', title: 'New', content: 'new', rev: 0 })).resolves.toEqual({ status: 'saved', rev: 1 });
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  test('AC-5: stale rev keeps both: creates a conflict copy and leaves the server note alone', async () => {
    const tx = transactionWith({ title: 'Shopping', content: 'theirs', rev: 5, updatedAt: new Timestamp(7) });
    const result = await saveNote({ id: 'a', title: 'Shopping', content: 'mine', rev: 4 });

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/new-id' }), {
      title: 'Shopping (conflict copy)', content: 'mine', encrypted: null, rev: 0,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(), deletedAt: null, archivedAt: null, schemaVersion: 2,
    });
    // CNOTE-21 AC-10: a conflict copy is written on the current schema
    expect(needsMigration(tx.set.mock.calls[0][1])).toBe(false);
    expect(result).toEqual({
      status: 'conflict',
      server: expect.objectContaining({ id: 'a', content: 'theirs', rev: 5 }),
      copy: expect.objectContaining({ id: 'new-id', title: 'Shopping (conflict copy)', content: 'mine', rev: 0 }),
    });
  });

  test('CNOTE-6 AC-11: a missing note returns gone and writes nothing', async () => {
    const tx = transactionWith(undefined);
    await expect(saveNote({ id: 'a', title: 'T', content: '', rev: 0 })).resolves.toEqual({ status: 'gone' });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();
  });

  test('CNOTE-6 AC-9: a note in Trash still saves and stays in Trash', async () => {
    const tx = transactionWith({ title: 'Old', content: 'old', rev: 1, deletedAt: new Timestamp(3) });
    await expect(saveNote({ id: 'a', title: 'New', content: 'new', rev: 1 })).resolves.toEqual({ status: 'saved', rev: 2 });
    expect(tx.update.mock.calls[0][1]).not.toHaveProperty('deletedAt');
  });

  test('CNOTE-17 AC-3: an archived note saves and stays archived (the update never writes archivedAt)', async () => {
    const tx = transactionWith({ title: 'Old', content: 'old', rev: 1, archivedAt: new Timestamp(3) });
    await expect(saveNote({ id: 'a', title: 'New', content: 'new', rev: 1 })).resolves.toEqual({ status: 'saved', rev: 2 });
    expect(tx.update.mock.calls[0][1]).not.toHaveProperty('archivedAt');
  });
});

describe('saveNote for locked notes (CNOTE-7)', () => {
  const secret = { title: 'Diary', content: '<p>my secret entry</p>' };

  test('AC-7: a sealed draft writes only ciphertext, title and content empty', async () => {
    const vault = await testVault();
    const payload = await vault.encrypt('a', secret);
    const tx = transactionWith({ title: 'Diary', content: 'old plain', rev: 2 });

    const result = await saveNote({ id: 'a', title: '', content: '', rev: 2, sealed: { noteId: 'a', payload } }, vault);
    expect(result).toEqual({ status: 'saved', rev: 3 });
    expect(tx.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/a' }), {
      title: '', content: '', encrypted: payload, rev: 3, updatedAt: 'SERVER_TIMESTAMP',
    });
    expect(written(tx)).not.toContain('secret');
    expect(written(tx)).not.toContain('Diary');
  });

  test('AC-11: a plain draft of a locked note (Remove lock) stores plain text and clears the payload', async () => {
    const tx = transactionWith({ title: '', content: '', encrypted: storedPayload(), rev: 4 });
    await saveNote({ id: 'a', title: 'T', content: 'C', rev: 4 });
    expect(tx.update.mock.calls[0][1]).toEqual({ title: 'T', content: 'C', encrypted: null, rev: 5, updatedAt: 'SERVER_TIMESTAMP' });
  });

  test('AC-8: a conflict on a locked note writes an encrypted copy that only opens under the copy id', async () => {
    const vault = await testVault();
    const payload = await vault.encrypt('a', secret);
    const tx = transactionWith({ title: '', content: '', encrypted: storedPayload(), rev: 7 });

    const result = await saveNote({ id: 'a', title: '', content: '', rev: 6, sealed: { noteId: 'a', payload } }, vault);
    expect(tx.update).not.toHaveBeenCalled();
    const [ref, copy] = tx.set.mock.calls[0];
    expect(ref).toEqual(expect.objectContaining({ id: 'new-id' }));
    expect(copy).toEqual({
      title: '', content: '', encrypted: expect.any(Object), rev: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      deletedAt: null, archivedAt: null, schemaVersion: 2,
    });
    expect(needsMigration(copy)).toBe(false);
    expect(written(tx)).not.toContain('secret');
    expect(copy.encrypted.iv).not.toBe(payload.iv);
    await expect(vault.decrypt('new-id', copy.encrypted)).resolves.toEqual({ ...secret, title: 'Diary (conflict copy)' });
    await expect(vault.decrypt('a', copy.encrypted)).rejects.toThrow();
    expect(result).toMatchObject({
      status: 'conflict',
      server: { id: 'a', locked: true, rev: 7 },
      copy: { id: 'new-id', title: '', content: '', locked: true, encrypted: copy.encrypted, rev: 0 },
    });
  });

  test('AC-8: a sealed draft moved to another note (edits typed during a conflict) is re-encrypted for it', async () => {
    const vault = await testVault();
    const payload = await vault.encrypt('a', secret);
    const tx = transactionWith({ title: '', content: '', encrypted: storedPayload(), rev: 0 });

    await saveNote({ id: 'copy', title: '', content: '', rev: 0, sealed: { noteId: 'a', payload } }, vault);
    const { encrypted } = tx.update.mock.calls[0][1];
    expect(encrypted.iv).not.toBe(payload.iv);
    await expect(vault.decrypt('copy', encrypted)).resolves.toEqual(secret);
    expect(written(tx)).not.toContain('secret');
  });

  test('AC-8: without the key a locked conflict throws and writes nothing (the saver retries)', async () => {
    const vault = await testVault();
    const payload = await vault.encrypt('a', secret);
    vault.lock();
    const tx = transactionWith({ title: '', content: '', encrypted: storedPayload(), rev: 7 });

    await expect(saveNote({ id: 'a', title: '', content: '', rev: 6, sealed: { noteId: 'a', payload } }, vault)).rejects.toThrow();
    await expect(saveNote({ id: 'a', title: '', content: '', rev: 6, sealed: { noteId: 'a', payload } })).rejects.toThrow();
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe('subscribeNotes', () => {
  test('CNOTE-21 AC-1: listens to the whole collection (no orderBy) and maps documents', () => {
    const unsubscribe = vi.fn();
    firestore.onSnapshot.mockReturnValue(unsubscribe);
    const onNotes = vi.fn();
    const onError = vi.fn();

    expect(subscribeNotes(onNotes, onError)).toBe(unsubscribe);
    const [ref, next, error] = firestore.onSnapshot.mock.calls[0];
    expect(ref).toEqual({ path: 'notes' });
    expect(firestore.query).not.toHaveBeenCalled();
    expect(firestore.orderBy).not.toHaveBeenCalled();
    expect(error).toBe(onError);

    const data = vi.fn(() => ({ title: 'T', content: 'C', rev: 1 }));
    next({ docs: [{ id: 'a', data }], metadata: { fromCache: false } });
    expect(data).toHaveBeenCalledWith({ serverTimestamps: 'estimate' });
    expect(onNotes).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', title: 'T', rev: 1 })], false);
  });

  test('CNOTE-20 AC-8: says whether the snapshot came from the local cache', () => {
    firestore.onSnapshot.mockReturnValue(vi.fn());
    const onNotes = vi.fn();
    subscribeNotes(onNotes, vi.fn());
    const next = firestore.onSnapshot.mock.calls[0][1];
    next({ docs: [], metadata: { fromCache: true } });
    expect(onNotes).toHaveBeenLastCalledWith([], true);
    next({ docs: [], metadata: { fromCache: false } });
    expect(onNotes).toHaveBeenLastCalledWith([], false);
  });

  test('CNOTE-21 AC-1: newest first by updatedAt, and a legacy note without updatedAt is listed', () => {
    firestore.onSnapshot.mockReturnValue(vi.fn());
    const onNotes = vi.fn();
    subscribeNotes(onNotes, vi.fn());
    const next = firestore.onSnapshot.mock.calls[0][1];
    const docOf = (id: string, fields: Record<string, unknown>) => ({ id, data: () => ({ title: id, content: '', ...fields }) });

    next({
      docs: [
        docOf('old', { createdAt: new Timestamp(1), updatedAt: new Timestamp(2) }),
        docOf('legacy', { createdAt: new Timestamp(5) }),
        docOf('new', { createdAt: new Timestamp(1), updatedAt: new Timestamp(9) }),
        docOf('undated', {}),
        docOf('b-tie', { updatedAt: new Timestamp(9) }),
      ],
      metadata: { fromCache: false },
    });
    const notes: Note[] = onNotes.mock.calls[0][0];
    expect(notes.map((n) => [n.id, n.updatedAt.getTime()])).toEqual([
      ['b-tie', 9], ['new', 9], ['legacy', 5], ['old', 2], ['undated', 0],
    ]);
  });
});

describe('findLegacyNotes (CNOTE-21 AC-6)', () => {
  test('reads the whole collection once and returns the id and rev of notes that need migrating', async () => {
    const data = vi.fn(() => current({ rev: 4 }));
    firestore.getDocs.mockResolvedValue({
      docs: [
        { id: 'current', data },
        { id: 'original', data: () => ({ title: 'T', content: '<p>x</p>', createdAt: new Timestamp(1), updatedAt: new Timestamp(2) }) },
        { id: 'saved', data: () => current({ schemaVersion: undefined, rev: 3 }) },
      ],
    });

    await expect(findLegacyNotes()).resolves.toEqual([{ id: 'original', rev: undefined }, { id: 'saved', rev: 3 }]);
    expect(firestore.getDocs).toHaveBeenCalledTimes(1);
    expect(firestore.getDocs).toHaveBeenCalledWith({ path: 'notes' });
    expect(firestore.orderBy).not.toHaveBeenCalled();
    expect(data).toHaveBeenCalledWith({ serverTimestamps: 'estimate' });
  });
});

// A note as this version writes it (CNOTE-21)
function current(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'T', content: '<p>x</p>', rev: 0, createdAt: new Timestamp(1), updatedAt: new Timestamp(2), deletedAt: null,
    encrypted: null, schemaVersion: SCHEMA_VERSION, ...fields,
  };
}

// An in-memory /notes for migration runs: transactions read and update it
function fakeStore(docs: Record<string, Record<string, unknown>>) {
  const store = new Map(Object.entries(docs));
  const updates: [string, Record<string, unknown>][] = [];
  firestore.runTransaction.mockImplementation(async (_db, fn) => fn({
    get: vi.fn(async (ref: { id: string }) => ({
      id: ref.id, exists: () => store.has(ref.id), data: () => store.get(ref.id),
    })),
    update: vi.fn((ref: { id: string }, patch: Record<string, unknown>) => {
      updates.push([ref.id, patch]);
      store.set(ref.id, { ...store.get(ref.id), ...patch });
    }),
    set: vi.fn(),
  }));
  firestore.getDocs.mockImplementation(async () => ({
    docs: [...store].map(([id, data]) => ({ id, data: () => data })),
  }));
  return { store, updates };
}

const NOW = new Date(50_000);
const ORIGINAL = { title: 'Groceries', content: '', createdAt: new Timestamp(10), updatedAt: new Timestamp(20) };

describe('migrateNote (CNOTE-21 AC-8)', () => {
  test('writes the patch in a transaction without bumping rev or updatedAt', async () => {
    const { updates } = fakeStore({ a: { ...ORIGINAL } });
    await expect(migrateNote('a', undefined, NOW)).resolves.toBe('updated');
    expect(firestore.runTransaction).toHaveBeenCalledWith(db, expect.any(Function));
    expect(updates).toEqual([['a', { rev: 0, deletedAt: null, encrypted: null, schemaVersion: 2 }]]);
  });

  test('a note without updatedAt gets it from createdAt', async () => {
    const { updates } = fakeStore({ a: { title: 'L', content: '', createdAt: new Timestamp(10) } });
    await migrateNote('a', undefined, NOW);
    expect(updates[0][1]).toMatchObject({ updatedAt: new Timestamp(10) });
  });

  test('skips a note whose rev changed since it was found (an edit landed); writes nothing', async () => {
    const { updates } = fakeStore({ a: { ...ORIGINAL, rev: 1 } });
    await expect(migrateNote('a', undefined, NOW)).resolves.toBe('changed');
    await expect(migrateNote('a', 0, NOW)).resolves.toBe('changed');
    expect(updates).toEqual([]);
  });

  test('skips a deleted note and a note that is already current', async () => {
    const { updates } = fakeStore({ done: current() });
    await expect(migrateNote('gone', undefined, NOW)).resolves.toBe('gone');
    await expect(migrateNote('done', 0, NOW)).resolves.toBe('current');
    expect(updates).toEqual([]);
  });

  test('patches from the fresh read, so a trash made meanwhile (no rev change) is kept', async () => {
    const { store } = fakeStore({ a: { ...ORIGINAL, deletedAt: new Timestamp(30) } });
    await migrateNote('a', undefined, NOW);
    expect(store.get('a')).toMatchObject({ deletedAt: new Timestamp(30), schemaVersion: 2 });
  });
});

describe('migrateNotes (CNOTE-21 AC-4, AC-8)', () => {
  test('counts updated and skipped, reports progress, and a second run writes nothing', async () => {
    const { updates } = fakeStore({
      a: { ...ORIGINAL }, b: { title: 'B', content: '', createdAt: new Timestamp(3) }, c: { ...ORIGINAL, rev: 2 },
    });
    const legacy = await findLegacyNotes();
    // c is edited after it was found
    const found = legacy.map((note) => (note.id === 'c' ? { ...note, rev: 1 } : note));
    const progress = vi.fn();

    await expect(migrateNotes(found, NOW, progress)).resolves.toEqual({ updated: 2, skipped: 1, failed: 0 });
    expect(progress).toHaveBeenLastCalledWith(3);
    expect(updates.map(([id]) => id).sort()).toEqual(['a', 'b']);

    updates.length = 0;
    await expect(migrateNotes(found.filter((n) => n.id !== 'c'), NOW)).resolves.toEqual({ updated: 0, skipped: 2, failed: 0 });
    expect(updates).toEqual([]);
    expect((await findLegacyNotes()).map((n) => n.id)).toEqual(['c']);
  });

  test('a failed note is counted and the others still migrate', async () => {
    const { updates } = fakeStore({ a: { ...ORIGINAL }, b: { ...ORIGINAL } });
    const run = firestore.runTransaction.getMockImplementation()!;
    firestore.runTransaction.mockImplementationOnce(async () => { throw new Error('offline'); }).mockImplementation(run);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(migrateNotes([{ id: 'a', rev: undefined }, { id: 'b', rev: undefined }], NOW))
      .resolves.toEqual({ updated: 1, skipped: 0, failed: 1 });
    expect(updates).toHaveLength(1);
  });

  test('runs at most 5 transactions at once', async () => {
    let active = 0;
    let peak = 0;
    firestore.runTransaction.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return 'updated';
    });
    const legacy = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, rev: 0 }));
    await expect(migrateNotes(legacy, NOW)).resolves.toEqual({ updated: 12, skipped: 0, failed: 0 });
    expect(peak).toBe(5);
  });
});

describe('createNote', () => {
  test('AC-2 / CNOTE-21 AC-10: new notes start at rev 0, on the current schema', async () => {
    firestore.setDoc.mockResolvedValue(undefined);
    const n = await createNote(true);
    expect(firestore.setDoc).toHaveBeenCalledWith({ path: 'notes/new-id', id: 'new-id' }, {
      title: 'Untitled Note', content: '', rev: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), deletedAt: null, archivedAt: null,
      encrypted: null, schemaVersion: 2,
    });
    expect(needsMigration(firestore.setDoc.mock.calls[0][1])).toBe(false);
    expect(n).toEqual({
      id: 'new-id', title: 'Untitled Note', content: '', rev: 0, createdAt: new Date(1_000), updatedAt: new Date(1_000), deletedAt: null, archivedAt: null,
      locked: false, encrypted: null,
    });
  });

  test('CNOTE-20 AC-7: online, a write the server rejects still fails the call', async () => {
    firestore.setDoc.mockRejectedValue(new Error('permission-denied'));
    await expect(createNote(true)).rejects.toThrow('permission-denied');
  });

  test('CNOTE-20 AC-7: offline, the note is returned at once and a later failure is logged', async () => {
    let fail!: (error: Error) => void;
    firestore.setDoc.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createNote(false)).resolves.toMatchObject({ id: 'new-id', title: 'Untitled Note', rev: 0 });
    fail(new Error('permission-denied'));
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });
});

describe('archive (CNOTE-17)', () => {
  test('AC-2: archiveNote sets only archivedAt to a server timestamp (no rev or updatedAt bump)', async () => {
    await archiveNote('a');
    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/a' }), {
      archivedAt: 'SERVER_TIMESTAMP',
    });
  });

  test('AC-2: unarchiveNote clears archivedAt only', async () => {
    await unarchiveNote('a');
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/a' }), { archivedAt: null });
  });

  test('AC-9: trashing and restoring leave archivedAt alone, so a restored archived note goes back to Archive', async () => {
    await trashNote('a');
    await restoreNote('a');
    expect(firestore.updateDoc.mock.calls.map(([, data]) => data)).toEqual([{ deletedAt: 'SERVER_TIMESTAMP' }, { deletedAt: null }]);
  });
});

// Fake write batches that record what each one writes
function batches() {
  const made: { delete: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }[] = [];
  firestore.writeBatch.mockImplementation(() => {
    const batch = { delete: vi.fn(), set: vi.fn(), commit: vi.fn(async () => {}) };
    made.push(batch);
    return batch;
  });
  return made;
}

const DAY = 24 * 60 * 60 * 1000;
const trashed = (id: string, deletedAt: Date | null): Note => ({
  id, title: id, content: '', rev: 0, createdAt: new Date(0), updatedAt: new Date(0), deletedAt, archivedAt: null, locked: false, encrypted: null,
});

describe('trash', () => {
  test('AC-2: trashNote sets only deletedAt to a server timestamp', async () => {
    await trashNote('a');
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/a' }), {
      deletedAt: 'SERVER_TIMESTAMP',
    });
  });

  test('AC-3: restoreNote clears deletedAt only', async () => {
    await restoreNote('a');
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/a' }), { deletedAt: null });
  });

  test('AC-4: deleteNotesForever deletes every id in batches of at most 500', async () => {
    const made = batches();
    const ids = Array.from({ length: 501 }, (_, i) => `n${i}`);
    await deleteNotesForever(ids);

    expect(made.map((b) => b.delete.mock.calls.length)).toEqual([500, 1]);
    expect(made.every((b) => b.commit.mock.calls.length === 1)).toBe(true);
    expect(made[1].delete).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/n500' }));
  });

  test('AC-5: purgeExpiredTrash deletes only notes trashed more than 30 days ago', async () => {
    const made = batches();
    const now = new Date(100 * DAY);
    const deleted = await purgeExpiredTrash([
      trashed('live', null),
      trashed('recent', new Date(now.getTime() - 29 * DAY)),
      trashed('exactly30', new Date(now.getTime() - 30 * DAY)),
      trashed('old', new Date(now.getTime() - 31 * DAY)),
    ], now);

    expect(deleted).toBe(1);
    expect(made).toHaveLength(1);
    expect(made[0].delete.mock.calls.map(([ref]) => ref.path)).toEqual(['notes/old']);
  });

  test('AC-5: purgeExpiredTrash writes nothing when nothing has expired', async () => {
    batches();
    await expect(purgeExpiredTrash([trashed('live', null)], new Date(100 * DAY))).resolves.toBe(0);
    expect(firestore.writeBatch).not.toHaveBeenCalled();
  });
});

describe('fetchAllNotes (CNOTE-19 AC-4)', () => {
  test('reads the whole collection without orderBy, so legacy notes without updatedAt are included', async () => {
    const data = vi.fn();
    firestore.getDocs.mockResolvedValue({
      docs: [
        { id: 'new', data: () => ({ title: 'N', content: 'c', rev: 2, createdAt: new Timestamp(1), updatedAt: new Timestamp(2) }) },
        { id: 'legacy', data: () => ({ title: 'L', content: 'q', createdAt: new Timestamp(5) }) },
        { id: 'older', data: () => ({ content: 'x', updatedAt: new Timestamp(7) }) },
        { id: 'pending', data },
      ],
    });
    data.mockReturnValue({ title: 'P', content: '', createdAt: new Timestamp(9), updatedAt: new Timestamp(9) });

    const notes = await fetchAllNotes();
    expect(firestore.getDocs).toHaveBeenCalledWith({ path: 'notes' });
    expect(firestore.query).not.toHaveBeenCalled();
    expect(firestore.orderBy).not.toHaveBeenCalled();
    expect(data).toHaveBeenCalledWith({ serverTimestamps: 'estimate' });
    expect(notes.map((n) => [n.id, n.title, n.createdAt.getTime(), n.updatedAt.getTime()])).toEqual([
      ['new', 'N', 1, 2],
      ['legacy', 'L', 5, 5],
      ['older', '', 7, 7],
      ['pending', 'P', 9, 9],
    ]);
  });
});

describe('importNotes (CNOTE-19 AC-11, AC-14)', () => {
  const imported = (i: number, deletedAt: Date | null = null, archivedAt: Date | null = null) => ({
    title: `T${i}`, content: `<p>${i}</p>`, createdAt: new Date(10 + i), updatedAt: new Date(20 + i), deletedAt, archivedAt, sealed: null,
  });

  test('writes each note as a new document with rev 0 and the backup timestamps (CNOTE-17 AC-11: archivedAt too)', async () => {
    const made = batches();
    await expect(importNotes([imported(1), imported(2, new Date(99), new Date(77))])).resolves.toBe(2);

    expect(made).toHaveLength(1);
    expect(made[0].delete).not.toHaveBeenCalled();
    expect(made[0].set.mock.calls).toEqual([
      [{ path: 'notes/new-id', id: 'new-id' }, {
        title: 'T1', content: '<p>1</p>', encrypted: null, rev: 0, createdAt: new Timestamp(11), updatedAt: new Timestamp(21),
        deletedAt: null, archivedAt: null, schemaVersion: 2,
      }],
      [{ path: 'notes/new-id', id: 'new-id' }, {
        title: 'T2', content: '<p>2</p>', encrypted: null, rev: 0, createdAt: new Timestamp(12), updatedAt: new Timestamp(22),
        deletedAt: new Timestamp(99), archivedAt: new Timestamp(77), schemaVersion: 2,
      }],
    ]);
    // CNOTE-21 AC-10: imported notes are written on the current schema
    expect(made[0].set.mock.calls.every(([, data]) => !needsMigration(data))).toBe(true);
    // A new id each time: doc() on the collection, never doc(db, 'notes', backupId)
    expect(firestore.doc).toHaveBeenCalledWith({ path: 'notes' });
    expect(firestore.doc).toHaveBeenCalledTimes(2);
  });

  test('batches of at most 500, reporting progress after each', async () => {
    const made = batches();
    const progress = vi.fn();
    await importNotes(Array.from({ length: 501 }, (_, i) => imported(i)), progress);
    expect(made.map((b) => b.set.mock.calls.length)).toEqual([500, 1]);
    expect(progress.mock.calls).toEqual([[500], [501]]);
  });

  test('a failed batch reports how many were written before it', async () => {
    const made = batches();
    firestore.writeBatch.mockImplementationOnce(() => {
      const batch = { delete: vi.fn(), set: vi.fn(), commit: vi.fn(async () => { throw new Error('quota'); }) };
      made.push(batch);
      return batch;
    });
    await expect(importNotes([imported(1)])).rejects.toMatchObject({ written: 0 });
  });

  test('CNOTE-7 AC-15: a locked note is written under its original id with its ciphertext only', async () => {
    const made = batches();
    const payload = storedPayload();
    await importNotes([{ ...imported(1), title: '', content: '', sealed: { noteId: 'Abc123', payload } }]);
    expect(made[0].set.mock.calls).toEqual([
      [{ path: 'notes/Abc123', id: 'Abc123' }, {
        title: '', content: '', encrypted: payload, rev: 0, createdAt: new Timestamp(11), updatedAt: new Timestamp(21), deletedAt: null, archivedAt: null,
        schemaVersion: 2,
      }],
    ]);
  });

  test('nothing to import writes nothing', async () => {
    batches();
    await expect(importNotes([])).resolves.toBe(0);
    expect(firestore.writeBatch).not.toHaveBeenCalled();
  });
});
