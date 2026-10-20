import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style';

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
// A bare host such as example.com/x or me@example.com, which autolink and paste turn
// into http:// and mailto: links
const BARE_HOST = /^[^\s/:?#]+\.[^\s/:?#.]+(?:[/?#]\S*)?$/;

// Links may only point to http(s) and mailto (CNOTE-12/14): never javascript:, data: etc.
export function isAllowedLinkHref(href: string): boolean {
  try {
    return LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return BARE_HOST.test(href);
  }
}

// Same image sources Quill allowed: remote http(s) images and pasted data:image URIs
export function isAllowedImageSrc(src: string): boolean {
  if (/^data:image\//i.test(src)) return true;
  try {
    const { protocol } = new URL(src);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const NoteImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (el) => (isAllowedImageSrc(el.getAttribute('src') ?? '') ? null : false) }];
  },
});

// The note schema. Whatever it can't represent is dropped on load, which is what keeps
// scripts, event handlers and unknown embeds out of the editor and out of saved HTML.
export function noteExtensions(): Extensions {
  return [
    StarterKit.configure({
      link: {
        autolink: true,
        openOnClick: false,
        defaultProtocol: 'https',
        isAllowedUri: isAllowedLinkHref,
        shouldAutoLink: isAllowedLinkHref,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
      // Appending a trailing paragraph on the first click would save notes nobody edited
      trailingNode: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // Quill pasted images inline, as base64 data URIs
    NoteImage.configure({ inline: true, allowBase64: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    BackgroundColor,
  ];
}
