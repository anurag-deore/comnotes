import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Our type-scale tokens (app/globals.css) are font sizes, not text colours
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['display-xs', 'body-md', 'body-sm', 'caption'] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
