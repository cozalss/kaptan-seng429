// Keeps keyboard focus from falling to <body>. Lazy chapters build their scroll pins only when the
// reader arrives (e.g. the Sancak Tezgâhı show in #olaylar), and GSAP pins wrap (and on every
// ScrollTrigger.refresh, unwrap and re-wrap) the section in a pin-spacer: the focused element is
// detached and re-inserted, which silently drops focus to <body> — no ring, and the next Tab
// restarts from wherever the browser guesses. When focus is lost that way it is handed straight
// back, without scrolling. A blur the reader caused is left alone: a pointer press, or a key whose
// own default action moved focus (e.g. Tab past the last control, out of the page).

/** A pointer press this recent explains a blur (clicking empty paper legitimately blurs). */
export const POINTER_GRACE_MS = 400;

/**
 * Pure: should focus be handed back to `target`?
 * @param {{active: Element|null, body: Element|null, target: Element|null, connected: boolean,
 *   focusable: boolean, sincePointerMs: number, hasFocus?: boolean, byKey?: boolean}} input
 *   `byKey`: the blur happened inside a key press's default action
 */
export function shouldRestoreFocus({ active, body, target, connected, focusable, sincePointerMs, hasFocus = true, byKey = false }) {
  if (!target || target === body) return false;
  if (byKey) return false; // the reader moved focus themselves (Tab out of the page)
  if (!hasFocus) return false; // focus left the page (browser chrome, another window)
  if (active && active !== body) return false; // focus went somewhere on purpose
  if (sincePointerMs < POINTER_GRACE_MS) return false;
  return connected && focusable;
}

/** Still able to take focus: not disabled, not inert, rendered and visible. */
export function isStillFocusable(element) {
  if (!element?.isConnected || element.disabled || element.closest?.('[inert]')) return false;
  if (typeof element.checkVisibility === 'function') return element.checkVisibility({ checkVisibilityCSS: true });
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * @param {{doc?: Document, now?: () => number, defer?: (fn: () => void) => void,
 *   later?: (fn: () => void) => void}} [options]
 * @returns {() => void} uninstall
 */
export function installFocusGuard({
  doc = document,
  now = () => performance.now(),
  defer = (fn) => queueMicrotask(fn),
  later = (fn) => setTimeout(fn, 0),
} = {}) {
  let lastPointer = -Infinity;
  let keysPending = 0;
  const onPointer = () => {
    lastPointer = now();
  };
  // A key's default action (moving focus) runs after its keydown listeners, in the same task;
  // the mark is cleared on the next task.
  const onKey = () => {
    keysPending += 1;
    later(() => {
      keysPending -= 1;
    });
  };
  const onFocusOut = (event) => {
    const target = event.target;
    if (event.relatedTarget || !(target instanceof Element)) return;
    const byKey = keysPending > 0;
    // a re-parent re-inserts the element later in the same task: judge once that is done
    defer(() => {
      const restore = shouldRestoreFocus({
        active: doc.activeElement,
        body: doc.body,
        target,
        connected: target.isConnected,
        focusable: isStillFocusable(target),
        sincePointerMs: now() - lastPointer,
        hasFocus: typeof doc.hasFocus === 'function' ? doc.hasFocus() : true,
        byKey,
      });
      if (restore) target.focus({ preventScroll: true });
    });
  };
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('focusout', onFocusOut, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointer, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('focusout', onFocusOut, true);
  };
}
