// Sınıflandırıcı — the six-hole flag locker of the portrait, as an inked box in the diorama: its
// cast shadow, side and cap in flat washes with dry-brush hatching, the dark cubbies (inner walls
// shaded by which way they face), the paper front with its six holes, the plaques with their codes,
// the day's tally strokes and — the plate's one north-red mark — the E4 bookmark ribbon the portrait
// hangs there. All world points are laid out once; each frame only projects and draws them.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { MONO, SANS } from '../fonts.js';
import { BINS } from './model.js';
import { LOCKER, LOCKER_AXES, holeRect, lockerPoint } from './world.js';

const SHADE = Object.freeze({
  front: '#dde2e8', // the portrait locker's pale grey-blue, as a flat wash
  side: '#a4b0be', // the portraits' mid indigo wash (style bridge)
  cap: '#f0efea',
  back: '#101216',
  floor: '#1c2433',
  wallLit: '#26344a',
  wallDark: '#151a24',
  ceiling: '#0d0e11',
  rim: INK.indigo,
  shadow: 'rgba(43, 66, 97, 0.22)',
});
const LIGHT = Object.freeze([0.62, -1, -0.42]); // sun from the upper left, behind the viewer
const BACK_WALL = 0.07;

/** Plaque width (world units): a code fits a narrow one, a word a wider one. */
export const plaqueWidth = (bin) => (BINS[bin].mono ? 0.32 : 0.56);

