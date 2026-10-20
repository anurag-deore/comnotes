'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { noteExtensions } from '@/lib/editorExtensions';
import { createContentSync } from '@/lib/editorContent';
import { convertQuillHtml } from '@/lib/quillToTiptap';
import { Toolbar } from '@/components/editor/Toolbar';

interface NoteEditorProps {
  value: string;
  onChange: (content: string) => void;
}

// Mounted once per note (the page keys it by note id), so content never leaks between notes
export default function NoteEditor({ value, onChange }: NoteEditorProps) {
  const [sync] = useState(() => createContentSync(value));
  const [initialContent] = useState(() => convertQuillHtml(value));
  // The editor keeps the first onUpdate it is given; this ref always calls the latest onChange
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: noteExtensions(),
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'note-editor', 'aria-label': 'Note content', 'aria-multiline': 'true', role: 'textbox' },
    },
    // Fires only for real edits: loading and setContent(..., { emitUpdate: false }) don't
    onUpdate: ({ editor }) => onChangeRef.current(sync.emitted(editor.getHTML())),
  });

  // A changed value from outside (e.g. another tab) replaces the content without saving it back
  useEffect(() => {
    if (editor) sync.apply(editor, value);
  }, [editor, sync, value]);

  if (!editor) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  );
}
