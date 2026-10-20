'use client';

import { useEffect } from 'react';
import { watchTheme } from '@/lib/themeStore';

// Keeps <html data-theme> in step with the OS (on System) and other tabs, on every screen
export function ThemeSync() {
  useEffect(() => watchTheme(), []);
  return null;
}
