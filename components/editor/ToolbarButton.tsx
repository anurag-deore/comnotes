import type { ButtonHTMLAttributes, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

// The toolbar finds its items (including the link popover trigger) by this attribute
export const TOOLBAR_ITEM_SELECTOR = '[data-toolbar-item]';

export interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: LucideIcon;
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function ToolbarButton({ label, icon: Icon, pressed, className, ...props }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      data-toolbar-item
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-sm text-body md:size-9',
        'transition-[color,background-color,scale] motion-safe:active:scale-[0.95]',
        'hover:bg-canvas-soft hover:text-ink aria-pressed:bg-ink aria-pressed:text-canvas',
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-[18px]" />
    </button>
  );
}
