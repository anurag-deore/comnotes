// Animates note-list changes (add, remove, re-order) with a View Transition (CNOTE-16).
// Rows carry data-motion-row={id} inside a data-motion-viewport scroll container. Only rows
// visible in their viewport get a view-transition-name: snapshots aren't clipped by the scroll
// container, and hidden copies (the desktop sidebar while the phone drawer is open) must not
// share a name with the visible ones.
import { isInView, prefersReducedMotion, runViewTransition, viewTransitionName } from '@/lib/motion';

const ROW = '[data-motion-row]';
const VIEWPORT = '[data-motion-viewport]';

function nameVisibleRows(doc: Document) {
  doc.querySelectorAll<HTMLElement>(ROW).forEach((row) => {
    const viewport = row.closest(VIEWPORT);
    const visible =
      viewport !== null &&
      row.getClientRects().length > 0 &&
      isInView(row.getBoundingClientRect(), viewport.getBoundingClientRect());
    row.style.viewTransitionName = visible ? viewTransitionName('note', row.dataset.motionRow ?? '') : '';
  });
}

function clearRowNames(doc: Document) {
  doc.querySelectorAll<HTMLElement>(ROW).forEach((row) => {
    row.style.viewTransitionName = '';
  });
}

// Bumped per transition, so an older one finishing doesn't strip the names a newer one uses
let generation = 0;

// `update` must apply the change to the DOM synchronously (e.g. via flushSync)
export function animateListChange(update: () => void) {
  if (typeof document === 'undefined') {
    update();
    return;
  }
  const doc = document;
  const current = ++generation;
  const reduced = prefersReducedMotion(window);
  if (!reduced) nameVisibleRows(doc);
  const transition = runViewTransition(
    () => {
      update();
      nameVisibleRows(doc);
    },
    { doc, reduced, kind: 'list' },
  );
  if (!transition) {
    clearRowNames(doc);
    return;
  }
  transition.finished
    .catch(() => undefined)
    .then(() => {
      if (current === generation) clearRowNames(doc);
    });
}
