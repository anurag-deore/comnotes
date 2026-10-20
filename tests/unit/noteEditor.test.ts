// @vitest-environment jsdom
// Runs note HTML through the real Tiptap schema the editor uses (lib/editorExtensions.ts).
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { isAllowedImageSrc, isAllowedLinkHref, noteExtensions } from '@/lib/editorExtensions';
import { createContentSync } from '@/lib/editorContent';
import { convertQuillHtml } from '@/lib/quillToTiptap';

const editors: Editor[] = [];

function load(html: string, onUpdate: () => void = () => {}) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: noteExtensions(),
    content: convertQuillHtml(html),
    onUpdate,
  });
  editors.push(editor);
  return editor;
}

const dom = (editor: Editor) => new DOMParser().parseFromString(editor.getHTML(), 'text/html').body;

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  vi.unstubAllGlobals();
});

// Typical react-quill-new note (quill 2.0.3 getSemanticHTML)
const QUILL_NOTE =
  '<h1>Plan</h1><h3>Week&nbsp;1</h3>' +
  '<p>plain&nbsp;<strong>bold</strong>&nbsp;<em>ital</em>&nbsp;<u>under</u>&nbsp;<s>gone</s>&nbsp;<code>x()</code>&nbsp;' +
  '<span style="color: rgb(230, 0, 0);">red</span>&nbsp;<span style="background-color: rgb(255, 255, 0);">marked</span>&nbsp;' +
  '<a href="https://example.com/a" rel="noopener noreferrer" target="_blank">site</a></p>' +
  '<ul><li>b1<ul><li>b1a</li></ul></li><li>b2</li></ul><ol><li>o1</li><li>o2</li></ol>' +
  '<ul><li data-list="checked">done</li></ul><ul><li data-list="unchecked">todo</li></ul>' +
  '<blockquote>wise</blockquote><pre data-language="plain">\nlet a = 1;\nlet b = 2;\n</pre>' +
  '<p class="ql-align-center">mid</p>' +
  '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>';

