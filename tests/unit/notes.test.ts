import { beforeEach, describe, expect, test, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  class Timestamp {
    constructor(private readonly ms: number) {}
    toDate() { return new Date(this.ms); }
    static now() { return new Timestamp(1_000); }
  }
  return {
    Timestamp,
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    doc: vi.fn((parent: { path: string }, path?: string, id?: string) =>
      path ? { path: `${path}/${id}`, id } : { path: `${parent.path}/new-id`, id: 'new-id' }),
    query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })),
    orderBy: vi.fn((field: string, dir: string) => ({ orderBy: field, dir })),
    onSnapshot: vi.fn(),
    addDoc: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  };
});

vi.mock('firebase/firestore', () => firestore);
const db = vi.hoisted(() => ({ name: 'test-db' }));
vi.mock('@/lib/firebase', () => ({ db }));

import { createNote, saveNote, subscribeNotes, toNote } from '@/lib/notes';

const { Timestamp } = firestore;

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
    expect(n).toEqual({ id: 'a', title: 'T', content: 'C', rev: 0, createdAt: new Date(5), updatedAt: new Date(9) });
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
      title: 'New', content: 'new', rev: 3, updatedAt: 'SERVER_TIMESTAMP',
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

  test('a missing note rejects', async () => {
    transactionWith(undefined);
    await expect(saveNote({ id: 'a', title: 'T', content: '', rev: 0 })).rejects.toThrow('Note no longer exists');
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
    expect(n).toEqual({ id: 'b', title: 'Untitled Note', content: '', rev: 0, createdAt: new Date(1_000), updatedAt: new Date(1_000) });
  });
});
