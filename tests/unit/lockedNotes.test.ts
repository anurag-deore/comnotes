import { describe, expect, test } from 'vitest';
import { LOCKED_PREVIEW, LOCKED_TITLE, listTitle, noteLabel, withDraft } from '@/lib/lockedNotes';
import { PBKDF2_ITERATIONS, bytesToBase64, type EncryptedPayload } from '@/lib/noteCrypto';
import type { Note } from '@/types/note';

const payload = (fill = 1): EncryptedPayload => ({
  v: 1, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITERATIONS,
  salt: bytesToBase64(new Uint8Array(16).fill(fill)),
  iv: bytesToBase64(new Uint8Array(12).fill(fill)),
  ct: bytesToBase64(new Uint8Array(32).fill(fill)),
});

const note = (over: Partial<Note> = {}): Note => ({
  id: 'a', title: 'T', content: '<p>c</p>', rev: 2, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null,
  locked: false, encrypted: null, ...over,
});

describe('withDraft (CNOTE-8 AC-7 with CNOTE-7 AC-7)', () => {
  test('no draft: the server note as is', () => {
    const n = note();
    expect(withDraft(n, undefined)).toBe(n);
  });

  test('a plain draft shows its text and rev, and an unlocked note', () => {
    const server = note({ title: '', content: '', locked: true, encrypted: payload() });
    expect(withDraft(server, { id: 'a', title: 'New', content: 'x', rev: 1 })).toEqual(
      note({ title: 'New', content: 'x', rev: 1 }),
    );
  });

  test('a sealed draft shows as the latest ciphertext of a locked note, never plaintext', () => {
    const latest = payload(9);
    expect(withDraft(note(), { id: 'a', title: '', content: '', rev: 2, sealed: { noteId: 'a', payload: latest } })).toEqual(
      note({ title: '', content: '', locked: true, encrypted: latest }),
    );
  });

  test('a sealed draft still bound to another note is not shown (it is re-encrypted when saved)', () => {
    const n = note({ title: '', content: '', locked: true, encrypted: payload() });
    expect(withDraft(n, { id: 'a', title: '', content: '', rev: 0, sealed: { noteId: 'b', payload: payload(9) } })).toBe(n);
  });
});

describe('titles (CNOTE-7 AC-12)', () => {
  test('a locked note shows the placeholder unless its title was decrypted this session', () => {
    const locked = note({ title: '', content: '', locked: true, encrypted: payload() });
    expect(listTitle(locked)).toBe(LOCKED_TITLE);
    expect(listTitle(locked, 'Diary')).toBe('Diary');
    expect(listTitle(locked, '  ')).toBe('Untitled');
    expect(listTitle(note({ title: 'Plain' }), 'ignored')).toBe('Plain');
  });

  test('noteLabel (Trash, toasts) never shows a locked title', () => {
    expect(noteLabel(note({ locked: true, title: '' }))).toBe('Locked note');
    expect(noteLabel(note({ title: ' ' }))).toBe('Untitled');
    expect(LOCKED_PREVIEW).toBe('Encrypted');
  });
});
