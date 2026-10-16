interface AutoLockOptions {
  idleMs: number;
  hiddenMs: number;
  onLock: () => void;
}

// Idle and hidden-tab timers, kept free of React and the DOM so they can be unit tested
export function createAutoLock({ idleMs, hiddenMs, onLock }: AutoLockOptions) {
  let lastActivity = Date.now();
  let hiddenSince: number | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  let locked = false;

  const dispose = () => {
    clearTimeout(idleTimer);
    clearTimeout(hiddenTimer);
  };

  const fire = () => {
    if (locked) return;
    locked = true;
    dispose();
    onLock();
  };

  // Activity only moves lastActivity; the one timer checks it when it fires and sleeps for the rest
  const checkIdle = () => {
    const left = lastActivity + idleMs - Date.now();
    if (left <= 0) fire();
    else idleTimer = setTimeout(checkIdle, left);
  };

  checkIdle();

  return {
    activity() {
      lastActivity = Date.now();
    },
    visibility(hidden: boolean) {
      if (locked) return;
      if (hidden) {
        hiddenSince ??= Date.now();
        clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(fire, hiddenMs);
        return;
      }
      // Background tabs throttle timers, so a deadline may have passed without firing
      const hiddenFor = hiddenSince === undefined ? 0 : Date.now() - hiddenSince;
      hiddenSince = undefined;
      clearTimeout(hiddenTimer);
      if (hiddenFor >= hiddenMs) fire();
      else {
        clearTimeout(idleTimer);
        checkIdle();
      }
    },
    dispose,
  };
}

// Saves what it can, but never lets a slow or failing save keep the app unlocked
export async function flushThenLock(flush: () => Promise<boolean>, lock: () => Promise<void>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const saved = await Promise.race([flush().catch(() => false), timeout]);
  clearTimeout(timer);
  await lock();
  return saved;
}
