// Drawer/modal overlay primitive: single-open registry (with an opt-in
// "stacked" mode for an overlay opened from inside another), Escape + scrim
// to close, a trapped focus loop, `inert` on the rest of the page, and a
// data-state driven CSS transition (see overlays.css).

import { h } from './dom.js';

const CLOSE_TRANSITION_MS = 450;
const noop = () => {};
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Every overlay instance created on the page registers itself here so that
// opening one can close (or, when stacked, partially guard) any others.
const registry = new Set();

function getFocusableElements(panel) {
  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
}

function getGuardedElements() {
  return [document.getElementById('main'), document.querySelector('.site-header'), document.querySelector('.site-footer')];
}

// setInert() is shared by every overlay instance and reference-counts its own
// requests per element (module-scoped, so it survives across instances):
// two overlays guarding the same <main> — a parent drawer and a stacked
// child modal — must both release it before it actually clears. It also
// remembers whether an element was *already* inert for some other reason
// (a loader, another subsystem) before this module ever touched it, and
// never clears that: an overlay must only ever undo the inert state *it*
// added, never one it didn't.
const inertRequestCounts = new WeakMap();
const preExistingInert = new WeakSet();

function setInert(elements, isInert) {
  for (const element of elements) {
    if (!element) continue;
    if (isInert) {
      const count = inertRequestCounts.get(element) ?? 0;
      if (count === 0 && element.hasAttribute('inert')) preExistingInert.add(element);
      inertRequestCounts.set(element, count + 1);
      element.inert = true;
      element.setAttribute('inert', '');
    } else {
      const count = Math.max(0, (inertRequestCounts.get(element) ?? 0) - 1);
      inertRequestCounts.set(element, count);
      if (count > 0) continue;
      if (preExistingInert.has(element)) {
        preExistingInert.delete(element);
        continue; // something else still wants this element inert
      }
      element.inert = false;
      element.removeAttribute('inert');
    }
  }
}

function focusFirst(panel) {
  const focusable = getFocusableElements(panel);
  (focusable[0] ?? panel).focus({ preventScroll: true });
}

function trapFocus(panel, event) {
  const focusable = getFocusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * @param {{mount: Element, id: string, label: string, labelledBy?: string, variant: 'drawer'|'modal'|'detail', lockScroll?: Function, unlockScroll?: Function, onClose?: Function, closeDurationMs?: number}} options
 * `labelledBy` is the id of the panel's own visible title (an <h2 id>); when
 * given, the dialog is named by it via aria-labelledby, so the accessible
 * name always matches what sighted users read. `label` is the aria-label
 * fallback for panels without a visible title (e.g. the menu drawer).
 * `onClose` runs synchronously on every close — button, Escape, scrim, or
 * another overlay taking over — after the dialog state has flipped, so a
 * panel that drives its own (JS) exit animation can start it; that panel
 * passes a `closeDurationMs` long enough for it before the root is hidden.
 * @returns {{
 *   panel: HTMLElement,
 *   open: (trigger?: Element, options?: {stack?: boolean}) => void,
 *   close: () => void,
 *   isOpen: () => boolean,
 * }} `open(trigger, { stack: true })` keeps whichever overlay is currently
 * open underneath (it stays visible and reachable in the DOM, but is made
 * `inert` for the duration) instead of closing it — used for an overlay
 * opened from inside another (e.g. a modal opened from a link inside the demo drawer),
 * where the parent should still be there when the child closes.
 */
export function createOverlay({
  mount,
  id,
  label,
  labelledBy,
  variant = 'drawer',
  lockScroll = noop,
  unlockScroll = noop,
  onClose = noop,
  closeDurationMs = CLOSE_TRANSITION_MS,
}) {
  let isOpenState = false;
  let triggerEl = null;
  let stackParent = null;
  let closeTimeoutId = null;

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') trapFocus(panel, event);
  }

  function otherOpenOverlays() {
    return [...registry].filter((overlay) => overlay !== instance && overlay.isOpen());
  }

  function beginOpen(trigger, stack) {
    const activeBeforeOpen = document.activeElement;
    triggerEl = trigger ?? activeBeforeOpen ?? null;
    stackParent = stack ? (otherOpenOverlays()[0] ?? null) : null;
    if (!stack) {
      for (const overlay of otherOpenOverlays()) overlay.close();
    }
  }

  function open(trigger, { stack = false } = {}) {
    if (isOpenState) return;
    beginOpen(trigger, stack);
    clearTimeout(closeTimeoutId);
    root.hidden = false;
    // Force a reflow so the browser paints the "closed" position before we
    // flip to "open", otherwise the transition never plays.
    void root.offsetHeight;
    root.dataset.state = 'open';
    isOpenState = true;
    const guarded = stackParent ? [...getGuardedElements(), stackParent.panel] : getGuardedElements();
    setInert(guarded, true);
    lockScroll();
    document.addEventListener('keydown', handleKeydown, true);
    focusFirst(panel);
  }

  function returnFocus() {
    const returnFocusTo = triggerEl;
    triggerEl = null;
    if (returnFocusTo && typeof returnFocusTo.focus === 'function') {
      // preventScroll: the trigger may sit in a pinned or off-screen area.
      returnFocusTo.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    root.dataset.state = 'closed';
    document.removeEventListener('keydown', handleKeydown, true);

    // Release exactly the elements (and only as many times) as open() added
    // — setInert() is reference-counted, so main/header/footer stay inert
    // for as long as a stacked parent overlay (or anything else) still
    // needs them, and this only ever undoes inert state this call added.
    const guarded = stackParent ? [...getGuardedElements(), stackParent.panel] : getGuardedElements();
    setInert(guarded, false);
    stackParent = null;

    // Scroll lock is a single page-level toggle, not per-element, so it only
    // unlocks once nothing else is open beneath this overlay.
    if (otherOpenOverlays().length === 0) {
      unlockScroll();
    }

    clearTimeout(closeTimeoutId);
    closeTimeoutId = setTimeout(() => {
      root.hidden = true;
    }, closeDurationMs);
    returnFocus();
    onClose();
  }

  const panel = h('div', {
    class: 'overlay__panel',
    role: 'dialog',
    'aria-modal': 'true',
    ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label }),
    tabindex: '-1',
    // The page runs Lenis smooth-scroll; without this, wheel/touch scrolling
    // inside a panel is swallowed while Lenis is stopped for the overlay.
    'data-lenis-prevent': '',
  });
  const scrim = h('div', { class: 'overlay__scrim', 'aria-hidden': 'true' });
  const root = h('div', { class: `overlay overlay--${variant}`, id, 'data-state': 'closed', hidden: true }, scrim, panel);
  scrim.addEventListener('click', close);
  mount.appendChild(root);

  const instance = { panel, open, close, isOpen: () => isOpenState };
  registry.add(instance);
  return instance;
}
