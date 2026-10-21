import { describe, expect, test, vi } from 'vitest';
import { DecryptError, bytesToBase64, type EncryptedPayload } from '@/lib/noteCrypto';
import { VaultLockedError, createVault, passphraseStrength } from '@/lib/vault';

const ITER = 1_000;
const randomPassphrase = () => bytesToBase64(crypto.getRandomValues(new Uint8Array(18)));
const text = { title: 'Plans', content: '<p>top secret</p>' };

async function setUpVault() {
  const passphrase = randomPassphrase();
  const vault = createVault({ iterations: ITER });
  await vault.setup(passphrase);
  return { vault, passphrase };
}

describe('setup and encrypt (AC-1, AC-9)', () => {
  test('a new vault is locked and refuses to encrypt or decrypt', async () => {
    const vault = createVault({ iterations: ITER });
    expect(vault.canEncrypt()).toBe(false);
    await expect(vault.encrypt('n1', text)).rejects.toBeInstanceOf(VaultLockedError);
  });

  test('setup derives a key with a fresh salt and the configured iterations', async () => {
    const { vault } = await setUpVault();
    expect(vault.canEncrypt()).toBe(true);
    const payload = await vault.encrypt('n1', text);
    expect(payload.iter).toBe(ITER);
    await expect(vault.decrypt('n1', payload)).resolves.toEqual(text);

    const other = createVault({ iterations: ITER });
    await other.setup(randomPassphrase());
    expect((await other.encrypt('n1', text)).salt).not.toBe(payload.salt);
  });

  test('an edit keeps the note on the salt it was encrypted with', async () => {
    const { vault, passphrase } = await setUpVault();
    const first = await vault.encrypt('n1', text);
    const second = createVault({ iterations: ITER });
    await second.setup(passphrase);
    expect(await second.unlock(passphrase, { id: 'n1', payload: first })).toBe(true);
    const edited = await second.encrypt('n1', { ...text, content: 'more' }, first);
    expect(edited.salt).toBe(first.salt);
  });
});

describe('unlock (AC-9, AC-10)', () => {
  test('the right passphrase is accepted by decrypting a sample note; the key is cached for its salt', async () => {
    const { vault: writer, passphrase } = await setUpVault();
    const payload = await writer.encrypt('n1', text);

    const vault = createVault({ iterations: ITER });
    const listener = vi.fn();
    vault.subscribe(listener);
    expect(vault.hasKeyFor(payload)).toBe(false);
    expect(await vault.unlock(passphrase, { id: 'n1', payload })).toBe(true);
    expect(vault.hasKeyFor(payload)).toBe(true);
    expect(vault.canEncrypt()).toBe(true);
    expect(listener).toHaveBeenCalled();
    // New locks reuse the verified salt, so one derivation covers every note
    expect((await vault.encrypt('n2', text)).salt).toBe(payload.salt);
  });

  test('a wrong passphrase is rejected and stores no key', async () => {
    const { vault: writer } = await setUpVault();
    const payload = await writer.encrypt('n1', text);
    const vault = createVault({ iterations: ITER });
    expect(await vault.unlock(randomPassphrase(), { id: 'n1', payload })).toBe(false);
    expect(vault.hasKeyFor(payload)).toBe(false);
    expect(vault.canEncrypt()).toBe(false);
  });

  test('derivation uses the iterations recorded in the payload', async () => {
    const { vault: writer, passphrase } = await setUpVault();
    const payload = await writer.encrypt('n1', text);
    const vault = createVault({ iterations: 5 * ITER });
    expect(await vault.unlock(passphrase, { id: 'n1', payload })).toBe(true);
  });

  test('a lock while a derivation is running wins: the late key is dropped', async () => {
    const { vault: writer, passphrase } = await setUpVault();
    const payload = await writer.encrypt('n1', text);
    const vault = createVault({ iterations: ITER });
    const unlocking = vault.unlock(passphrase, { id: 'n1', payload });
    vault.lock();
    expect(await unlocking).toBe(false);
    expect(vault.hasKeyFor(payload)).toBe(false);
  });
});

describe('lock (AC-13)', () => {
  test('clears every key and notifies', async () => {
    const { vault } = await setUpVault();
    const payload = await vault.encrypt('n1', text);
    const listener = vi.fn();
    const unsubscribe = vault.subscribe(listener);
    const before = vault.getVersion();

    vault.lock();
    expect(vault.canEncrypt()).toBe(false);
    expect(vault.hasKeyFor(payload)).toBe(false);
    expect(vault.getVersion()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(vault.decrypt('n1', payload)).rejects.toBeInstanceOf(VaultLockedError);

    unsubscribe();
    vault.lock();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('reseal (AC-8)', () => {
  test('re-encrypts for another note id, optionally editing the text', async () => {
    const { vault } = await setUpVault();
    const payload = await vault.encrypt('n1', text);
    const copy = await vault.reseal(payload, 'n1', 'copy', (t) => ({ ...t, title: `${t.title} (conflict copy)` }));
    await expect(vault.decrypt('copy', copy)).resolves.toEqual({ ...text, title: 'Plans (conflict copy)' });
    await expect(vault.decrypt('n1', copy)).rejects.toBeInstanceOf(DecryptError);
    expect(copy.salt).toBe(payload.salt);
  });

  test('without the key it throws instead of writing anything readable', async () => {
    const { vault } = await setUpVault();
    const payload: EncryptedPayload = await vault.encrypt('n1', text);
    vault.lock();
    await expect(vault.reseal(payload, 'n1', 'copy')).rejects.toBeInstanceOf(VaultLockedError);
  });
});

// Generated inputs only: no example passphrases in the repo
const randomFrom = (alphabet: string, length: number) =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => alphabet[n % alphabet.length]).join('');
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const MIXED = `${LOWER}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*`;

describe('passphraseStrength (AC-9)', () => {
  test.each([
    ['empty', () => '', 'weak'],
    ['3 lowercase letters', () => randomFrom(LOWER, 3), 'weak'],
    ['8 lowercase letters and digits', () => randomFrom(`${LOWER}0123456789`, 8), 'weak'],
    ['one character repeated 24 times', () => 'q'.repeat(24), 'weak'],
    ['16 lowercase letters', () => randomFrom(LOWER, 16), 'fair'],
    ['four 6-letter words', () => Array.from({ length: 4 }, () => randomFrom(LOWER, 6)).join(' '), 'strong'],
    ['16 mixed characters', () => randomFrom(MIXED, 16), 'strong'],
  ])('%s is %s', (_label, make, strength) => {
    expect(passphraseStrength(make())).toBe(strength);
  });
});
