// Client-side encryption of locked notes (CNOTE-7). WebCrypto only: PBKDF2-SHA-256 turns the
// passphrase into a non-extractable AES-GCM-256 key; each note's { title, content } is encrypted
// with a fresh random IV and bound to the note id as additional data. Nothing here stores anything.

// OWASP 2023 recommendation for PBKDF2-HMAC-SHA-256
export const PBKDF2_ITERATIONS = 600_000;
export const KDF = 'PBKDF2-SHA256';
export const PAYLOAD_VERSION = 1;
// Accepted from storage or a backup: low enough for older payloads, high enough not to freeze the tab
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
// Firestore stores at most 1 MiB per document, so no stored ciphertext can be longer
const MAX_CT_CHARS = 1_048_576;

export interface EncryptedPayload {
  v: typeof PAYLOAD_VERSION;
  kdf: typeof KDF;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

export interface NoteText {
  title: string;
  content: string;
}

// A derived key and the parameters it was derived with, which go into every payload it makes
export interface NoteKey {
  key: CryptoKey;
  salt: string;
  iter: number;
}

// Wrong passphrase, wrong note, tampered or malformed data: all look the same from outside
export class DecryptError extends Error {
  constructor(options?: ErrorOptions) {
    super("This note couldn't be decrypted", options);
    this.name = 'DecryptError';
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked, so large ciphertexts don't overflow the argument limit
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Only the canonical encoding of exactly `length` (or at least `min`) bytes
function decodedLength(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > MAX_CT_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    const bytes = base64ToBytes(value);
    return bytesToBase64(bytes) === value ? bytes.length : null;
  } catch {
    return null;
  }
}

const PAYLOAD_KEYS = ['v', 'kdf', 'iter', 'salt', 'iv', 'ct'];

// Strict shape check for a payload read from Firestore or a backup
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== PAYLOAD_KEYS.length || !PAYLOAD_KEYS.every((key) => Object.hasOwn(record, key))) return false;
  const { v, kdf, iter } = record;
  if (v !== PAYLOAD_VERSION || kdf !== KDF) return false;
  if (typeof iter !== 'number' || !Number.isSafeInteger(iter) || iter < MIN_ITERATIONS || iter > MAX_ITERATIONS) return false;
  const ct = decodedLength(record.ct);
  return decodedLength(record.salt) === SALT_BYTES && decodedLength(record.iv) === IV_BYTES && ct !== null && ct >= TAG_BYTES;
}

export function newSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

const encoder = new TextEncoder();

// NFC, so the same passphrase typed on different keyboards gives the same key
export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const additionalData = (noteId: string) => encoder.encode(`comnotes:note:v${PAYLOAD_VERSION}:${noteId}`);

export async function encryptNote({ key, salt, iter }: NoteKey, noteId: string, text: NoteText): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = encoder.encode(JSON.stringify({ title: text.title, content: text.content }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(noteId) }, key, plaintext);
  return { v: PAYLOAD_VERSION, kdf: KDF, iter, salt, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

export async function decryptNote(key: CryptoKey, noteId: string, payload: EncryptedPayload): Promise<NoteText> {
  let value: unknown;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv), additionalData: additionalData(noteId) },
      key,
      base64ToBytes(payload.ct),
    );
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch (cause) {
    throw new DecryptError({ cause });
  }
  const { title, content } = (value ?? {}) as Record<string, unknown>;
  if (typeof title !== 'string' || typeof content !== 'string') throw new DecryptError();
  return { title, content };
}
