'use client';

import { ToastBar, Toaster } from 'react-hot-toast';

// Toasts rise and fade in, then fade and shrink away, on the motion tokens (CNOTE-16).
// With reduced motion the toast-in/out keyframes are opacity-only (globals.css).
const ENTER = 'toast-in var(--motion-base) var(--motion-ease-enter) both';
const EXIT = 'toast-out var(--motion-fast) var(--motion-ease-exit) both';

// Quiet toasts: small white cards, bottom centre, only for things that need attention
export function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      gutter={8}
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--canvas)',
          color: 'var(--ink)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--elevation-raised)',
          padding: '12px 16px',
          fontSize: '14px',
          lineHeight: '20px',
          maxWidth: 'min(28rem, calc(100vw - 32px))',
        },
        success: { iconTheme: { primary: 'var(--positive)', secondary: 'var(--canvas)' } },
        error: { duration: 6000, iconTheme: { primary: 'var(--negative)', secondary: 'var(--canvas)' } },
      }}
    >
      {(t) => (
        // Until the toast is measured the library keeps it transparent; animate only after that
        <ToastBar toast={t} style={t.height ? { animation: t.visible ? ENTER : EXIT } : undefined} />
      )}
    </Toaster>
  );
}
