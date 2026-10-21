'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { lock } from '@/lib/auth';
import { createAutoLock, flushThenLock } from '@/lib/autoLock';
import { HIDDEN_LOCK_MS, IDLE_LOCK_MS, LOCK_FLUSH_TIMEOUT_MS } from '@/lib/lockSettings';
import { noteVault } from '@/lib/vault';
import { useSaver } from '@/contexts/AutosaveContext';

interface AuthContextType {
  isAuthenticated: boolean;
  lockedForInactivity: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart', 'focus'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lockedForInactivity, setLockedForInactivity] = useState(false);
  const router = useRouter();
  const { saver } = useSaver();

  // Firebase Auth is the source of truth; pages redirect when this flips
  useEffect(() => onAuthStateChanged(getFirebaseAuth(), (user) => {
    setIsAuthenticated(user !== null);
    // Signed out by any path: locked notes need the passphrase again (CNOTE-7)
    if (!user) {
      noteVault.lock();
      return;
    }
    setLockedForInactivity(false);
    // Drafts that couldn't be saved before the last lock can be saved now
    if (saver.hasPending()) void saver.flush();
  }), [saver]);

  // Unsaved drafts stay in the saver if the flush fails; locking always wins. The keys of locked
  // notes go first, so decrypted notes close at once; their drafts are already encrypted (CNOTE-7).
  const logout = useCallback(async () => {
    noteVault.lock();
    await flushThenLock(saver.flush, lock, LOCK_FLUSH_TIMEOUT_MS);
    router.push('/');
  }, [saver, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const autoLock = createAutoLock({
      idleMs: IDLE_LOCK_MS,
      hiddenMs: HIDDEN_LOCK_MS,
      onLock: () => {
        setLockedForInactivity(true);
        void logout();
      },
    });
    const onActivity = () => autoLock.activity();
    const onVisibility = () => autoLock.visibility(document.hidden);
    const options = { capture: true, passive: true };
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, onActivity, options));
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      autoLock.dispose();
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, onActivity, options));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAuthenticated, logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, lockedForInactivity, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
