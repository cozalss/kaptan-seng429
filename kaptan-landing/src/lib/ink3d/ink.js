// Ink primitives shared by the Canvas 2D ink scenes (the Pusula interlude, the agent scenes): the book's colours, a seeded wobble for
// hand-drawn lines, a tapered brush ribbon and small helpers. Canvas 2D only.

import { seededRandom } from './random.js';

export const INK = Object.freeze({
  paper: '#f3f1ec',
  sheet: '#fffefa',
  sumi: '#121318',
  indigo: '#2a4c8c',
  wash: '#d6dde9',
  north: '#b3261e',
  muted: '#45433e',
});

/** Cheap smooth 1D value noise in [0, 1], deterministic. */
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/**
 * A hand-ruled line: a few points along a→b nudged off the straight by up to `wobble` px.
 * @param {CanvasRenderingContext2D} ctx
 */
export function inkLine(ctx, ax, ay, bx, by, { width = 1, wobble = 0.6, random = Math.random, color = INK.sumi } = {}) {
  const steps = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 18));
  const nx = -(by - ay);
  const ny = bx - ax;
  const len = Math.hypot(nx, ny) || 1;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const off = i === 0 || i === steps ? 0 : (random() - 0.5) * 2 * wobble;
    const x = ax + (bx - ax) * t + (nx / len) * off;
    const y = ay + (by - ay) * t + (ny / len) * off;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** A hand-inked rectangle: four ruled sides that overshoot the corners a touch. */
export function inkRect(ctx, x, y, w, h, { width = 1.5, wobble = 0.5, overshoot = 0, seed = 1, color = INK.sumi } = {}) {
  const random = seededRandom(seed);
  const o = overshoot;
  inkLine(ctx, x - o * random(), y, x + w + o * random(), y, { width, wobble, random, color });
  inkLine(ctx, x + w, y - o * random(), x + w, y + h + o * random(), { width, wobble, random, color });
  inkLine(ctx, x + w + o * random(), y + h, x - o * random(), y + h, { width, wobble, random, color });
  inkLine(ctx, x, y + h + o * random(), x, y - o * random(), { width, wobble, random, color });
}

/**
 * Fills a tapered brush ribbon along a polyline (xs, ys typed arrays, [from, to) indices).
 * `width(i)` gives the full width at point i. Allocation-free.
 * @param {CanvasRenderingContext2D} ctx
 */
export function brushRibbon(ctx, xs, ys, from, to, width) {
  const n = to - from;
  if (n < 2) return;
  ctx.beginPath();
  for (let pass = 0; pass < 2; pass += 1) {
    const side = pass === 0 ? 1 : -1;
    for (let k = 0; k < n; k += 1) {
      const i = pass === 0 ? from + k : to - 1 - k;
      const i0 = Math.max(i - 1, from);
      const i1 = Math.min(i + 1, to - 1);
      let tx = xs[i1] - xs[i0];
      let ty = ys[i1] - ys[i0];
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const half = width(i) * 0.5 * side;
      const x = xs[i] - ty * half;
      const y = ys[i] + tx * half;
      if (pass === 0 && k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

/** A canvas (DOM or offscreen) of a pixel size. */
export function makeCanvas(doc, width, height) {
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}
