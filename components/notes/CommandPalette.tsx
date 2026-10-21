'use client';

import { useDeferredValue, useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Archive, ArchiveRestore, Command as CommandIcon, FileText, House, Keyboard, Lock, LockOpen, LogOut, PanelLeft, Plus,
  Search, Settings2, SunMoon, Trash2, type LucideIcon,
} from 'lucide-react';
import type { NoteSearch, SearchResult } from '@/hooks/useNoteSearch';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { paletteCommands, type PaletteCommand } from '@/lib/commandPalette';
import { searchKeyAction } from '@/lib/searchKeys';
import { COMMANDS, matchShortcut, toKeyInput, type CommandId, type CommandState } from '@/lib/shortcuts';
import { Highlighted } from '@/components/notes/NoteSearch';
import { Keys } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';

// Enough to jump to a note; the sidebar search is there for more
const NOTE_LIMIT = 8;

const ICONS: Record<CommandId, (state: CommandState) => LucideIcon> = {
  palette: () => CommandIcon,
  search: () => Search,
  'new-note': () => Plus,
  'toggle-archive': (state) => (state.noteArchived ? ArchiveRestore : Archive),
  'trash-note': () => Trash2,
  'lock-note': (state) => (state.noteLocked ? LockOpen : Lock),
  'go-home': () => House,
  'show-archive': () => Archive,
  'show-trash': () => Trash2,
  'toggle-sidebar': () => PanelLeft,
  'toggle-theme': () => SunMoon,
  shortcuts: () => Keyboard,
  'open-settings': () => Settings2,
  'lock-app': () => LogOut,
};

const PALETTE_SHORTCUT = COMMANDS.filter((command) => command.id === 'palette');

type Item = { kind: 'command'; entry: PaletteCommand } | { kind: 'note'; result: SearchResult };

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: CommandState;
  mac: boolean;
  // The notes page's search (CNOTE-18): notes come from its index via find()
  search: NoteSearch;
  onRun: (id: CommandId) => void;
  onOpenNote: (id: string) => void;
}

