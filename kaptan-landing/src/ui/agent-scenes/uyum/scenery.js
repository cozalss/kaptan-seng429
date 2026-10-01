// Uyum — the fixed props of the diorama, inked per frame from world points laid out once: the
// sealed box (a crate with a slotted, grilled lid, a seal on a string and the "Emir: 0" plaque),
// the slanted reading desk, the hanging lantern (its flame is the plate's one north-red mark, as in
// the portrait), the ship's rail behind and the bottle the note came in. Flat washes, dry-brush
// hatching on turned faces, hand-ruled edges. Nothing here allocates per frame.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { DISPLAY, SANS } from '../fonts.js';
import { BOTTLE, BOX, BOX_AXES, DESK, LANTERN, RAIL, boxPoint } from './world.js';

export const SHADE = Object.freeze({
  front: '#dde2e8',
  side: '#a4b0be', // the portraits' mid indigo wash (style bridge)
  cap: '#f0efea',
  slot: '#101216',
  board: '#e3e5e6',
  shadow: 'rgba(43, 66, 97, 0.22)',
});
const LIGHT = Object.freeze([0.62, -1, -0.42]); // sun from the upper left, behind the viewer
const GRILLE_BARS = 5;
const RAYS = 9;
const DASH = Object.freeze([4, 4]);
const NO_DASH = Object.freeze([]);

/** The box's world points (box coordinates → world), with index tables for drawing. */
function layoutBox() {
  const points = [];
  const add = (u, v, w) => {
    points.push(...boxPoint(u, v, w));
    return points.length / 3 - 1;
  };
  const { width: W, height: H, depth: D, slot } = BOX;
  const corner = [];
  for (let wi = 0; wi < 2; wi += 1) for (let vi = 0; vi < 2; vi += 1) for (let ui = 0; ui < 2; ui += 1) corner.push(add(ui * W, vi * H, -wi * D));
  const c = (ui, vi, wi) => corner[ui + 2 * vi + 4 * wi];
  const faces = {
    front: [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)],
    left: [c(0, 0, 1), c(0, 0, 0), c(0, 1, 0), c(0, 1, 1)],
    right: [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)],
    cap: [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
  };
  const su0 = W / 2 - slot.half;
  const su1 = W / 2 + slot.half;
  const sw0 = -D / 2 + slot.width / 2;
  const sw1 = -D / 2 - slot.width / 2;
  const lid = H + 0.003;
  const slotQuad = [add(su0, lid, sw0), add(su1, lid, sw0), add(su1, lid, sw1), add(su0, lid, sw1)];
  const bars = [];
  for (let b = 1; b <= GRILLE_BARS; b += 1) {
    const u = su0 + ((su1 - su0) * b) / (GRILLE_BARS + 1);
    bars.push(add(u, lid + 0.002, sw0 + 0.02), add(u, lid + 0.002, sw1 - 0.02));
  }
  // planks across the front, a seal on a string, the counter plaque
  const planks = [add(0, H / 3, 0.002), add(W, H / 3, 0.002), add(0, (2 * H) / 3, 0.002), add(W, (2 * H) / 3, 0.002)];
  const sealU = 0.4;
  const string = [add(sealU, H, -0.3), add(sealU, H, 0.004), add(sealU, H - 0.2, 0.006)];
  const seal = add(sealU, H - 0.26, 0.012);
  const sealEdge = add(sealU + 0.085, H - 0.26, 0.012);
  const tails = [add(sealU - 0.05, H - 0.44, 0.008), add(sealU + 0.07, H - 0.46, 0.008)];
  const pl0 = W - 0.82;
  const pl1 = W - 0.12;
  const pv0 = 0.3;
  const pv1 = 0.8;
  const plaque = [add(pl0, pv0, 0.006), add(pl1, pv0, 0.006), add(pl1, pv1, 0.006), add(pl0, pv1, 0.006)];
  const label = add((pl0 + pl1) / 2, (pv0 + pv1) / 2, 0.006);
  const centre = add(W / 2, H / 2, -D / 2);
  return { points: new Float64Array(points), corner, faces, slotQuad, bars, planks, string, seal, sealEdge, tails, plaque, label, centre };
}

