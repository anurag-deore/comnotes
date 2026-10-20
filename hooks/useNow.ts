'use client';

import { useEffect, useState } from 'react';

// The current time, refreshed every intervalMs, so relative times ("5 min ago") stay current
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
