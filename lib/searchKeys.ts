// What a key in the search field does (CNOTE-18 combobox). Pure, so the keyboard model is tested
// without a DOM: arrows move through the results (wrapping), Enter opens the active result or the
// first, Esc clears a query. Returns null for keys the text field keeps.
export type SearchKeyAction =
  | { type: 'move'; index: number }
  | { type: 'open'; index: number }
  | { type: 'clear' };

export function searchKeyAction(key: string, active: number, count: number, hasQuery: boolean): SearchKeyAction | null {
  if (key === 'Escape') return hasQuery ? { type: 'clear' } : null;
  if (!hasQuery || count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return { type: 'move', index: (active + 1) % count };
    case 'ArrowUp':
      return { type: 'move', index: active <= 0 ? count - 1 : active - 1 };
    case 'Enter':
      return { type: 'open', index: Math.min(Math.max(0, active), count - 1) };
    default:
      return null;
  }
}
