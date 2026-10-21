// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { dataUriToFile, markdownFiles, noteMarkdown, slugify, uniqueSlugs } from '@/lib/backupMarkdown';
import type { Note } from '@/types/note';
import { PBKDF2_ITERATIONS, bytesToBase64 } from '@/lib/noteCrypto';

const note = (over: Partial<Note> = {}): Note => ({
  id: 'a', title: 'Shopping', content: '', rev: 0,
  createdAt: new Date('2026-01-02T03:04:05.006Z'), updatedAt: new Date('2026-02-03T04:05:06.007Z'), deletedAt: null,
  locked: false, encrypted: null, ...over,
});

const body = (content: string) => noteMarkdown(note({ content }), 'n', false).markdown.split('---\n\n')[1];

const TASKS =
  '<ul data-type="taskList">' +
  '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked><span></span></label><div><p>done</p></div></li>' +
  '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>todo</p>' +
  '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>nested</p></div></li></ul>' +
  '</div></li></ul>';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
// Bytes as text, so typed arrays from different realms (jsdom/node) compare equal
const asText = (file: { bytes: Uint8Array; ext: string } | null) => file && { ext: file.ext, text: new TextDecoder().decode(file.bytes) };

describe('slugify (AC-5)', () => {
  test.each([
    ['Shopping List', 'shopping-list'],
    ['  Café — crème brûlée!  ', 'cafe-creme-brulee'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a-b-c-d-e-f-g-h-i-j'],
    ['', 'untitled'],
    ['   ', 'untitled'],
    ['日本語', 'untitled'],
    ['CON', 'con-note'],
    ['lpt1', 'lpt1-note'],
    ['..', 'untitled'],
  ])('%j → %s', (title, slug) => expect(slugify(title)).toBe(slug));

  test('at most 60 characters, no trailing dash', () => {
    const slug = slugify(`${'word '.repeat(30)}`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).not.toMatch(/-$/);
  });
});

describe('uniqueSlugs (AC-5)', () => {
  test('repeats get -2, -3, and a numbered title does not collide', () => {
    expect(uniqueSlugs(['Note', 'note', 'Note 2', 'NOTE', ''])).toEqual(['note', 'note-2', 'note-2-2', 'note-3', 'untitled']);
  });
});

describe('noteMarkdown (AC-5–AC-7)', () => {
  test('front matter with title, created, updated', () => {
    const { markdown } = noteMarkdown(note({ title: 'Say "hi"\nthere', content: '<p>x</p>' }), 'say-hi', false);
    expect(markdown).toBe(
      '---\ntitle: "Say \\"hi\\"\\nthere"\ncreated: 2026-01-02T03:04:05.006Z\nupdated: 2026-02-03T04:05:06.007Z\n---\n\nx\n',
    );
  });

  test('Trash notes also carry deleted', () => {
    const { markdown } = noteMarkdown(note({ deletedAt: new Date('2026-10-01T00:00:00.000Z') }), 'x', true);
    expect(markdown).toContain('\ndeleted: 2026-10-01T00:00:00.000Z\n---\n');
  });

  test('an empty note is just front matter', () => {
    expect(noteMarkdown(note(), 'x', false).markdown).toMatch(/---\n\n$/);
  });

  test('task lists, nested', () => {
    expect(body(TASKS)).toBe('- [x] done\n- [ ] todo\n  - [ ] nested\n');
  });

  test('code block with language', () => {
    expect(body('<pre><code class="language-js">const a = 1;\nif (a &lt; 2) {}</code></pre>')).toBe(
      '```js\nconst a = 1;\nif (a < 2) {}\n```\n',
    );
  });

  test('headings, marks, lists, quote', () => {
    expect(body('<h2>Hi</h2><p><strong>b</strong> <em>i</em> <s>s</s> <code>c</code></p><ol><li><p>one</p></li></ol><blockquote><p>q</p></blockquote>'))
      .toBe('## Hi\n\n**b** *i* ~~s~~ `c`\n\n1. one\n\n> q\n');
  });

  test('links: allowed ones kept, javascript: dropped like in the editor', () => {
    expect(body('<p><a href="https://example.com/a?b=1">web</a> <a href="mailto:me@example.com">mail</a> <a href="javascript:alert(1)">bad</a></p>'))
      .toBe('[web](https://example.com/a?b=1) [mail](mailto:me@example.com) bad\n');
  });

  test('scripts and handlers never reach the Markdown', () => {
    expect(body('<p onclick="x()">ok</p><script>alert(1)</script><img src="x" onerror="alert(1)">')).toBe('ok\n');
  });

  test('a remote image stays a URL; a data image becomes an asset file', () => {
    const { markdown, assets } = noteMarkdown(
      note({ content: `<p><img src="https://example.com/a.png" alt="A"><img src="${PNG}"></p>` }), 'pic', false,
    );
    expect(markdown).toContain('![A](https://example.com/a.png)![](assets/pic-1.png)');
    expect(assets).toEqual([{ path: 'assets/pic-1.png', bytes: Uint8Array.from(atob('iVBORw0KGgo='), (c) => c.charCodeAt(0)) }]);
  });

  test('from Trash, assets are referenced one level up', () => {
    const { markdown, assets } = noteMarkdown(note({ content: `<p><img src="${PNG}"><img src="${PNG}"></p>` }), 'pic', true);
    expect(markdown).toContain('![](../assets/pic-1.png)![](../assets/pic-2.png)');
    expect(assets.map((a) => a.path)).toEqual(['assets/pic-1.png', 'assets/pic-2.png']);
  });

  test('legacy Quill HTML converts cleanly', () => {
    const quill =
      '<ul><li data-list="checked">done</li></ul><ul><li data-list="unchecked">todo</li></ul>' +
      '<pre data-language="plain">\nconst a = 1;\n</pre><p class="ql-align-center">every&nbsp;space&nbsp;nbsp</p>';
    expect(body(quill)).toBe('- [x] done\n- [ ] todo\n\n```\nconst a = 1;\n```\n\nevery space nbsp\n');
  });
});

describe('dataUriToFile (AC-7)', () => {
  test('base64 png/jpeg/svg', () => {
    expect(dataUriToFile(PNG)?.ext).toBe('png');
    expect(dataUriToFile('data:image/jpeg;base64,/9j/')?.ext).toBe('jpg');
    expect(asText(dataUriToFile('data:image/svg+xml;base64,PHN2Zy8+'))).toEqual({ ext: 'svg', text: '<svg/>' });
  });

  test('percent-encoded data', () => {
    expect(asText(dataUriToFile('data:image/svg+xml,%3Csvg%2F%3E'))).toEqual({ ext: 'svg', text: '<svg/>' });
  });

  test('undecodable or not an image → null (stays inline)', () => {
    expect(dataUriToFile('data:image/png;base64,***')).toBeNull();
    expect(dataUriToFile('data:text/html;base64,PGI+')).toBeNull();
    expect(dataUriToFile('https://example.com/a.png')).toBeNull();
  });
});

describe('markdownFiles (AC-5, AC-7)', () => {
  test('live notes at the top, Trash under trash/, slugs unique across both, assets collected', () => {
    const files = markdownFiles([
      note({ id: '1', title: 'Plan' }),
      note({ id: '2', title: 'Plan', deletedAt: new Date('2026-10-01T00:00:00.000Z'), content: `<p><img src="${PNG}"></p>` }),
      note({ id: '3', title: '' }),
    ]);
    expect(Object.keys(files).sort()).toEqual([
      'markdown/assets/plan-2-1.png', 'markdown/plan.md', 'markdown/trash/plan-2.md', 'markdown/untitled.md',
    ]);
    expect(files['markdown/trash/plan-2.md']).toContain('![](../assets/plan-2-1.png)');
  });
});

describe('locked notes (CNOTE-7 AC-14)', () => {
  const encrypted = {
    v: 1 as const, kdf: 'PBKDF2-SHA256' as const, iter: PBKDF2_ITERATIONS,
    salt: bytesToBase64(new Uint8Array(16).fill(1)), iv: bytesToBase64(new Uint8Array(12).fill(2)),
    ct: bytesToBase64(new Uint8Array(48).fill(3)),
  };
  const locked = (over: Partial<Note> = {}) => note({ id: 'L', title: '', content: '', locked: true, encrypted, ...over });

  test('each locked note gets a placeholder file, Trash included, and nothing else', () => {
    const files = markdownFiles([locked(), locked({ id: 'M', deletedAt: new Date('2026-10-01T00:00:00.000Z') }), note()]);
    expect(Object.keys(files)).toEqual(['markdown/locked-note.md', 'markdown/trash/locked-note-2.md', 'markdown/shopping.md']);
  });

  test('the placeholder says it is encrypted and holds neither ciphertext nor a title', () => {
    const { markdown, assets } = noteMarkdown(locked(), 'locked-note', false);
    expect(assets).toEqual([]);
    expect(markdown).toBe(
      '---\ntitle: "Locked note"\ncreated: 2026-01-02T03:04:05.006Z\nupdated: 2026-02-03T04:05:06.007Z\nlocked: true\n---\n\n' +
        'This note is locked. Its title and text are encrypted with your passphrase and are only in notes.json. ' +
        'Import the backup into ComNotes and enter the passphrase to read it.\n',
    );
    expect(markdown).not.toContain(encrypted.ct);
  });
});
