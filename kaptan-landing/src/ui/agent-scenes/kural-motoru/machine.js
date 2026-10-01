// Kural Motoru — the sorting bench as an inked object: its cast shadow, the cabinet and the
// backboard in flat washes with dry-brush hatching on their turned sides, the five open trays, the
// gates' plaques with their written thresholds, the slate, the rail with a gap at each gate, the
// hopper's front plate and the reading bridge. All world points are laid out once; each frame only
// projects and draws them (no allocation).

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { MONO, SANS } from '../fonts.js';
import { GATES, RAIL } from './model.js';
import { BENCH, BRIDGE, DIAL, GATE_GAP, HOPPER, SLATE, TRAY, plaqueRect } from './world.js';

export const SHADE = Object.freeze({
  front: '#dde2e8',
  side: '#a4b0be', // the portraits' mid indigo wash (style bridge)
  cap: '#f0efea',
  trayIn: '#26344a',
  trayFloor: '#1c2433',
  trayWall: '#151a24',
  shadow: 'rgba(43, 66, 97, 0.22)',
});
const LIGHT = Object.freeze([0.62, -1, -0.42]); // sun from the upper left, behind the viewer
const UP = Object.freeze([0, 1, 0]);
const LEFT = Object.freeze([-1, 0, 0]);
const FRONT = Object.freeze([0, 0, 1]);

