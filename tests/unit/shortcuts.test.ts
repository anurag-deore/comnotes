// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import {
  COMMANDS, commandLabel, formatKeys, isAvailable, isBlockedTarget, isMacPlatform, isTypingTarget, keyTokens,
  matchShortcut, parseKeys, toKeyInput, type CommandState, type KeyInput, type MatchContext,
} from '@/lib/shortcuts';

const NO_NOTE: CommandState = { hasNote: false, noteArchived: false, noteLocked: false, noteReadable: false };
const OPEN_NOTE: CommandState = { hasNote: true, noteArchived: false, noteLocked: false, noteReadable: true };

const key = (k: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key: k, code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra,
});
const ctx = (extra: Partial<MatchContext> = {}): MatchContext => ({
  mac: true, typing: false, blocked: false, state: OPEN_NOTE, ...extra,
});
const match = (input: KeyInput, context: Partial<MatchContext> = {}) => matchShortcut(input, COMMANDS, ctx(context))?.id ?? null;

describe('registry (AC-1, AC-3)', () => {
  test('ids are unique and every binding parses', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of COMMANDS) for (const keys of command.keys) expect(() => parseKeys(keys)).not.toThrow();
  });

  test('no binding is used twice', () => {
    const all = COMMANDS.flatMap((c) => c.keys.map((k) => JSON.stringify(parseKeys(k))));
    expect(new Set(all).size).toBe(all.length);
  });

  test('avoids browser-reserved keys and the editor formatting keys', () => {
    const reserved = ['Mod+N', 'Mod+T', 'Mod+W', 'Mod+Q', 'Mod+Shift+N', 'Mod+Shift+T', 'Mod+Shift+W', 'Mod+B', 'Mod+I',
      'Mod+U', 'Mod+E', 'Mod+Z', 'Mod+Y', 'Mod+Shift+Z', 'Mod+A', 'Mod+Shift+S', 'Mod+Shift+B', 'Mod+Shift+L',
      'Mod+Shift+E', 'Mod+Shift+R', 'Mod+Shift+J', 'Mod+Shift+7', 'Mod+Shift+8', 'Mod+Shift+9', 'Mod+Alt+C',
      'Mod+Alt+0', 'Mod+Alt+1', 'Mod+Alt+2', 'Mod+Alt+3', 'Mod+Enter', 'Mod+Backspace', 'Mod+Delete']
      .map((k) => JSON.stringify(parseKeys(k)));
    const used = COMMANDS.flatMap((c) => c.keys.map((k) => JSON.stringify(parseKeys(k))));
    expect(used.filter((k) => reserved.includes(k))).toEqual([]);
  });

  test('the bindings in the spec', () => {
    const keysOf = Object.fromEntries(COMMANDS.map((c) => [c.id, c.keys]));
    expect(keysOf).toMatchObject({
      palette: ['Mod+K'],
      search: ['/', 'Mod+Shift+F'],
      shortcuts: ['?', 'Mod+/'],
      'new-note': ['Mod+Alt+N'],
      'toggle-archive': ['Mod+Alt+A'],
      'trash-note': ['Mod+Alt+Backspace'],
      'go-home': ['Mod+Shift+H'],
      'toggle-sidebar': ['Mod+\\'],
      'toggle-theme': ['Mod+Shift+D'],
      'lock-app': ['Mod+Alt+L'],
      'lock-note': [],
    });
  });

  test('parseKeys rejects nonsense', () => {
    expect(() => parseKeys('Mod+')).toThrow();
    expect(() => parseKeys('Hyper+K')).toThrow();
    expect(parseKeys('Mod+Alt+N')).toEqual({ key: 'n', mod: true, alt: true, shift: false });
  });
});

