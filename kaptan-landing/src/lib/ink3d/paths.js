// Path helpers for ink scenes drawn every frame. Unlike ink.js's inkLine (seeded by a random
// generator, fine for sprites inked once), these wobble by value noise keyed to a fixed seed, so a
// line redrawn every frame from a moving camera keeps the same hand-made kinks. Allocation-free.

import { noise1 } from './ink.js';

/**
 * Adds a hand-ruled segment a→b to the current path: `steps` points nudged sideways by up to
 * `wobble` px, the same kinks for the same seed. Call ctx.beginPath()/stroke() around it.
 * @param {CanvasRenderingContext2D} ctx
 */
export function stillLine(ctx, ax, ay, bx, by, seed = 0, wobble = 0.6, move = true) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const steps = Math.min(8, Math.max(2, Math.round(len / 22)));
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  if (move) ctx.moveTo(ax, ay);
  else ctx.lineTo(ax, ay);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const off = i === steps ? 0 : (noise1(seed * 7.13 + i * 1.37) - 0.5) * 2 * wobble;
    ctx.lineTo(ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off);
  }
}

/**
 * Adds the closed polygon through projected points `idx` (indices into xs/ys) to the path.
 * @param {CanvasRenderingContext2D} ctx
 */
export function polyPath(ctx, xs, ys, idx) {
  ctx.moveTo(xs[idx[0]], ys[idx[0]]);
  for (let k = 1; k < idx.length; k += 1) ctx.lineTo(xs[idx[k]], ys[idx[k]]);
  ctx.closePath();
}

/**
 * Outlines the closed polygon through `idx` with hand-ruled sides (seeded per side).
 * @param {CanvasRenderingContext2D} ctx
 */
export function stillOutline(ctx, xs, ys, idx, seed = 0, wobble = 0.5) {
  for (let k = 0; k < idx.length; k += 1) {
    const a = idx[k];
    const b = idx[(k + 1) % idx.length];
    stillLine(ctx, xs[a], ys[a], xs[b], ys[b], seed + k * 3.1, wobble, true);
  }
}

/**
 * Whether a face with outward `normal` through world point p is turned toward the eye.
 * @param {{ eye: number[] }} frame
 */
export function facesEye(frame, normal, px, py, pz) {
  return normal[0] * (frame.eye[0] - px) + normal[1] * (frame.eye[1] - py) + normal[2] * (frame.eye[2] - pz) > 0;
}
