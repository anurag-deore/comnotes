import { cn } from '@/lib/cn';

// Placeholder block while content loads; decorative, so hidden from assistive tech
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-sm bg-canvas-soft motion-safe:animate-pulse', className)} />;
}
