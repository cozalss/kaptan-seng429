// Inks a pennant's cloth, its halyard and the mast on a Canvas 2D context. The hatch runs sit on the
// cloth's own iso-lines (bilinear inside each cell), so the shading bends and crowds as the cloth does.
// Allocation-free per frame: four strokes and one fill per pennant.

import { INK, brushRibbon, noise1 } from '../../../lib/ink3d/ink.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { clothV } from './pennants.js';

const HATCH_ALPHA = 0.82;

// Moves or draws the pen to cloth point (u, v).
function at(ctx, cloth, u, v, move) {
  const { cols, rows, w, sx, sy } = cloth;
  const fu = Math.min(cols - 1e-4, Math.max(0, u * cols));
  const fv = Math.min(rows - 1e-4, Math.max(0, v * rows));
  const c = Math.floor(fu);
  const r = Math.floor(fv);
  const s = fu - c;
  const t = fv - r;
  const i = r * w + c;
  const x = (sx[i] * (1 - s) + sx[i + 1] * s) * (1 - t) + (sx[i + w] * (1 - s) + sx[i + w + 1] * s) * t;
  const y = (sy[i] * (1 - s) + sy[i + 1] * s) * (1 - t) + (sy[i + w] * (1 - s) + sy[i + w + 1] * s) * t;
  if (move) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
}

// A vertical run (iso-u line): pen down at its ends and at every row line it crosses.
function runV(ctx, cloth, u, from, to) {
  at(ctx, cloth, u, from, true);
  for (let k = Math.floor(from * cloth.rows) + 1; k < to * cloth.rows; k += 1) at(ctx, cloth, u, k / cloth.rows, false);
  at(ctx, cloth, u, to, false);
}

// A horizontal run (level at rest y): pen down at its ends and at every column line it crosses.
function runH(ctx, cloth, y, from, to) {
  at(ctx, cloth, from, clothV(from, y), true);
  for (let k = Math.floor(from * cloth.cols) + 1; k < to * cloth.cols; k += 1) {
    const u = k / cloth.cols;
    at(ctx, cloth, u, clothV(u, y), false);
  }
  at(ctx, cloth, to, clothV(to, y), false);
}

function outline(ctx, cloth) {
  const { cols, rows, w, sx, sy } = cloth;
  ctx.moveTo(sx[0], sy[0]);
  for (let c = 1; c <= cols; c += 1) ctx.lineTo(sx[c], sy[c]);
  for (let r = 1; r <= rows; r += 1) ctx.lineTo(sx[r * w + cols], sy[r * w + cols]);
  for (let c = cols - 1; c >= 0; c -= 1) ctx.lineTo(sx[rows * w + c], sy[rows * w + c]);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('./cloth.js').createCloth>} cloth
 * @param {{ vertical: Float32Array, horizontal: Float32Array, bounds: Float32Array[] }} art
 * @param {number} scale  line-weight scale (1 on the desktop mast)
 * @param {number} furl   0 flying … 1 rolled on the halyard
 */
export function drawPennant(ctx, cloth, art, scale = 1, furl = 0) {
  ctx.beginPath();
  outline(ctx, cloth);
  ctx.fillStyle = INK.sheet;
  ctx.fill();

  ctx.beginPath();
  const { vertical, horizontal } = art;
  for (let k = 0; k < vertical.length; k += 3) runV(ctx, cloth, vertical[k], vertical[k + 1], vertical[k + 2]);
  for (let k = 0; k < horizontal.length; k += 3) runH(ctx, cloth, horizontal[k], horizontal[k + 1], horizontal[k + 2]);
  // a rolled pennant shows the pale back of its roll, not a black knot of hatching
  ctx.globalAlpha = HATCH_ALPHA * (1 - 0.8 * furl);
  ctx.lineWidth = 0.85 * scale;
  ctx.strokeStyle = INK.sumi;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  for (let b = 0; b < art.bounds.length; b += 1) {
    const line = art.bounds[b];
    for (let k = 0; k < line.length; k += 2) at(ctx, cloth, line[k], line[k + 1], k === 0);
  }
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  ctx.beginPath();
  outline(ctx, cloth);
  ctx.lineWidth = 1.35 * scale;
  ctx.stroke();
  // the heading: the roped hoist edge, a heavier stroke
  const { w, rows, sx, sy } = cloth;
  ctx.beginPath();
  ctx.moveTo(sx[0], sy[0]);
  ctx.lineTo(sx[rows * w], sy[rows * w]);
  ctx.lineWidth = 2.4 * scale;
  ctx.stroke();
  if (furl > 0.6) tie(ctx, cloth, (furl - 0.6) / 0.4, scale);
}

// Two turns of line round a rolled pennant.
function tie(ctx, cloth, alpha, scale) {
  const { w, cols, rows, sx, sy } = cloth;
  ctx.beginPath();
  for (let k = 1; k <= 2; k += 1) {
    const i = Math.round((rows * k) / 3) * w;
    ctx.moveTo(sx[i] - 1.5 * scale, sy[i] - 1);
    ctx.lineTo(sx[i + cols] + 1.5 * scale, sy[i + cols] + 1.5);
  }
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.6 * scale;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * The working halyard: from the truck, through each pennant's hoist, down to the foot block.
 * `ys` holds sorted (top, bottom) pairs of the hoists on the line; `count` of them are used.
 */
export function drawHalyard(ctx, x, top, base, ys, count, scale = 1) {
  ctx.beginPath();
  let y = top;
  for (let k = 0; k < count; k += 2) {
    if (ys[k] > y + 1) stillLine(ctx, x, y, x, ys[k], 11 + k, 0.35, true);
    y = Math.max(y, ys[k + 1]);
  }
  if (base > y + 1) stillLine(ctx, x, y, x, base, 31, 0.35, true);
  ctx.lineWidth = 0.9 * scale;
  ctx.strokeStyle = INK.sumi;
  ctx.stroke();
}

/**
 * The mast, inked once per size into its own layer: a brushed pole tapering to the truck, the truck,
 * the halyard's fall to a cleat, and a short deck stroke at the foot.
 * @param {CanvasRenderingContext2D} ctx  already scaled to CSS px
 */
export function drawMast(ctx, layout, { weight = 1, steps = 40 } = {}) {
  const { pole, halyard, top, base } = layout;
  const xs = new Float32Array(steps);
  const ys = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    ys[i] = top + (base + 6 - top) * t;
    xs[i] = pole + (noise1(t * 9 + 3) - 0.5) * 0.7 * weight;
  }
  ctx.fillStyle = INK.sumi;
  brushRibbon(ctx, xs, ys, 0, steps, (i) => weight * (1.7 + 2.1 * (i / (steps - 1)) * (0.85 + 0.3 * noise1(i * 0.7))));
  ctx.beginPath();
  ctx.arc(pole, top - 2.5 * weight, 2.8 * weight, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  stillLine(ctx, halyard - 3 * weight, top, pole + 2.6 * weight, base - 10 * weight, 5, 0.3, true);
  ctx.lineWidth = 0.7 * weight;
  ctx.strokeStyle = INK.sumi;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  stillLine(ctx, pole - 1.5 * weight, base - 10 * weight, pole + 6 * weight, base - 10 * weight, 7, 0.2, true);
  ctx.lineWidth = 1.6 * weight;
  ctx.stroke();
  ctx.beginPath();
  stillLine(ctx, pole - 8 * weight, base + 6, pole + 16 * weight, base + 6, 9, 0.5, true);
  ctx.lineWidth = 1.8 * weight;
  ctx.stroke();
}
