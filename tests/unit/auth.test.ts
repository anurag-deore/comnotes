import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';

const firebaseAuth = vi.hoisted(() => ({
  inMemoryPersistence: { type: 'NONE' },
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/auth', () => firebaseAuth);
const auth = vi.hoisted(() => ({ name: 'test-auth' }));
vi.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => auth }));

import { OFFLINE_UNLOCK_MESSAGE, lock, unlock } from '@/lib/auth';
import { noteVault } from '@/lib/vault';
import { bytesToBase64 } from '@/lib/noteCrypto';

const OWNER_EMAIL = 'owner@example.com';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_OWNER_EMAIL', OWNER_EMAIL);
  firebaseAuth.setPersistence.mockResolvedValue(undefined);
  firebaseAuth.signInWithEmailAndPassword.mockResolvedValue({});
  firebaseAuth.signOut.mockResolvedValue(undefined);
});

describe('unlock', () => {
  test('AC-1: signs in to Firebase Auth as the owner with the PIN as password', async () => {
    await unlock('48151623');
    expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, OWNER_EMAIL, '48151623');
  });

  test('AC-3: switches to in-memory persistence before signing in', async () => {
    await unlock('48151623');
    expect(firebaseAuth.setPersistence).toHaveBeenCalledWith(auth, firebaseAuth.inMemoryPersistence);
    expect(firebaseAuth.setPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      firebaseAuth.signInWithEmailAndPassword.mock.invocationCallOrder[0],
    );
  });

  test.each(['auth/invalid-credential', 'auth/wrong-password', 'auth/missing-password'])(
    'AC-2: %s is reported as "Invalid PIN"',
    async (code) => {
      firebaseAuth.signInWithEmailAndPassword.mockRejectedValue(new FirebaseError(code, 'x'));
      await expect(unlock('000000')).rejects.toThrow('Invalid PIN');
    },
  );

  test('AC-2: Firebase throttling is reported as too many attempts', async () => {
    firebaseAuth.signInWithEmailAndPassword.mockRejectedValue(new FirebaseError('auth/too-many-requests', 'x'));
    await expect(unlock('000000')).rejects.toThrow('Too many attempts. Try again later.');
  });

  test('AC-2: any other failure is reported as a connection problem', async () => {
    firebaseAuth.signInWithEmailAndPassword.mockRejectedValue(new FirebaseError('auth/internal-error', 'x'));
    await expect(unlock('000000')).rejects.toThrow('Could not unlock. Check your connection.');
  });

  test('CNOTE-20 AC-11: no network says unlocking needs a connection', async () => {
    firebaseAuth.signInWithEmailAndPassword.mockRejectedValue(new FirebaseError('auth/network-request-failed', 'x'));
    await expect(unlock('000000')).rejects.toThrow(OFFLINE_UNLOCK_MESSAGE);
    expect(OFFLINE_UNLOCK_MESSAGE).toBe("You're offline. Unlocking needs an internet connection.");
  });
});

describe('lock', () => {
  test('AC-4: signs out of Firebase Auth', async () => {
    await lock();
    expect(firebaseAuth.signOut).toHaveBeenCalledWith(auth);
  });

  test('CNOTE-7 AC-13: forgets the keys of locked notes before signing out', async () => {
    await noteVault.setup(bytesToBase64(crypto.getRandomValues(new Uint8Array(18))));
    expect(noteVault.canEncrypt()).toBe(true);
    firebaseAuth.signOut.mockImplementation(async () => {
      expect(noteVault.canEncrypt()).toBe(false);
    });
    await lock();
    expect(noteVault.canEncrypt()).toBe(false);
    expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
  });
});
