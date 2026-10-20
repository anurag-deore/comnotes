import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Reads the colour tokens straight from globals.css, so the test checks what ships (CNOTE-15 AC-1, AC-2)
const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in globals.css`);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();
  return tokens;
}

const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(match[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]
const PAIRS: [string, string, number][] = [
  ['--ink', '--canvas', 4.5],
  ['--ink', '--canvas-soft', 4.5],
  ['--ink', '--primary-pale', 4.5],
  ['--body', '--canvas', 4.5],
  ['--body', '--canvas-soft', 4.5],
  ['--body', '--primary-pale', 4.5],
  ['--on-primary', '--primary', 4.5],
  ['--on-primary', '--primary-hover', 4.5],
  ['--on-negative', '--negative', 4.5],
  ['--on-negative', '--negative-deep', 4.5],
  ['--negative-deep', '--canvas', 4.5],
  ['--negative-deep', '--canvas-soft', 4.5],
  ['--negative-deep', '--negative-pale', 4.5],
  ['--positive-deep', '--canvas', 4.5],
  ['--warning-content', '--warning', 4.5],
  // Non-text: title placeholder (large text), invalid-input border, input border / focus ring
  ['--mute', '--canvas', 3],
  ['--negative', '--canvas', 3],
  ['--ink', '--canvas', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast (AC-2)', (_name, tokens) => {
  test.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('dark palette (AC-1)', () => {
  test('only redefines tokens that light mode already has', () => {
    const redefined = Object.keys(block(':root[data-theme="dark"]'));
    expect(redefined.length).toBeGreaterThan(10);
    for (const name of redefined) expect(Object.keys(light)).toContain(name);
  });

  test('keeps the lime primary with ink-dark text on it', () => {
    expect(dark['--primary']).toBe(light['--primary']);
    expect(dark['--on-primary']).toBe(light['--on-primary']);
  });

  test('cards sit a step lighter than the page', () => {
    expect(luminance(dark['--canvas'])).toBeGreaterThan(luminance(dark['--canvas-soft']));
  });
});
