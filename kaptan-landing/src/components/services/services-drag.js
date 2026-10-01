// Mouse drag gesture for the pinned service track. Pure DOM (no GSAP) so it can be unit tested.
// A drag past the threshold swallows the click that ends it; the flag is cleared on the next
// pointerdown and one task after pointerup, so a release outside the track never eats a later click.

const DEFAULT_THRESHOLD_PX = 6;

/** Adds [type, handler, options] listeners; returns a function that removes them again. */
function listen(target, entries) {
  entries.forEach(([type, handler, options]) => target.addEventListener(type, handler, options));
  return () => entries.forEach(([type, handler, options]) => target.removeEventListener(type, handler, options));
}

/**
 * @param {{
 *   pin: HTMLElement,
 *   canStart?: (event: PointerEvent) => boolean,
 *   onStart?: () => unknown,
 *   onDrag: (dx: number, context: unknown) => void,
 *   threshold?: number,
 *   win?: Window,
 * }} options
 * @returns {() => void} removes every listener.
 */
export function createDragGesture({ pin, canStart = () => true, onStart = () => null, onDrag, threshold = DEFAULT_THRESHOLD_PX, win = window }) {
  let drag = null;
  let suppressClick = false;
  let resetTimer = 0;
  let detach = () => {};

  const end = (keepSuppression) => {
    suppressClick = keepSuppression && Boolean(drag?.active);
    drag = null;
    pin.classList.remove('is-dragging');
    detach();
  };
  const onMove = (event) => {
    const dx = event.clientX - drag.x;
    if (!drag.active && Math.abs(dx) < threshold) return;
    drag.active = true;
    pin.classList.add('is-dragging');
    onDrag(dx, drag.context);
  };
  const onUp = () => {
    end(true);
    win.clearTimeout(resetTimer);
    // The click (if any) is dispatched in the same task as pointerup, before this runs.
    resetTimer = win.setTimeout(() => {
      suppressClick = false;
    }, 0);
  };
  const onDown = (event) => {
    suppressClick = false;
    win.clearTimeout(resetTimer);
    if (drag || event.pointerType !== 'mouse' || event.button !== 0 || !canStart(event)) return;
    drag = { x: event.clientX, active: false, context: onStart() };
    detach = listen(win, [['pointermove', onMove], ['pointerup', onUp], ['pointercancel', () => end(false)]]);
  };
  const onClick = (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const unbindPin = listen(pin, [
    ['pointerdown', onDown],
    ['click', onClick, true],
    ['dragstart', (event) => event.preventDefault()],
  ]);
  return () => {
    win.clearTimeout(resetTimer);
    end(false);
    unbindPin();
  };
}
