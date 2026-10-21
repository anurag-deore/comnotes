import { FirebaseError } from 'firebase/app';
import { inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { noteVault } from '@/lib/vault';

const INVALID_PIN_CODES = ['auth/invalid-credential', 'auth/wrong-password', 'auth/missing-password'];

// Firebase checks the PIN on its servers, so there is no unlocking offline (CNOTE-20)
export const OFFLINE_UNLOCK_MESSAGE = "You're offline. Unlocking needs an internet connection.";

function messageFor(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : '';
  if (INVALID_PIN_CODES.includes(code)) return 'Invalid PIN';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  if (code === 'auth/network-request-failed') return OFFLINE_UNLOCK_MESSAGE;
  return 'Could not unlock. Check your connection.';
}

// The PIN is the password of the single owner account; Firebase verifies it server-side
export async function unlock(pin: string) {
  const auth = getFirebaseAuth();
  try {
    // Keep the session in memory only so nothing survives a refresh on a shared PC
    await setPersistence(auth, inMemoryPersistence);
    await signInWithEmailAndPassword(auth, process.env.NEXT_PUBLIC_OWNER_EMAIL ?? '', pin);
  } catch (error) {
    throw new Error(messageFor(error));
  }
}

// Forgets the keys of locked notes first (CNOTE-7), then signs out
export async function lock() {
  noteVault.lock();
  await signOut(getFirebaseAuth());
}
