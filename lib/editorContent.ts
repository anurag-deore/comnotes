import type { Editor } from '@tiptap/core';
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
