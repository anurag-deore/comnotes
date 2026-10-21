// The in-memory keys for locked notes (CNOTE-7). Holds derived CryptoKeys only: never the
// passphrase, never a hash of it, never anything in storage. lock() forgets everything.
import {
  PBKDF2_ITERATIONS, base64ToBytes, bytesToBase64, decryptNote, deriveKey, encryptNote, newSalt,
  type EncryptedPayload, type NoteKey, type NoteText,
} from '@/lib/noteCrypto';

// The vault has no key for this payload; ask for the passphrase
export class VaultLockedError extends Error {
  constructor() {
    super('Locked notes are locked. Enter your passphrase first.');
    this.name = 'VaultLockedError';
  }
}

// A locked note to check a passphrase against: a wrong passphrase fails to decrypt it
export interface LockedSample {
  id: string;
  payload: EncryptedPayload;
}

const cacheKey = (salt: string, iter: number) => `${iter}:${salt}`;

export function createVault({ iterations = PBKDF2_ITERATIONS }: { iterations?: number } = {}) {
  // One key per (salt, iterations); normally every note shares one salt, so one entry
  const keys = new Map<string, NoteKey>();
  // Used for newly locked notes
  let current: NoteKey | null = null;
  // Bumped by lock(), so a derivation that finishes after a lock is thrown away
  let epoch = 0;
  let version = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };

  const remember = (noteKey: NoteKey) => {
    keys.set(cacheKey(noteKey.salt, noteKey.iter), noteKey);
    current ??= noteKey;
    notify();
  };

  const keyFor = (payload: EncryptedPayload) => {
    const noteKey = keys.get(cacheKey(payload.salt, payload.iter));
    if (!noteKey) throw new VaultLockedError();
    return noteKey;
  };

  const decrypt = (noteId: string, payload: EncryptedPayload) => decryptNote(keyFor(payload).key, noteId, payload);

  return {
    // First lock ever: nothing to check against, so the caller confirms the passphrase twice
    async setup(passphrase: string) {
      const started = epoch;
      const salt = newSalt();
      const key = await deriveKey(passphrase, salt, iterations);
      if (started !== epoch) return false;
      remember({ key, salt: bytesToBase64(salt), iter: iterations });
      return true;
    },
    // True when the passphrase decrypts the sample; only then is the key kept
    async unlock(passphrase: string, sample: LockedSample) {
      const started = epoch;
      const { salt, iter } = sample.payload;
      const key = await deriveKey(passphrase, base64ToBytes(salt), iter);
      try {
        await decryptNote(key, sample.id, sample.payload);
      } catch {
        return false;
      }
      if (started !== epoch) return false;
      remember({ key, salt, iter });
      return true;
    },
    hasKeyFor: (payload: EncryptedPayload) => keys.has(cacheKey(payload.salt, payload.iter)),
    canEncrypt: () => current !== null,
    // Encrypts with the key of `like` (the note's current payload) or, for a newly locked note, the current key.
    // The key is picked synchronously, so a lock right after the call doesn't lose this encryption.
    encrypt(noteId: string, text: NoteText, like?: EncryptedPayload) {
      try {
        const noteKey = like ? keyFor(like) : current;
        if (!noteKey) throw new VaultLockedError();
        return encryptNote(noteKey, noteId, text);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    decrypt(noteId: string, payload: EncryptedPayload) {
      try {
        return decrypt(noteId, payload);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    // The same text (optionally edited) encrypted for another note id, e.g. a conflict copy
    async reseal(payload: EncryptedPayload, fromId: string, toId: string, edit: (text: NoteText) => NoteText = (t) => t) {
      const noteKey = keyFor(payload);
      return encryptNote(noteKey, toId, edit(await decryptNote(noteKey.key, fromId, payload)));
    },
    lock() {
      epoch += 1;
      if (!keys.size && !current) return;
      keys.clear();
      current = null;
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion: () => version,
  };
}

export type Vault = ReturnType<typeof createVault>;

// The app's one vault. Module state lives only in this tab's memory.
export const noteVault = createVault();

export type Strength = 'weak' | 'fair' | 'strong';

// A rough guide for the passphrase field, not a gate: character pool × length, with repeated
// characters counting for little
export function passphraseStrength(passphrase: string): Strength {
  const chars = [...passphrase];
  let pool = 0;
  if (/[a-z]/.test(passphrase)) pool += 26;
  if (/[A-Z]/.test(passphrase)) pool += 26;
  if (/[0-9]/.test(passphrase)) pool += 10;
  if (/[^A-Za-z0-9]/.test(passphrase)) pool += 33;
  const length = Math.min(chars.length, 2 * new Set(chars).size);
  const bits = pool ? length * Math.log2(pool) : 0;
  if (bits >= 90) return 'strong';
  return bits >= 60 ? 'fair' : 'weak';
}
