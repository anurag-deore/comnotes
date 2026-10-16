// @vitest-environment jsdom
// Pins how Quill (as configured in QuillEditor) treats hostile HTML, so a
// Quill upgrade or a formats change that reopens a hole fails here.
import { describe, expect, test } from 'vitest';
import { Quill } from 'react-quill-new';
import { NOTE_FORMATS } from '@/lib/noteHtml';

function loadHtml(html: string) {
  const el = document.createElement('div');
  document.body.append(el);
  const quill = new Quill(el, { formats: NOTE_FORMATS });
  // Same call react-quill-new makes for a string `value`
  quill.setContents(quill.clipboard.convert({ html }));
  return quill;
}

describe('Quill with NOTE_FORMATS', () => {
  test('a pasted video embed cannot smuggle markup into the saved HTML', () => {
    const quill = loadHtml(
      '<p>before</p><iframe class="ql-video" src="https://x&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"></iframe>',
    );

    expect(quill.root.querySelector('iframe, img')).toBeNull();
    expect(quill.getSemanticHTML()).not.toMatch(/<img|<iframe/);
  });

  test('javascript: links become about:blank', () => {
    const quill = loadHtml('<p><a href="javascript:alert(1)">x</a></p>');

    expect(quill.root.querySelector('a')?.getAttribute('href')).toBe('about:blank');
  });

  test('event handlers and scripts are dropped', () => {
    const quill = loadHtml('<p><img src="https://example.com/a.png" onerror="alert(1)"><script>alert(2)</script></p>');

    expect(quill.root.querySelector('script')).toBeNull();
    expect(quill.root.querySelector('img')?.getAttribute('onerror')).toBeNull();
    expect(quill.getSemanticHTML()).not.toMatch(/onerror|<script/);
  });
});
