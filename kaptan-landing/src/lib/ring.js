// Geometry of the compass ring in the KAPtan wordmark (#kaptan-logo: ellipse rx 26.5, ry 27.5).
// The cursor lens and the ritual window reuse its proportions so every "O" on the page matches.

export const LOGO_RING = Object.freeze({ rx: 26.5, ry: 27.5 });

/**
 * Dispatched on the hero zoom wrapper for every drawn lens frame. detail: `{ x, y, rx, ry, zoom }`
 * in the wrapper's untransformed px (ellipse centre, on-parent radii, magnification), or null
 * once the lens has closed. The hero WebGL layer draws the lens from it.
 */
export const LENS_FRAME_EVENT = 'hero:lens-frame';

/** Width × height of a ring `height` px tall with the logo proportions (0 × 0 for bad input). */
export function ringBox(height, ring = LOGO_RING) {
  if (!Number.isFinite(height) || height <= 0) return { width: 0, height: 0 };
  return { width: (height * ring.rx) / ring.ry, height };
}

/**
 * Where the magnifying lens sits inside a layer whose parent is scaled on screen (the hero
 * push-in). The lens layer is drawn with `transform-origin: 0 0; translate(tx, ty) scale(magnify)`
 * and `clip-path: ellipse(rx ry at x y)`, all in the parent's untransformed px.
 * @param {{ pointer: {x: number, y: number}, rect: {left: number, top: number, width: number},
 *   localWidth: number, radius: {rx: number, ry: number}, magnify: number }} input
 *   `rect` is the parent's client rect, `localWidth` its layout width, `radius` the on-screen ring.
 */
export function lensFrame({ pointer, rect, localWidth, radius, magnify }) {
  const scale = localWidth > 0 && rect.width > 0 ? rect.width / localWidth : 1;
  const zoom = magnify > 0 ? magnify : 1;
  const x = (pointer.x - rect.left) / scale;
  const y = (pointer.y - rect.top) / scale;
  return {
    x,
    y,
    rx: radius.rx / (scale * zoom),
    ry: radius.ry / (scale * zoom),
    tx: x * (1 - zoom),
    ty: y * (1 - zoom),
  };
}
