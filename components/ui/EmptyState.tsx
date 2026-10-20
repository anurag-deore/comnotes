import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

// The empty-state card: sage surface inside a white card
export function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center rounded-xl bg-canvas-soft px-6 py-12 text-center', className)}>
      <span className="flex size-14 items-center justify-center rounded-full bg-canvas">
        <Icon aria-hidden className="size-6 text-ink" />
      </span>
      <h2 className="mt-4 text-body-md font-semibold text-ink">{title}</h2>
      {children && <p className="mt-1 max-w-xs text-body-sm text-body">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
