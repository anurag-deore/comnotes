// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { convertQuillHtml } from '@/lib/quillToTiptap';

// Real output of quill 2.0.3 getSemanticHTML() (what react-quill-new saved), except the
// code block, whose text jsdom drops; that part follows quill's CodeBlockContainer.html().
const QUILL2_SEMANTIC =
  '<h1>Title</h1><h2>Sub</h2>' +
  '<p>plain&nbsp;<strong>bold</strong>&nbsp;<em>ital</em>&nbsp;<u>u</u>&nbsp;<s>s</s>&nbsp;' +
  '<span style="color: rgb(230, 0, 0);">red</span>&nbsp;<span style="background-color: rgb(255, 255, 0);">hl</span>&nbsp;' +
  '<a href="https://example.com" rel="noopener noreferrer" target="_blank">link</a>&nbsp;<code>c</code></p>' +
  '<ul><li>b1<ul><li>b1a<ol><li>b1a-o</li></ol></li></ul></li><li>b2</li></ul>' +
  '<p>between</p><ol><li>o1</li><li>o2</li></ol>' +
  '<ul><li data-list="checked">done</li></ul><ul><li data-list="unchecked">todo</li></ul>' +
  '<blockquote>quote</blockquote>' +
  '<pre data-language="plain">\nconst a = 1;\nif (a &lt; 2) {}\n</pre>' +
  '<p class="ql-align-center">centered</p><p class="ql-indent-1">indented&nbsp;para</p>' +
  '<p>two&nbsp;&nbsp;spaces</p><p><img src="data:image/png;base64,iVBORw0KGgo="></p><p></p>';

// Real quill 2.0.3 editor DOM (root.innerHTML)
const QUILL2_ROOT =
  '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>b1</li>' +
  '<li data-list="bullet" class="ql-indent-1"><span class="ql-ui" contenteditable="false"></span>b1a</li>' +
  '<li data-list="ordered" class="ql-indent-2"><span class="ql-ui" contenteditable="false"></span>b1a-o</li>' +
  '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>b2</li></ol>' +
  '<ol><li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>o1</li>' +
  '<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>o2</li>' +
  '<li data-list="checked"><span class="ql-ui" contenteditable="false"></span>done</li>' +
  '<li data-list="unchecked"><span class="ql-ui" contenteditable="false"></span>todo</li></ol>' +
  '<div class="ql-code-block-container" spellcheck="false"><div class="ql-code-block" data-language="plain">const a = 1;</div>' +
  '<div class="ql-code-block" data-language="plain">if (a &lt; 2) {}</div></div>' +
  '<p class="ql-align-right">right</p>';

// Quill 1.3.7 editor DOM (what react-quill 2.0 saved before CNOTE-4)
const QUILL1_ROOT =
  '<ul><li>b1</li><li class="ql-indent-1">b1a</li><li class="ql-indent-1">b1b</li><li>b2</li></ul>' +
  '<ol><li>o1</li><li class="ql-indent-1">o1a</li></ol>' +
  '<ul data-checked="true"><li>done</li></ul><ul data-checked="false"><li>todo</li></ul>' +
  '<pre class="ql-syntax" spellcheck="false">line 1\nline 2\n</pre>' +
  '<p class="ql-align-justify">just</p><p><br></p>';

function parse(html: string) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return body;
}

// Compact structural view of lists: tag[type] > items
function listShape(el: Element): unknown {
  const kind = el.getAttribute('data-type') === 'taskList' ? 'task' : el.tagName.toLowerCase();
  return {
    [kind]: Array.from(el.children).map((li) => {
      const nested = Array.from(li.children).filter((c) => /^(UL|OL)$/.test(c.tagName));
      const text = Array.from(li.childNodes)
        .filter((n) => !(n instanceof Element && /^(UL|OL)$/.test(n.tagName)))
        .map((n) => n.textContent)
        .join('');
      const item: Record<string, unknown> = { text };
      if (li.getAttribute('data-type') === 'taskItem') item.checked = li.getAttribute('data-checked') === 'true';
      if (nested.length) item.children = nested.map(listShape);
      return item;
    }),
  };
}

const topLists = (body: HTMLElement) => Array.from(body.children).filter((c) => /^(UL|OL)$/.test(c.tagName));

