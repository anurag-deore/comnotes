// How long an unattended session stays unlocked
export const IDLE_LOCK_MS = 5 * 60 * 1000;
export const HIDDEN_LOCK_MS = 60 * 1000;
// Longest a lock waits for pending saves before locking anyway
export const LOCK_FLUSH_TIMEOUT_MS = 3000;

// "5 minutes", "1 minute", "30 seconds"
function duration(ms: number): string {
  const [count, unit] = ms % 60_000 === 0 ? [ms / 60_000, 'minute'] : [Math.round(ms / 1000), 'second'];
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

// Settings → Security: when ComNotes locks by itself, from the constants above
export function autoLockSummary(idleMs = IDLE_LOCK_MS, hiddenMs = HIDDEN_LOCK_MS): string {
  return `Locks by itself after ${duration(idleMs)} idle or ${duration(hiddenMs)} in the background.`;
}
