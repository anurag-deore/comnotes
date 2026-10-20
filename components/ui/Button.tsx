import type { ButtonHTMLAttributes, ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  // The single lime call to action; text on lime is always ink
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-canvas-soft text-ink hover:bg-primary-pale',
  tertiary: 'border border-ink bg-canvas text-ink hover:bg-canvas-soft',
  ghost: 'text-ink hover:bg-canvas-soft',
  danger: 'bg-negative text-on-negative hover:bg-negative-deep',
};

// Every size keeps a 44px touch target (WCAG 2.5.5)
const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-6 py-2 text-body-md',
  sm: 'min-h-11 px-4 py-1.5 text-body-sm',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  // Required: an icon-only button needs an accessible name
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  variant?: Exclude<Variant, 'primary' | 'danger'>;
}

export function IconButton({ label, icon: Icon, variant = 'ghost', className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANTS[variant], 'size-11 shrink-0 rounded-full p-0', className)}
      {...props}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
