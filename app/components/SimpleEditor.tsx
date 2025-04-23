'use client';

import { useEffect, useRef } from 'react';

interface SimpleEditorProps {
  value: string;
  onChange: (content: string) => void;
}

export default function SimpleEditor({ value, onChange }: SimpleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div
      ref={editorRef}
      contentEditable
      onInput={handleInput}
      className="flex-1 p-4 outline-none min-h-[calc(100vh-8rem)] text-gray-900"
    />
  );
} 