describe('convertQuillHtml – Quill 2 semantic HTML (AC-1)', () => {
  const body = parse(convertQuillHtml(QUILL2_SEMANTIC));

  test('keeps nested bullet and ordered lists with their types', () => {
    const [bullets, ordered] = topLists(body);
    expect(listShape(bullets)).toEqual({
      ul: [{ text: 'b1', children: [{ ul: [{ text: 'b1a', children: [{ ol: [{ text: 'b1a-o' }] }] }] }] }, { text: 'b2' }],
    });
    expect(listShape(ordered)).toEqual({ ol: [{ text: 'o1' }, { text: 'o2' }] });
  });

  test('turns checked/unchecked items into one task list', () => {
    const tasks = body.querySelectorAll('ul[data-type="taskList"]');
    expect(tasks).toHaveLength(1);
    expect(listShape(tasks[0])).toEqual({ task: [{ text: 'done', checked: true }, { text: 'todo', checked: false }] });
    expect(body.querySelector('[data-list]')).toBeNull();
  });

  test('keeps code block lines without the wrapping newlines', () => {
    const code = body.querySelector('pre > code');
    expect(code?.textContent).toBe('const a = 1;\nif (a < 2) {}');
    expect(body.querySelector('pre')?.hasAttribute('data-language')).toBe(false);
  });

  test('maps ql-align to text-align and drops ql- classes', () => {
    const centered = Array.from(body.querySelectorAll('p')).find((p) => p.textContent === 'centered');
    expect(centered?.style.textAlign).toBe('center');
    expect(body.querySelector('[class*="ql-"]')).toBeNull();
  });

  test('makes &nbsp; runs wrappable but keeps the extra spaces', () => {
    const paras = Array.from(body.querySelectorAll('p')).map((p) => p.textContent);
    expect(paras).toContain('two  spaces');
    expect(paras).toContain('indented para');
    expect(body.querySelector('p')?.textContent).toBe('plain bold ital u s red hl link c');
  });

  test('keeps headings, marks, colors, links and images untouched', () => {
    expect(body.querySelector('h1')?.textContent).toBe('Title');
    expect(body.querySelector('strong')?.textContent).toBe('bold');
    expect(body.querySelector('span[style*="background-color"]')?.textContent).toBe('hl');
    expect(body.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(body.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(body.querySelector('blockquote')?.textContent).toBe('quote');
  });
});

describe('convertQuillHtml – Quill editor DOM (AC-2)', () => {
  test('Quill 2: rebuilds data-list + ql-indent into nested lists and a task list', () => {
    const body = parse(convertQuillHtml(QUILL2_ROOT));
    const lists = topLists(body);
    expect(lists.map(listShape)).toEqual([
      { ul: [{ text: 'b1', children: [{ ul: [{ text: 'b1a', children: [{ ol: [{ text: 'b1a-o' }] }] }] }] }, { text: 'b2' }] },
      { ol: [{ text: 'o1' }, { text: 'o2' }] },
      { task: [{ text: 'done', checked: true }, { text: 'todo', checked: false }] },
    ]);
    expect(body.querySelector('.ql-ui, [contenteditable]')).toBeNull();
  });

  test('Quill 2: joins ql-code-block lines into one code block', () => {
    const body = parse(convertQuillHtml(QUILL2_ROOT));
    expect(body.querySelectorAll('pre')).toHaveLength(1);
    expect(body.querySelector('pre > code')?.textContent).toBe('const a = 1;\nif (a < 2) {}');
    expect(body.querySelector('div')).toBeNull();
    expect(body.querySelector('p')?.style.textAlign).toBe('right');
  });

  test('Quill 1: rebuilds ql-indent lists, data-checked lists and pre.ql-syntax', () => {
    const body = parse(convertQuillHtml(QUILL1_ROOT));
    expect(topLists(body).map(listShape)).toEqual([
      { ul: [{ text: 'b1', children: [{ ul: [{ text: 'b1a' }, { text: 'b1b' }] }] }, { text: 'b2' }] },
      { ol: [{ text: 'o1', children: [{ ol: [{ text: 'o1a' }] }] }] },
      { task: [{ text: 'done', checked: true }, { text: 'todo', checked: false }] },
    ]);
    expect(body.querySelector('pre > code')?.textContent).toBe('line 1\nline 2');
    expect(body.querySelector('p')?.style.textAlign).toBe('justify');
  });

  test('a list that starts indented still nests under a placeholder-free parent', () => {
    const body = parse(convertQuillHtml('<ul><li class="ql-indent-1">deep</li><li>top</li></ul>'));
    expect(body.textContent).toBe('deeptop');
    expect(body.querySelectorAll('li')).toHaveLength(2);
  });
});

describe('convertQuillHtml – idempotent (CNOTE-21 AC-5)', () => {
  test.each([
    ['Quill 2 semantic', QUILL2_SEMANTIC],
    ['Quill 2 root', QUILL2_ROOT],
    ['Quill 1 root', QUILL1_ROOT],
  ])('%s: converting the output again changes nothing', (_label, html) => {
    const once = convertQuillHtml(html);
    expect(convertQuillHtml(once)).toBe(once);
  });

  test('a non-breaking space next to a normal space is left alone', () => {
    expect(convertQuillHtml('<p>a  b</p>')).toBe('<p>a &nbsp;b</p>');
    expect(convertQuillHtml('<p>a  b</p>')).toBe('<p>a&nbsp; b</p>');
    expect(convertQuillHtml('<p>two&nbsp;&nbsp;spaces</p>')).toBe('<p>two &nbsp;spaces</p>');
  });
});

describe('convertQuillHtml – other input', () => {
  test('leaves plain and empty HTML alone', () => {
    expect(convertQuillHtml('')).toBe('');
    expect(convertQuillHtml('<p>hello <strong>you</strong></p>')).toBe('<p>hello <strong>you</strong></p>');
  });

  test('does not touch spaces inside code blocks', () => {
    const body = parse(convertQuillHtml('<pre><code>a  b</code></pre>'));
    expect(body.querySelector('code')?.textContent).toBe('a  b');
  });
});