describe('matchShortcut (AC-2)', () => {
  test('Mod is ⌘ on Mac and Ctrl elsewhere; the other key must be up', () => {
    expect(match(key('k', { metaKey: true }), { mac: true })).toBe('palette');
    expect(match(key('k', { ctrlKey: true }), { mac: true })).toBeNull();
    expect(match(key('k', { ctrlKey: true }), { mac: false })).toBe('palette');
    expect(match(key('k', { metaKey: true }), { mac: false })).toBeNull();
    expect(match(key('k', { ctrlKey: true, metaKey: true }), { mac: true })).toBeNull();
  });

  test('modifiers must match exactly', () => {
    expect(match(key('K', { metaKey: true, shiftKey: true }))).toBeNull();
    expect(match(key('F', { metaKey: true, shiftKey: true }))).toBe('search');
    expect(match(key('f', { metaKey: true }))).toBeNull();
    expect(match(key('k'))).toBeNull();
  });

  test('ignores repeats, IME composition and already-handled keys', () => {
    expect(match(key('k', { metaKey: true, repeat: true }))).toBeNull();
    expect(match(key('/', { isComposing: true }))).toBeNull();
    expect(match(key('Process', { keyCode: 229 }))).toBeNull();
    expect(match(key('k', { metaKey: true, defaultPrevented: true }))).toBeNull();
  });

  test('nothing matches inside a modal dialog', () => {
    expect(match(key('k', { metaKey: true }), { blocked: true })).toBeNull();
    expect(match(key('?', { shiftKey: true }), { blocked: true })).toBeNull();
  });

  test('single keys are ignored while typing; Mod shortcuts still work', () => {
    expect(match(key('/'))).toBe('search');
    expect(match(key('/'), { typing: true })).toBeNull();
    expect(match(key('?', { shiftKey: true }), { typing: true })).toBeNull();
    expect(match(key('k', { metaKey: true }), { typing: true })).toBe('palette');
    expect(match(key('Backspace', { metaKey: true, altKey: true }), { typing: true })).toBe('trash-note');
  });

  test('punctuation ignores Shift (layout-dependent), letters do not', () => {
    expect(match(key('?', { shiftKey: true }))).toBe('shortcuts');
    expect(match(key('/', { shiftKey: true }))).toBe('search');
    expect(match(key('/', { metaKey: true }))).toBe('shortcuts');
    expect(match(key('\\', { metaKey: true }))).toBe('toggle-sidebar');
    expect(match(key('/', { altKey: true }))).toBeNull();
  });

  test('Mac Option letters and non-Latin layouts fall back to the physical key', () => {
    expect(match(key('Dead', { code: 'KeyN', metaKey: true, altKey: true }))).toBe('new-note');
    expect(match(key('å', { code: 'KeyA', metaKey: true, altKey: true }))).toBe('toggle-archive');
    expect(match(key('л', { code: 'KeyK', ctrlKey: true }), { mac: false })).toBe('palette');
    // A printable ASCII key wins over the physical position (AZERTY etc.)
    expect(match(key('q', { code: 'KeyA', metaKey: true, altKey: true }))).toBeNull();
  });

  test('AltGr never matches on Windows/Linux, so Ctrl+Alt keys do not steal characters', () => {
    expect(match(key('n', { ctrlKey: true, altKey: true }), { mac: false })).toBe('new-note');
    expect(match(key('ń', { code: 'KeyN', ctrlKey: true, altKey: true, altGraph: true }), { mac: false })).toBeNull();
    expect(match(key('Dead', { code: 'KeyN', metaKey: true, altKey: true, altGraph: true }), { mac: true })).toBe('new-note');
  });

  test('a command whose `when` is false does not match', () => {
    const trash = key('Backspace', { metaKey: true, altKey: true });
    expect(match(trash, { state: NO_NOTE })).toBeNull();
    expect(match(trash, { state: OPEN_NOTE })).toBe('trash-note');
    expect(match(key('a', { metaKey: true, altKey: true }), { state: NO_NOTE })).toBeNull();
    expect(match(key('n', { metaKey: true, altKey: true }), { state: NO_NOTE })).toBe('new-note');
  });

  test('toKeyInput reads a real KeyboardEvent, including AltGraph off Mac', () => {
    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, cancelable: true });
    event.preventDefault();
    expect(toKeyInput(event, false)).toMatchObject({ key: 'k', code: 'KeyK', ctrlKey: true, defaultPrevented: true, altGraph: false });
  });
});

