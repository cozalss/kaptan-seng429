import { afterEach, describe, expect, it } from 'vitest';
import { POINTER_GRACE_MS, installFocusGuard, isStillFocusable, shouldRestoreFocus } from './focus-guard.js';

const base = () => {
  const body = {};
  const target = {};
  return { active: body, body, target, connected: true, focusable: true, sincePointerMs: 10_000, hasFocus: true };
};

describe('shouldRestoreFocus', () => {
  it('restores a re-inserted element whose focus fell to <body>', () => {
    expect(shouldRestoreFocus(base())).toBe(true);
  });

  it.each([
    ['focus moved elsewhere on purpose', { active: {} }],
    ['a pointer press explains the blur', { sincePointerMs: POINTER_GRACE_MS - 1 }],
    ['the element is gone', { connected: false }],
    ['the element is hidden or inert now', { focusable: false }],
    ['focus left the page', { hasFocus: false }],
    ['no target', { target: null }],
    ['a key press moved focus (Tab out of the page)', { byKey: true }],
  ])('does not when %s', (_, patch) => {
    expect(shouldRestoreFocus({ ...base(), ...patch })).toBe(false);
  });
});

describe('installFocusGuard', () => {
  let uninstall = () => {};
  afterEach(() => {
    uninstall();
    document.body.innerHTML = '';
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('hands focus back to an element that a pin re-parented', async () => {
    document.body.innerHTML = '<section id="s"><a id="a" href="#x">†</a></section><div id="spacer"></div>';
    const link = document.getElementById('a');
    const section = document.getElementById('s');
    uninstall = installFocusGuard({ now: () => 10_000 });
    document.hasFocus = () => true;
    link.focus();
    expect(document.activeElement).toBe(link);
    // GSAP pin: wrap the section in a spacer (detach + re-insert in one task)
    document.getElementById('spacer').appendChild(section);
    // Chromium fires focusout (relatedTarget null) for it, after the re-insert; jsdom does not
    link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(document.activeElement).toBe(document.body);
    await flush();
    expect(document.activeElement).toBe(link);
  });

  it('leaves a blur caused by a key press alone (Tab out of the page)', async () => {
    document.body.innerHTML = '<button id="b">x</button>';
    const button = document.getElementById('b');
    uninstall = installFocusGuard({ now: () => 5_000 });
    document.hasFocus = () => true;
    button.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    button.blur();
    await flush();
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves a pointer-caused blur alone', async () => {
    document.body.innerHTML = '<button id="b">x</button>';
    const button = document.getElementById('b');
    uninstall = installFocusGuard({ now: () => 5_000 });
    document.hasFocus = () => true;
    button.focus();
    document.dispatchEvent(new Event('pointerdown'));
    button.blur();
    await flush();
    expect(document.activeElement).toBe(document.body);
  });

  it('isStillFocusable rejects disabled and inert elements', () => {
    document.body.innerHTML = '<div inert><button id="i">i</button></div><button id="d" disabled>d</button><button id="ok">ok</button>';
    expect(isStillFocusable(document.getElementById('i'))).toBe(false);
    expect(isStillFocusable(document.getElementById('d'))).toBe(false);
    expect(isStillFocusable(document.getElementById('ok'))).toBe(true);
    expect(isStillFocusable(null)).toBe(false);
  });
});
