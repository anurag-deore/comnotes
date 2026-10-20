// Motion helpers (CNOTE-16). Pure: the window and document are passed in, so they are unit-tested
// without a browser. Styling of the transitions lives in app/globals.css.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface MediaWindow {
  matchMedia?: (query: string) => { matches: boolean };
}

// True when the viewer asked the OS for less motion
export function prefersReducedMotion(win: MediaWindow | undefined): boolean {
  return typeof win?.matchMedia === 'function' && win.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// A duration token's computed value ("240ms", "0.24s") in milliseconds, for the Web Animations API
export function cssDurationMs(value: string, fallback: number): number {
  const match = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(value);
  if (!match) return fallback;
  const amount = Number(match[1]);
  return match[2] === 's' ? Math.round(amount * 1000) : amount;
}

// True when items were added, removed or re-ordered; edits that keep the order are not a change
export function listOrderChanged(prev: readonly string[], next: readonly string[]): boolean {
  return prev.length !== next.length || prev.some((id, index) => id !== next[index]);
}

interface ListedNote {
  id: string;
  deletedAt: unknown;
}

const idsWhere = (notes: readonly ListedNote[], trashed: boolean) =>
  notes.filter((note) => (note.deletedAt !== null) === trashed).map((note) => note.id);

// Whether the notes list or the Trash list gained, lost or re-ordered rows (worth animating)
export function noteListsChanged(prev: readonly ListedNote[], next: readonly ListedNote[]): boolean {
  return (
    listOrderChanged(idsWhere(prev, false), idsWhere(next, false)) ||
    listOrderChanged(idsWhere(prev, true), idsWhere(next, true))
  );
}

// A view-transition-name must be a CSS identifier; Firestore ids are, but don't rely on it
export function viewTransitionName(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

interface VerticalRect {
  top: number;
  bottom: number;
}

// Whether a row overlaps its scroll viewport (touching the edge doesn't count)
export function isInView(rect: VerticalRect, viewport: VerticalRect): boolean {
  return rect.bottom > viewport.top && rect.top < viewport.bottom;
}

export interface TransitionHandle {
  finished: Promise<unknown>;
}

// The slice of Document the runner uses
export interface TransitionDocument {
  visibilityState: DocumentVisibilityState;
  documentElement: { dataset: Record<string, string | undefined> };
  startViewTransition?: (update: () => void) => TransitionHandle;
}

interface RunOptions {
  doc: TransitionDocument | undefined;
  reduced: boolean;
  // Set as data-motion on <html> while the transition runs, so CSS can name the parts it moves
  kind?: string;
}

// Latest transition per document, so an older one finishing doesn't clear a newer one's tag
const latest = new WeakMap<object, symbol>();

// Runs `update` inside a View Transition when the browser has one and the viewer wants motion;
// otherwise applies it at once (the fallback is simply no animation). Returns the transition, if any.
export function runViewTransition(update: () => void, { doc, reduced, kind }: RunOptions): TransitionHandle | null {
  if (!doc || reduced || doc.visibilityState !== 'visible' || typeof doc.startViewTransition !== 'function') {
    update();
    return null;
  }
  const root = doc.documentElement;
  const token = Symbol(kind);
  latest.set(root, token);
  if (kind) root.dataset.motion = kind;
  const transition = doc.startViewTransition(update);
  // A skipped or failed transition still applies the update; only the animation is lost
  transition.finished
    .catch(() => undefined)
    .then(() => {
      if (latest.get(root) !== token) return;
      latest.delete(root);
      delete root.dataset.motion;
    });
  return transition;
}
