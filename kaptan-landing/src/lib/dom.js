// Shared DOM helpers for the components (the overlay UI keeps its own hyperscript helper).

/**
 * Creates an element with an optional class and text. Text always goes through textContent,
 * never innerHTML, so data can never be parsed as markup.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Selector for an open drawer or modal (overlays set data-state="open" on their root). */
export const OPEN_OVERLAY_SELECTOR = '.overlay[data-state="open"]';

/** True while any drawer or modal is open. */
export function isOverlayOpen(root = document) {
  return root.querySelector(OPEN_OVERLAY_SELECTOR) !== null;
}
