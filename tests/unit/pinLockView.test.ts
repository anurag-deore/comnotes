// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { autoLockSummary } from '@/lib/lockSettings';

const auth = vi.hoisted(() => ({ lockedForInactivity: false }));
const unlock = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/auth', () => ({ OFFLINE_UNLOCK_MESSAGE: 'You are offline.', unlock }));

const { default: PinLock } = await import('@/components/PinLock');

let root: Root | null = null;
let host: HTMLElement;

function render() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(PinLock)));
}

const input = () => host.querySelector('input') as HTMLInputElement;
const toggle = () => host.querySelector('button[aria-pressed]') as HTMLButtonElement;

beforeAll(() => {
  // React only warns about act() outside a test environment it recognises
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  auth.lockedForInactivity = false;
});

describe('PIN screen (CNOTE-32)', () => {
  test('the PIN is hidden until Show PIN is pressed, and hidden again on Hide PIN', () => {
    render();
    expect(input().type).toBe('password');
    expect(toggle().getAttribute('aria-label')).toBe('Show PIN');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');

    act(() => toggle().click());
    expect(input().type).toBe('text');
    expect(toggle().getAttribute('aria-label')).toBe('Hide PIN');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');

    act(() => toggle().click());
    expect(input().type).toBe('password');
  });

  test('the field keeps the numeric keyboard and password-manager autofill', () => {
    render();
    expect(input().inputMode).toBe('numeric');
    expect(input().autocomplete).toBe('current-password');
  });

  test('the hint says why it is locked, and the input is described by it', () => {
    auth.lockedForInactivity = true;
    render();
    const hint = host.querySelector(`#${CSS.escape(input().getAttribute('aria-describedby') ?? '')}`);
    expect(hint?.textContent).toMatch(/Locked after inactivity/);
  });

  test('shows the auto-lock timing from lib/lockSettings', () => {
    render();
    expect(host.textContent).toContain(autoLockSummary());
  });

  test('the scenery is a decorative picture', () => {
    render();
    const scenery = host.querySelector('img[src="/images/pin-scenery.webp"]');
    expect(scenery?.getAttribute('alt')).toBe('');
    expect(scenery?.getAttribute('aria-hidden')).toBe('true');
  });
});
