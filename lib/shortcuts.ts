// Keyboard shortcuts and commands (CNOTE-24). Pure: one registry that the keyboard matcher, the
// command palette and the shortcuts help all read. The notes page owns the handlers.
//
// Bindings are written like 'Mod+Alt+N'. Mod is ⌘ on Apple platforms and Ctrl elsewhere. Browser-
// reserved keys (⌘N/T/W/Q) and the editor's formatting keys (Mod-B/I/U/E, Mod-Shift-S/B/L/E/R/J/7/8/9,
// Mod-Alt-0..6/C, …) are avoided; Tiptap has no Mod-K, so ⌘K opens the palette everywhere.

export type CommandId =
  | 'palette' | 'search' | 'new-note' | 'toggle-archive' | 'trash-note' | 'lock-note' | 'go-home'
  | 'show-archive' | 'show-trash' | 'toggle-sidebar' | 'toggle-theme' | 'shortcuts' | 'open-settings' | 'lock-app';

export const COMMAND_GROUPS = ['General', 'Notes', 'Go to', 'View'] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

// What the page knows when a key is pressed or the palette is open
export interface CommandState {
  hasNote: boolean;
  noteArchived: boolean;
  noteLocked: boolean;
  // A locked note whose decrypted text is in memory (or any unlocked note)
  noteReadable: boolean;
}

export interface Command {
  id: CommandId;
  // Static name, used by the help dialog and when there's no paletteLabel
  label: string;
  paletteLabel?: (state: CommandState) => string;
  group: CommandGroup;
  keys: readonly string[];
  keywords?: readonly string[];
  when?: (state: CommandState) => boolean;
  // Shown in the help dialog for conditional commands
  hint?: string;
  // Only "Open command palette" stays out of the palette
  inPalette?: false;
}

const withNote = (state: CommandState) => state.hasNote;

export const COMMANDS: readonly Command[] = [
  { id: 'palette', label: 'Open command palette', group: 'General', keys: ['Mod+K'], inPalette: false },
  { id: 'search', label: 'Search notes', group: 'General', keys: ['/', 'Mod+Shift+F'], keywords: ['find'] },
  { id: 'new-note', label: 'New note', group: 'Notes', keys: ['Mod+Alt+N'], keywords: ['create', 'add'] },
  {
    id: 'toggle-archive',
    label: 'Archive or unarchive note',
    paletteLabel: (state) => (state.noteArchived ? 'Unarchive note' : 'Archive note'),
    group: 'Notes',
    keys: ['Mod+Alt+A'],
    when: withNote,
    hint: 'With a note open',
  },
  {
    id: 'trash-note',
    label: 'Move note to Trash',
    group: 'Notes',
    keys: ['Mod+Alt+Backspace'],
    keywords: ['delete', 'remove'],
    when: withNote,
    hint: 'With a note open; Undo brings it back',
  },
  {
    id: 'lock-note',
    label: 'Lock note or remove lock',
    paletteLabel: (state) => (state.noteLocked ? 'Remove lock' : 'Lock note'),
    group: 'Notes',
    keys: [],
    keywords: ['encrypt', 'unlock', 'passphrase'],
    // Remove lock needs the decrypted text
    when: (state) => state.hasNote && (!state.noteLocked || state.noteReadable),
    hint: 'With a note open',
  },
  { id: 'go-home', label: 'Go to Home', group: 'Go to', keys: ['Mod+Shift+H'], keywords: ['dashboard', 'close note'] },
  { id: 'show-archive', label: 'Show Archive', group: 'Go to', keys: [], keywords: ['archived'] },
  { id: 'show-trash', label: 'Show Trash', group: 'Go to', keys: [], keywords: ['bin', 'trashed'] },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', group: 'View', keys: ['Mod+\\'], keywords: ['hide', 'show', 'notes list'] },
  { id: 'toggle-theme', label: 'Toggle light/dark theme', group: 'View', keys: ['Mod+Shift+D'], keywords: ['dark mode', 'appearance'] },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'General', keys: ['?', 'Mod+/'], keywords: ['help', 'keys'] },
  // Palette only: ⌘, belongs to the browser on Mac
  {
    id: 'open-settings',
    label: 'Open settings',
    group: 'General',
    keys: [],
    keywords: ['preferences', 'offline', 'backup', 'export', 'import'],
  },
  { id: 'lock-app', label: 'Lock ComNotes', group: 'General', keys: ['Mod+Alt+L'], keywords: ['logout', 'sign out', 'pin'] },
];

export const isAvailable = (command: Command, state: CommandState) => command.when?.(state) ?? true;
export const commandLabel = (command: Command, state: CommandState) => command.paletteLabel?.(state) ?? command.label;

export interface KeyCombo {
  // Lowercase: 'k', '/', 'backspace'
  key: string;
  mod: boolean;
  alt: boolean;
  shift: boolean;
}

const MODIFIERS = new Set(['Mod', 'Alt', 'Shift']);

