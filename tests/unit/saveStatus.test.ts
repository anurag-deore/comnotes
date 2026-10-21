import { describe, expect, test } from 'vitest';
import { saveStatusView } from '@/lib/saveStatus';

describe('saveStatusView (AC-7)', () => {
  test('idle shows nothing', () => {
    expect(saveStatusView('idle', true)).toEqual({ label: '', tone: 'idle' });
  });
  test('pending and saving read as Saving…', () => {
    expect(saveStatusView('pending', true)).toEqual({ label: 'Saving…', tone: 'busy' });
    expect(saveStatusView('saving', true)).toEqual({ label: 'Saving…', tone: 'busy' });
  });
  test('saved uses the positive tone', () => {
    expect(saveStatusView('saved', true)).toEqual({ label: 'Saved', tone: 'positive' });
  });
  test('error says whether we are offline', () => {
    expect(saveStatusView('error', true)).toEqual({ label: 'Save failed – retrying', tone: 'negative' });
    expect(saveStatusView('error', false)).toEqual({ label: 'Offline – not saved', tone: 'negative' });
  });
  test('CNOTE-20 AC-4: waiting for the connection is calm, not an error', () => {
    expect(saveStatusView('offline', false)).toEqual({ label: 'Offline – saves when back online', tone: 'offline' });
  });
});