describe('loading Quill notes (AC-3)', () => {
  test('keeps headings, marks, colors, links, lists, quote, code, alignment and images', () => {
    const body = dom(load(QUILL_NOTE));
    expect(body.querySelector('h1')?.textContent).toBe('Plan');
    expect(body.querySelector('h3')?.textContent).toBe('Week 1');
    for (const [selector, text] of [['strong', 'bold'], ['em', 'ital'], ['u', 'under'], ['s', 'gone'], ['code', 'x()']]) {
      expect(body.querySelector(`p ${selector}`)?.textContent).toBe(text);
    }
    expect(body.querySelector('span[style*="color: rgb(230, 0, 0)"]')?.textContent).toBe('red');
    expect(body.querySelector('span[style*="background-color"]')?.textContent).toBe('marked');
    expect(body.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
    expect(body.querySelector('ul:not([data-type]) > li ul > li')?.textContent).toBe('b1a');
    expect(Array.from(body.querySelectorAll('ol > li'), (li) => li.textContent)).toEqual(['o1', 'o2']);
    const tasks = Array.from(body.querySelectorAll('li[data-type="taskItem"]'));
    expect(tasks.map((li) => [li.textContent, li.getAttribute('data-checked')])).toEqual([['done', 'true'], ['todo', 'false']]);
    expect(body.querySelector('blockquote')?.textContent).toBe('wise');
    expect(body.querySelector('pre code')?.textContent).toBe('let a = 1;\nlet b = 2;');
    expect(Array.from(body.querySelectorAll('p')).find((p) => p.textContent === 'mid')?.style.textAlign).toBe('center');
    expect(body.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  test('loading, or just moving the cursor, never emits an update (AC-6)', () => {
    const onUpdate = vi.fn();
    const editor = load(QUILL_NOTE + '<pre data-language="plain">\nlast\n</pre>', onUpdate);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.focus('end');
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('Tiptap HTML round trip (AC-4)', () => {
  test('converting the editor output and loading it again changes nothing', () => {
    const first = load(QUILL_NOTE);
    const second = load(first.getHTML());
    expect(second.getJSON()).toEqual(first.getJSON());
    expect(second.getHTML()).toBe(first.getHTML());
  });
});

describe('link and image safety (AC-5)', () => {
  test('isAllowedLinkHref allows only http, https and mailto', () => {
    for (const ok of ['https://a.com', 'http://a.com/x?y=1', 'mailto:me@a.com', 'HTTPS://A.COM', 'example.com/x', 'me@a.com']) {
      expect(isAllowedLinkHref(ok)).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', ' javascript:alert(1)', 'JaVaScRiPt:x', 'data:text/html,x', 'vbscript:x', 'tel:123', 'ftp://a.com', '/relative', '', 'java\tscript:x']) {
      expect(isAllowedLinkHref(bad)).toBe(false);
    }
  });

  test('isAllowedImageSrc allows only http(s) and data:image', () => {
    for (const ok of ['https://a.com/i.png', 'http://a.com/i.png', 'data:image/png;base64,AAAA']) expect(isAllowedImageSrc(ok)).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', '//:0', '', 'file:///etc/passwd']) expect(isAllowedImageSrc(bad)).toBe(false);
  });

  test('disallowed links lose the link but keep the text; links get rel and target', () => {
    const body = dom(load('<p><a href="javascript:alert(1)">bad</a> <a href="data:text/html,x">worse</a> <a href="https://ok.com">ok</a></p>'));
    const links = Array.from(body.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://ok.com']);
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(body.textContent).toBe('bad worse ok');
  });

  test('scripts, event handlers and bad image sources never survive', () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const html = load(
      '<p>a<img src="https://x.com/i.png" onerror="alert(1)"><img src="javascript:alert(2)"><script>alert(3)</script></p>' +
        '<iframe src="https://x.com"></iframe><p onclick="alert(4)">b</p>',
    ).getHTML();
    expect(html).not.toMatch(/onerror|onclick|<script|<iframe|javascript:/);
    expect(dom(load(html)).querySelectorAll('img')).toHaveLength(1);
    expect(alert).not.toHaveBeenCalled();
  });

  test('autolinks typed URLs', () => {
    const editor = load('<p></p>');
    editor.commands.insertContent('see https://example.com ');
    expect(dom(editor).querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });
});

describe('content sync between props and editor (AC-6)', () => {
  test('a new value from props is applied without emitting an update', () => {
    const onUpdate = vi.fn();
    const editor = load('<p>one</p>', onUpdate);
    const sync = createContentSync('<p>one</p>');
    sync.apply(editor, '<ul><li data-list="checked">from another tab</li></ul>');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(dom(editor).querySelector('li[data-type="taskItem"]')?.textContent).toBe('from another tab');
  });

  test('the value the editor just emitted is not re-applied', () => {
    const editor = load('<p>one</p>');
    const sync = createContentSync('<p>one</p>');
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' two');
    editor.commands.setTextSelection(3);
    const emitted = sync.emitted(editor.getHTML());
    const setContent = vi.spyOn(editor.commands, 'setContent');
    sync.apply(editor, emitted);
    expect(setContent).not.toHaveBeenCalled();
    expect(editor.state.selection.from).toBe(3);
  });

  test('the initial value is not re-applied', () => {
    const editor = load('<p>one</p>');
    const sync = createContentSync('<p>one</p>');
    const setContent = vi.spyOn(editor.commands, 'setContent');
    sync.apply(editor, '<p>one</p>');
    expect(setContent).not.toHaveBeenCalled();
  });

  test('typing emits an update with the editor HTML', () => {
    const onUpdate = vi.fn();
    const editor = load('<p>one</p>', onUpdate);
    editor.commands.insertContent('x');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('markdown shortcuts (AC-8)', () => {
  // Input rules fire on text typed through the view, as a keypress would
  function type(editor: Editor, text: string) {
    for (const char of text) {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, char, () => editor.state.tr.insertText(char, from, to)));
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    }
    return dom(editor);
  }

  test.each([
    ['# Title', 'h1'],
    ['## Sub', 'h2'],
    ['### Small', 'h3'],
    ['- item', 'ul:not([data-type]) > li'],
    ['* item', 'ul:not([data-type]) > li'],
    ['1. item', 'ol > li'],
    ['[ ] task', 'ul[data-type="taskList"] > li'],
    ['> quote', 'blockquote'],
    ['``` ', 'pre'],
    ['**bold** ', 'strong'],
    ['*it* ', 'em'],
    ['`code` ', 'code'],
  ])('%s', (input, selector) => {
    expect(type(load('<p></p>'), input).querySelector(selector)).not.toBeNull();
  });
});
