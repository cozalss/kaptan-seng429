// Önemlilik — what is weighed, drawn each frame: the purser's chest on the deck (flat washes,
// dry-brush hatching on its turned side, the company's slip on its front), the amount's weight
// with Okuyucu's paper tag "Tutar", and the two ledgers — "Yıllık gelir" and "Piyasa değeri" —
// as cloth-bound boxes with a paper label on the spine. Allocation-free per frame.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { DISPLAY, SANS } from '../fonts.js';
import { CAST } from './model.js';
import { fontCache } from './sprites.js';
import { BOOK, CHEST, WEIGHT } from './world.js';

const SHADE = Object.freeze({
  front: '#dde2e8',
  side: '#a4b0be', // the portraits' mid indigo wash (style bridge)
  inside: '#151a24',
  lid: '#97a4b4',
  strap: INK.indigo,
  weight: '#d9dde2',
  cloth: Object.freeze(['#2b4261', '#1d2c42']),
  pages: '#efeee8',
  shadow: 'rgba(43, 66, 97, 0.22)',
});
const STRAPS = Object.freeze([0.14, 0.86]);
const LIGHT_X = 0.42; // shadows fall a touch to the right and back (sun upper left)
const LIGHT_Z = -0.3;
export const SPINES = Object.freeze(['Yıllık gelir', 'Piyasa değeri']);

