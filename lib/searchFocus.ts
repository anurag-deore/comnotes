// "Focus the search field" as an event, so a shortcut (CNOTE-24: `/`, Cmd+K) or any other part of
// the app can ask for it without a reference to the sidebar. The notes page listens and focuses the
// visible field, showing the sidebar or opening the drawer first when needed.
export const FOCUS_SEARCH_EVENT = 'comnotes:focus-search';

const browserWindow = () => (typeof window === 'undefined' ? undefined : window);

export function requestSearchFocus(target: EventTarget | undefined = browserWindow()): void {
  target?.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
}

// Returns the unsubscribe function
export function onSearchFocusRequest(listener: () => void, target: EventTarget | undefined = browserWindow()): () => void {
  if (!target) return () => undefined;
  target.addEventListener(FOCUS_SEARCH_EVENT, listener);
  return () => target.removeEventListener(FOCUS_SEARCH_EVENT, listener);
}
