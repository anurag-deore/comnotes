import type { SaveStatus } from '@/lib/autosave';

export type SaveTone = 'idle' | 'busy' | 'positive' | 'negative' | 'offline';

// What the inline save indicator shows; saving is never announced with a toast (CNOTE-13)
export function saveStatusView(status: SaveStatus, online: boolean): { label: string; tone: SaveTone } {
  switch (status) {
    case 'pending':
    case 'saving':
      return { label: 'Saving…', tone: 'busy' };
    case 'saved':
      return { label: 'Saved', tone: 'positive' };
    // Waiting for the connection isn't a failure (CNOTE-20)
    case 'offline':
      return { label: 'Offline – saves when back online', tone: 'offline' };
    case 'error':
      return { label: online ? 'Save failed – retrying' : 'Offline – not saved', tone: 'negative' };
    default:
      return { label: '', tone: 'idle' };
  }
}
