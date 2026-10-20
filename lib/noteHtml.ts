// Note content is HTML from the Tiptap editor (older notes: Quill HTML, converted on load
// by lib/quillToTiptap.ts). Outside the editor, show it only as plain text via
// noteHtmlToText; never inject it as HTML (see specs/CNOTE-12.md).

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div, br';

// Browser only. DOMParser builds an inert document: no scripts run, no
// resources load, so hostile markup can't fire here.
export function noteHtmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('script, style').forEach((el) => el.remove());
  doc.body.querySelectorAll(BLOCKS).forEach((el) => el.after(' '));
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
