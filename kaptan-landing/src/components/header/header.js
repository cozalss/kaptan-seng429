// Header surface state: transparent (with a soft scrim) over the top of the hero, a near-solid
// blurred canvas with a hairline once the page has scrolled. Reads scroll once per frame at most.

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

  const update = () => {
    frame = 0;
    const next = isScrolledPast(win.scrollY, threshold);
    if (next === current) return;
    current = next;
    header.dataset.scrolled = String(next);
  };
  const onScroll = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };

  win.addEventListener('scroll', onScroll, { passive: true });
  update();
  return {
    destroy() {
      win.cancelAnimationFrame(frame);
      win.removeEventListener('scroll', onScroll);
    },
  };
}
