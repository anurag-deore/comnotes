import { describe, expect, test } from 'vitest';
import {
  DecryptError, PBKDF2_ITERATIONS, base64ToBytes, bytesToBase64, decryptNote, deriveKey, encryptNote, isEncryptedPayload,
  newSalt, type EncryptedPayload,
} from '@/lib/noteCrypto';

// Fast for tests; production uses PBKDF2_ITERATIONS
const ITER = 1_000;
// Never a real passphrase: random per run
const randomPassphrase = () => bytesToBase64(crypto.getRandomValues(new Uint8Array(18)));

async function keyFor(passphrase: string, salt = newSalt()) {
  return { key: await deriveKey(passphrase, salt, ITER), salt: bytesToBase64(salt), iter: ITER };
}

const text = { title: 'Diary', content: '<p>secret <strong>stuff</strong> ü 😀</p>' };

describe('key derivation (AC-1)', () => {
  test('production default is at least 600 000 PBKDF2 iterations', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  test('derives a non-extractable AES-GCM 256 key for encrypt/decrypt only', async () => {
    const key = await deriveKey(randomPassphrase(), newSalt(), ITER);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  test('salt is 16 random bytes', () => {
    const a = newSalt();
    expect(a).toHaveLength(16);
    expect(bytesToBase64(a)).not.toBe(bytesToBase64(newSalt()));
  });

  test('NFC and NFD spellings of the same passphrase derive the same key', async () => {
    const salt = newSalt();
    const base = randomPassphrase();
    const nfc = await keyFor(`${base}é`.normalize('NFC'), salt);
    const nfd = await keyFor(`${base}é`.normalize('NFD'), salt);
    const payload = await encryptNote(nfc, 'n1', text);
    await expect(decryptNote(nfd.key, 'n1', payload)).resolves.toEqual(text);
  });
});

describe('encryptNote / decryptNote (AC-2, AC-3)', () => {
  test('round-trips title and content', async () => {
    const k = await keyFor(randomPassphrase());
    const payload = await encryptNote(k, 'n1', text);
    expect(payload).toEqual({ v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: k.salt, iv: expect.any(String), ct: expect.any(String) });
    await expect(decryptNote(k.key, 'n1', payload)).resolves.toEqual(text);
  });

  test('the payload holds no plaintext', async () => {
    const k = await keyFor(randomPassphrase());
    const json = JSON.stringify(await encryptNote(k, 'n1', text));
    expect(json).not.toContain('Diary');
    expect(json).not.toContain('secret');
  });

  test('every encryption uses a fresh 12-byte IV', async () => {
    const k = await keyFor(randomPassphrase());
    const payloads = await Promise.all(Array.from({ length: 50 }, () => encryptNote(k, 'n1', text)));
    const ivs = new Set(payloads.map((p) => p.iv));
    expect(ivs.size).toBe(50);
    expect(base64ToBytes(payloads[0].iv)).toHaveLength(12);
    expect(new Set(payloads.map((p) => p.ct)).size).toBe(50);
  });

  test('wrong passphrase fails with DecryptError', async () => {
    const salt = newSalt();
    const right = await keyFor(randomPassphrase(), salt);
    const wrong = await keyFor(randomPassphrase(), salt);
    const payload = await encryptNote(right, 'n1', text);
    await expect(decryptNote(wrong.key, 'n1', payload)).rejects.toBeInstanceOf(DecryptError);
  });

  test('ciphertext is bound to the note id (AAD)', async () => {
    const k = await keyFor(randomPassphrase());
    const payload = await encryptNote(k, 'n1', text);
    await expect(decryptNote(k.key, 'n2', payload)).rejects.toBeInstanceOf(DecryptError);
  });

  test('tampered ciphertext or IV fails', async () => {
    const k = await keyFor(randomPassphrase());
    const payload = await encryptNote(k, 'n1', text);
    const flip = (b64: string) => {
      const bytes = base64ToBytes(b64);
      bytes[0] ^= 1;
      return bytesToBase64(bytes);
    };
    await expect(decryptNote(k.key, 'n1', { ...payload, ct: flip(payload.ct) })).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptNote(k.key, 'n1', { ...payload, iv: flip(payload.iv) })).rejects.toBeInstanceOf(DecryptError);
    const short = bytesToBase64(base64ToBytes(payload.ct).slice(0, -1));
    await expect(decryptNote(k.key, 'n1', { ...payload, ct: short })).rejects.toBeInstanceOf(DecryptError);
  });

  test('a decrypted value that is not { title, content } strings is rejected', async () => {
    const k = await keyFor(randomPassphrase());
    const bogus = await encryptNote(k, 'n1', { title: 1, content: 'x' } as unknown as typeof text);
    await expect(decryptNote(k.key, 'n1', bogus)).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('isEncryptedPayload (AC-4)', () => {
  const valid = (): EncryptedPayload => ({
    v: 1, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITERATIONS,
    salt: bytesToBase64(new Uint8Array(16).fill(1)),
    iv: bytesToBase64(new Uint8Array(12).fill(2)),
    ct: bytesToBase64(new Uint8Array(40).fill(3)),
  });

  test('accepts a well-formed payload', () => {
    expect(isEncryptedPayload(valid())).toBe(true);
  });

  test.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['an extra key', { ...valid(), title: 'x' }],
    ['a missing key', Object.fromEntries(Object.entries(valid()).filter(([key]) => key !== 'ct'))],
    ['v 2', { ...valid(), v: 2 }],
    ['another kdf', { ...valid(), kdf: 'argon2id' }],
    ['iter below 100 000', { ...valid(), iter: 99_999 }],
    ['iter above 10 000 000', { ...valid(), iter: 10_000_001 }],
    ['a fractional iter', { ...valid(), iter: 600_000.5 }],
    ['iter as a string', { ...valid(), iter: '600000' }],
    ['a 15-byte salt', { ...valid(), salt: bytesToBase64(new Uint8Array(15)) }],
    ['a 16-byte iv', { ...valid(), iv: bytesToBase64(new Uint8Array(16)) }],
    ['ct shorter than the tag', { ...valid(), ct: bytesToBase64(new Uint8Array(15)) }],
    ['non-base64 ct', { ...valid(), ct: 'not base64!' }],
    ['non-canonical base64', { ...valid(), salt: `${valid().salt.slice(0, -2)}B=` }],
    ['a ct longer than a Firestore document', { ...valid(), ct: 'A'.repeat(1_048_580) }],
  ])('rejects %s', (_label, value) => {
    expect(isEncryptedPayload(value)).toBe(false);
  });

  test('accepts what encryptNote produces at the lowest allowed iteration count', async () => {
    const salt = newSalt();
    const key = await deriveKey(randomPassphrase(), salt, 100_000);
    const payload = await encryptNote({ key, salt: bytesToBase64(salt), iter: 100_000 }, 'n1', text);
    expect(isEncryptedPayload(payload)).toBe(true);
  });
});
