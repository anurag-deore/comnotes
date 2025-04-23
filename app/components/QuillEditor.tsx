'use client';

import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), { 
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center">Loading editor...</div>
});

interface QuillEditorProps {
  value: string;
  onChange: (content: string) => void;
}

export default function QuillEditor({ value, onChange }: QuillEditorProps) {
  return (
    <ReactQuill
      theme="snow"
      value={value}
      onChange={onChange}
      modules={{
        toolbar: false,
        clipboard: {
          matchVisual: false,
        },
      }}
      formats={[
        'bold',
        'italic',
        'underline',
        'strike',
        'list',
        'bullet',
        'indent',
        'link',
        'clean'
      ]}
      className="h-full [&_.ql-container]:h-[calc(100%-42px)] [&_.ql-editor]:min-h-[calc(100vh-8rem)] [&_.ql-editor]:p-4 [&_.ql-editor]:text-gray-900"
    />
  );
} 