/** The desk's world points: board (front and back faces), ledge, post and foot. */
function layoutDesk() {
  const { centre: C, right: A, up: B, normal: N, halfW, halfH, thick } = DESK;
  const points = [];
  const add = (x, y, z) => {
    points.push(x, y, z);
    return points.length / 3 - 1;
  };
  const at = (a, b, n) => add(C[0] + A[0] * a + B[0] * b + N[0] * n, C[1] + A[1] * a + B[1] * b + N[1] * n, C[2] + A[2] * a + B[2] * b + N[2] * n);
  const board = [at(-halfW, -halfH, 0), at(halfW, -halfH, 0), at(halfW, halfH, 0), at(-halfW, halfH, 0)];
  const back = [at(-halfW, -halfH, -thick), at(halfW, -halfH, -thick), at(halfW, halfH, -thick), at(-halfW, halfH, -thick)];
  const ledge = [at(-halfW - 0.03, -halfH + 0.01, 0.01), at(halfW + 0.03, -halfH + 0.01, 0.01), at(halfW + 0.03, -halfH - 0.02, 0.1), at(-halfW - 0.03, -halfH - 0.02, 0.1)];
  const top = at(0, -0.1, -thick);
  const fx = C[0] - N[0] * 0.25;
  const fz = C[2] - N[2] * 0.25;
  const foot = add(fx, 0, fz);
  const feet = [add(fx - A[0] * 0.42, 0, fz - A[2] * 0.42), add(fx + A[0] * 0.42, 0, fz + A[2] * 0.42), add(fx + N[0] * 0.38, 0, fz + N[2] * 0.38), add(fx - N[0] * 0.3, 0, fz - N[2] * 0.3)];
  return { points: new Float64Array(points), board, back, ledge, top, foot, feet };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createScenery(ctx) {
  const box = layoutBox();
  const desk = layoutDesk();
  const boxCount = box.points.length / 3;
  const deskCount = desk.points.length / 3;
  const bx = new Float32Array(boxCount);
  const by = new Float32Array(boxCount);
  const bd = new Float32Array(boxCount);
  const dx = new Float32Array(deskCount);
  const dy = new Float32Array(deskCount);
  const tmp = new Float64Array(4);
  const hullX = new Float32Array(8);
  const hullY = new Float32Array(8);
  const hullOrder = new Uint8Array(8);
  const flame = new Float64Array(3); // screen x, y, px per unit at the lantern
  const { right, normal, up } = BOX_AXES;
  const left = [-right[0], -right[1], -right[2]];
  let boxScale = 1;
  let deskScale = 1;

  const wp = (i, k) => box.points[i * 3 + k];

  function projectAll(frame) {
    for (let i = 0; i < boxCount; i += 1) {
      project(frame, box.points[i * 3], box.points[i * 3 + 1], box.points[i * 3 + 2], tmp);
      bx[i] = tmp[0];
      by[i] = tmp[1];
      bd[i] = tmp[2];
      if (i === box.centre) boxScale = tmp[3];
    }
    for (let i = 0; i < deskCount; i += 1) {
      project(frame, desk.points[i * 3], desk.points[i * 3 + 1], desk.points[i * 3 + 2], tmp);
      dx[i] = tmp[0];
      dy[i] = tmp[1];
      if (i === desk.top) deskScale = tmp[3];
    }
  }

  /** The box's ground shadow: its corners cast along the light onto y = 0, wrapped (gift wrap, n = 8). */
  function drawBoxShadow(frame, alpha) {
    for (let k = 0; k < 8; k += 1) {
      const i = box.corner[k];
      const h = wp(i, 1) / -LIGHT[1];
      project(frame, wp(i, 0) + LIGHT[0] * h, 0, wp(i, 2) + LIGHT[2] * h, tmp);
      hullX[k] = tmp[0];
      hullY[k] = tmp[1];
    }
    const n = giftWrap(hullX, hullY, 8, hullOrder);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = SHADE.shadow;
    ctx.beginPath();
    ctx.moveTo(hullX[hullOrder[0]], hullY[hullOrder[0]]);
    for (let k = 1; k < n; k += 1) ctx.lineTo(hullX[hullOrder[k]], hullY[hullOrder[k]]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function face(xs, ys, idx, fill, seed, width) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.fill();
    ctx.beginPath();
    stillOutline(ctx, xs, ys, idx, seed, 0.45);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** Dry-brush hatching across a face (diagonal strokes clipped to it). */
  function hatch(xs, ys, idx, seed, alpha, scale) {
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
    const gap = Math.max(3.2, scale * 0.07);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    let k = 0;
    for (let x = minX - h; x < maxX; x += gap) {
      const lift = 0.1 + 0.25 * ((k * 0.618) % 1);
      stillLine(ctx, x, maxY - h * lift * 0.2, x + h * 0.55, minY + h * lift, seed + k, 0.4, true);
      k += 1;
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The box up to its lid: turned sides, cap, the slot and its grille. */
  function drawBoxBody(frame, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    const { faces } = box;
    const f = (idx) => facesEye(frame, idx === faces.left ? left : idx === faces.right ? right : up, wp(idx[0], 0), wp(idx[0], 1), wp(idx[0], 2));
    if (f(faces.left)) {
      face(bx, by, faces.left, SHADE.side, 21, 1.5);
      hatch(bx, by, faces.left, 300, 0.22 * alpha, boxScale);
    }
    if (f(faces.right)) {
      face(bx, by, faces.right, SHADE.side, 23, 1.5);
      hatch(bx, by, faces.right, 340, 0.22 * alpha, boxScale);
    }
    ctx.globalAlpha = alpha;
    if (f(faces.cap)) face(bx, by, faces.cap, SHADE.cap, 27, 1.5);
    // the slot, dark, with the grille's bars across it
    ctx.fillStyle = SHADE.slot;
    ctx.beginPath();
    polyPath(ctx, bx, by, box.slotQuad);
    ctx.fill();
    ctx.strokeStyle = SHADE.cap;
    ctx.lineWidth = Math.max(1, boxScale * 0.018);
    ctx.beginPath();
    for (let b = 0; b < box.bars.length; b += 2) {
      ctx.moveTo(bx[box.bars[b]], by[box.bars[b]]);
      ctx.lineTo(bx[box.bars[b + 1]], by[box.bars[b + 1]]);
    }
    ctx.stroke();
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1;
    ctx.beginPath();
    stillOutline(ctx, bx, by, box.slotQuad, 77, 0.3);
    ctx.stroke();
  }

  /**
   * The front: plank lines, the seal on its string and the counter plaque. `glow` underlines the
   * count as a stopped slip lands; `orders` is what it reads (always 0).
   */
  function drawBoxFront(alpha, glow, orders) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    face(bx, by, box.faces.front, SHADE.front, 11, 2.1);
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    const p = box.planks;
    stillLine(ctx, bx[p[0]], by[p[0]], bx[p[1]], by[p[1]], 61, 0.5, true);
    stillLine(ctx, bx[p[2]], by[p[2]], bx[p[3]], by[p[3]], 63, 0.5, true);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    // the string over the lid's edge down to the seal, and its two tails
    const s = box.string;
    ctx.lineWidth = Math.max(1, boxScale * 0.014);
    ctx.beginPath();
    ctx.moveTo(bx[s[0]], by[s[0]]);
    ctx.lineTo(bx[s[1]], by[s[1]]);
    ctx.lineTo(bx[s[2]], by[s[2]]);
    const [t0, t1] = box.tails;
    ctx.moveTo(bx[box.seal], by[box.seal]);
    ctx.quadraticCurveTo(bx[box.seal] - boxScale * 0.02, by[box.seal] + boxScale * 0.1, bx[t0], by[t0]);
    ctx.moveTo(bx[box.seal], by[box.seal]);
    ctx.quadraticCurveTo(bx[box.seal] + boxScale * 0.05, by[box.seal] + boxScale * 0.1, bx[t1], by[t1]);
    ctx.stroke();
    // the seal: an indigo disc with a pressed ring
    const r = Math.hypot(bx[box.sealEdge] - bx[box.seal], by[box.sealEdge] - by[box.seal]);
    ctx.fillStyle = INK.indigo;
    ctx.beginPath();
    ctx.ellipse(bx[box.seal], by[box.seal], r, r * 0.96, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SHADE.front;
    ctx.lineWidth = Math.max(0.8, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(bx[box.seal], by[box.seal], r * 0.6, r * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawPlaque(alpha, glow, orders);
  }

  function drawPlaque(alpha, glow, orders) {
    const q = box.plaque;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK.sheet;
    ctx.beginPath();
    polyPath(ctx, bx, by, q);
    ctx.fill();
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    stillOutline(ctx, bx, by, q, 210, 0.3);
    ctx.stroke();
    const height = Math.hypot(bx[q[3]] - bx[q[0]], by[q[3]] - by[q[0]]);
    const width = Math.hypot(bx[q[1]] - bx[q[0]], by[q[1]] - by[q[0]]);
    const small = Math.max(8, Math.min(14, height * 0.36));
    const big = Math.max(12, Math.min(30, height * 0.8));
    const cx = bx[box.label];
    const cy = by[box.label] + 0.5;
    ctx.fillStyle = INK.sumi;
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${small}px ${SANS}`;
    const word = 'Emir:';
    const ww = Math.min(ctx.measureText(word).width, width * 0.56);
    ctx.font = `400 ${big}px ${DISPLAY}`;
    const digit = String(orders);
    const dw = ctx.measureText(digit).width;
    const gap = small * 0.4;
    const x0 = cx - (ww + gap + dw) / 2;
    ctx.textAlign = 'left';
    ctx.fillText(digit, x0 + ww + gap, cy + big * 0.04);
    ctx.font = `500 ${small}px ${SANS}`;
    ctx.fillText(word, x0, cy, width * 0.56);
    if (glow > 0) {
      const ux = x0 + ww + gap - 1;
      const uy = cy + big * 0.5;
      ctx.strokeStyle = INK.indigo;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = alpha * Math.min(1, glow * 1.5);
      ctx.beginPath();
      ctx.moveTo(ux, uy);
      ctx.lineTo(ux + (dw + 2) * Math.min(1, glow * 1.4), uy - 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Clip to everything above the slot's long middle line (a dropping slip shows only above the lid). */
  function clipAboveSlot() {
    const q = box.slotQuad;
    const ax = (bx[q[0]] + bx[q[3]]) / 2;
    const ay = (by[q[0]] + by[q[3]]) / 2;
    const cx = (bx[q[1]] + bx[q[2]]) / 2;
    const cy = (by[q[1]] + by[q[2]]) / 2;
    const reach = 4000;
    ctx.beginPath();
    ctx.moveTo(ax - (cx - ax) * 2, ay - (cy - ay) * 2);
    ctx.lineTo(cx + (cx - ax) * 2, cy + (cy - ay) * 2);
    ctx.lineTo(cx + (cx - ax) * 2, cy - reach);
    ctx.lineTo(ax - (cx - ax) * 2, ay - reach);
    ctx.closePath();
    ctx.clip();
  }

  /** The reading desk: board (lit by the lantern), its thickness, the ledge, post and foot. */
  function drawDesk(alpha, lit) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    // post and foot first: the board hides their top
    ctx.lineWidth = Math.max(1.8, deskScale * 0.028);
    ctx.beginPath();
    stillLine(ctx, dx[desk.top], dy[desk.top], dx[desk.foot], dy[desk.foot], 81, 0.6, true);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.3, deskScale * 0.02);
    ctx.beginPath();
    const [f0, f1, f2, f3] = desk.feet;
    stillLine(ctx, dx[f0], dy[f0], dx[f1], dy[f1], 83, 0.5, true);
    stillLine(ctx, dx[f3], dy[f3], dx[f2], dy[f2], 85, 0.5, true);
    ctx.stroke();
    face(dx, dy, desk.back, SHADE.side, 31, 1.4);
    ctx.globalAlpha = alpha;
    face(dx, dy, desk.board, SHADE.board, 33, 1.8);
    if (lit > 0) {
      ctx.globalAlpha = alpha * lit;
      ctx.fillStyle = INK.sheet;
      ctx.beginPath();
      polyPath(ctx, dx, dy, desk.board);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
    face(dx, dy, desk.ledge, SHADE.side, 35, 1.4);
    ctx.globalAlpha = 1;
  }

  /** Ground shadows of the desk and bottle (soft indigo ellipses). */
  function drawDeskShadow(frame, alpha) {
    ctx.fillStyle = INK.indigo;
    ctx.globalAlpha = 0.07 * alpha;
    project(frame, DESK.centre[0] + 0.25, 0, DESK.centre[2] - 0.15, tmp);
    ctx.beginPath();
    ctx.ellipse(tmp[0], tmp[1], tmp[3] * 0.7, tmp[3] * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    project(frame, BOTTLE[0] + 0.12, 0, BOTTLE[2] - 0.05, tmp);
    ctx.beginPath();
    ctx.ellipse(tmp[0], tmp[1], tmp[3] * 0.16, tmp[3] * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * Writes the lantern's screen frame: ring point (x, y) and px per unit, after the sway (radians
   * about the pivot high above). Returns the flame's screen point via `flame`.
   */
  function placeLantern(frame, sway) {
    const L = LANTERN.pivot[1] - LANTERN.ring[1];
    project(frame, LANTERN.pivot[0] + Math.sin(sway) * L, LANTERN.pivot[1] - Math.cos(sway) * L, LANTERN.ring[2], tmp);
    return tmp;
  }

  /** The hanging lantern (portrait: black cap, glass, indigo base, red flame) and its light's rays. */
  function drawLantern(frame, alpha, lantern) {
    const ring = placeLantern(frame, lantern.sway);
    const rx = ring[0];
    const ry = ring[1];
    const s = ring[3];
    project(frame, LANTERN.pivot[0], LANTERN.pivot[1], LANTERN.pivot[2], tmp);
    const px = tmp[0];
    const py = tmp[1];
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(-lantern.sway * 0.6);
    const u = s * LANTERN.scale;
    // ring
    ctx.lineWidth = Math.max(1, u * 0.014);
    ctx.beginPath();
    ctx.ellipse(0, u * 0.035, u * 0.03, u * 0.035, 0, 0, Math.PI * 2);
    ctx.stroke();
    // cap: a black trapezoid with a knob
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.moveTo(-u * 0.05, u * 0.07);
    ctx.lineTo(u * 0.05, u * 0.07);
    ctx.lineTo(u * 0.19, u * 0.17);
    ctx.lineTo(-u * 0.19, u * 0.17);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-u * 0.15, u * 0.17, u * 0.3, u * 0.03);
    // the glass: a pale pane in a black frame, two bars
    const g0 = u * 0.2;
    const g1 = u * 0.5;
    const gw = u * 0.12;
    ctx.fillStyle = INK.sheet;
    ctx.fillRect(-gw, g0, gw * 2, g1 - g0);
    ctx.lineWidth = Math.max(1.2, u * 0.02);
    ctx.strokeRect(-gw, g0, gw * 2, g1 - g0);
    ctx.lineWidth = Math.max(0.8, u * 0.01);
    ctx.beginPath();
    ctx.moveTo(-gw * 0.5, g0);
    ctx.lineTo(-gw * 0.5, g1);
    ctx.moveTo(gw * 0.5, g0);
    ctx.lineTo(gw * 0.5, g1);
    ctx.stroke();
    // the wick's stand, and the flame (the plate's one red mark): taller as the lantern is turned up
    ctx.fillStyle = INK.sumi;
    ctx.fillRect(-u * 0.035, g1 - u * 0.06, u * 0.07, u * 0.025);
    const fh = u * (0.07 + 0.08 * lantern.lit) * (1 + 0.06 * lantern.flicker);
    const fw = u * (0.026 + 0.012 * lantern.lit);
    const fb = g1 - u * 0.065;
    ctx.fillStyle = INK.north;
    ctx.beginPath();
    ctx.moveTo(0, fb - fh);
    ctx.quadraticCurveTo(fw * 1.5, fb - fh * 0.35, 0, fb);
    ctx.quadraticCurveTo(-fw * 1.5, fb - fh * 0.35, 0, fb - fh);
    ctx.fill();
    // base: an indigo band, ruled
    ctx.fillStyle = INK.indigo;
    ctx.fillRect(-u * 0.17, g1, u * 0.34, u * 0.09);
    ctx.lineWidth = Math.max(1, u * 0.012);
    ctx.strokeRect(-u * 0.17, g1, u * 0.34, u * 0.09);
    // short rays round the glass while it is turned up
    if (lantern.lit > 0.01) {
      ctx.globalAlpha = alpha * lantern.lit * 0.75;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cy = (g0 + g1) / 2;
      for (let i = 0; i < RAYS; i += 1) {
        const a = Math.PI * (0.1 + (1.8 * i) / (RAYS - 1)) + 0.12;
        const r0 = u * 0.24;
        const r1 = u * (0.3 + 0.04 * (i % 2));
        ctx.moveTo(Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.9);
        ctx.lineTo(Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.9);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Where the flame is on screen (the light's rays start there): flame = [x, y, px per unit]. */
  function locateFlame(frame, lantern) {
    const ring = placeLantern(frame, lantern.sway);
    const a = -lantern.sway * 0.6;
    const fy = ring[3] * LANTERN.scale * 0.38;
    flame[0] = ring[0] - Math.sin(a) * fy;
    flame[1] = ring[1] + Math.cos(a) * fy;
    flame[2] = ring[3] * LANTERN.scale;
  }

  /** The light falling on the desk: two dashed edges from the flame to the board's far corners. */
  function drawBeam(frame, alpha, lantern) {
    const lit = lantern.lit;
    if (lit <= 0.01) return;
    locateFlame(frame, lantern);
    let lo = 0;
    let hi = 0;
    let amin = Infinity;
    let amax = -Infinity;
    for (let k = 0; k < 4; k += 1) {
      const i = desk.board[k];
      const a = Math.atan2(dy[i] - flame[1], dx[i] - flame[0]);
      if (a < amin) {
        amin = a;
        lo = i;
      }
      if (a > amax) {
        amax = a;
        hi = i;
      }
    }
    const start = flame[2] * 0.36;
    ctx.globalAlpha = alpha * lit * 0.5;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.setLineDash(DASH);
    ctx.beginPath();
    for (let side = 0; side < 2; side += 1) {
      const i = side ? hi : lo;
      const ex = dx[i] - flame[0];
      const ey = dy[i] - flame[1];
      const len = Math.hypot(ex, ey) || 1;
      ctx.moveTo(flame[0] + (ex / len) * start, flame[1] + (ey / len) * start);
      ctx.lineTo(dx[i], dy[i]);
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = 1;
  }

  /** The ship's rail far behind: posts and the top rail (the portrait's deck), light against the sea. */
  function drawRail(frame, alpha) {
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    project(frame, RAIL.from, RAIL.height, RAIL.z, tmp);
    const x0 = tmp[0];
    const y0 = tmp[1];
    project(frame, RAIL.to, RAIL.height, RAIL.z, tmp);
    stillLine(ctx, x0, y0, tmp[0], tmp[1], 401, 0.5, true);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = RAIL.from, n = 0; x <= RAIL.to + 1e-6; x += RAIL.step, n += 1) {
      project(frame, x, 0, RAIL.z, tmp);
      const bxp = tmp[0];
      const byp = tmp[1];
      project(frame, x, RAIL.height, RAIL.z, tmp);
      stillLine(ctx, bxp, byp, tmp[0], tmp[1], 410 + n, 0.35, true);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The empty bottle the note came in: a pale wash, a black outline, a cork. */
  function drawBottle(frame, alpha) {
    project(frame, BOTTLE[0], BOTTLE[1], BOTTLE[2], tmp);
    const x = tmp[0];
    const y = tmp[1];
    const u = tmp[3];
    const bw = u * 0.075;
    const sh = u * 0.33;
    const nk = u * 0.028;
    const top = u * 0.56;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x - bw, y);
    ctx.lineTo(x - bw, y - sh);
    ctx.quadraticCurveTo(x - bw, y - sh - u * 0.08, x - nk, y - sh - u * 0.11);
    ctx.lineTo(x - nk, y - top);
    ctx.lineTo(x + nk, y - top);
    ctx.lineTo(x + nk, y - sh - u * 0.11);
    ctx.quadraticCurveTo(x + bw, y - sh - u * 0.08, x + bw, y - sh);
    ctx.lineTo(x + bw, y);
    ctx.closePath();
    ctx.fillStyle = SHADE.front;
    ctx.fill();
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = Math.max(1, u * 0.012);
    ctx.stroke();
    // a dry indigo stroke down its turned side, a paper glint down the lit one
    ctx.strokeStyle = INK.indigo;
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = Math.max(1, u * 0.018);
    ctx.beginPath();
    ctx.moveTo(x + bw * 0.55, y - u * 0.03);
    ctx.lineTo(x + bw * 0.55, y - sh + u * 0.02);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sheet;
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.5, y - u * 0.06);
    ctx.lineTo(x - bw * 0.5, y - sh + u * 0.03);
    ctx.stroke();
    // the cork
    ctx.fillStyle = INK.sumi;
    ctx.fillRect(x - nk * 0.9, y - top - u * 0.05, nk * 1.8, u * 0.05);
    ctx.globalAlpha = 1;
  }

  return {
    get boxScale() {
      return boxScale;
    },
    get deskScale() {
      return deskScale;
    },
    centreDepth: () => bd[box.centre],
    /** Screen point of the box's top-right front corner (for the plate's letter). */
    boxCorner(out) {
      const i = box.faces.cap[1];
      out[0] = bx[i];
      out[1] = by[i];
      return out;
    },
    /** Screen point of the board's bottom-left corner. */
    deskCorner(out) {
      const i = desk.board[0];
      out[0] = dx[i];
      out[1] = dy[i];
      return out;
    },
    project: projectAll,
    drawBoxShadow,
    drawBoxBody,
    drawBoxFront,
    clipAboveSlot,
    drawDesk,
    drawDeskShadow,
    drawLantern,
    drawBeam,
    drawRail,
    drawBottle,
  };
}

/**
 * Convex hull by gift wrapping (n ≤ 8, alloc-free): writes the hull's point indices into `order`
 * (counter-clockwise on screen) and returns how many there are.
 */
export function giftWrap(xs, ys, n, order) {
  let start = 0;
  for (let i = 1; i < n; i += 1) if (xs[i] < xs[start] || (xs[i] === xs[start] && ys[i] < ys[start])) start = i;
  let count = 0;
  let p = start;
  do {
    order[count] = p;
    count += 1;
    let q = (p + 1) % n;
    for (let r = 0; r < n; r += 1) {
      const cross = (xs[q] - xs[p]) * (ys[r] - ys[p]) - (ys[q] - ys[p]) * (xs[r] - xs[p]);
      if (cross < 0 || (cross === 0 && Math.hypot(xs[r] - xs[p], ys[r] - ys[p]) > Math.hypot(xs[q] - xs[p], ys[q] - ys[p]))) q = r;
    }
    p = q;
  } while (p !== start && count < n);
  return count;
}
