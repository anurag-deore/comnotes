'use client';
import ReactQuill, { Quill } from 'react-quill-new';
import { useEffect, useState } from 'react'; 
import MagicUrl from "quill-magic-url";

Quill.register("modules/magicUrl", MagicUrl);
 
import 'react-quill-new/dist/quill.snow.css';

interface QuillEditorProps {
  value: string;
  onChange: (content: string) => void;
}

export default function QuillEditor({ value, onChange }: QuillEditorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div>Loading editor...</div>;
  }

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
      onChange={onChange}
      modules={modules}
      className="h-[calc(100vh-12rem)]"
    />
  );
}