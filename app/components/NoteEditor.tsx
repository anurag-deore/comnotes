'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
  Bold, Heading1, Heading2, Heading3, Italic, Link, List, ListOrdered, ListTodo, Quote,
  RemoveFormatting, SquareCode, Strikethrough, Underline, type LucideIcon,
} from 'lucide-react';
import { noteExtensions } from '@/lib/editorExtensions';
import { createContentSync } from '@/lib/editorContent';
import { convertQuillHtml } from '@/lib/quillToTiptap';

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
    editorProps: { attributes: { class: 'note-editor', 'aria-label': 'Note content' } },
    // Fires only for real edits: loading and setContent(..., { emitUpdate: false }) don't
    onUpdate: ({ editor }) => onChangeRef.current(sync.emitted(editor.getHTML())),
  });

  // A changed value from outside (e.g. another tab) replaces the content without saving it back
  useEffect(() => {
    if (editor) sync.apply(editor, value);
  }, [editor, sync, value]);

  if (!editor) return null;
  return (
    <div className="flex h-full flex-col">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
    </div>
  );
}

interface ToolbarButton {
  label: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

// Without a scheme, treat what was typed as a web address
const withScheme = (href: string) => (/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`);

// Plain prompt until CNOTE-13 brings a link popover. setLink refuses disallowed schemes.
function editLink(editor: Editor) {
  const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
  const input = window.prompt('Link URL (leave empty to remove)', previous);
  if (input === null) return;
  const chain = editor.chain().focus().extendMarkRange('link');
  if (input.trim() === '') chain.unsetLink().run();
  else chain.setLink({ href: withScheme(input.trim()) }).run();
}

const BUTTONS: ToolbarButton[] = [
  { label: 'Bold', icon: Bold, isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'Italic', icon: Italic, isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'Underline', icon: Underline, isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
  { label: 'Strikethrough', icon: Strikethrough, isActive: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
  ...([1, 2, 3] as const).map((level) => ({
    label: `Heading ${level}`,
    icon: [Heading1, Heading2, Heading3][level - 1],
    isActive: (e: Editor) => e.isActive('heading', { level }),
    run: (e: Editor) => e.chain().focus().toggleHeading({ level }).run(),
  })),
  { label: 'Bullet list', icon: List, isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: ListOrdered, isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Checklist', icon: ListTodo, isActive: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: 'Quote', icon: Quote, isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: 'Code block', icon: SquareCode, isActive: (e) => e.isActive('codeBlock'), run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Link', icon: Link, isActive: (e) => e.isActive('link'), run: editLink },
  {
    label: 'Clear formatting',
    icon: RemoveFormatting,
    isActive: () => false,
    run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
  },
];

// Minimal, unstyled-ish toolbar; CNOTE-13 restyles it
function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => BUTTONS.map((button) => button.isActive(e)),
  });

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 border-b border-gray-200 px-2 py-1">
      {BUTTONS.map(({ label, icon: Icon, run }, i) => (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={active[i]}
          onClick={() => run(editor)}
          className={`rounded p-1.5 text-gray-600 hover:bg-gray-100 ${active[i] ? 'bg-gray-200 text-gray-900' : ''}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
