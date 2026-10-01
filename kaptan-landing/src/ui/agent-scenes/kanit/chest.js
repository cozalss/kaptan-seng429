// Kanıt — the event memory as an inked card-catalogue chest: its cast shadow, side and cap in flat
// washes with dry-brush hatching, the paper front of twelve drawers (label holders, bar pulls), the
// cap's plaque, and the one drawer standing open — its dark hole, its tray of filed cards, its
// front. All fixed world points are laid out once; each frame only projects them (and the open
// drawer's eight corners) and draws.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { SANS } from '../fonts.js';
import { DRAWERS } from './model.js';
import { CHEST, CHEST_AXES, chestPoint, drawerRect } from './world.js';

export const SHADE = Object.freeze({
  front: '#e9e6df', // the logbook's warm paper, as a flat wash
  side: '#a4b0be', // the portraits' mid indigo wash (style bridge)
  cap: '#f0efea',
  hole: '#101216',
  tray: '#1c2433',
  trayWall: '#26344a',
  shadow: 'rgba(43, 66, 97, 0.22)',
});
export const LIGHT = Object.freeze([0.62, -1, -0.42]); // sun from the upper left, behind the viewer

/** Builds the chest's fixed world points; returns index tables for the drawing code. */
function layout() {
  const points = [];
  const add = (u, v, w) => {
    points.push(...chestPoint(u, v, w));
    return points.length / 3 - 1;
  };
  const { width: W, height: H, depth: D } = CHEST;
  const corner = [];
  for (let wi = 0; wi < 2; wi += 1) for (let vi = 0; vi < 2; vi += 1) for (let ui = 0; ui < 2; ui += 1) corner.push(add(ui * W, vi * H, -wi * D));
  const c = (ui, vi, wi) => corner[ui + 2 * vi + 4 * wi];
  const faces = {
    front: [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)],
    left: [c(0, 0, 1), c(0, 0, 0), c(0, 1, 0), c(0, 1, 1)],
    right: [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)],
    cap: [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
  };
  const drawers = Array.from({ length: DRAWERS }, (_, d) => {
    const r = drawerRect(d);
    const cu = (r.left + r.right) / 2;
    const lh = 0.075;
    const lw = 0.13;
    const lv = r.top - 0.1;
    return {
      rect: r,
      front: [add(r.left, r.bottom, 0), add(r.right, r.bottom, 0), add(r.right, r.top, 0), add(r.left, r.top, 0)],
      label: [add(cu - lw, lv - lh, 0.005), add(cu + lw, lv - lh, 0.005), add(cu + lw, lv + lh, 0.005), add(cu - lw, lv + lh, 0.005)],
      pull: [add(cu - 0.06, r.bottom + 0.11, 0.01), add(cu + 0.06, r.bottom + 0.11, 0.01)],
    };
  });
  const capLine = [add(0, H - CHEST.cap, 0), add(W, H - CHEST.cap, 0), add(0, CHEST.plinth, 0), add(W, CHEST.plinth, 0)];
  const pv0 = H - CHEST.cap + 0.08;
  const pv1 = H - 0.08;
  const plaque = [add(W * 0.2, pv0, 0.005), add(W * 0.8, pv0, 0.005), add(W * 0.8, pv1, 0.005), add(W * 0.2, pv1, 0.005)];
  const plaqueLabel = add(W / 2, (pv0 + pv1) / 2, 0.005);
  const centre = add(W / 2, H / 2, -D / 2);
  return { points: new Float64Array(points), faces, corner, drawers, capLine, plaque, plaqueLabel, centre };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createChest(ctx) {
  const geo = layout();
  const count = geo.points.length / 3;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const ds = new Float32Array(count);
  const tmp = new Float64Array(4);
  const pt = [0, 0, 0];
  // the open drawer: 8 corners (index = ui + 2·vi + 4·wi), plus its label and pull
  const dw = new Float64Array(12 * 3);
  const dx = new Float32Array(12);
  const dy = new Float32Array(12);
  const D_FRONT = [0, 1, 3, 2];
  const D_TOP = [2, 3, 7, 6];
  const D_LEFT = [4, 0, 2, 6];
  const D_RIGHT = [1, 5, 7, 3];
  const D_LABEL = [8, 9, 10, 11];
  const LABEL_CORNERS = [-0.13, -0.075, 0.13, -0.075, 0.13, 0.075, -0.13, 0.075];
  const hull = new Float32Array(16 * 2);
  const hullIdx = new Uint8Array(16);
  const shadowX = new Float32Array(8);
  const shadowY = new Float32Array(8);
  const { right, up } = CHEST_AXES;
  const left = [-right[0], -right[1], -right[2]];
  const SIDES = [D_LEFT, D_RIGHT];
  const SIDE_NORMALS = [left, right];
  let scale = 1;
  const open = { drawer: -1, amount: 0 };

  function projectAll(frame, drawer, amount) {
    const p = geo.points;
    for (let i = 0; i < count; i += 1) {
      project(frame, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], tmp);
      xs[i] = tmp[0];
      ys[i] = tmp[1];
      ds[i] = tmp[2];
      if (i === geo.centre) scale = tmp[3];
    }
    open.drawer = amount > 0.001 ? drawer : -1;
    open.amount = amount;
    if (open.drawer < 0) return;
    const r = drawerRect(drawer);
    const w1 = amount * CHEST.travel;
    const w0 = w1 - CHEST.drawerDepth;
    const inset = 0.015;
    let k = 0;
    for (let wi = 0; wi < 2; wi += 1) {
      for (let vi = 0; vi < 2; vi += 1) {
        for (let ui = 0; ui < 2; ui += 1) {
          chestPoint(ui ? r.right - inset : r.left + inset, vi ? r.top - inset : r.bottom + inset, wi ? w0 : w1, pt);
          dw[k * 3] = pt[0];
          dw[k * 3 + 1] = pt[1];
          dw[k * 3 + 2] = pt[2];
          k += 1;
        }
      }
    }
    const cu = (r.left + r.right) / 2;
    const lv = r.top - 0.1;
    for (let i = 0; i < 4; i += 1) {
      chestPoint(cu + LABEL_CORNERS[i * 2], lv + LABEL_CORNERS[i * 2 + 1], w1 + 0.005, pt);
      dw[(8 + i) * 3] = pt[0];
      dw[(8 + i) * 3 + 1] = pt[1];
      dw[(8 + i) * 3 + 2] = pt[2];
    }
    for (let i = 0; i < 12; i += 1) {
      project(frame, dw[i * 3], dw[i * 3 + 1], dw[i * 3 + 2], tmp);
      dx[i] = tmp[0];
      dy[i] = tmp[1];
    }
  }

  const wp = (i, k) => geo.points[i * 3 + k];

  function drawShadow(frame, alpha) {
    for (let k = 0; k < 8; k += 1) {
      const i = geo.corner[k];
      const h = wp(i, 1) / -LIGHT[1];
      project(frame, wp(i, 0) + LIGHT[0] * h, 0, wp(i, 2) + LIGHT[2] * h, tmp);
      shadowX[k] = tmp[0];
      shadowY[k] = tmp[1];
    }
    const n = convexHull(shadowX, shadowY, 8, hullIdx, hull);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = SHADE.shadow;
    ctx.beginPath();
    ctx.moveTo(hull[0], hull[1]);
    for (let k = 1; k < n; k += 1) ctx.lineTo(hull[k * 2], hull[k * 2 + 1]);
    ctx.closePath();
    ctx.fill();
  }

  function face(idx, fill, seed, width) {
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
  function hatch(px, py, idx, seed, alpha) {
    ctx.save();
    ctx.beginPath();
    polyPath(ctx, px, py, idx);
    ctx.clip();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < idx.length; k += 1) {
      const i = idx[k];
      minX = Math.min(minX, px[i]);
      maxX = Math.max(maxX, px[i]);
      minY = Math.min(minY, py[i]);
      maxY = Math.max(maxY, py[i]);
    }
    const h = maxY - minY;
    const gap = Math.max(3.2, scale * 0.07);
    ctx.globalAlpha *= alpha;
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

  function drawBody(frame) {
    ctx.strokeStyle = INK.sumi;
    const { faces } = geo;
    if (facesEye(frame, left, wp(faces.left[0], 0), wp(faces.left[0], 1), wp(faces.left[0], 2))) {
      face(faces.left, SHADE.side, 21, 1.5);
      hatch(xs, ys, faces.left, 300, 0.22);
    }
    if (facesEye(frame, right, wp(faces.right[0], 0), wp(faces.right[0], 1), wp(faces.right[0], 2))) {
      face(faces.right, SHADE.side, 23, 1.5);
      hatch(xs, ys, faces.right, 340, 0.22);
    }
    if (facesEye(frame, up, wp(faces.cap[0], 0), wp(faces.cap[0], 1), wp(faces.cap[0], 2))) face(faces.cap, SHADE.cap, 27, 1.5);
  }

  /** The paper front: twelve drawers (the open one a dark hole), the plaque on the cap. */
  function drawFront() {
    const hole = open.drawer >= 0 ? geo.drawers[open.drawer] : null;
    if (hole) {
      ctx.fillStyle = SHADE.hole;
      ctx.beginPath();
      polyPath(ctx, xs, ys, hole.front);
      ctx.fill();
    }
    ctx.fillStyle = SHADE.front;
    ctx.beginPath();
    polyPath(ctx, xs, ys, geo.faces.front);
    if (hole) polyPath(ctx, xs, ys, hole.front);
    ctx.fill('evenodd');
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    stillOutline(ctx, xs, ys, geo.faces.front, 11, 0.5);
    ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let d = 0; d < geo.drawers.length; d += 1) {
      const dr = geo.drawers[d];
      stillOutline(ctx, xs, ys, dr.front, 40 + d * 9, 0.35);
      if (d !== open.drawer) stillOutline(ctx, xs, ys, dr.label, 400 + d * 7, 0.2);
    }
    const [r0, r1, r2, r3] = geo.capLine;
    stillLine(ctx, xs[r0], ys[r0], xs[r1], ys[r1], 61, 0.4, true);
    stillLine(ctx, xs[r2], ys[r2], xs[r3], ys[r3], 63, 0.4, true);
    ctx.stroke();
    // the label cards in their holders: one ruled line each (illegible by design)
    ctx.lineWidth = 1;
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    for (let d = 0; d < geo.drawers.length; d += 1) {
      if (d === open.drawer) continue;
      const lab = geo.drawers[d].label;
      const a = lab[0];
      const b = lab[1];
      const ox = (xs[lab[3]] - xs[a]) * 0.5;
      const oy = (ys[lab[3]] - ys[a]) * 0.5;
      const t1 = 0.6 + 0.2 * ((d * 0.37) % 1);
      ctx.moveTo(xs[a] + (xs[b] - xs[a]) * 0.2 + ox, ys[a] + (ys[b] - ys[a]) * 0.2 + oy);
      ctx.lineTo(xs[a] + (xs[b] - xs[a]) * t1 + ox, ys[a] + (ys[b] - ys[a]) * t1 + oy);
    }
    ctx.stroke();
    ctx.globalAlpha /= 0.6;
    // bar pulls: short, heavy, straight (a cup would read as a face at this size)
    ctx.lineWidth = Math.max(1.8, scale * 0.04);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let d = 0; d < geo.drawers.length; d += 1) {
      if (d === open.drawer) continue;
      const [p0, p1] = geo.drawers[d].pull;
      ctx.moveTo(xs[p0], ys[p0]);
      ctx.lineTo(xs[p1], ys[p1]);
    }
    ctx.stroke();
    drawPlaque();
  }

  function drawPlaque() {
    ctx.fillStyle = INK.sheet;
    ctx.beginPath();
    polyPath(ctx, xs, ys, geo.plaque);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.beginPath();
    stillOutline(ctx, xs, ys, geo.plaque, 210, 0.3);
    ctx.stroke();
    const [a, b, , d] = geo.plaque;
    const h = Math.hypot(xs[d] - xs[a], ys[d] - ys[a]);
    const size = Math.min(14, Math.max(8, h * 0.62));
    ctx.font = `500 ${size}px ${SANS}`;
    ctx.fillStyle = INK.sumi;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Olay hafızası', xs[geo.plaqueLabel], ys[geo.plaqueLabel] + 0.5, Math.hypot(xs[b] - xs[a], ys[b] - ys[a]) * 0.9);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /** The open drawer's tray seen from above: dark, with the filed cards' top edges. */
  function drawDrawerInside(frame) {
    if (open.drawer < 0) return;
    ctx.strokeStyle = INK.sumi;
    if (facesEye(frame, up, dw[6], dw[7], dw[8])) {
      ctx.fillStyle = SHADE.tray;
      ctx.beginPath();
      polyPath(ctx, dx, dy, D_TOP);
      ctx.fill();
      // filed cards: pale edges across the tray, front to back
      ctx.strokeStyle = INK.sheet;
      ctx.globalAlpha *= 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 9; i += 1) {
        const t = i / 9;
        const ax = dx[2] + (dx[6] - dx[2]) * t;
        const ay = dy[2] + (dy[6] - dy[2]) * t;
        const bx = dx[3] + (dx[7] - dx[3]) * t;
        const by = dy[3] + (dy[7] - dy[3]) * t;
        ctx.moveTo(ax + (bx - ax) * 0.08, ay + (by - ay) * 0.08 + 1.5);
        ctx.lineTo(ax + (bx - ax) * 0.92, ay + (by - ay) * 0.92 + 1.5);
      }
      ctx.stroke();
      ctx.globalAlpha /= 0.55;
      ctx.strokeStyle = INK.sumi;
    }
  }

  /** The open drawer's visible side and its front (label holder, pull). */
  function drawDrawerFront(frame) {
    if (open.drawer < 0) return;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.2;
    for (let s = 0; s < 2; s += 1) {
      const i = SIDES[s][1];
      if (!facesEye(frame, SIDE_NORMALS[s], dw[i * 3], dw[i * 3 + 1], dw[i * 3 + 2])) continue;
      ctx.fillStyle = SHADE.side;
      ctx.beginPath();
      polyPath(ctx, dx, dy, SIDES[s]);
      ctx.fill();
      hatch(dx, dy, SIDES[s], 520 + s, 0.3);
      ctx.beginPath();
      stillOutline(ctx, dx, dy, SIDES[s], 530 + s, 0.3);
      ctx.stroke();
    }
    ctx.fillStyle = SHADE.front;
    ctx.beginPath();
    polyPath(ctx, dx, dy, D_FRONT);
    ctx.fill();
    ctx.beginPath();
    stillOutline(ctx, dx, dy, D_FRONT, 540, 0.35);
    stillOutline(ctx, dx, dy, D_LABEL, 550, 0.2);
    ctx.stroke();
    const mx = (dx[0] + dx[1]) / 2;
    const my = (dy[0] + dy[1]) / 2;
    const hx = (dx[1] - dx[0]) * 0.11;
    const hy = (dy[1] - dy[0]) * 0.11;
    const lift = (dy[0] - dy[2]) * 0.27;
    ctx.lineWidth = Math.max(1.8, scale * 0.04);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(mx - hx, my - hy - lift);
    ctx.lineTo(mx + hx, my + hy - lift);
    ctx.stroke();
  }

  return {
    get scale() {
      return scale;
    },
    /** Screen point of the cap's top-right front corner (for the plate's letter). */
    corner(out) {
      const i = geo.faces.front[2];
      out[0] = xs[i];
      out[1] = ys[i];
      return out;
    },
    centreDepth: () => ds[geo.centre],
    project: projectAll,
    drawShadow,
    drawBody,
    drawFront,
    drawDrawerInside,
    drawDrawerFront,
  };
}

