// Pure maths for the rule instruments (no DOM): value snapping, the ledger's session split, the
// balance beam's angle and its damped spring, the leak line's default shape, a seeded ink wobble.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Snaps to the step grid inside [min, max]; kills float noise (0.1 + 0.2). */
export function snap(value, { min, max, step }) {
  const steps = Math.round((clamp(value, min, max) - min) / step);
  return Number((min + steps * step).toFixed(6));
}

/** Linear map of `v` from [a0, a1] to [b0, b1]. */
export const map = (v, a0, a1, b0, b1) => b0 + ((v - a0) / (a1 - a0)) * (b1 - b0);

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Buyback per session as a share of the ten-session total (deterministic, sums to 1). */
export const SESSION_WEIGHTS = Object.freeze([0.06, 0.12, 0.08, 0.14, 0.1, 0.07, 0.13, 0.09, 0.11, 0.1]);

/** Running total after each of the ten sessions; the last entry equals `total`. */
export function cumulative(total, weights = SESSION_WEIGHTS) {
  let sum = 0;
  return weights.map((w, i) => {
    sum += w;
    return i === weights.length - 1 ? total : total * sum;
  });
}

/**
 * Beam tilt in degrees for an amount (% of revenue) against the threshold; + = amount pan down.
 * Like a real balance it tips as soon as one side is heavier (a `kick`), level only at equality.
 */
export function beamAngle(value, threshold = 10, { kick = 4.5, gain = 1, max = 12 } = {}) {
  const d = value - threshold;
  if (Math.abs(d) < 1e-9) return 0;
  return Math.sign(d) * Math.min(max, kick + Math.abs(d) * gain);
}

/** One semi-implicit Euler step of a damped spring; returns a new state. */
export function springStep({ x, v }, target, dt, k = 170, c = 11) {
  const nv = v + (k * (target - x) - c * v) * dt;
  return { x: x + nv * dt, v: nv };
}

export const settled = ({ x, v }, target, eps = 0.02) => Math.abs(x - target) < eps && Math.abs(v) < eps * 10;

/** Default course of the five-session line: fractions of the final rise, session 0 = 0. */
export const LEAK_SHAPE = Object.freeze([0, 0.18, 0.46, 0.34, 0.72, 1]);

/** The six points (session 0..5, % rise from session 0); drawn points override the shape. */
export function leakPoints(rise, drawn = []) {
  return LEAK_SHAPE.map((f, i) => {
    if (i === 0) return 0;
    if (i === LEAK_SHAPE.length - 1) return rise;
    return drawn[i] ?? Number((f * rise).toFixed(2));
  });
}

/** Mulberry32: tiny seeded PRNG so every ink wobble prints the same way each time. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hand-drawn polyline: each segment split once and nudged ±`amp` across its direction. */
export function inkPath(points, seed = 1, amp = 0.7) {
  const rand = rng(seed);
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const off = (rand() - 0.5) * 2 * amp;
    const mx = (x0 + x1) / 2 + (-(y1 - y0) / len) * off;
    const my = (y0 + y1) / 2 + ((x1 - x0) / len) * off;
    d += `Q${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}
