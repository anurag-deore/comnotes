// "Keep notes available offline on this device" (CNOTE-20). On: Firestore keeps its cache, and
// writes waiting for the network, in this browser's IndexedDB. Off: memory only. Per device, in
// localStorage; storage that is missing or throws reads as the default, on.

export const OFFLINE_CACHE_KEY = 'comnotes:offline-cache';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

export function readOfflineCache(storage: ReadStorage | null): boolean {
  try {
    return storage?.getItem(OFFLINE_CACHE_KEY) !== '0';
  } catch {
    return true;
  }
}

// False when the value couldn't be stored, so the caller doesn't reload into the old setting
export function writeOfflineCache(storage: WriteStorage | null, on: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(OFFLINE_CACHE_KEY, on ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

export interface OfflineCacheDeps {
  isOnline: () => boolean;
  // Saves every draft and waits for Firestore's queued writes; true when all reached the server
  settle: () => Promise<boolean>;
  write: (on: boolean) => boolean;
  // Stops Firestore and deletes its IndexedDB data
  clearCache: () => Promise<void>;
  reload: () => void;
}

export type OfflineCacheChange = 'done' | 'offline' | 'unsaved' | 'storage';

// Firestore picks its cache when it starts, so a change means a reload, which locks the app. That
// needs a connection to unlock again, and turning the cache off deletes writes still waiting in it,
// so nothing changes unless we're online and everything has reached the server.
export async function changeOfflineCache(on: boolean, deps: OfflineCacheDeps): Promise<OfflineCacheChange> {
  if (!deps.isOnline()) return 'offline';
  if (!(await deps.settle())) return 'unsaved';
  if (!deps.write(on)) return 'storage';
  if (!on) {
    try {
      await deps.clearCache();
    } catch (error) {
      // Another tab may still have it open; the next load with the setting off clears it again
      console.error('Error clearing the offline cache:', error);
    }
  }
  deps.reload();
  return 'done';
}
