// A class that stays on an element while something keeps poking it, and comes off `delay` ms
// after the last poke. The pinned strip wears `.is-scrolling` this way: hovers are
// switched off while the panels slide under a still mouse (see services.css).

const DEFAULT_DELAY_MS = 150;

/**
 * @param {{ el: Element, className: string, delay?: number, win?: Window }} options
 * @returns {{ poke: () => void, destroy: () => void }}
 */
export function createSettleFlag({ el, className, delay = DEFAULT_DELAY_MS, win = window }) {
  let timer = 0;
  const clear = () => {
    timer = 0;
    el.classList.remove(className);
  };
  return {
    poke() {
      if (!timer) el.classList.add(className);
      else win.clearTimeout(timer);
      timer = win.setTimeout(clear, delay);
    },
    destroy() {
      win.clearTimeout(timer);
      clear();
    },
  };
}
