// Pure settings of the agent plates: the pixel density a plate is drawn at, and whether a 2D
// canvas is to be had at all.

/** Plates up to this many CSS px² may draw at 2×; larger ones stop at 1.5×. */
export const DENSE_MAX_AREA = 260_000;
export const MAX_DPR = 2;
export const MAX_DPR_LARGE = 1.5;

/**
 * @param {number} dpr   window.devicePixelRatio
 * @param {number} area  the plate's CSS px²
 */
export function sceneDpr(dpr, area) {
  const safe = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(safe, area > DENSE_MAX_AREA ? MAX_DPR_LARGE : MAX_DPR);
}

/** Whether a 2D canvas can be had (jsdom and very old engines cannot) — without asking jsdom for one. */
export function canDraw2D(win = globalThis.window) {
  if (!win || typeof win.CanvasRenderingContext2D !== 'function') return false;
  try {
    return Boolean(win.document.createElement('canvas').getContext('2d'));
  } catch {
    return false;
  }
}

/** Longest frame step the clock takes (a stalled tab resumes where it paused, not jumps). */
export const MAX_STEP_S = 0.1;

/** Advances a plate's clock by a rAF delta in ms, clamped. */
export function advance(elapsed, deltaMs) {
  if (!(deltaMs > 0)) return elapsed;
  return elapsed + Math.min(deltaMs / 1000, MAX_STEP_S);
}