/** Builds the locker's world points; returns index tables for the drawing code. */
function layout() {
  const points = [];
  const add = (u, v, w) => {
    points.push(...lockerPoint(u, v, w));
    return points.length / 3 - 1;
  };
  const { width: W, height: H, depth: D } = LOCKER;
  // box corners: index = ui + 2·vi + 4·wi
  const corner = [];
  for (let wi = 0; wi < 2; wi += 1) for (let vi = 0; vi < 2; vi += 1) for (let ui = 0; ui < 2; ui += 1) corner.push(add(ui * W, vi * H, -wi * D));
  const c = (ui, vi, wi) => corner[ui + 2 * vi + 4 * wi];
  const faces = {
    front: [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)],
    left: [c(0, 0, 1), c(0, 0, 0), c(0, 1, 0), c(0, 1, 1)],
    right: [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)],
    cap: [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
  };
  const holes = BINS.map((_, bin) => {
    const r = holeRect(bin);
    const back = -(D - BACK_WALL);
    const front = [add(r.left, r.bottom, 0), add(r.right, r.bottom, 0), add(r.right, r.top, 0), add(r.left, r.top, 0)];
    const rear = [add(r.left, r.bottom, back), add(r.right, r.bottom, back), add(r.right, r.top, back), add(r.left, r.top, back)];
    const plaqueW = plaqueWidth(bin);
    const pTop = r.top + LOCKER.rail - 0.04;
    const pBottom = r.top + 0.05;
    const pl = r.left + 0.05;
    const plaque = [add(pl, pBottom, 0.004), add(pl + plaqueW, pBottom, 0.004), add(pl + plaqueW, pTop, 0.004), add(pl, pTop, 0.004)];
    return {
      rect: r,
      front,
      rear,
      plaque,
      label: add(pl + plaqueW / 2, (pTop + pBottom) / 2, 0.004),
      tally: add(pl + plaqueW + (bin === 3 ? 0.17 : 0.08), (pTop + pBottom) / 2, 0.004),
      // two resting slips per cubby: yesterday's stack at the back
      stack: [add((r.left + r.right) / 2 - 0.03, r.bottom + 0.015, -D + 0.52), add((r.left + r.right) / 2 + 0.04, r.bottom + 0.035, -D + 0.5)],
    };
  });
  // the plinth's drawer and its pull
  const inset = 0.16;
  const drawer = [add(inset, 0.12, 0), add(W - inset, 0.12, 0), add(W - inset, LOCKER.plinth - 0.1, 0), add(inset, LOCKER.plinth - 0.1, 0)];
  const pull = [add(W / 2 - 0.17, LOCKER.plinth * 0.55, 0.01), add(W / 2 + 0.17, LOCKER.plinth * 0.55, 0.01)];
  // the cap's overhang line and the plinth's top line across the front
  const rails = [add(0, H - LOCKER.cap, 0), add(W, H - LOCKER.cap, 0), add(0, LOCKER.plinth, 0), add(W, LOCKER.plinth, 0)];
  // the red bookmark ribbon hangs from the E4 plaque (bin 3), as in the portrait
  const e4 = holeRect(3);
  const rx = e4.left + 0.05 + plaqueWidth(3) + 0.03;
  const ry = e4.top + LOCKER.rail - 0.06;
  const rw = 0.075;
  const rl = LOCKER.rail + 0.2;
  const ribbon = [add(rx, ry, 0.012), add(rx + rw, ry, 0.012), add(rx + rw, ry - rl, 0.012), add(rx + rw / 2, ry - rl + 0.06, 0.012), add(rx, ry - rl, 0.012)];
  const centre = add(W / 2, H / 2, -D / 2);
  return { points: new Float64Array(points), faces, corner, holes, drawer, pull, rails, ribbon, centre };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createLocker(ctx) {
  const geo = layout();
  const count = geo.points.length / 3;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const ds = new Float32Array(count);
  const tmp = new Float64Array(4);
  const hull = new Float32Array(16 * 2);
  const hullIdx = new Uint8Array(16);
  const shadowX = new Float32Array(8);
  const shadowY = new Float32Array(8);
  const { right, normal, up } = LOCKER_AXES;
  const left = [-right[0], -right[1], -right[2]];
  const down = [0, -1, 0];
  const minusNormal = [-normal[0], -normal[1], -normal[2]];
  let scale = 1; // px per world unit at the locker

  function projectAll(frame) {
    const p = geo.points;
    for (let i = 0; i < count; i += 1) {
      project(frame, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], tmp);
      xs[i] = tmp[0];
      ys[i] = tmp[1];
      ds[i] = tmp[2];
      if (i === geo.centre) scale = tmp[3];
    }
  }

  const wp = (i, k) => geo.points[i * 3 + k];

  /** Ground shadow: the box's corners cast along the light onto y = 0, their convex hull. */
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
  function hatch(idx, seed, alpha) {
    ctx.save();
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.clip();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const i of idx) {
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

  function fillQuad(a, b, c, d, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(xs[a], ys[a]);
    ctx.lineTo(xs[b], ys[b]);
    ctx.lineTo(xs[c], ys[c]);
    ctx.lineTo(xs[d], ys[d]);
    ctx.closePath();
    ctx.fill();
  }

  function drawCubby(frame, hole) {
    const [f0, f1, f2, f3] = hole.front;
    const [b0, b1, b2, b3] = hole.rear;
    ctx.fillStyle = SHADE.back;
    ctx.beginPath();
    polyPath(ctx, xs, ys, hole.front);
    ctx.fill();
    if (facesEye(frame, up, wp(f0, 0), wp(f0, 1), wp(f0, 2))) fillQuad(f0, f1, b1, b0, SHADE.floor);
    if (facesEye(frame, down, wp(f3, 0), wp(f3, 1), wp(f3, 2))) fillQuad(f3, f2, b2, b3, SHADE.ceiling);
    if (facesEye(frame, right, wp(f0, 0), wp(f0, 1), wp(f0, 2))) fillQuad(f0, f3, b3, b0, SHADE.wallDark);
    if (facesEye(frame, left, wp(f1, 0), wp(f1, 1), wp(f1, 2))) fillQuad(f1, f2, b2, b1, SHADE.wallLit);
    ctx.fillStyle = SHADE.back;
    ctx.beginPath();
    polyPath(ctx, xs, ys, hole.rear);
    ctx.fill();
    // the indigo band just inside each hole, as the portrait paints it (half of it is clipped away)
    ctx.strokeStyle = SHADE.rim;
    ctx.lineWidth = Math.max(3, scale * 0.11);
    ctx.beginPath();
    polyPath(ctx, xs, ys, hole.front);
    ctx.stroke();
  }

  /** The front: paper with six holes (even-odd), ruled edges, the drawer and its pull. */
  function drawFront() {
    ctx.fillStyle = SHADE.front;
    ctx.beginPath();
    polyPath(ctx, xs, ys, geo.faces.front);
    for (const hole of geo.holes) polyPath(ctx, xs, ys, hole.front);
    ctx.fill('evenodd');
    ctx.strokeStyle = INK.sumi;
    // silhouette heavy, inner lines light: the book's brush weights
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    stillOutline(ctx, xs, ys, geo.faces.front, 11, 0.5);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    geo.holes.forEach((hole, i) => stillOutline(ctx, xs, ys, hole.front, 40 + i * 9, 0.4));
    stillOutline(ctx, xs, ys, geo.drawer, 97, 0.4);
    const [r0, r1, r2, r3] = geo.rails;
    stillLine(ctx, xs[r0], ys[r0], xs[r1], ys[r1], 61, 0.4, true);
    stillLine(ctx, xs[r2], ys[r2], xs[r3], ys[r3], 63, 0.4, true);
    ctx.stroke();
    const [p0, p1] = geo.pull;
    ctx.lineWidth = Math.max(1.6, scale * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xs[p0], ys[p0]);
    ctx.quadraticCurveTo((xs[p0] + xs[p1]) / 2, (ys[p0] + ys[p1]) / 2 + scale * 0.07, xs[p1], ys[p1]);
    ctx.stroke();
  }

  /** Type size for the plaques: fitted to a plaque's projected height, never under 8 px. */
  function labelSize() {
    const [a, , , d] = geo.holes[0].plaque;
    return Math.min(14, Math.max(8, Math.hypot(xs[d] - xs[a], ys[d] - ys[a]) * 0.7));
  }

  /** Plaques and their codes; the plaque of the bin a stamped slip is bound for is underlined. */
  function drawPlaques(target, glow) {
    const size = labelSize();
    ctx.lineWidth = 1;
    geo.holes.forEach((hole, bin) => {
      ctx.fillStyle = INK.sheet;
      ctx.strokeStyle = INK.sumi;
      ctx.beginPath();
      polyPath(ctx, xs, ys, hole.plaque);
      ctx.fill();
      ctx.beginPath();
      stillOutline(ctx, xs, ys, hole.plaque, 200 + bin * 5, 0.3);
      ctx.stroke();
      const { code, mono } = BINS[bin];
      ctx.font = mono ? `500 ${size}px ${MONO}` : `500 ${size * 0.92}px ${SANS}`;
      ctx.fillStyle = INK.sumi;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const x = xs[hole.label];
      const y = ys[hole.label] + 0.5;
      const a = hole.plaque[0];
      const b = hole.plaque[1];
      // never wider than its plaque (small plates squeeze the type rather than spill it)
      ctx.fillText(code, x, y, Math.hypot(xs[b] - xs[a], ys[b] - ys[a]) * 0.86);
      if (bin === target && glow > 0) {
        const half = ctx.measureText(code).width / 2 + 2;
        ctx.strokeStyle = INK.indigo;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - half, y + size * 0.62);
        ctx.lineTo(x - half + half * 2 * glow, y + size * 0.62);
        ctx.stroke();
      }
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /** Tally strokes on each rail: groups of five, the fifth across; ruled off at day's end. */
  function drawTallies(tallies) {
    const unit = labelSize() / 10;
    const h = 11 * unit;
    const step = 4.2 * unit;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    tallies.forEach((tally, bin) => {
      if (tally.marks === 0 || tally.alpha <= 0) return;
      const i0 = geo.holes[bin].tally;
      const x0 = xs[i0];
      const y0 = ys[i0] - h / 2;
      ctx.globalAlpha = tally.alpha;
      ctx.lineWidth = 1.5 * unit;
      ctx.beginPath();
      for (let m = 0; m < tally.marks; m += 1) {
        const newest = m === tally.marks - 1;
        const ink = newest ? tally.ink : 1;
        if (ink <= 0) continue;
        const group = Math.floor(m / 5);
        const gx = x0 + group * step * 6;
        const k = m % 5;
        if (k === 4) {
          ctx.moveTo(gx - step * 0.5, y0 + h * 0.8);
          ctx.lineTo(gx - step * 0.5 + (step * 4) * ink, y0 + h * 0.8 - h * 0.6 * ink);
        } else {
          const x = gx + k * step;
          const wob = 0.4 * Math.sin(m * 2.3 + bin);
          ctx.moveTo(x, y0);
          ctx.lineTo(x + wob, y0 + h * ink);
        }
      }
      ctx.stroke();
      if (tally.strike > 0) {
        const groups = Math.ceil(tally.marks / 5);
        const len = (groups - 1) * step * 6 + Math.min(tally.marks, 5) * step + step;
        ctx.lineWidth = 1.5 * unit;
        ctx.beginPath();
        ctx.moveTo(x0 - step, y0 + h * 0.5);
        ctx.lineTo(x0 - step + (len + step) * tally.strike, y0 + h * 0.46);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawRibbon() {
    const r = geo.ribbon;
    ctx.fillStyle = INK.north;
    ctx.beginPath();
    ctx.moveTo(xs[r[0]], ys[r[0]]);
    for (let k = 1; k < r.length; k += 1) ctx.lineTo(xs[r[k]], ys[r[k]]);
    ctx.closePath();
    ctx.fill();
  }

  /** The cubby a sliding slip is inside of: clip to its hole while drawing it. */
  function clipToHole(bin) {
    ctx.beginPath();
    polyPath(ctx, xs, ys, geo.holes[bin].front);
    ctx.clip();
  }

  return {
    geo,
    get scale() {
      return scale;
    },
    /** Screen point of a locker landmark (the cap's top-left corner, for the plate's letter). */
    corner(out) {
      const i = geo.faces.cap[3];
      out[0] = xs[geo.faces.front[3]];
      out[1] = ys[geo.faces.front[3]];
      out[2] = xs[i];
      out[3] = ys[i];
      return out;
    },
    centreDepth: () => ds[geo.centre],
    project: projectAll,
    drawShadow,
    /** The box up to (not including) its front face: sides, cap, cubby interiors, stacks. */
    drawBody(frame, drawStack) {
      ctx.strokeStyle = INK.sumi;
      const { faces } = geo;
      if (facesEye(frame, left, wp(faces.left[0], 0), wp(faces.left[0], 1), wp(faces.left[0], 2))) {
        face(faces.left, SHADE.side, 21, 1.5);
        hatch(faces.left, 300, 0.22);
      }
      if (facesEye(frame, right, wp(faces.right[0], 0), wp(faces.right[0], 1), wp(faces.right[0], 2))) {
        face(faces.right, SHADE.side, 23, 1.5);
        hatch(faces.right, 340, 0.22);
      }
      if (facesEye(frame, up, wp(faces.cap[0], 0), wp(faces.cap[0], 1), wp(faces.cap[0], 2))) face(faces.cap, SHADE.cap, 27, 1.5);
      ctx.globalAlpha = 1;
      // each cubby is seen only through its hole: clip to it (it would spill over the side otherwise)
      for (let bin = 0; bin < geo.holes.length; bin += 1) {
        const hole = geo.holes[bin];
        ctx.save();
        ctx.beginPath();
        polyPath(ctx, xs, ys, hole.front);
        ctx.clip();
        drawCubby(frame, hole);
        drawStack?.(hole);
        ctx.restore();
      }
    },
    drawFront,
    drawPlaques,
    drawTallies,
    drawRibbon,
    clipToHole,
    minusNormal,
  };
}

/**
 * Convex hull (monotone chain) of n points, alloc-free: writes hull xy pairs into `out`, returns
 * the hull's point count. `order` is scratch of length ≥ n.
 */
export function convexHull(xs, ys, n, order, out) {
  for (let i = 0; i < n; i += 1) order[i] = i;
  // insertion sort by x, then y (n ≤ 16)
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
