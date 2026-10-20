'use client';

import { Fragment, useRef, useState, type KeyboardEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import * as Separator from '@radix-ui/react-separator';
import {
  Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, ListTodo, Quote,
  RemoveFormatting, SquareCode, Strikethrough, Underline, type LucideIcon,
} from 'lucide-react';
import { nextFocusIndex } from '@/lib/rovingFocus';
import { LinkPopover } from '@/components/editor/LinkPopover';
import { TOOLBAR_ITEM_SELECTOR, ToolbarButton } from '@/components/editor/ToolbarButton';

interface Action {
  label: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const GROUPS: Action[][] = [
  [
    { label: 'Bold', icon: Bold, isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
    { label: 'Italic', icon: Italic, isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
    { label: 'Underline', icon: Underline, isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
    { label: 'Strikethrough', icon: Strikethrough, isActive: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
  ],
  ([1, 2, 3] as const).map((level) => ({
    label: `Heading ${level}`,
    icon: [Heading1, Heading2, Heading3][level - 1],
    isActive: (e: Editor) => e.isActive('heading', { level }),
    run: (e: Editor) => e.chain().focus().toggleHeading({ level }).run(),
  })),
  [
    { label: 'Bullet list', icon: List, isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListOrdered, isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
    { label: 'Checklist', icon: ListTodo, isActive: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
  ],
  [
    { label: 'Quote', icon: Quote, isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
    { label: 'Code block', icon: SquareCode, isActive: (e) => e.isActive('codeBlock'), run: (e) => e.chain().focus().toggleCodeBlock().run() },
  ],
];

const CLEAR: Action = {
  label: 'Clear formatting',
  icon: RemoveFormatting,
  isActive: () => false,
  run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
};

const ACTIONS = GROUPS.flat();
// Index of each group's first action in ACTIONS
const GROUP_STARTS = GROUPS.map((_, g) => GROUPS.slice(0, g).flat().length);
// Toolbar order: the groups, then Link (last in the quote/code group), then Clear formatting
const LINK_INDEX = ACTIONS.length;
const CLEAR_INDEX = LINK_INDEX + 1;

const Divider = () => (
  <Separator.Root decorative orientation="vertical" className="mx-1 h-6 w-px shrink-0 bg-canvas-soft" />
);

// ARIA toolbar: one tab stop; arrow keys, Home and End move between buttons
export function Toolbar({ editor }: { editor: Editor }) {
  const [focusIndex, setFocusIndex] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ actions: ACTIONS.map((action) => action.isActive(e)), link: e.isActive('link') }),
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>(TOOLBAR_ITEM_SELECTOR) ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    const next = nextFocusIndex(current, event.key, items.length);
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  };

  // Spread on every item so only the last-focused one is in the tab order
  const roving = (index: number) => ({
    tabIndex: index === focusIndex ? 0 : -1,
    onFocus: () => setFocusIndex(index),
  });

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-canvas-soft px-3 py-2 md:px-6"
    >
      {GROUPS.map((group, g) => (
        <Fragment key={g}>
          {g > 0 && <Divider />}
          {group.map((action, j) => {
            const i = GROUP_STARTS[g] + j;
            return (
              <ToolbarButton
                key={action.label}
                label={action.label}
                icon={action.icon}
                pressed={active.actions[i]}
                onClick={() => action.run(editor)}
                {...roving(i)}
              />
            );
          })}
          {g === GROUPS.length - 1 && <LinkPopover editor={editor} pressed={active.link} {...roving(LINK_INDEX)} />}
        </Fragment>
      ))}
      <Divider />
      <ToolbarButton label={CLEAR.label} icon={CLEAR.icon} onClick={() => CLEAR.run(editor)} {...roving(CLEAR_INDEX)} />
    </div>
  );
}
