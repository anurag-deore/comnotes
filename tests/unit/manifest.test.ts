import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import manifest from '@/app/manifest';
import { APP_COLORS } from '@/lib/pwa';

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const css = readFileSync(root('app/globals.css'), 'utf8');

// The value of a token in the light (:root) or dark block of globals.css
function token(name: string, dark = false): string {
  const selector = dark ? ':root[data-theme="dark"] {' : ':root {';
  const start = css.indexOf(selector);
  const body = css.slice(start, css.indexOf('}', start));
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body);
  if (!match) throw new Error(`No ${name} in ${selector}`);
  return match[1].trim();
}

// Width and height of a PNG, from its IHDR chunk
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(root(`public${path}`));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('web app manifest (CNOTE-20 AC-12)', () => {
  const m = manifest();

  test('names the app and opens standalone at the root', () => {
    expect(m).toMatchObject({
      name: 'ComNotes', short_name: 'ComNotes', id: '/', start_url: '/', scope: '/', display: 'standalone',
    });
    expect(m.description).toBeTruthy();
  });

  test('colours come from the design tokens', () => {
    expect(APP_COLORS).toEqual({
      background: token('--canvas'),
      light: token('--canvas-soft'),
      dark: token('--canvas-soft', true),
    });
    expect(m.background_color).toBe(APP_COLORS.background);
    expect(m.theme_color).toBe(APP_COLORS.light);
  });

  test('has 192 and 512 icons and a maskable 512, and the files exist at those sizes', () => {
    expect(m.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
    for (const icon of m.icons ?? []) {
      const [w, h] = icon.sizes!.split('x').map(Number);
      expect(pngSize(icon.src)).toEqual([w, h]);
    }
  });

  test('the apple-touch-icon is 180 px and the SVG source is kept', () => {
    expect(pngSize('/icons/apple-touch-icon.png')).toEqual([180, 180]);
    expect(existsSync(root('public/icons/icon.svg'))).toBe(true);
  });
});
