// Whether this viewer keeps the desktop sidebar hidden (CNOTE-16). A per-browser convenience:
// storage can be missing or throw (private mode, blocked site data), which just means "shown".

export const SIDEBAR_HIDDEN_KEY = 'comnotes:sidebar-hidden';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSidebarHidden(storage: ReadStorage | null): boolean {
  try {
    return storage?.getItem(SIDEBAR_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarHidden(storage: WriteStorage | null, hidden: boolean): void {
  try {
    storage?.setItem(SIDEBAR_HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    // Not remembered this time; the toggle itself still works
  }
}
