import { clamp } from './math.js';

/** Radius of a circle centred on (x, y) that covers a width × height viewport. */
export function coverRadius(x, y, width, height) {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}

/**
 * Scroll position at which a pinned horizontal track has moved `offset` px.
 * `travelShare` is the fraction of the pin's scroll length spent on the travel.
 */
export function pinScrollForOffset(offset, { start, end, travel, travelShare }) {
  if (travel <= 0) return start;
  const progress = clamp(offset / travel, 0, 1);
  return start + (end - start) * travelShare * progress;
}

/**
 * Where a ring of a viewBox (preserveAspectRatio "xMidYMid meet") lands on screen.
 * `box` is the SVG's client rect; returns the centre, radius and transform origin in px.
 */
export function ringFrame(box, view) {
  const scale = Math.min(box.width / view.width, box.height / view.height);
  const originX = (box.width - view.width * scale) / 2 + view.cx * scale;
  const originY = (box.height - view.height * scale) / 2 + view.cy * scale;
  return { scale, originX, originY, x: box.left + originX, y: box.top + originY, r: view.r * scale };
}
