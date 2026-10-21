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
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  };
});

vi.mock('firebase/firestore', () => firestore);
const db = vi.hoisted(() => ({ name: 'test-db' }));
vi.mock('@/lib/firebase', () => ({ db }));

import {
  createNote, deleteNotesForever, fetchAllNotes, importNotes, purgeExpiredTrash, restoreNote, saveNote, subscribeNotes,
  toNote, trashNote,
} from '@/lib/notes';
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
      id: 'a', title: 'T', content: 'C', rev: 0, createdAt: new Date(5), updatedAt: new Date(9), deletedAt: null,
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

  test('CNOTE-19 AC-4: a missing title reads as empty', () => {
    expect(toNote('a', {}).title).toBe('');
    expect(toNote('a', { title: 3 }).title).toBe('');
  });

  test('keeps an existing rev', () => {
    expect(toNote('a', { title: 'T', content: '', rev: 4 }).rev).toBe(4);
  });
});

describe('saveNote', () => {
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
      title: 'Shopping (conflict copy)', content: 'mine', rev: 0,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
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
    });
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
  test('AC-11: listens to notes ordered by updatedAt desc and maps documents', () => {
    const unsubscribe = vi.fn();
    firestore.onSnapshot.mockReturnValue(unsubscribe);
    const onNotes = vi.fn();
    const onError = vi.fn();

    expect(subscribeNotes(onNotes, onError)).toBe(unsubscribe);
    const [q, next, error] = firestore.onSnapshot.mock.calls[0];
    expect(q).toEqual({ ref: { path: 'notes' }, constraints: [{ orderBy: 'updatedAt', dir: 'desc' }] });
    expect(error).toBe(onError);

    const data = vi.fn(() => ({ title: 'T', content: 'C', rev: 1 }));
    next({ docs: [{ id: 'a', data }] });
    expect(data).toHaveBeenCalledWith({ serverTimestamps: 'estimate' });
    expect(onNotes).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', title: 'T', rev: 1 })]);
  });
});

describe('createNote', () => {
  test('AC-2: new notes start at rev 0', async () => {
    firestore.addDoc.mockResolvedValue({ id: 'b' });
    const n = await createNote();
    expect(firestore.addDoc).toHaveBeenCalledWith({ path: 'notes' }, {
      title: 'Untitled Note', content: '', rev: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    expect(n).toEqual({
      id: 'b', title: 'Untitled Note', content: '', rev: 0, createdAt: new Date(1_000), updatedAt: new Date(1_000), deletedAt: null,
      locked: false, encrypted: null,
    });
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
  id, title: id, content: '', rev: 0, createdAt: new Date(0), updatedAt: new Date(0), deletedAt, locked: false, encrypted: null,
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
  const imported = (i: number, deletedAt: Date | null = null) => ({
    title: `T${i}`, content: `<p>${i}</p>`, createdAt: new Date(10 + i), updatedAt: new Date(20 + i), deletedAt, sealed: null,
  });

  test('writes each note as a new document with rev 0 and the backup timestamps', async () => {
    const made = batches();
    await expect(importNotes([imported(1), imported(2, new Date(99))])).resolves.toBe(2);

    expect(made).toHaveLength(1);
    expect(made[0].delete).not.toHaveBeenCalled();
    expect(made[0].set.mock.calls).toEqual([
      [{ path: 'notes/new-id', id: 'new-id' }, {
        title: 'T1', content: '<p>1</p>', rev: 0, createdAt: new Timestamp(11), updatedAt: new Timestamp(21), deletedAt: null,
      }],
      [{ path: 'notes/new-id', id: 'new-id' }, {
        title: 'T2', content: '<p>2</p>', rev: 0, createdAt: new Timestamp(12), updatedAt: new Timestamp(22), deletedAt: new Timestamp(99),
      }],
    ]);
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
        title: '', content: '', encrypted: payload, rev: 0, createdAt: new Timestamp(11), updatedAt: new Timestamp(21), deletedAt: null,
      }],
    ]);
  });

  test('nothing to import writes nothing', async () => {
    batches();
    await expect(importNotes([])).resolves.toBe(0);
    expect(firestore.writeBatch).not.toHaveBeenCalled();
  });
});
