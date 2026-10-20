// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { noteHtmlToText } from '@/lib/noteHtml';

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

  test('reads Tiptap task lists and nested lists', () => {
    const html =
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked><span></span></label>' +
      '<div><p>done</p></div></li></ul><ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>';

    expect(noteHtmlToText(html)).toBe('done a b');
  });

  test('handles empty and plain input', () => {
    expect(noteHtmlToText('')).toBe('');
    expect(noteHtmlToText('just text')).toBe('just text');
  });
});
