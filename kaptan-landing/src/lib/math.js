const SNAP_EPSILON = 1e-4;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Normalises `value` from [start, end] into [0, 1], clamped. */
export function mapRange(value, start, end) {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp((value - start) / (end - start), 0, 1);
}

export const easeInCubic = (t) => t * t * t;
export const easeInQuart = (t) => t * t * t * t;

/** Frame-rate independent exponential smoothing (lambda ≈ responsiveness per second). */
export function damp(current, target, lambda, dt) {
  const next = current + (target - current) * (1 - Math.exp(-lambda * dt));
  return Math.abs(target - next) < SNAP_EPSILON ? target : next;
}

/**
 * Per-item progress for a left-to-right stagger: item 0 starts first, the last
 * item starts after `spread` of the overall progress. All items finish at 1.
 */
export function staggerProgress(progress, index, count, spread) {
  if (count <= 1) return clamp(progress, 0, 1);
  const offset = (index / (count - 1)) * spread;
  return mapRange(progress, offset, offset + (1 - spread));
}