/**
 * Convex hull (monotone chain) of n points, alloc-free: writes hull xy pairs into `out`, returns
 * the hull's point count. `order` is scratch of length ≥ n.
 */
export function convexHull(xs, ys, n, order, out) {
  for (let i = 0; i < n; i += 1) order[i] = i;
  for (let i = 1; i < n; i += 1) {
    const v = order[i];
    let j = i - 1;
    while (j >= 0 && (xs[order[j]] > xs[v] || (xs[order[j]] === xs[v] && ys[order[j]] > ys[v]))) {
      order[j + 1] = order[j];
      j -= 1;
    }
    order[j + 1] = v;
  }
  const cross = (o, a, b) => (out[a * 2] - out[o * 2]) * (ys[b] - out[o * 2 + 1]) - (out[a * 2 + 1] - out[o * 2 + 1]) * (xs[b] - out[o * 2]);
  let k = 0;
  const push = (i) => {
    out[k * 2] = xs[i];
    out[k * 2 + 1] = ys[i];
    k += 1;
  };
  for (let s = 0; s < n; s += 1) {
    const i = order[s];
    while (k >= 2 && cross(k - 2, k - 1, i) <= 0) k -= 1;
    push(i);
  }
  const lower = k + 1;
  for (let s = n - 2; s >= 0; s -= 1) {
    const i = order[s];
    while (k >= lower && cross(k - 2, k - 1, i) <= 0) k -= 1;
    push(i);
  }
  return k - 1;
}
