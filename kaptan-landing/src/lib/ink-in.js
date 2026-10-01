// The page's one reveal verb: a caption panel marked [data-ink-in] inks itself in (book.css) the
// first time it comes into view. Without IntersectionObserver every panel is shown at once.

const SELECTOR = '[data-ink-in]';
const INKED = 'is-inked';

/**
 * @param {{ root?: ParentNode, win?: Window, rootMargin?: string }} [options]
 * @returns {{ destroy: () => void }}
 */
export function initInkIn({ root = document, win = window, rootMargin = '0px 0px -12% 0px' } = {}) {
  const panels = [...root.querySelectorAll(SELECTOR)];
  if (!('IntersectionObserver' in win)) {
    panels.forEach((panel) => panel.classList.add(INKED));
    return { destroy() {} };
  }
  const observer = new win.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add(INKED);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin },
  );
  panels.forEach((panel) => observer.observe(panel));
  return { destroy: () => observer.disconnect() };
}
