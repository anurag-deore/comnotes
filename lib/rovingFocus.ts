// Keyboard movement inside a horizontal ARIA toolbar (one tab stop, arrows move focus).
// Returns the index to focus, or null when the key isn't a toolbar key.
export function nextFocusIndex(current: number, key: string, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

// Same movement for an ARIA radio group, where Up/Down move like Left/Right
const RADIO_KEYS: Record<string, string> = { ArrowDown: 'ArrowRight', ArrowUp: 'ArrowLeft' };

export function nextRadioIndex(current: number, key: string, count: number): number | null {
  return nextFocusIndex(current, RADIO_KEYS[key] ?? key, count);
}
