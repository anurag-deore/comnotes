import type { SaveStatus } from '@/lib/autosave';

export type SaveTone = 'idle' | 'busy' | 'positive' | 'negative';

// What the inline save indicator shows; saving is never announced with a toast (CNOTE-13)
export function saveStatusView(status: SaveStatus, online: boolean): { label: string; tone: SaveTone } {
  switch (status) {
    case 'pending':
    case 'saving':
      return { label: 'Saving…', tone: 'busy' };
    case 'saved':
      return { label: 'Saved', tone: 'positive' };
    case 'error':
      return { label: online ? 'Save failed – retrying' : 'Offline – not saved', tone: 'negative' };
    default:
      return { label: '', tone: 'idle' };
  }
}