/** Builds the bench's world points; returns index tables for the drawing code. */
function layout() {
  const points = [];
  const add = (x, y, z) => {
    points.push(x, y, z);
    return points.length / 3 - 1;
  };
  /** A box's faces (front, left, top) and its eight corners. */
  const box = ([x0, x1, y0, y1, z0, z1]) => {
    const c = [];
    for (let k = 0; k < 8; k += 1) c.push(add(k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z0 : z1));
    // index bits: 1 → x1, 2 → y1, 4 → back (z0)
    return {
      corners: c,
      front: [c[0], c[1], c[3], c[2]],
      left: [c[4], c[0], c[2], c[6]],
      top: [c[2], c[3], c[7], c[6]],
    };
  };
  const quadZ = (x0, x1, y0, y1, z) => [add(x0, y0, z), add(x1, y0, z), add(x1, y1, z), add(x0, y1, z)];
  const cabinet = box(BENCH.cabinet);
  const backboard = box(BENCH.backboard);
  const rail = box(BENCH.rail);
  // the rail opens only at the gate a card is dropping through: each gate's rail, cut in two
  const [rx0, rx1, ry0, ry1, rz0, rz1] = BENCH.rail;
  const topZ = (x0, x1) => [add(x0, ry1, rz1), add(x1, ry1, rz1), add(x1, ry1, rz0), add(x0, ry1, rz0)];
  const cuts = RAIL.gates.map((gx) => ({
    frontL: quadZ(rx0, gx - GATE_GAP, ry0, ry1, rz1),
    frontR: quadZ(gx + GATE_GAP, rx1, ry0, ry1, rz1),
    topL: topZ(rx0, gx - GATE_GAP),
    topR: topZ(gx + GATE_GAP, rx1),
    hinge: add(gx - GATE_GAP, ry1 - 0.01, rz1),
    hingeR: add(gx + GATE_GAP, ry1 - 0.01, rz1),
  }));
  const trays = RAIL.gates.map((gx) => {
    const x0 = gx - TRAY.halfW;
    const x1 = gx + TRAY.halfW;
    const wallTop = TRAY.lip + 0.14;
    return {
      back: quadZ(x0, x1, TRAY.floor, wallTop, TRAY.back),
      floor: [add(x0, TRAY.floor, TRAY.front), add(x1, TRAY.floor, TRAY.front), add(x1, TRAY.floor, TRAY.back), add(x0, TRAY.floor, TRAY.back)],
      leftIn: [add(x1, TRAY.floor, TRAY.front), add(x1, TRAY.floor, TRAY.back), add(x1, wallTop, TRAY.back), add(x1, TRAY.lip, TRAY.front)],
      leftOut: [add(x0, TRAY.floor, TRAY.back), add(x0, TRAY.floor, TRAY.front), add(x0, TRAY.lip, TRAY.front), add(x0, wallTop, TRAY.back)],
      step: quadZ(x0, x1, TRAY.floor, TRAY.floor + TRAY.step, 0.03),
      stepTop: [add(x0, TRAY.floor + TRAY.step, 0.03), add(x1, TRAY.floor + TRAY.step, 0.03), add(x1, TRAY.floor + TRAY.step, TRAY.back), add(x0, TRAY.floor + TRAY.step, TRAY.back)],
      front: quadZ(x0, x1, TRAY.floor - 0.02, TRAY.lip, TRAY.front),
    };
  });
  const z = BENCH.backZ + 0.004;
  const plaques = GATES.map((_, g) => {
    const [x0, x1, y0, y1] = plaqueRect(g);
    return {
      quad: quadZ(x0, x1, y0, y1, z),
      code: add((x0 + x1) / 2, y1 - 0.16, z),
      // a short ruled arrow from the plaque down toward its gate
      arrowTop: add((x0 + x1) / 2, y0 - 0.02, z),
      arrowEnd: add((x0 + x1) / 2, BENCH.railTop + 0.05, z),
    };
  });
  const slate = {
    quad: quadZ(SLATE[0], SLATE[1], SLATE[2], SLATE[3], z),
    line0: add(SLATE[0] + 0.08, (SLATE[2] + SLATE[3]) / 2 + 0.03, z),
  };
  const hopper = {
    front: quadZ(HOPPER.x - HOPPER.halfW, HOPPER.x + HOPPER.halfW, BENCH.railTop - 0.02, BENCH.railTop + HOPPER.wall, HOPPER.front),
    left: [
      add(HOPPER.x - HOPPER.halfW, BENCH.railTop - 0.02, -0.5),
      add(HOPPER.x - HOPPER.halfW, BENCH.railTop - 0.02, HOPPER.front),
      add(HOPPER.x - HOPPER.halfW, BENCH.railTop + HOPPER.wall, HOPPER.front),
      add(HOPPER.x - HOPPER.halfW, BENCH.railTop + HOPPER.wall + 0.3, -0.5),
    ],
  };
  const bx0 = BRIDGE.x - BRIDGE.halfW;
  const bx1 = BRIDGE.x + BRIDGE.halfW;
  const bridge = {
    bar: quadZ(bx0 - 0.05, bx1 + 0.05, BRIDGE.bar, BRIDGE.bar + BRIDGE.barH, BRIDGE.z + 0.04),
    barTop: [add(bx0 - 0.05, BRIDGE.bar + BRIDGE.barH, BRIDGE.z + 0.04), add(bx1 + 0.05, BRIDGE.bar + BRIDGE.barH, BRIDGE.z + 0.04), add(bx1 + 0.05, BRIDGE.bar + BRIDGE.barH, BENCH.backZ), add(bx0 - 0.05, BRIDGE.bar + BRIDGE.barH, BENCH.backZ)],
    posts: [add(bx0, BENCH.railTop, BRIDGE.z), add(bx0, BRIDGE.bar, BRIDGE.z), add(bx1, BENCH.railTop, BRIDGE.z), add(bx1, BRIDGE.bar, BRIDGE.z)],
  };
  const dial = {
    centre: add(DIAL.x, DIAL.y, DIAL.z),
    neck: quadZ(DIAL.x - 0.13, DIAL.x + 0.13, BENCH.backboard[3] - 0.01, DIAL.y - DIAL.r * 0.8, DIAL.z + 0.05),
    foot: quadZ(DIAL.x - 0.3, DIAL.x + 0.3, BENCH.backboard[3] - 0.01, BENCH.backboard[3] + 0.07, DIAL.z + 0.12),
  };
  const centre = add((BENCH.x0 + BENCH.x1) / 2, 1, 0);
  return { points: new Float64Array(points), cabinet, backboard, rail, cuts, trays, plaques, slate, hopper, bridge, dial, centre };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createBench(ctx) {
  const geo = layout();
  const count = geo.points.length / 3;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const tmp = new Float64Array(4);
  const hull = new Float32Array(32 * 2);
  const hullIdx = new Uint8Array(32);
  const shadowX = new Float32Array(16);
  const shadowY = new Float32Array(16);
  const shadowBoxes = [geo.cabinet, geo.backboard];
  const plaqueSize = new Float32Array(2);
  let scale = 1; // px per world unit at the bench's centre

  function projectAll(frame) {
    const p = geo.points;
    for (let i = 0; i < count; i += 1) {
      project(frame, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], tmp);
      xs[i] = tmp[0];
      ys[i] = tmp[1];
      if (i === geo.centre) scale = tmp[3];
    }
  }

  const wp = (i, k) => geo.points[i * 3 + k];
  const sees = (frame, normal, i) => facesEye(frame, normal, wp(i, 0), wp(i, 1), wp(i, 2));

  /** Ground shadow: the cabinet's and backboard's corners cast along the light, their hull. */
  function drawShadow(frame, alpha) {
    let n = 0;
    for (let bi = 0; bi < shadowBoxes.length; bi += 1) {
      for (let k = 0; k < 8; k += 1) {
        const i = shadowBoxes[bi].corners[k];
        const h = wp(i, 1) / -LIGHT[1];
        project(frame, wp(i, 0) + LIGHT[0] * h, 0, wp(i, 2) + LIGHT[2] * h, tmp);
        shadowX[n] = tmp[0];
        shadowY[n] = tmp[1];
        n += 1;
      }
    }
    const m = convexHull(shadowX, shadowY, n, hullIdx, hull);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = SHADE.shadow;
    ctx.beginPath();
    ctx.moveTo(hull[0], hull[1]);
    for (let k = 1; k < m; k += 1) ctx.lineTo(hull[k * 2], hull[k * 2 + 1]);
    ctx.closePath();
    ctx.fill();
  }

  function face(idx, fill, seed, width) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.fill();
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = width;
    ctx.beginPath();
    stillOutline(ctx, xs, ys, idx, seed, 0.45);
    ctx.stroke();
  }

  function fill(idx, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.fill();
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
    for (let k = 0; k < idx.length; k += 1) {
      const i = idx[k];
      if (xs[i] < minX) minX = xs[i];
      if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i];
      if (ys[i] > maxY) maxY = ys[i];
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

  function drawBox(frame, b, seed) {
    if (sees(frame, LEFT, b.left[0])) {
      face(b.left, SHADE.side, seed, 1.4);
      hatch(b.left, seed + 100, 0.24);
    }
    if (sees(frame, UP, b.top[0])) face(b.top, SHADE.cap, seed + 3, 1.2);
    face(b.front, SHADE.front, seed + 7, 1.9);
  }

  /** A plaque's projected height and width (px). */
  function plaqueBox() {
    const q = geo.plaques[0].quad;
    plaqueSize[0] = Math.hypot(xs[q[3]] - xs[q[0]], ys[q[3]] - ys[q[0]]);
    plaqueSize[1] = Math.hypot(xs[q[1]] - xs[q[0]], ys[q[1]] - ys[q[0]]);
    return plaqueSize;
  }

  /**
   * The gates' plaques on the backboard: the code, the written threshold under it (when the plate
   * is large enough to print it at ≥ 8 px), and a ruled arrow down to the gate.
   */
  function drawPlaques(target, ink) {
    const h = plaqueBox()[0];
    const codeType = Math.min(14, Math.max(9, h * 0.25));
    const ruleType = Math.min(10.5, Math.max(8, h * 0.165));
    // the written threshold in two lines, in one short line on a small plate, or not at all
    const lines = h >= codeType * 1.3 + ruleType * 2.5 + 4 ? 2 : h >= codeType * 1.25 + ruleType * 1.25 + 3 ? 1 : 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let g = 0; g < geo.plaques.length; g += 1) {
      const p = geo.plaques[g];
      fill(p.quad, INK.sheet);
      ctx.strokeStyle = INK.sumi;
      ctx.lineWidth = 1;
      ctx.beginPath();
      stillOutline(ctx, xs, ys, p.quad, 210 + g * 5, 0.3);
      stillLine(ctx, xs[p.arrowTop], ys[p.arrowTop], xs[p.arrowEnd], ys[p.arrowEnd], 230 + g, 0.3, true);
      ctx.stroke();
      ctx.beginPath();
      const ax = xs[p.arrowEnd];
      const ay = ys[p.arrowEnd];
      ctx.moveTo(ax - 3, ay - 4);
      ctx.lineTo(ax, ay);
      ctx.lineTo(ax + 3, ay - 4);
      ctx.stroke();
      const q = p.quad;
      const cx = xs[p.code];
      const maxW = Math.hypot(xs[q[1]] - xs[q[0]], ys[q[1]] - ys[q[0]]) * 0.86;
      const top = (ys[q[3]] + ys[q[2]]) / 2;
      const { code, mono, rule } = GATES[g];
      const codeY = lines === 2 ? top + h * 0.06 + codeType * 0.62 : lines === 1 ? top + h * 0.06 + codeType * 0.55 : top + h / 2;
      ctx.fillStyle = INK.sumi;
      ctx.font = mono ? `600 ${codeType}px ${MONO}` : `500 ${codeType * 0.8}px ${SANS}`;
      ctx.fillText(code, cx, codeY, maxW);
      if (g === target && ink > 0) {
        const half = Math.min(ctx.measureText(code).width, maxW) / 2 + 2;
        const y = codeY + codeType * 0.62;
        ctx.strokeStyle = INK.indigo;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx - half, y);
        ctx.lineTo(cx - half + half * 2 * ink, y);
        ctx.stroke();
      }
      if (lines === 0) continue;
      ctx.font = `400 ${ruleType}px ${SANS}`;
      ctx.fillStyle = INK.muted;
      if (lines === 1) {
        ctx.fillText(GATES[g].short, cx, (codeY + codeType * 0.55 + top + h) / 2, maxW);
        continue;
      }
      const ry = codeY + codeType * 0.62 + ruleType * 0.95;
      if (rule.length === 1) ctx.fillText(rule[0], cx, ry + ruleType * 0.6, maxW);
      else {
        ctx.fillText(rule[0], cx, ry, maxW);
        ctx.fillText(rule[1], cx, ry + ruleType * 1.2, maxW);
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /** The trays' insides (back wall, floor, step, inner side): dark, so the paper cards read. */
  function drawTrayInsides(frame) {
    for (let g = 0; g < geo.trays.length; g += 1) {
      const t = geo.trays[g];
      fill(t.back, SHADE.trayIn);
      fill(t.floor, SHADE.trayFloor);
      if (sees(frame, LEFT, t.leftIn[0])) fill(t.leftIn, SHADE.trayWall);
      fill(t.stepTop, SHADE.trayIn);
      fill(t.step, SHADE.trayWall);
      ctx.strokeStyle = INK.sumi;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      stillOutline(ctx, xs, ys, t.back, 300 + g * 7, 0.35);
      ctx.stroke();
    }
  }

  /** The trays' outer faces: the turned left side and the paper front lip (covers the cards' feet). */
  function drawTrayFronts(frame) {
    for (let g = 0; g < geo.trays.length; g += 1) {
      const t = geo.trays[g];
      if (sees(frame, LEFT, t.leftOut[0])) {
        face(t.leftOut, SHADE.side, 340 + g * 3, 1.1);
        hatch(t.leftOut, 360 + g * 9, 0.22);
      }
      face(t.front, SHADE.front, 380 + g * 3, 1.5);
    }
  }

  /** The rail: its top face and front strip, cut open at the gate whose trapdoor is down. */
  function drawRail(frame, flapGate, flapOpen) {
    const r = geo.rail;
    const open = flapGate >= 0 && flapOpen > 0;
    const showTop = sees(frame, UP, r.top[0]);
    if (!open) {
      if (showTop) face(r.top, SHADE.cap, 421, 1);
      face(r.front, SHADE.side, 425, 1.4);
      return;
    }
    const c = geo.cuts[flapGate];
    if (showTop) {
      face(c.topL, SHADE.cap, 421, 1);
      face(c.topR, SHADE.cap, 423, 1);
    }
    face(c.frontL, SHADE.side, 425, 1.4);
    face(c.frontR, SHADE.side, 427, 1.4);
    // two trapdoor leaves swing down from the gap's edges
    const len = GATE_GAP * scale * 0.94;
    const a = flapOpen * 1.4;
    const ca = Math.cos(a) * len;
    const sa = Math.sin(a) * len;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = Math.max(2, scale * 0.045);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(xs[c.hinge], ys[c.hinge]);
    ctx.lineTo(xs[c.hinge] + ca, ys[c.hinge] + sa);
    ctx.moveTo(xs[c.hingeR], ys[c.hingeR]);
    ctx.lineTo(xs[c.hingeR] - ca, ys[c.hingeR] + sa);
    ctx.stroke();
  }

  function drawHopper(frame) {
    const hp = geo.hopper;
    if (sees(frame, LEFT, hp.left[0])) {
      face(hp.left, SHADE.side, 500, 1.3);
      hatch(hp.left, 510, 0.24);
    }
    face(hp.front, SHADE.front, 520, 1.7);
  }

  /** The reading bridge: two posts and the crossbar the pins hang from. */
  function drawBridge(frame) {
    const b = geo.bridge;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2.2, scale * 0.06);
    ctx.beginPath();
    stillLine(ctx, xs[b.posts[0]], ys[b.posts[0]], xs[b.posts[1]], ys[b.posts[1]], 601, 0.3, true);
    stillLine(ctx, xs[b.posts[2]], ys[b.posts[2]], xs[b.posts[3]], ys[b.posts[3]], 603, 0.3, true);
    ctx.stroke();
    if (sees(frame, UP, b.barTop[0])) face(b.barTop, SHADE.cap, 607, 1.1);
    face(b.bar, SHADE.side, 611, 1.6);
  }

  return {
    geo,
    xs,
    ys,
    get scale() {
      return scale;
    },
    project: projectAll,
    drawShadow,
    /** Cabinet and backboard (sides, tops, fronts), back to front. */
    drawBody(frame) {
      drawBox(frame, geo.cabinet, 10);
      drawBox(frame, geo.backboard, 30);
    },
    drawPlaques,
    drawTrayInsides,
    drawTrayFronts,
    drawRail,
    drawHopper,
    drawBridge,
    face,
    fill,
    /** The dial's neck and foot plate on the backboard's top. */
    drawDialMount() {
      face(geo.dial.foot, SHADE.side, 701, 1.3);
      face(geo.dial.neck, SHADE.side, 705, 1.3);
    },
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

