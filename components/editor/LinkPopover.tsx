'use client';

import { useId, useState, type FormEvent } from 'react';
import type { Editor } from '@tiptap/react';
import * as Popover from '@radix-ui/react-popover';
import { Link } from 'lucide-react';
import { parseLinkInput } from '@/lib/editorLink';
import { Button } from '@/components/ui/Button';
import { ToolbarButton } from '@/components/editor/ToolbarButton';

interface LinkPopoverProps {
  editor: Editor;
  pressed: boolean;
  tabIndex: number;
  onFocus: () => void;
}

// Add, edit or remove the link at the selection. Replaces window.prompt (CNOTE-14).
export function LinkPopover({ editor, pressed, tabIndex, onFocus }: LinkPopoverProps) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputId = useId();
  const errorId = useId();

  const onOpenChange = (next: boolean) => {
    if (next) {
      setHref((editor.getAttributes('link').href as string | undefined) ?? '');
      setInvalid(false);
    }
    setOpen(next);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setOpen(false);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseLinkInput(href);
    if (parsed.kind === 'invalid') {
      setInvalid(true);
      return;
    }
    if (parsed.kind === 'remove') {
      removeLink();
      return;
    }
    const chain = editor.chain().focus();
    // With nothing selected, insert the address itself as the link text
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: parsed.href, marks: [{ type: 'link', attrs: { href: parsed.href } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href: parsed.href }).run();
    }
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <ToolbarButton label="Link" icon={Link} pressed={pressed} tabIndex={tabIndex} onFocus={onFocus} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          // Back to the text, not the toolbar button, so typing carries on
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            editor.commands.focus();
          }}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) rounded-xl bg-canvas p-4 shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <form onSubmit={onSubmit} noValidate>
            <label htmlFor={inputId} className="block text-body-sm font-semibold text-ink">
              Link address
            </label>
            <input
              id={inputId}
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              value={href}
              onChange={(event) => {
                setHref(event.target.value);
                setInvalid(false);
              }}
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              className="mt-2 w-full rounded-md border border-ink bg-canvas px-4 py-2.5 text-body-md text-ink aria-invalid:border-negative"
            />
            {invalid && (
              <p id={errorId} role="alert" className="mt-2 text-body-sm text-negative-deep">
                Use a web (http, https) or email (mailto) address.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {pressed && (
                <Button variant="ghost" size="sm" onClick={removeLink}>
                  Remove
                </Button>
              )}
              <Button type="submit" variant="tertiary" size="sm">
                Apply
              </Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
