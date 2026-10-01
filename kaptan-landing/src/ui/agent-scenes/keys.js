// The plate's letters (a · b · c) are HTML set over the canvas (legible at any plate size, ≥ 12 CSS
// px, read by the page's own type). A scene still draws each letter's hairline leader; instead of
// inking the letter it writes where the letter sits into a shared buffer, and the runtime
// (index.js) moves three small HTML keys there after every frame. No allocation per frame.

export const KEY_COUNT = 3;
export const KEY_STRIDE = 3; // x, y (CSS px from the plate's top-left), alpha

/** A buffer for the three letters' positions, every letter hidden. */
export function createKeyBuffer() {
  return new Float32Array(KEY_COUNT * KEY_STRIDE);
}

/**
 * Records letter `text` ('a' | 'b' | 'c') at (x, y) with `alpha` into `keys`.
 * @returns {boolean} false when there is no buffer (or no such letter): the scene inks it itself.
 */
export function placeKey(keys, text, x, y, alpha) {
  if (!keys) return false;
  const i = String(text).charCodeAt(0) - 97;
  if (!(i >= 0 && i < KEY_COUNT)) return false;
  const o = i * KEY_STRIDE;
  keys[o] = x;
  keys[o + 1] = y;
  keys[o + 2] = alpha;
  return true;
}
