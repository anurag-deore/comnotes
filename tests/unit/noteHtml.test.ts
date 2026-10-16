// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { NOTE_FORMATS, noteHtmlToText } from '@/lib/noteHtml';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('noteHtmlToText', () => {
  test('returns the text of Quill-style blocks, separated and whitespace-collapsed', () => {
    const html =
      '<h1>Groceries</h1><p>Buy <strong>milk</strong>&nbsp;and   eggs</p>' +
      '<ul><li>one</li><li>two</li></ul><p>line<br>break</p><blockquote>quote</blockquote>';

    expect(noteHtmlToText(html)).toBe('Groceries Buy milk and eggs one two line break quote');
  });

  test('drops <script> and <style> contents and runs nothing', () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);

    const text = noteHtmlToText(
      '<p>safe</p><script>alert(1)</script><style>p{color:red}</style>' +
        '<img src="x" onerror="alert(2)"><a href="javascript:alert(3)">click</a>',
    );

    expect(text).toBe('safe click');
    expect(alert).not.toHaveBeenCalled();
    expect(document.querySelector('img, script')).toBeNull();
  });

  test('keeps escaped markup as literal text', () => {
    expect(noteHtmlToText('<p>&lt;img src=x onerror=alert(1)&gt;</p>')).toBe('<img src=x onerror=alert(1)>');
  });

  test('handles empty and plain input', () => {
    expect(noteHtmlToText('')).toBe('');
    expect(noteHtmlToText('just text')).toBe('just text');
  });
});

describe('NOTE_FORMATS', () => {
  test('excludes the embeds whose HTML export is unescaped', () => {
    expect(NOTE_FORMATS).not.toContain('video');
    expect(NOTE_FORMATS).not.toContain('formula');
  });

  test('keeps every format the toolbar and pasted content use', () => {
    for (const f of ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'indent', 'link', 'blockquote', 'code-block', 'code', 'color', 'background', 'image']) {
      expect(NOTE_FORMATS).toContain(f);
    }
  });
});
