import { useId } from 'react';

// Layered hills along the bottom of the PIN screen (CNOTE-32). Drawn from the theme tokens, so it
// follows light and dark; the far ridge reuses the logo's blue gradient. Purely decorative.
export function PinScenery({ className }: { className?: string }) {
  // Unique per instance, like the logo's gradients
  const id = `scenery${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 1440 520"
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-far`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#5D54FF" />
          <stop offset="1" stopColor="#87A2F8" />
        </linearGradient>
        <linearGradient id={`${id}-mid`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-pale)" />
        </linearGradient>
      </defs>

      {/* Far ridge */}
      <path
        d="M0 250 C 160 170 300 160 450 210 S 760 300 930 220 S 1250 120 1440 200 V520 H0 Z"
        fill={`url(#${id}-far)`}
        opacity="0.22"
      />
      {/* Middle hills */}
      <path
        d="M0 330 C 200 250 360 260 520 310 S 840 380 1010 300 S 1300 230 1440 290 V520 H0 Z"
        fill={`url(#${id}-mid)`}
        opacity="0.55"
      />
      {/* Near hills */}
      <path
        d="M0 400 C 240 340 420 350 600 395 S 980 450 1160 380 S 1380 350 1440 370 V520 H0 Z"
        fill="var(--primary-pale)"
      />
      {/* Foreground bank */}
      <path
        d="M0 460 C 300 420 520 430 760 455 S 1200 480 1440 440 V520 H0 Z"
        fill="var(--canvas-soft)"
      />
    </svg>
  );
}
