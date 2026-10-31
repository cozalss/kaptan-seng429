// Header surface state: transparent (with a soft scrim) over the top of the hero, a near-solid
// blurred canvas with a hairline once the page has scrolled. Writes at most once per frame, on a change.

export const SCROLLED_THRESHOLD_PX = 40;

/** @param {number} scrollY @param {number} [threshold] @returns {boolean} */
export function isScrolledPast(scrollY, threshold = SCROLLED_THRESHOLD_PX) {
  return Number.isFinite(scrollY) && scrollY > threshold;
}

/**
 * Keeps `data-scrolled` on the header in sync with the scroll position.
 * @param {{header: HTMLElement | null, threshold?: number, win?: Window}} options
 * @returns {{destroy: () => void}}
 */
export function initHeaderState({ header, threshold = SCROLLED_THRESHOLD_PX, win = window }) {
  if (!header) return { destroy() {} };
  let frame = 0;
  let current = null;
  let wanted = null;

  const update = () => {
    frame = 0;
    if (wanted === current) return;
    current = wanted;
    header.dataset.scrolled = String(current);
  };
  // Read in the scroll event, where layout is still clean: read inside the frame, after the scroll
  // animations had written their styles, it forced an extra style and layout pass every frame.
  const read = () => {
    wanted = isScrolledPast(win.scrollY, threshold);
  };
  const onScroll = () => {
    read();
    if (!frame && wanted !== current) frame = win.requestAnimationFrame(update);
  };

  win.addEventListener('scroll', onScroll, { passive: true });
  read();
  update();
  return {
    destroy() {
      win.cancelAnimationFrame(frame);
      win.removeEventListener('scroll', onScroll);
    },
  };
}