describe('typing and blocked targets (AC-2)', () => {
  const el = (html: string, selector: string) => {
    // Parsed inertly, then moved into the live document
    const host = document.createElement('div');
    host.append(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
    document.body.append(host);
    return host.querySelector(selector);
  };

  test('text fields, textareas, selects and contenteditable count as typing', () => {
    expect(isTypingTarget(el('<input type="text">', 'input'))).toBe(true);
    expect(isTypingTarget(el('<input type="search">', 'input'))).toBe(true);
    expect(isTypingTarget(el('<input>', 'input'))).toBe(true);
    expect(isTypingTarget(el('<textarea></textarea>', 'textarea'))).toBe(true);
    expect(isTypingTarget(el('<select><option>a</option></select>', 'select'))).toBe(true);
    expect(isTypingTarget(el('<div contenteditable="true"><p>x</p></div>', 'p'))).toBe(true);
    expect(isTypingTarget(el('<div contenteditable="false"><p>x</p></div>', 'p'))).toBe(false);
    expect(isTypingTarget(el('<input type="checkbox">', 'input'))).toBe(false);
    expect(isTypingTarget(el('<button>b</button>', 'button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  test('modal dialogs and popovers block shortcuts; the notes drawer does not', () => {
    expect(isBlockedTarget(el('<div role="dialog"><input></div>', 'input'))).toBe(true);
    expect(isBlockedTarget(el('<div role="alertdialog"><button>b</button></div>', 'button'))).toBe(true);
    expect(isBlockedTarget(el('<div role="dialog" id="notes-drawer"><input></div>', 'input'))).toBe(false);
    expect(isBlockedTarget(el('<main><input></main>', 'input'))).toBe(false);
    expect(isBlockedTarget(null)).toBe(false);
  });
});

describe('key labels (AC-4)', () => {
  test('Mac uses symbols in Apple order without separators', () => {
    expect(keyTokens('Mod+Alt+N', true)).toEqual(['⌥', '⌘', 'N']);
    expect(formatKeys('Mod+Alt+N', true)).toBe('⌥⌘N');
    expect(formatKeys('Mod+Shift+F', true)).toBe('⇧⌘F');
    expect(formatKeys('Mod+Alt+Backspace', true)).toBe('⌥⌘⌫');
    expect(formatKeys('Mod+\\', true)).toBe('⌘\\');
    expect(formatKeys('?', true)).toBe('?');
  });

  test('others spell modifiers out with +', () => {
    expect(keyTokens('Mod+Alt+N', false)).toEqual(['Ctrl', 'Alt', 'N']);
    expect(formatKeys('Mod+Alt+N', false)).toBe('Ctrl+Alt+N');
    expect(formatKeys('Mod+Shift+F', false)).toBe('Ctrl+Shift+F');
    expect(formatKeys('Mod+Alt+Backspace', false)).toBe('Ctrl+Alt+Backspace');
    expect(formatKeys('/', false)).toBe('/');
  });

  test('platform detection', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('macOS')).toBe(true);
    expect(isMacPlatform('iPad')).toBe(true);
    expect(isMacPlatform('iPhone')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(isMacPlatform('Linux x86_64')).toBe(false);
    expect(isMacPlatform('')).toBe(false);
  });
});

describe('availability and labels (AC-3, AC-5)', () => {
  const byId = (id: string) => COMMANDS.find((c) => c.id === id)!;

  test('note commands need an open note', () => {
    for (const id of ['toggle-archive', 'trash-note', 'lock-note']) {
      expect(isAvailable(byId(id), NO_NOTE)).toBe(false);
      expect(isAvailable(byId(id), OPEN_NOTE)).toBe(true);
    }
    for (const id of ['new-note', 'search', 'go-home', 'toggle-sidebar', 'toggle-theme', 'lock-app']) {
      expect(isAvailable(byId(id), NO_NOTE)).toBe(true);
    }
  });

  test('Remove lock needs the locked note decrypted', () => {
    const lockNote = byId('lock-note');
    expect(isAvailable(lockNote, { ...OPEN_NOTE, noteLocked: true, noteReadable: false })).toBe(false);
    expect(isAvailable(lockNote, { ...OPEN_NOTE, noteLocked: true, noteReadable: true })).toBe(true);
  });

  test('labels follow the open note', () => {
    expect(commandLabel(byId('toggle-archive'), OPEN_NOTE)).toBe('Archive note');
    expect(commandLabel(byId('toggle-archive'), { ...OPEN_NOTE, noteArchived: true })).toBe('Unarchive note');
    expect(commandLabel(byId('lock-note'), OPEN_NOTE)).toBe('Lock note');
    expect(commandLabel(byId('lock-note'), { ...OPEN_NOTE, noteLocked: true })).toBe('Remove lock');
    expect(commandLabel(byId('new-note'), OPEN_NOTE)).toBe('New note');
  });
});
