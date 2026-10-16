import { FirebaseError } from 'firebase/app';
import { inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

const INVALID_PIN_CODES = ['auth/invalid-credential', 'auth/wrong-password', 'auth/missing-password'];

function messageFor(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : '';
  if (INVALID_PIN_CODES.includes(code)) return 'Invalid PIN';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
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

export async function lock() {
  await signOut(getFirebaseAuth());
}
