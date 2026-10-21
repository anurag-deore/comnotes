import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  clearIndexedDbPersistence, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
  terminate, waitForPendingWrites,
} from 'firebase/firestore';
import { readOfflineCache } from '@/lib/offlineSetting';
import { browserStorage } from '@/lib/sidebarPreference';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// "Keep notes available offline on this device" (CNOTE-20): Firestore keeps what it read, and writes
// waiting for the network, in IndexedDB, shared by every open tab. Off, and on the server: memory only.
const inBrowser = typeof window !== 'undefined';
export const offlineCacheEnabled = inBrowser && readOfflineCache(browserStorage());

export const db = initializeFirestore(app, {
  localCache: offlineCacheEnabled ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
});

// Turned off: delete what an earlier session kept, before Firestore starts. Finishes a clear that an
// open tab blocked when the setting changed.
if (inBrowser && !offlineCacheEnabled) {
  clearIndexedDbPersistence(db).catch((error) => console.error('Error clearing the offline cache:', error));
}

// True once every write queued on this device has reached the server, false after timeoutMs
export async function settlePendingWrites(timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([waitForPendingWrites(db).then(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Stops Firestore and deletes its IndexedDB data; the page must reload afterwards
export async function dropOfflineCache() {
  await terminate(db);
  await clearIndexedDbPersistence(db);
}

// Created on first use so server prerendering never initializes Auth
export const getFirebaseAuth = () => getAuth(app);
