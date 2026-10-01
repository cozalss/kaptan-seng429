import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createOverlay', () => {
  let createOverlay;
  let mount;
  let main;
  let header;
  let footer;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <header class="site-header"></header>
      <main id="main"></main>
      <footer class="site-footer"></footer>
      <div id="overlays"></div>
    `;
    mount = document.getElementById('overlays');
    main = document.getElementById('main');
    header = document.querySelector('.site-header');
    footer = document.querySelector('.site-footer');
    ({ createOverlay } = await import('./overlay.js'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a hidden dialog with the expected structure', () => {
    const overlay = createOverlay({
      mount,
      id: 'test-overlay',
      label: 'Test overlay',
      variant: 'drawer',
      lockScroll: vi.fn(),
      unlockScroll: vi.fn(),
    });

    const root = mount.querySelector('.overlay');
    expect(root).not.toBeNull();
    expect(root.id).toBe('test-overlay');
    expect(root.classList.contains('overlay--drawer')).toBe(true);
    expect(root.hidden).toBe(true);
    expect(root.dataset.state).toBe('closed');
    expect(mount.querySelector('.overlay__scrim')).not.toBeNull();
    expect(overlay.panel.getAttribute('role')).toBe('dialog');
    expect(overlay.panel.getAttribute('aria-modal')).toBe('true');
    expect(overlay.panel.getAttribute('aria-label')).toBe('Test overlay');
    expect(overlay.isOpen()).toBe(false);
  });

  it('uses aria-labelledby instead of aria-label when a visible title id is given', () => {
    const overlay = createOverlay({ mount, id: 'lb', label: 'Fallback', labelledBy: 'lb-title', variant: 'modal' });
    expect(overlay.panel.getAttribute('aria-labelledby')).toBe('lb-title');
    expect(overlay.panel.hasAttribute('aria-label')).toBe(false);
  });

  it('marks the panel data-lenis-prevent so Lenis never swallows scroll inside it', () => {
    const overlay = createOverlay({ mount, id: 'lenis-check', label: 'L', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    expect(overlay.panel.hasAttribute('data-lenis-prevent')).toBe(true);
  });

  it('open() reveals the overlay, locks scroll, sets inert, and focuses the panel', () => {
    const lockScroll = vi.fn();
    const unlockScroll = vi.fn();
    const overlay = createOverlay({ mount, id: 'a', label: 'A', variant: 'drawer', lockScroll, unlockScroll });
    const button = document.createElement('button');
    button.textContent = 'inside';
    overlay.panel.appendChild(button);

    overlay.open();

    const root = mount.querySelector('.overlay');
    expect(overlay.isOpen()).toBe(true);
    expect(root.hidden).toBe(false);
    expect(root.dataset.state).toBe('open');
    expect(lockScroll).toHaveBeenCalledTimes(1);
    expect(main.hasAttribute('inert')).toBe(true);
    expect(header.hasAttribute('inert')).toBe(true);
    expect(footer.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('open() is a no-op when already open', () => {
    const lockScroll = vi.fn();
    const overlay = createOverlay({ mount, id: 'a', label: 'A', variant: 'drawer', lockScroll, unlockScroll: vi.fn() });
    overlay.open();
    overlay.open();
    expect(lockScroll).toHaveBeenCalledTimes(1);
  });

  it('close() restores focus, removes inert, unlocks scroll, and hides after the transition', () => {
    vi.useFakeTimers();
    const unlockScroll = vi.fn();
    const overlay = createOverlay({ mount, id: 'b', label: 'B', variant: 'drawer', lockScroll: vi.fn(), unlockScroll });
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    overlay.open(trigger);
    overlay.close();

    const root = mount.querySelector('.overlay');
    expect(overlay.isOpen()).toBe(false);
    expect(root.dataset.state).toBe('closed');
    expect(unlockScroll).toHaveBeenCalledTimes(1);
    expect(main.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(root.hidden).toBe(false);

    vi.advanceTimersByTime(450);
    expect(root.hidden).toBe(true);
  });

  it('calls onClose on every close path, after focus has returned to the trigger', () => {
    const seen = [];
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const overlay = createOverlay({
      mount, id: 'on-close', label: 'X', variant: 'detail', lockScroll: vi.fn(), unlockScroll: vi.fn(),
      onClose: () => seen.push({ open: overlay.isOpen(), focus: document.activeElement }),
    });

    overlay.open(trigger);
    overlay.close();
    overlay.open(trigger);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    overlay.close(); // already closed: no extra call

    expect(seen).toEqual([{ open: false, focus: trigger }, { open: false, focus: trigger }]);
    expect(mount.querySelector('#on-close').classList.contains('overlay--detail')).toBe(true);
  });

  it('calls onClose when another overlay opening closes it', () => {
    const onClose = vi.fn();
    const a = createOverlay({ mount, id: 'a2', label: 'A', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn(), onClose });
    const b = createOverlay({ mount, id: 'b2', label: 'B', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    a.open();
    b.open();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the root after a custom closeDurationMs', () => {
    vi.useFakeTimers();
    const overlay = createOverlay({ mount, id: 'slow', label: 'S', variant: 'detail', lockScroll: vi.fn(), unlockScroll: vi.fn(), closeDurationMs: 900 });
    overlay.open();
    overlay.close();
    const root = mount.querySelector('#slow');
    vi.advanceTimersByTime(450);
    expect(root.hidden).toBe(false);
    vi.advanceTimersByTime(450);
    expect(root.hidden).toBe(true);
  });

  it('close() is a no-op when already closed', () => {
    const unlockScroll = vi.fn();
    const overlay = createOverlay({ mount, id: 'b', label: 'B', variant: 'drawer', lockScroll: vi.fn(), unlockScroll });
    overlay.close();
    expect(unlockScroll).not.toHaveBeenCalled();
  });

  it('Escape closes the overlay', () => {
    const overlay = createOverlay({ mount, id: 'c', label: 'C', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    overlay.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(overlay.isOpen()).toBe(false);
  });

  it('clicking the scrim closes the overlay', () => {
    const overlay = createOverlay({ mount, id: 'd', label: 'D', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    overlay.open();
    mount.querySelector('.overlay__scrim').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.isOpen()).toBe(false);
  });

  it('only one overlay stays open at a time', () => {
    const overlayA = createOverlay({ mount, id: 'e1', label: 'E1', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    const overlayB = createOverlay({ mount, id: 'e2', label: 'E2', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: vi.fn() });

    overlayA.open();
    expect(overlayA.isOpen()).toBe(true);

    overlayB.open();
    expect(overlayA.isOpen()).toBe(false);
    expect(overlayB.isOpen()).toBe(true);
  });

  it('traps Tab at the last focusable element back to the first', () => {
    const overlay = createOverlay({ mount, id: 'f', label: 'F', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    const first = document.createElement('button');
    const last = document.createElement('button');
    overlay.panel.appendChild(first);
    overlay.panel.appendChild(last);
    overlay.open();

    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab at the first focusable element back to the last', () => {
    const overlay = createOverlay({ mount, id: 'g', label: 'G', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    const first = document.createElement('button');
    const last = document.createElement('button');
    overlay.panel.appendChild(first);
    overlay.panel.appendChild(last);
    overlay.open();

    first.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
  });

  it('focuses the panel itself when there are no focusable children', () => {
    const overlay = createOverlay({ mount, id: 'h', label: 'H', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    overlay.open();
    expect(document.activeElement).toBe(overlay.panel);
  });

  it('ignores non-Tab, non-Escape keys', () => {
    const overlay = createOverlay({ mount, id: 'i', label: 'I', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    overlay.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(overlay.isOpen()).toBe(true);
  });

  it('defaults the focus-return target to document.activeElement at open time when no trigger is given', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const overlay = createOverlay({ mount, id: 'j', label: 'J', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
    overlay.open();
    overlay.close();

    expect(document.activeElement).toBe(trigger);
  });

  describe('stacked overlays', () => {
    it('open(trigger, {stack: true}) keeps the currently open overlay open underneath', () => {
      const parent = createOverlay({ mount, id: 'parent-1', label: 'Parent', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      const child = createOverlay({ mount, id: 'child-1', label: 'Child', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });

      parent.open();
      child.open(undefined, { stack: true });

      expect(parent.isOpen()).toBe(true);
      expect(child.isOpen()).toBe(true);
    });

    it('makes the parent panel inert while the stacked child is open', () => {
      const parent = createOverlay({ mount, id: 'parent-2', label: 'Parent', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      const child = createOverlay({ mount, id: 'child-2', label: 'Child', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });

      parent.open();
      expect(parent.panel.hasAttribute('inert')).toBe(false);
      child.open(undefined, { stack: true });
      expect(parent.panel.hasAttribute('inert')).toBe(true);
    });

    it('restores the parent panel and keeps it open when the stacked child closes', () => {
      const parent = createOverlay({ mount, id: 'parent-3', label: 'Parent', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      const child = createOverlay({ mount, id: 'child-3', label: 'Child', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      const trigger = document.createElement('button');
      parent.panel.appendChild(trigger);

      parent.open();
      child.open(trigger, { stack: true });
      child.close();

      expect(parent.isOpen()).toBe(true);
      expect(parent.panel.hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(trigger);
    });

    it('does not unlock scroll or un-inert the page body while the parent is still open', () => {
      const unlockParent = vi.fn();
      const unlockChild = vi.fn();
      const parent = createOverlay({ mount, id: 'parent-4', label: 'Parent', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: unlockParent });
      const child = createOverlay({ mount, id: 'child-4', label: 'Child', variant: 'modal', lockScroll: vi.fn(), unlockScroll: unlockChild });

      parent.open();
      child.open(undefined, { stack: true });
      child.close();

      expect(unlockChild).not.toHaveBeenCalled();
      expect(main.hasAttribute('inert')).toBe(true);

      parent.close();
      expect(unlockParent).toHaveBeenCalledTimes(1);
      expect(main.hasAttribute('inert')).toBe(false);
    });

    it('falls back to a normal open when stack: true is requested but nothing else is open', () => {
      const solo = createOverlay({ mount, id: 'solo-1', label: 'Solo', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      expect(() => solo.open(undefined, { stack: true })).not.toThrow();
      expect(solo.isOpen()).toBe(true);
    });

    it('stack: true still closes other overlays when there is no meaningful parent relationship beyond one', () => {
      const a = createOverlay({ mount, id: 'multi-a', label: 'A', variant: 'drawer', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      const b = createOverlay({ mount, id: 'multi-b', label: 'B', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      a.open();
      b.open(undefined, { stack: true });
      expect(a.isOpen()).toBe(true);
      expect(b.isOpen()).toBe(true);
    });

    it('never removes inert that was already present on main for an unrelated reason', () => {
      main.setAttribute('inert', '');
      main.inert = true;

      const overlay = createOverlay({ mount, id: 'external-inert', label: 'X', variant: 'modal', lockScroll: vi.fn(), unlockScroll: vi.fn() });
      overlay.open();
      overlay.close();

      expect(main.hasAttribute('inert')).toBe(true);
      main.removeAttribute('inert');
      main.inert = false;
    });
  });
});