/** The box's corner order: index = ui + 2·vi + 4·wi (u across, v up, w toward the back). */
const FACE = Object.freeze({
  front: Object.freeze([0, 1, 3, 2]),
  left: Object.freeze([4, 0, 2, 6]),
  right: Object.freeze([1, 5, 7, 3]),
  top: Object.freeze([2, 3, 7, 6]),
});
const LEFT = Object.freeze([-1, 0, 0]);
const RIGHT = Object.freeze([1, 0, 0]);
const UP = Object.freeze([0, 1, 0]);

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createProps(ctx) {
  const tmp = new Float64Array(4);
  const xs = new Float32Array(10);
  const ys = new Float32Array(10);
  const corner = new Float64Array(8 * 3);
  const sans = fontCache(500, SANS);
  const small = fontCache(400, SANS);
  const display = fontCache(400, DISPLAY);
  const lidIdx = Object.freeze([6, 7, 9, 8]);

  /** Writes a box's eight world corners (bottom centre bx, by, bz; yaw about y) and projects them. */
  function box(frame, bx, by, bz, w, h, d, yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let i = 0; i < 8; i += 1) {
      const u = ((i & 1) - 0.5) * w;
      const v = (i >> 1) & 1 ? h : 0;
      const wz = (0.5 - ((i >> 2) & 1)) * d;
      const x = bx + c * u + s * wz;
      const z = bz - s * u + c * wz;
      corner[i * 3] = x;
      corner[i * 3 + 1] = by + v;
      corner[i * 3 + 2] = z;
      project(frame, x, by + v, z, tmp);
      xs[i] = tmp[0];
      ys[i] = tmp[1];
    }
  }

  function face(idx, fill, seed, width) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.fill();
    ctx.beginPath();
    stillOutline(ctx, xs, ys, idx, seed, 0.4);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  const visible = (frame, normal, i) => facesEye(frame, normal, corner[i * 3], corner[i * 3 + 1], corner[i * 3 + 2]);

  /** Dry-brush hatching over a quad (diagonal strokes, clipped). */
  function hatch(idx, seed, alpha, gap) {
    ctx.save();
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.clip();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < idx.length; k += 1) {
      const i = idx[k];
      minX = Math.min(minX, xs[i]);
      maxX = Math.max(maxX, xs[i]);
      minY = Math.min(minY, ys[i]);
      maxY = Math.max(maxY, ys[i]);
    }
    const h = maxY - minY;
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    let k = 0;
    for (let x = minX - h; x < maxX; x += gap) {
      stillLine(ctx, x, maxY, x + h * 0.6, minY, seed + k, 0.4, true);
      k += 1;
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The chest's ground shadow: its footprint pushed along the light. */
  function drawChestShadow(frame, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = SHADE.shadow;
    ctx.beginPath();
    const hw = CHEST.width / 2;
    const hd = CHEST.depth / 2;
    const reach = CHEST.height;
    project(frame, CHEST.x - hw, 0, CHEST.z + hd, tmp);
    ctx.moveTo(tmp[0], tmp[1]);
    project(frame, CHEST.x + hw, 0, CHEST.z + hd, tmp);
    ctx.lineTo(tmp[0], tmp[1]);
    project(frame, CHEST.x + hw + LIGHT_X * reach, 0, CHEST.z + hd + LIGHT_Z * reach, tmp);
    ctx.lineTo(tmp[0], tmp[1]);
    project(frame, CHEST.x + hw + LIGHT_X * reach, 0, CHEST.z - hd + LIGHT_Z * reach, tmp);
    ctx.lineTo(tmp[0], tmp[1]);
    project(frame, CHEST.x - hw + LIGHT_X * reach * 0.4, 0, CHEST.z - hd + LIGHT_Z * reach, tmp);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The chest: lid thrown back, dark inside, washed sides, iron straps, the company's slip. */
  function drawChest(frame, alpha, label) {
    box(frame, CHEST.x, 0, CHEST.z, CHEST.width, CHEST.height, CHEST.depth, 0);
    // the lid, hinged at the back edge of the top, thrown back past upright
    const lw = CHEST.depth;
    const ly = Math.sin(CHEST.lid) * lw;
    const lz = Math.cos(CHEST.lid) * lw;
    project(frame, corner[6 * 3], CHEST.height + ly, corner[6 * 3 + 2] + lz, tmp);
    xs[8] = tmp[0];
    ys[8] = tmp[1];
    project(frame, corner[7 * 3], CHEST.height + ly, corner[7 * 3 + 2] + lz, tmp);
    xs[9] = tmp[0];
    ys[9] = tmp[1];
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    face(lidIdx, SHADE.lid, 140, 1.4);
    hatch(lidIdx, 150, 0.18, 4);
    if (visible(frame, LEFT, 0)) {
      face(FACE.left, SHADE.side, 160, 1.4);
      hatch(FACE.left, 170, 0.24, 3.6);
    }
    if (visible(frame, RIGHT, 1)) {
      face(FACE.right, SHADE.side, 180, 1.4);
      hatch(FACE.right, 190, 0.24, 3.6);
    }
    face(FACE.top, SHADE.inside, 200, 1.4);
    face(FACE.front, SHADE.front, 210, 2);
    drawStraps();
    drawSlip(frame, alpha, label);
    ctx.globalAlpha = 1;
  }

  /** Two indigo iron straps across the front and over the rim. */
  function drawStraps() {
    ctx.strokeStyle = SHADE.strap;
    const [a, b, c, d] = FACE.front; // bottom-left, bottom-right, top-right, top-left
    const s = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]) / CHEST.width;
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let i = 0; i < STRAPS.length; i += 1) {
      const f = STRAPS[i];
      ctx.moveTo(xs[a] + (xs[b] - xs[a]) * f, ys[a] + (ys[b] - ys[a]) * f);
      ctx.lineTo(xs[d] + (xs[c] - xs[d]) * f, ys[d] + (ys[c] - ys[d]) * f);
    }
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK.sumi;
  }

  /** The company's slip pinned to the chest front: "ÖRNEK" over the rest of its name. */
  function drawSlip(frame, alpha, label) {
    const [a, b, c, d] = FACE.front;
    const cx = (xs[a] + xs[b] + xs[c] + xs[d]) / 4;
    const cy = (ys[a] + ys[b] + ys[c] + ys[d]) / 4;
    const faceW = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]);
    const faceH = Math.hypot(xs[d] - xs[a], ys[d] - ys[a]);
    const size = Math.max(8, Math.min(12, faceH * 0.2));
    const w = Math.min(faceW * 0.62, size * 7.5);
    const h = Math.max(faceH * 0.56, size * 2.7);
    const angle = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle - 0.02);
    ctx.fillStyle = INK.sheet;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK.sumi;
    ctx.beginPath();
    stillLine(ctx, -w / 2, -h / 2, w / 2, -h / 2, 220, 0.3, true);
    stillLine(ctx, w / 2, -h / 2, w / 2, h / 2, 221, 0.3, false);
    stillLine(ctx, w / 2, h / 2, -w / 2, h / 2, 222, 0.3, false);
    stillLine(ctx, -w / 2, h / 2, -w / 2, -h / 2, 223, 0.3, false);
    ctx.stroke();
    if (label.alpha > 0) {
      const issuer = CAST[label.weighing].issuer;
      const cut = issuer.indexOf(' ');
      ctx.globalAlpha = alpha * label.alpha;
      ctx.fillStyle = INK.sumi;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = sans(size);
      ctx.fillText(issuer.slice(0, cut), 0, -size * 0.6, w * 0.9);
      ctx.fillText(issuer.slice(cut + 1), 0, size * 0.6, w * 0.9);
    }
    ctx.restore();
  }

  /** The amount's weight: a bell with a knob, shaded on its right; Okuyucu's tag on a string. */
  function drawWeight(frame, alpha, base, scale, swing) {
    project(frame, base[0], base[1], base[2], tmp);
    const bx = tmp[0];
    const by = tmp[1];
    const s = tmp[3] * scale;
    const hb = WEIGHT.base * s;
    const H = WEIGHT.height * s;
    const shoulder = by - H * 0.72;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = SHADE.weight;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx - hb, by);
    ctx.bezierCurveTo(bx - hb, by - H * 0.38, bx - hb * 0.62, by - H * 0.5, bx - hb * 0.58, shoulder);
    ctx.quadraticCurveTo(bx, shoulder - H * 0.16, bx + hb * 0.58, shoulder);
    ctx.bezierCurveTo(bx + hb * 0.62, by - H * 0.5, bx + hb, by - H * 0.38, bx + hb, by);
    ctx.quadraticCurveTo(bx, by + hb * 0.36, bx - hb, by);
    ctx.closePath();
    ctx.fill();
    // shade: the right third in indigo dry-brush strokes (light from the upper left)
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = alpha * 0.3;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let k = 0; k < 4; k += 1) {
      const x = bx + hb * (0.32 + k * 0.2);
      stillLine(ctx, x, by + 2, x - hb * 0.3, shoulder, 600 + k, 0.4, true);
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = alpha;
    ctx.stroke();
    // a band turned round the waist, and the knob on a short neck
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(bx - hb * 0.86, by - H * 0.22);
    ctx.quadraticCurveTo(bx, by - H * 0.22 + hb * 0.28, bx + hb * 0.86, by - H * 0.22);
    ctx.stroke();
    const kr = Math.max(2.2, hb * 0.3);
    const ky = shoulder - H * 0.1 - kr;
    ctx.fillStyle = SHADE.weight;
    ctx.lineWidth = 1.3;
    ctx.fillRect(bx - kr * 0.4, ky, kr * 0.8, shoulder - ky);
    ctx.beginPath();
    ctx.moveTo(bx - kr * 0.4, shoulder - H * 0.06);
    ctx.lineTo(bx - kr * 0.4, ky);
    ctx.moveTo(bx + kr * 0.4, shoulder - H * 0.06);
    ctx.lineTo(bx + kr * 0.4, ky);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, ky - kr * 0.6, kr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawTag(bx, ky - kr * 0.6, tmp[3], swing, alpha);
    ctx.globalAlpha = 1;
  }

  /** Okuyucu's paper tag, hanging off the knob by a string, swinging as it is carried. */
  function drawTag(kx, ky, s, swing, alpha) {
    const size = Math.max(8.5, Math.min(13, s * 0.17));
    ctx.font = display(size);
    const w = ctx.measureText('Tutar').width + size * 1.1;
    const h = size * 1.55;
    const drop = Math.max(10, s * 0.16);
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(0.62 + swing);
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, drop);
    ctx.stroke();
    ctx.translate(0, drop);
    ctx.rotate(-0.62 - swing * 0.4);
    // a tag notched at its string end, hanging to the left of the knob
    ctx.fillStyle = INK.sheet;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-h * 0.45, -h / 2);
    ctx.lineTo(-w, -h / 2);
    ctx.lineTo(-w, h / 2);
    ctx.lineTo(-h * 0.45, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK.sumi;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Tutar', -h * 0.5, 0.5);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /** One ledger: a cloth-bound box with its page edge on the side and a labelled spine. */
  function drawBook(frame, alpha, k, base, thick, yaw) {
    box(frame, base[0], base[1], base[2], BOOK.width, thick, BOOK.depth, yaw);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    if (visible(frame, LEFT, 0)) {
      face(FACE.left, SHADE.pages, 400 + k, 1.2);
      pageLines(FACE.left, 3);
    }
    if (visible(frame, RIGHT, 1)) face(FACE.right, SHADE.pages, 410 + k, 1.2);
    if (visible(frame, UP, 2)) face(FACE.top, SHADE.cloth[k], 420 + k, 1.3);
    face(FACE.front, SHADE.cloth[k], 430 + k, 1.4);
    drawSpine(alpha, k);
    ctx.globalAlpha = 1;
  }

  /** Thin page lines along a page-edge face (between its bottom and top edges). */
  function pageLines(idx, n) {
    const [a, b, c, d] = idx; // bottom-back, bottom-front, top-front, top-back
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 1; i <= n; i += 1) {
      const f = i / (n + 1);
      ctx.moveTo(xs[a] + (xs[d] - xs[a]) * f, ys[a] + (ys[d] - ys[a]) * f);
      ctx.lineTo(xs[b] + (xs[c] - xs[b]) * f, ys[b] + (ys[c] - ys[b]) * f);
    }
    ctx.stroke();
    ctx.globalAlpha /= 0.5;
  }

  /** The spine's paper label, its title fitted (never under 8 px: the label grows to hold it). */
  function drawSpine(alpha, k) {
    const [a, b, c, d] = FACE.front;
    const cx = (xs[a] + xs[b] + xs[c] + xs[d]) / 4;
    const cy = (ys[a] + ys[b] + ys[c] + ys[d]) / 4;
    const faceW = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]);
    const faceH = Math.hypot(xs[d] - xs[a], ys[d] - ys[a]);
    const size = Math.max(8, Math.min(12, faceH * 0.5));
    const w = faceW * 0.74;
    const h = Math.max(faceH * 0.62, size + 3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(ys[b] - ys[a], xs[b] - xs[a]));
    ctx.fillStyle = INK.sheet;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = INK.sumi;
    ctx.font = small(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SPINES[k], 0, 0.5, w * 0.92);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  return { drawChestShadow, drawChest, drawWeight, drawBook };
}
