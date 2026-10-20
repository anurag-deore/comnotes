import { isAllowedLinkHref } from '@/lib/editorExtensions';

export type LinkInput = { kind: 'remove' } | { kind: 'set'; href: string } | { kind: 'invalid' };

// Without a scheme, treat what was typed as a web address
export const withScheme = (href: string) => (/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`);

// What the link popover does with the typed text: empty removes the link, and only
// http(s)/mailto links are set (the editor's Link extension refuses the rest anyway)
export function parseLinkInput(input: string): LinkInput {
  const trimmed = input.trim();
  if (trimmed === '') return { kind: 'remove' };
  const href = withScheme(trimmed);
  return isAllowedLinkHref(href) && !/\s/.test(href) ? { kind: 'set', href } : { kind: 'invalid' };
}