export function parseKeys(keys: string): KeyCombo {
  // '\' and '/' are keys too, so split only on '+' between parts
  const parts = keys.split('+');
  const key = parts.pop();
  if (!key) throw new Error(`No key in "${keys}"`);
  for (const part of parts) {
    if (!MODIFIERS.has(part)) throw new Error(`Unknown modifier "${part}" in "${keys}"`);
  }
  return { key: key.toLowerCase(), mod: parts.includes('Mod'), alt: parts.includes('Alt'), shift: parts.includes('Shift') };
}

// navigator.userAgentData.platform ('macOS') or navigator.platform ('MacIntel', 'iPhone', …)
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const KEY_NAMES: Record<string, { mac: string; other: string }> = {
  backspace: { mac: '⌫', other: 'Backspace' },
  enter: { mac: '↩', other: 'Enter' },
  escape: { mac: 'esc', other: 'Esc' },
};

// The keys to render one by one (<kbd>), in Apple order ⌃⌥⇧⌘ on Mac
export function keyTokens(keys: string, mac: boolean): string[] {
  const combo = parseKeys(keys);
  const name = KEY_NAMES[combo.key]?.[mac ? 'mac' : 'other'] ?? combo.key.toUpperCase();
  if (mac) return [combo.alt && '⌥', combo.shift && '⇧', combo.mod && '⌘', name].filter((t): t is string => !!t);
  return [combo.mod && 'Ctrl', combo.alt && 'Alt', combo.shift && 'Shift', name].filter((t): t is string => !!t);
}

export function formatKeys(keys: string, mac: boolean): string {
  return keyTokens(keys, mac).join(mac ? '' : '+');
}

// What the matcher needs from a KeyboardEvent
export interface KeyInput {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  defaultPrevented?: boolean;
  // AltGr held (Windows/Linux international layouts report it as Ctrl+Alt)
  altGraph?: boolean;
}

export function toKeyInput(event: KeyboardEvent, mac: boolean): KeyInput {
  return {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    isComposing: event.isComposing,
    keyCode: event.keyCode,
    defaultPrevented: event.defaultPrevented,
    altGraph: !mac && event.getModifierState('AltGraph'),
  };
}

export interface MatchContext {
  mac: boolean;
  // Focus is in a text field or the editor: single-key shortcuts are off
  typing: boolean;
  // Focus is in a modal dialog or popover: every shortcut is off
  blocked: boolean;
  state: CommandState;
}

const PRINTABLE_ASCII = /^[\x21-\x7e]$/;
const LETTER_OR_DIGIT = /^[a-z0-9]$/;

// The pressed key, lowercase. Mac Option combos (å, Dead) and non-Latin layouts (л) fall back to the
// physical key for letters and digits; any printable ASCII key is taken as typed.
function pressedKey({ key, code }: KeyInput): string {
  if (PRINTABLE_ASCII.test(key)) return key.toLowerCase();
  if (key.length === 1 || key === 'Dead' || key === 'Unidentified') {
    const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
    if (physical) return (physical[1] ?? physical[2]).toLowerCase();
  }
  return key.toLowerCase();
}

function comboMatches(combo: KeyCombo, input: KeyInput, pressed: string, mac: boolean): boolean {
  if (combo.key !== pressed) return false;
  const mod = mac ? input.metaKey : input.ctrlKey;
  const otherMod = mac ? input.ctrlKey : input.metaKey;
  if (mod !== combo.mod || otherMod || input.altKey !== combo.alt) return false;
  // Letters and named keys need Shift exactly; '/', '?', '\' depend on the layout, so Shift is ignored
  const punctuation = combo.key.length === 1 && !LETTER_OR_DIGIT.test(combo.key);
  return punctuation || input.shiftKey === combo.shift;
}

const PARSED = new WeakMap<Command, KeyCombo[]>();
const combosOf = (command: Command) => {
  let combos = PARSED.get(command);
  if (!combos) {
    combos = command.keys.map(parseKeys);
    PARSED.set(command, combos);
  }
  return combos;
};

// The command a key press runs, or null to leave the key alone
export function matchShortcut(input: KeyInput, registry: readonly Command[], context: MatchContext): Command | null {
  if (context.blocked || input.repeat || input.isComposing || input.keyCode === 229 || input.defaultPrevented) return null;
  // AltGr types a character on Windows/Linux; on Mac (Firefox reports Option as AltGraph) ⌘ is held
  if (input.altGraph && !context.mac) return null;
  const pressed = pressedKey(input);
  for (const command of registry) {
    const hit = combosOf(command).some((combo) => {
      // A bare key types a character, so it only counts outside text fields
      if (!combo.mod && !combo.alt && context.typing) return false;
      return comboMatches(combo, input, pressed, context.mac);
    });
    if (hit && isAvailable(command, context.state)) return command;
  }
  return null;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);

export function isTypingTarget(target: Element | null): boolean {
  if (!target) return false;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}

// Dialogs, popovers and menus (Radix: role="dialog", role="menu") own the keyboard; the notes drawer is
// navigation, not a task
export function isBlockedTarget(target: Element | null): boolean {
  return target?.closest('[role="dialog"]:not(#notes-drawer), [role="alertdialog"], [role="menu"]') != null;
}
