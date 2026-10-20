import { describe, expect, test } from 'vitest';
import { parseLinkInput, withScheme } from '@/lib/editorLink';

describe('withScheme (AC-4)', () => {
  test('adds https:// to a bare host and keeps an existing scheme', () => {
    expect(withScheme('example.com/a')).toBe('https://example.com/a');
    expect(withScheme('http://x.org')).toBe('http://x.org');
    expect(withScheme('mailto:me@x.org')).toBe('mailto:me@x.org');
  });
});

describe('parseLinkInput (AC-4)', () => {
  test('empty or blank input removes the link', () => {
    expect(parseLinkInput('')).toEqual({ kind: 'remove' });
    expect(parseLinkInput('   ')).toEqual({ kind: 'remove' });
  });
  test('allowed links are set, trimmed and with a scheme', () => {
    expect(parseLinkInput(' example.com ')).toEqual({ kind: 'set', href: 'https://example.com' });
    expect(parseLinkInput('https://x.org/p?q=1')).toEqual({ kind: 'set', href: 'https://x.org/p?q=1' });
    expect(parseLinkInput('mailto:me@x.org')).toEqual({ kind: 'set', href: 'mailto:me@x.org' });
  });
  test('other schemes are invalid', () => {
    expect(parseLinkInput('javascript:alert(1)')).toEqual({ kind: 'invalid' });
    expect(parseLinkInput('data:text/html,<b>x</b>')).toEqual({ kind: 'invalid' });
    expect(parseLinkInput('not a url')).toEqual({ kind: 'invalid' });
  });
});
