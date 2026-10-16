// Note content is Quill HTML. Outside the editor, show it only as plain text
// via noteHtmlToText; never inject it as HTML (see specs/CNOTE-12.md).

// Quill's default formats minus `video` and `formula`, whose HTML export
// (getSemanticHTML) is not escaped: GHSA-v3m3-f69x-jf25.
export const NOTE_FORMATS = [
  'align', 'direction', 'indent', 'background', 'color', 'font', 'size',
  'blockquote', 'code-block', 'header', 'list',
  'bold', 'code', 'italic', 'link', 'script', 'strike', 'underline',
  'image',
];

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div, br';

// Browser only. DOMParser builds an inert document: no scripts run, no
// resources load, so hostile markup can't fire here.
export function noteHtmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('script, style').forEach((el) => el.remove());
  doc.body.querySelectorAll(BLOCKS).forEach((el) => el.after(' '));
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