// ⌘K / Ctrl+K (CNOTE-24). A dialog with a combobox: commands filtered as you type, then notes.
export function CommandPalette({ open, onOpenChange, ...body }: CommandPaletteProps) {
  // A command may move focus (search field, a note, help); otherwise focus goes back where it was
  const { onOpenAutoFocus, onCloseAutoFocus } = useReturnFocus();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[min(32rem,76dvh)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-canvas text-ink shadow-raised data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          {/* Mounted per opening, so the query starts empty every time */}
          <PaletteBody onClose={() => onOpenChange(false)} {...body} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type BodyProps = Omit<CommandPaletteProps, 'open' | 'onOpenChange'> & { onClose: () => void };

function PaletteBody({ state, mac, search, onRun, onOpenNote, onClose }: BodyProps) {
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState('');
  // Notes are looked up a beat behind the typing; commands follow every key
  const noteQuery = useDeferredValue(query);
  const { prepare, find } = search;

  // Loads the search index (lazy, CNOTE-18) so notes can be found
  useEffect(prepare, [prepare]);

  const commands = useMemo(() => paletteCommands(COMMANDS, query, state), [query, state]);
  const notes = useMemo(() => (noteQuery.trim() ? find(noteQuery, NOTE_LIMIT) : []), [find, noteQuery]);
  const items = useMemo<Item[]>(() => [
    ...commands.map((entry): Item => ({ kind: 'command', entry })),
    ...notes.map((result): Item => ({ kind: 'note', result })),
  ], [commands, notes]);

  // The highlighted row: the first one whenever the rows change
  const [active, setActive] = useState({ items, index: 0 });
  const activeIndex = active.items === items ? active.index : 0;
  const optionId = (index: number) => `${listboxId}-${index}`;

  const choose = (item: Item | undefined) => {
    if (!item) return;
    // Closed first, so the command can move focus or open another dialog
    flushSync(onClose);
    if (item.kind === 'command') onRun(item.entry.command.id);
    else onOpenNote(item.result.note.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (matchShortcut(toKeyInput(event.nativeEvent, mac), PALETTE_SHORTCUT, { mac, typing: true, blocked: false, state })) {
      event.preventDefault();
      onClose();
      return;
    }
    // Esc is Radix's: it closes the dialog
    if (event.key === 'Escape' || event.nativeEvent.isComposing) return;
    const action = searchKeyAction(event.key, activeIndex, items.length, true);
    if (!action || action.type === 'clear') return;
    event.preventDefault();
    if (action.type === 'move') {
      setActive({ items, index: action.index });
      document.getElementById(optionId(action.index))?.scrollIntoView({ block: 'nearest' });
    } else {
      choose(items[action.index]);
    }
  };

  const summary = items.length === 0 ? 'No matching commands or notes' : `${items.length} ${items.length === 1 ? 'result' : 'results'}`;

  return (
    <>
      <div className="relative shrink-0 border-b border-canvas-soft">
        <label htmlFor={inputId} className="sr-only">Type a command or search notes</label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-body" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded
          aria-controls={listboxId}
          aria-activedescendant={items.length > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Type a command or search notes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-14 w-full bg-transparent py-3 pr-5 pl-13 text-body-md text-ink placeholder:text-mute focus:outline-none"
        />
      </div>
      <p role="status" className="sr-only">{query.trim() ? summary : ''}</p>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 && (
          <p className="px-3 py-8 text-center text-body-sm text-body">{summary}</p>
        )}
        <ul id={listboxId} role="listbox" aria-label="Commands and notes" className={cn(items.length === 0 && 'hidden')}>
          {commands.length > 0 && (
            <Group label="Commands" id={`${listboxId}-commands`}>
              {commands.map((entry, i) => {
                const Icon = ICONS[entry.command.id](state);
                const keys = entry.command.keys[0];
                return (
                  <Option key={entry.command.id} id={optionId(i)} active={i === activeIndex} kind="command" onChoose={() => choose(items[i])}>
                    <Icon aria-hidden className="size-4 shrink-0 text-body" />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {keys && <Keys keys={keys} mac={mac} />}
                  </Option>
                );
              })}
            </Group>
          )}
          {notes.length > 0 && (
            <Group label="Notes" id={`${listboxId}-notes`}>
              {notes.map((result, j) => {
                const i = commands.length + j;
                const { note } = result;
                return (
                  <Option key={note.id} id={optionId(i)} active={i === activeIndex} kind="note" onChoose={() => choose(items[i])}>
                    {note.locked ? <Lock aria-hidden className="size-4 shrink-0 text-body" /> : <FileText aria-hidden className="size-4 shrink-0 text-body" />}
                    {note.locked && <span className="sr-only">Locked: </span>}
                    <span className="min-w-0 flex-1 truncate"><Highlighted segments={result.title} /></span>
                    {result.archived && <span className="shrink-0 rounded-sm bg-canvas-soft px-1.5 py-0.5 text-caption text-ink">Archived</span>}
                  </Option>
                );
              })}
            </Group>
          )}
        </ul>
      </div>
    </>
  );
}

function Group({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <li role="presentation" className="not-first:mt-2">
      <div id={id} role="presentation" className="px-3 pt-1 pb-1 text-caption font-semibold text-body">{label}</div>
      <ul role="group" aria-labelledby={id}>{children}</ul>
    </li>
  );
}

interface OptionProps {
  id: string;
  active: boolean;
  kind: Item['kind'];
  onChoose: () => void;
  children: ReactNode;
}

function Option({ id, active, kind, onChoose, children }: OptionProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      data-kind={kind}
      onClick={onChoose}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-body-sm',
        'transition-[background-color]',
        active ? 'bg-primary-pale text-ink' : 'hover:bg-canvas-soft',
      )}
    >
      {children}
    </li>
  );
}
