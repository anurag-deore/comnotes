'use client';
import ReactQuill, { Quill } from 'react-quill-new';
import MagicUrl from "quill-magic-url";
import { NOTE_FORMATS } from '@/lib/noteHtml';

Quill.register("modules/magicUrl", MagicUrl);
 
import 'react-quill-new/dist/quill.snow.css';

interface QuillEditorProps {
  value: string;
  onChange: (content: string) => void;
}

export default function QuillEditor({ value, onChange }: QuillEditorProps) {
  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'blockquote', 'code-block'],
      [{ color: [] }, { background: [] }],
      ['clean'],
    ],
    magicUrl: true,
  };

  return (
    <ReactQuill
      theme="snow"
      value={value}
      // Only real typing counts; loading or normalising content must not trigger a save
      onChange={(content, _delta, source) => {
        if (source === 'user') onChange(content);
      }}
      modules={modules}
      formats={NOTE_FORMATS}
      className="h-[calc(100vh-12rem)]"
    />
  );
}