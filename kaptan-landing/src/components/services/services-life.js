// Idle life in the Tayfa chapter: the portraits' small loops (rain, a glint, a reading rule, a
// lantern's flicker — services.css) run only while the chapter is on screen. One
// IntersectionObserver toggles `.is-live` on the section; CSS pauses every loop without it.

/**
 * @param {{ section: Element, win?: Window }} options
 * @returns {() => void} undo
 */
export function initServicesLife({ section, win = window }) {
  if (!section || typeof win.IntersectionObserver !== 'function') return () => {};
  const observer = new win.IntersectionObserver((entries) => {
    section.classList.toggle('is-live', entries[entries.length - 1].isIntersecting);
  });
  observer.observe(section);
  return () => {
    observer.disconnect();
    section.classList.remove('is-live');
  };
}

/** Each panel's centre along the strip (px), for the in-frame parallax (`--cx`). */
export function measurePanelCentres(items) {
  items.forEach((item) => {
    item.style.setProperty('--cx', `${Math.round(item.offsetLeft + item.offsetWidth / 2)}px`);
  });
}
