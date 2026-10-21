import { describe, expect, test } from 'vitest';
import { highlightSegments, snippetSegments } from '@/lib/searchHighlight';

const marked = (segments: { text: string; match: boolean }[]) =>
  segments.filter((s) => s.match).map((s) => s.text);
const joined = (segments: { text: string }[]) => segments.map((s) => s.text).join('');

describe('highlightSegments (AC-6)', () => {
  test('marks whole words matching a term, case-insensitively, and keeps all text', () => {
    const text = 'Groceries: milk, GROCERIES list';
    const segments = highlightSegments(text, ['groceries']);
    expect(joined(segments)).toBe(text);
    expect(segments).toEqual([
      { text: 'Groceries', match: true },
      { text: ': milk, ', match: false },
      { text: 'GROCERIES', match: true },
      { text: ' list', match: false },
    ]);
  });

  test('does not mark a term inside a longer word', () => {
    expect(marked(highlightSegments('milkshake and milk', ['milk']))).toEqual(['milk']);
  });

  test('HTML-looking text stays literal text', () => {
    const text = '<script>alert("x")</script> <b>bold</b>';
    const segments = highlightSegments(text, ['script', 'alert']);
    expect(joined(segments)).toBe(text);
    expect(marked(segments)).toEqual(['script', 'alert', 'script']);
    expect(segments.every((s) => typeof s.text === 'string')).toBe(true);
  });

  test('no terms or no matches give one plain segment; empty text gives none', () => {
    expect(highlightSegments('hello world', [])).toEqual([{ text: 'hello world', match: false }]);
    expect(highlightSegments('hello world', ['zzz'])).toEqual([{ text: 'hello world', match: false }]);
    expect(highlightSegments('', ['a'])).toEqual([]);
  });

  test('non-Latin words and adjacent matches', () => {
    expect(highlightSegments('Café crème', ['café', 'crème'])).toEqual([
      { text: 'Café', match: true },
      { text: ' ', match: false },
      { text: 'crème', match: true },
    ]);
  });
});

describe('snippetSegments (AC-6)', () => {
  const long = `${'intro words here '.repeat(10)}the needle sits here ${'outro words there '.repeat(10)}`.trim();

  test('a window around the first match, with ellipses where cut', () => {
    const segments = snippetSegments(long, ['needle'], 60);
    const text = joined(segments);
    expect(text.startsWith('…')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
    expect(text).toContain('needle');
    expect(text.length).toBeLessThanOrEqual(62);
    expect(marked(segments)).toEqual(['needle']);
  });

  test('cuts at word boundaries', () => {
    const text = joined(snippetSegments(long, ['needle'], 60)).replace(/…/g, '');
    for (const word of text.trim().split(' ')) {
      expect(['intro', 'words', 'here', 'the', 'needle', 'sits', 'outro', 'there']).toContain(word);
    }
  });

  test('without a match in the body, the start of the text', () => {
    const text = joined(snippetSegments(long, ['absent'], 40));
    expect(text.startsWith('intro')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
  });

  test('short text is returned whole, no ellipses', () => {
    expect(snippetSegments('milk and eggs', ['eggs'], 120)).toEqual([
      { text: 'milk and ', match: false },
      { text: 'eggs', match: true },
    ]);
  });

  test('empty text gives no segments', () => {
    expect(snippetSegments('', ['x'], 120)).toEqual([]);
  });
});
