import { generateHTML, generateJSON, type Editor, type JSONContent } from '@tiptap/core';
import { noteExtensions } from '@/lib/editorExtensions';
import { convertQuillHtml } from '@/lib/quillToTiptap';

// Keeps the editor in step with the note's `content` prop without save loops: the HTML
// the editor last emitted (or was given) is remembered, so the parent echoing it back is
// ignored, and a genuinely new value (e.g. a snapshot from another tab) is applied
// without emitting an update.
export function createContentSync(initial: string) {
  let current = initial;
  return {
    emitted(html: string) {
      current = html;
      return html;
    },
    apply(editor: Editor, value: string) {
      if (value === current) return;
      current = value;
      editor.commands.setContent(convertQuillHtml(value), { emitUpdate: false });
    },
  };
}

// Browser only. A note's HTML as the editor's document: the same path the editor takes on
// load (Quill conversion, then the note schema, parsed by an inert DOMParser), so anything
// the editor would drop (scripts, handlers, javascript: links, bad images) is gone.
export function noteHtmlToDoc(html: string): JSONContent {
  return generateJSON(convertQuillHtml(html), noteExtensions());
}

// Note HTML reduced to what the editor would keep, e.g. for content arriving from a backup.
// Empty stays empty rather than becoming an empty paragraph.
export function sanitizeNoteHtml(html: string): string {
  if (html.trim() === '') return '';
  return generateHTML(noteHtmlToDoc(html), noteExtensions());
}
