// Kanıt — the code's counter: a small inked cabinet at the end of the row. Its plaque reads "Kod";
// a wheel turns while it works; its window keeps the tally — one bar per lifted mask, signed about
// a ruled axis, then a rule and the summary bar. No figure is ever printed. The rod it runs out
// under the ledge to pull a mask down is drawn by the renderer from `rodBase`.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { SANS } from '../fonts.js';
import { PICKS } from './model.js';
import { SHADE } from './chest.js';
import { COUNTER, COUNTER_AXES, LEDGE_Y, counterPoint } from './world.js';

const W = COUNTER.width;
const H = COUNTER.height;
/** Window rows (v, up from the floor): one per pick, then the summary under a rule. */
const ROWS = Object.freeze([0.86, 0.74, 0.62]);
const RULE_V = 0.53;
const SUM_V = 0.44;
const AXIS_U = W / 2;
const BAR_REACH = W / 2 - 0.12;

function layout() {
  const points = [];
  const add = (u, v, w) => {
    points.push(...counterPoint(u, v, w));
    return points.length / 3 - 1;
  };
  const D = COUNTER.depth;
  const corner = [];
  for (let wi = 0; wi < 2; wi += 1) for (let vi = 0; vi < 2; vi += 1) for (let ui = 0; ui < 2; ui += 1) corner.push(add(ui * W, (vi ? H : 0.12), -wi * D));
  const c = (ui, vi, wi) => corner[ui + 2 * vi + 4 * wi];
  const faces = {
    front: [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)],
    left: [c(0, 0, 1), c(0, 0, 0), c(0, 1, 0), c(0, 1, 1)],
    right: [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)],
    top: [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
  };
  const win = [add(0.08, 0.34, 0.004), add(W - 0.08, 0.34, 0.004), add(W - 0.08, 0.95, 0.004), add(0.08, 0.95, 0.004)];
  const axis = [add(AXIS_U, 0.38, 0.006), add(AXIS_U, 0.92, 0.006)];
  const rule = [add(0.14, RULE_V, 0.006), add(W - 0.14, RULE_V, 0.006)];
  const plaque = [add(0.08, 1.04, 0.004), add(0.46, 1.04, 0.004), add(0.46, 1.22, 0.004), add(0.08, 1.22, 0.004)];
  const plaqueLabel = add(0.27, 1.13, 0.004);
  const wheel = add(W - 0.17, 1.13, 0.01);
  const wheelRim = add(W - 0.17 + 0.085, 1.13, 0.01);
  // four short legs under the cabinet
  const legs = [add(0.06, 0.12, -0.04), add(0.06, 0, -0.04), add(W - 0.06, 0.12, -0.04), add(W - 0.06, 0, -0.04)];
  const rodBase = add(0, LEDGE_Y - 0.12, -0.12); // under the ledge, out of its left side
  const centre = add(W / 2, H / 2, -D / 2);
  return { points: new Float64Array(points), faces, win, axis, rule, plaque, plaqueLabel, wheel, wheelRim, legs, rodBase, centre };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createCounter(ctx) {
  const geo = layout();
  const count = geo.points.length / 3;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const tmp = new Float64Array(4);
  const pt = [0, 0, 0];
  const { right, up } = COUNTER_AXES;
  const left = [-right[0], -right[1], -right[2]];
  let scale = 1;

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

  /** A signed bar about the axis at row height v (counter coords), `amount` of the way inked. */
  function bar(v, value, amount, weight) {
    if (amount <= 0) return;
    counterPoint(AXIS_U, v, 0.008, pt);
    project(frameRef, pt[0], pt[1], pt[2], tmp);
    const x0 = tmp[0];
    const y0 = tmp[1];
    counterPoint(AXIS_U + value * BAR_REACH * amount, v, 0.008, pt);
    project(frameRef, pt[0], pt[1], pt[2], tmp);
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.stroke();
  }

  let frameRef = null;

  /**
   * @param {*} frame
   * @param {{ cards: { bar: number }[], sum: number, crank: number, fade: number }} state
   * @param {readonly { result: number }[]} picks
   */
  function draw(frame, state, picks) {
    frameRef = frame;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    // legs first (behind the box)
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const L = geo.legs;
    stillLine(ctx, xs[L[0]], ys[L[0]], xs[L[1]], ys[L[1]], 600, 0.3, true);
    stillLine(ctx, xs[L[2]], ys[L[2]], xs[L[3]], ys[L[3]], 601, 0.3, true);
    ctx.stroke();
    const { faces } = geo;
    if (facesEye(frame, left, wp(faces.left[0], 0), wp(faces.left[0], 1), wp(faces.left[0], 2))) face(faces.left, SHADE.side, 610, 1.4);
    if (facesEye(frame, right, wp(faces.right[0], 0), wp(faces.right[0], 1), wp(faces.right[0], 2))) face(faces.right, SHADE.side, 612, 1.4);
    if (facesEye(frame, up, wp(faces.top[0], 0), wp(faces.top[0], 1), wp(faces.top[0], 2))) face(faces.top, SHADE.cap, 614, 1.4);
    face(faces.front, SHADE.front, 616, 1.9);
    // the window: paper, an axis, the rule over the summary
    ctx.fillStyle = INK.sheet;
    ctx.beginPath();
    polyPath(ctx, xs, ys, geo.win);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.beginPath();
    stillOutline(ctx, xs, ys, geo.win, 620, 0.3);
    stillOutline(ctx, xs, ys, geo.plaque, 624, 0.25);
    ctx.stroke();
    const base = ctx.globalAlpha;
    ctx.globalAlpha = base * 0.5;
    ctx.beginPath();
    const [a0, a1] = geo.axis;
    stillLine(ctx, xs[a0], ys[a0], xs[a1], ys[a1], 626, 0.2, true);
    ctx.stroke();
    ctx.globalAlpha = base;
    // the tally: one bar per lifted mask, then the summary under its rule
    ctx.strokeStyle = INK.sumi;
    const weight = Math.max(2.2, scale * 0.05);
    ctx.globalAlpha = base * state.fade;
    let sum = 0;
    for (let i = 0; i < PICKS; i += 1) {
      bar(ROWS[i], picks[i].result, state.cards[i].bar, weight);
      sum += picks[i].result;
    }
    if (state.sum > 0) {
      const [r0, r1] = geo.rule;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(xs[r0], ys[r0]);
      ctx.lineTo(xs[r0] + (xs[r1] - xs[r0]) * state.sum, ys[r0] + (ys[r1] - ys[r0]) * state.sum);
      ctx.stroke();
      ctx.strokeStyle = INK.indigo;
      bar(SUM_V, sum / PICKS, state.sum, weight * 1.35);
    }
    ctx.globalAlpha = base;
    // plaque word
    const [p0, , , p3] = geo.plaque;
    const size = Math.min(13, Math.max(8, Math.hypot(xs[p3] - xs[p0], ys[p3] - ys[p0]) * 0.7));
    ctx.font = `500 ${size}px ${SANS}`;
    ctx.fillStyle = INK.sumi;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Kod', xs[geo.plaqueLabel], ys[geo.plaqueLabel] + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // the wheel: a rim and three spokes, turning with the work
    const cx = xs[geo.wheel];
    const cy = ys[geo.wheel];
    const r = Math.max(4, Math.hypot(xs[geo.wheelRim] - cx, ys[geo.wheelRim] - cy));
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
    for (let k = 0; k < 3; k += 1) {
      const a = state.crank + (k * Math.PI * 2) / 3;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  }

  return {
    get scale() {
      return scale;
    },
    project: projectAll,
    draw,
    /** Screen point the rod leaves from (the cabinet's left side, under the ledge). */
    rodBase(out) {
      out[0] = xs[geo.rodBase];
      out[1] = ys[geo.rodBase];
      return out;
    },
    /** Screen point of the cabinet's top-left front corner (for the plate's letter). */
    corner(out) {
      const i = geo.faces.front[3];
      out[0] = xs[i];
      out[1] = ys[i];
      return out;
    },
  };
}
