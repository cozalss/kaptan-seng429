// Şüpheci — the set, inked every frame from world points laid out once: the sea's horizon and swell,
// the ship's rail behind (the portrait's rail), the drafts crate with its stack, and the lookout's
// board on its legs, with their flat cast shadows. Flat washes, dry-brush hatching on turned faces,
// hand-ruled edges. Allocation-free per frame.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { SANS } from '../fonts.js';
import { BOARD, BOARD_AXES, CRATE, CRATE_AXES, RAIL, SLIP, boardPoint, cratePoint } from './world.js';

const SHADE = Object.freeze({
  board: '#e4e7ea', // the portrait's pale grey-blue sky, as a flat wash
  edge: '#a4b0be',
  crate: '#d6dce3',
  crateSide: '#a4b0be',
  crateTop: '#eeede8',
  shadow: 'rgba(43, 66, 97, 0.22)',
});
const LIGHT = Object.freeze([0.55, -1, -0.5]); // from the upper left, behind the viewer
/** Swell strokes under the horizon: x (plate fraction), length (fraction), depth 0 far → 1 near. */
const SWELL = Object.freeze([
  0.03, 0.07, 0.1, 0.18, 0.05, 0.05, 0.3, 0.09, 0.16, 0.5, 0.06, 0.04, 0.64, 0.1, 0.12, 0.84, 0.05, 0.07,
  0.12, 0.08, 0.34, 0.44, 0.07, 0.28, 0.74, 0.09, 0.38, 0.01, 0.12, 0.58, 0.3, 0.08, 0.66, 0.9, 0.06, 0.48,
  0.58, 0.07, 0.82, 0.2, 0.1, 0.9,
]);
const POSTS = Math.floor((RAIL.to - RAIL.from) / RAIL.step) + 1;
const ROPE_STEPS = 6;

/** Builds every world point the set needs; returns index tables for the drawing code. */
function layout() {
  const points = [];
  const add = (p) => {
    points.push(p[0], p[1], p[2]);
    return points.length / 3 - 1;
  };
  // the board: index = si + 2·vi + 4·wi (w = 0 its face, w = 1 its back)
  const b = [];
  for (let wi = 0; wi < 2; wi += 1) {
    for (let vi = 0; vi < 2; vi += 1) {
      for (let si = 0; si < 2; si += 1) b.push(add(boardPoint((si * 2 - 1) * BOARD.halfW, (vi * 2 - 1) * BOARD.halfH, -wi * BOARD.thick)));
    }
  }
  const c = (si, vi, wi) => b[si + 2 * vi + 4 * wi];
  const board = {
    corners: b,
    front: [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)],
    top: [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
    left: [c(0, 0, 1), c(0, 0, 0), c(0, 1, 0), c(0, 1, 1)],
    right: [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)],
    bottom: [c(0, 0, 1), c(1, 0, 1), c(1, 0, 0), c(0, 0, 0)],
  };
  // its legs: two in front under the lower edge, one strut behind; a ledge rail between the front legs
  const legs = [];
  for (const s of [-1, 1]) {
    const top = boardPoint(s * (BOARD.halfW - 0.22), -BOARD.halfH, -BOARD.thick);
    legs.push(add(top), add([top[0], 0, top[2] + 0.05]));
  }
  const strutTop = boardPoint(0, BOARD.halfH * 0.35, -BOARD.thick);
  const back = BOARD_AXES.normal;
  legs.push(add(strutTop), add([strutTop[0] - back[0] * 1.1, 0, strutTop[2] - back[2] * 1.1]));
  const brace = [add(boardPoint(-(BOARD.halfW - 0.22), -BOARD.halfH - 0.32, -BOARD.thick)), add(boardPoint(BOARD.halfW - 0.22, -BOARD.halfH - 0.32, -BOARD.thick))];
  // the crate: index = ui + 2·vi + 4·wi (w = 0 its front)
  const k = [];
  for (let wi = 0; wi < 2; wi += 1) {
    for (let vi = 0; vi < 2; vi += 1) {
      for (let ui = 0; ui < 2; ui += 1) k.push(add(cratePoint((ui - 0.5) * CRATE.width, vi * CRATE.height, (0.5 - wi) * CRATE.depth)));
    }
  }
  const q = (ui, vi, wi) => k[ui + 2 * vi + 4 * wi];
  const crate = {
    corners: k,
    front: [q(0, 0, 0), q(1, 0, 0), q(1, 1, 0), q(0, 1, 0)],
    top: [q(0, 1, 0), q(1, 1, 0), q(1, 1, 1), q(0, 1, 1)],
    left: [q(0, 0, 1), q(0, 0, 0), q(0, 1, 0), q(0, 1, 1)],
    right: [q(1, 0, 0), q(1, 0, 1), q(1, 1, 1), q(1, 1, 0)],
    // a slat line round its middle, and its stencil's centre
    slat: [add(cratePoint(-CRATE.width / 2, CRATE.height * 0.5, CRATE.depth / 2)), add(cratePoint(CRATE.width / 2, CRATE.height * 0.5, CRATE.depth / 2))],
    stencil: add(cratePoint(0, CRATE.height * 0.27, CRATE.depth / 2)),
  };
  // the stack: two sheets lying lengthwise, a hair askew
  const stack = [];
  for (let s = 0; s < 2; s += 1) {
    const lift = CRATE.height + 0.012 + s * 0.016;
    const skew = s ? 0.04 : -0.03;
    for (const [du, dw] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      stack.push(add(cratePoint(du * SLIP.halfH + dw * skew, lift, dw * SLIP.halfW - du * skew)));
    }
  }
  // the rail: posts, the top rail's ends, the rope's sag points between posts
  const rail = [];
  for (let i = 0; i < POSTS; i += 1) {
    const x = RAIL.from + i * RAIL.step;
    rail.push(add([x, 0, RAIL.z]), add([x, RAIL.height, RAIL.z]));
  }
  const rope = [];
  for (let i = 0; i < POSTS - 1; i += 1) {
    for (let j = 0; j <= ROPE_STEPS; j += 1) {
      const f = j / ROPE_STEPS;
      rope.push(add([RAIL.from + (i + f) * RAIL.step, RAIL.rope - RAIL.sag * 4 * f * (1 - f), RAIL.z]));
    }
  }
  const centre = add(BOARD.centre);
  return { points: new Float64Array(points), board, legs, brace, crate, stack, rail, rope, centre };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createProps(ctx) {
  const geo = layout();
  const count = geo.points.length / 3;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const tmp = new Float64Array(4);
  const sx = new Float32Array(4);
  const sy = new Float32Array(4);
  const { right: BR, up: BU, normal: BN } = BOARD_AXES;
  const minus = (v) => Object.freeze([-v[0], -v[1], -v[2]]);
  const BL = minus(BR);
  const BD = minus(BU);
  const CR = CRATE_AXES.right;
  const CL = minus(CR);
  const CN = CRATE_AXES.normal;
  const UP = Object.freeze([0, 1, 0]);
  let scale = 1; // px per world unit at the board
  let horizon = 0;

  function projectAll(frame) {
    const p = geo.points;
    for (let i = 0; i < count; i += 1) {
      project(frame, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], tmp);
      xs[i] = tmp[0];
      ys[i] = tmp[1];
      if (i === geo.centre) scale = tmp[3];
    }
    const F = frame.forward;
    project(frame, frame.eye[0] + F[0] * 600, 0, frame.eye[2] + F[2] * 600, tmp);
    horizon = tmp[1];
  }

  const wp = (i, k) => geo.points[i * 3 + k];
  const sees = (frame, normal, i) => facesEye(frame, normal, wp(i, 0), wp(i, 1), wp(i, 2));

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
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < idx.length; k += 1) {
      minX = Math.min(minX, xs[idx[k]]);
      maxX = Math.max(maxX, xs[idx[k]]);
      minY = Math.min(minY, ys[idx[k]]);
      maxY = Math.max(maxY, ys[idx[k]]);
    }
    const h = maxY - minY;
    if (h < 2 || maxX - minX < 1) return;
    ctx.save();
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.clip();
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

  /** Adds the quad (screen points in sx, sy) to the path, always wound the same way. */
  function quadPath() {
    const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
    const order = area >= 0 ? 0 : 1;
    ctx.moveTo(sx[0], sy[0]);
    for (let k = 1; k < 4; k += 1) {
      const i = order ? 4 - k : k;
      ctx.lineTo(sx[i], sy[i]);
    }
    ctx.closePath();
  }

  /** The ground shadow of a box (8 corners: base 0–3, top 4–7 by the caller's order). */
  function castInto(frame, i, slot) {
    const h = wp(i, 1) / -LIGHT[1];
    project(frame, wp(i, 0) + LIGHT[0] * h, 0, wp(i, 2) + LIGHT[2] * h, tmp);
    sx[slot] = tmp[0];
    sy[slot] = tmp[1];
  }

  /** A box's shadow: its swept outline, quad by quad, under one fill (no doubled alpha). */
  function boxShadow(frame, bottom, top) {
    for (let e = 0; e < 4; e += 1) {
      const a = bottom[e];
      const b = bottom[(e + 1) % 4];
      castInto(frame, a, 0);
      castInto(frame, b, 1);
      castInto(frame, top[(e + 1) % 4], 2);
      castInto(frame, top[e], 3);
      quadPath();
    }
    for (let e = 0; e < 4; e += 1) castInto(frame, top[e], e);
    quadPath();
  }

  const crateBase = [0, 1, 5, 4].map((i) => geo.crate.corners[i]);
  const crateTop = [2, 3, 7, 6].map((i) => geo.crate.corners[i]);
  const boardLow = [0, 1, 5, 4].map((i) => geo.board.corners[i]);
  const boardHigh = [2, 3, 7, 6].map((i) => geo.board.corners[i]);

  return {
    geo,
    get scale() {
      return scale;
    },
    get horizon() {
      return horizon;
    },
    xs,
    ys,
    project: projectAll,

    /** The sea's horizon as a ruled hairline and dry indigo swell down to the rail's foot. */
    drawSea(width, height, alpha) {
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = INK.sumi;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      stillLine(ctx, -4, horizon, width + 4, horizon, 5, 0.35, true);
      ctx.stroke();
      const foot = ys[geo.rail[0]];
      const band = Math.max(8, Math.min(height * 0.42, foot - horizon - 4));
      ctx.strokeStyle = INK.indigo;
      ctx.lineCap = 'round';
      for (let i = 0; i < SWELL.length; i += 3) {
        const depth = SWELL[i + 2];
        const y = horizon + 4 + depth * band;
        ctx.globalAlpha = alpha * (0.1 + 0.16 * depth);
        ctx.lineWidth = 0.8 + depth * 1.3;
        ctx.beginPath();
        const x = SWELL[i] * width;
        stillLine(ctx, x, y, x + SWELL[i + 1] * width * (0.5 + depth), y, i, 0.5, true);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    /** The rail: posts, the top rail and the slack rope between posts. */
    drawRail(alpha) {
      const r = geo.rail;
      ctx.globalAlpha = alpha * 0.62;
      ctx.strokeStyle = INK.sumi;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.2, scale * 0.016);
      ctx.beginPath();
      for (let i = 0; i < r.length; i += 2) stillLine(ctx, xs[r[i]], ys[r[i]], xs[r[i + 1]], ys[r[i + 1]], 90 + i, 0.35, true);
      stillLine(ctx, xs[r[1]], ys[r[1]], xs[r[r.length - 1]], ys[r[r.length - 1]], 83, 0.5, true);
      ctx.stroke();
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const rope = geo.rope;
      for (let i = 0; i < rope.length; i += 1) {
        if (i % (ROPE_STEPS + 1) === 0) ctx.moveTo(xs[rope[i]], ys[rope[i]]);
        else ctx.lineTo(xs[rope[i]], ys[rope[i]]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    },

    drawShadows(frame, alpha) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = SHADE.shadow;
      ctx.beginPath();
      boxShadow(frame, crateBase, crateTop);
      boxShadow(frame, boardLow, boardHigh);
      ctx.fill();
      ctx.globalAlpha = 1;
    },

    /** The drafts crate: turned faces hatched, a slat, its stencil, and the stack on top. */
    drawCrate(frame, alpha) {
      const { crate } = geo;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      if (sees(frame, CL, crate.left[0])) {
        face(crate.left, SHADE.crateSide, 31, 1.4);
        hatch(crate.left, 330, 0.24);
      }
      if (sees(frame, CR, crate.right[0])) {
        face(crate.right, SHADE.crateSide, 33, 1.4);
        hatch(crate.right, 360, 0.24);
      }
      ctx.strokeStyle = INK.sumi;
      if (sees(frame, CN, crate.front[0])) face(crate.front, SHADE.crate, 35, 1.8);
      if (sees(frame, UP, crate.top[0])) face(crate.top, SHADE.crateTop, 37, 1.4);
      const [s0, s1] = crate.slat;
      ctx.lineWidth = 1;
      ctx.beginPath();
      stillLine(ctx, xs[s0], ys[s0], xs[s1], ys[s1], 39, 0.4, true);
      ctx.stroke();
      const size = Math.max(8, Math.min(10, scale * 0.1));
      ctx.font = `500 ${size}px ${SANS}`;
      ctx.fillStyle = INK.sumi;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Taslaklar', xs[crate.stencil], ys[crate.stencil], Math.abs(xs[s1] - xs[s0]) * 0.9);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      // the stack: two sheets lying in it
      ctx.lineWidth = 1;
      for (let s = 0; s < 2; s += 1) {
        ctx.fillStyle = INK.sheet;
        ctx.beginPath();
        ctx.moveTo(xs[geo.stack[s * 4]], ys[geo.stack[s * 4]]);
        for (let k = 1; k < 4; k += 1) ctx.lineTo(xs[geo.stack[s * 4 + k]], ys[geo.stack[s * 4 + k]]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    /** The board on its legs: legs and strut first, then its edges and its face. */
    drawBoard(frame, alpha) {
      const { board, legs, brace } = geo;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.8, scale * 0.04);
      ctx.beginPath();
      for (let i = 0; i < legs.length; i += 2) stillLine(ctx, xs[legs[i]], ys[legs[i]], xs[legs[i + 1]], ys[legs[i + 1]], 50 + i, 0.4, true);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.2, scale * 0.022);
      ctx.beginPath();
      stillLine(ctx, xs[brace[0]], ys[brace[0]], xs[brace[1]], ys[brace[1]], 58, 0.4, true);
      ctx.stroke();
      if (sees(frame, BU, board.top[0])) face(board.top, SHADE.edge, 41, 1.3);
      if (sees(frame, BD, board.bottom[0])) face(board.bottom, SHADE.edge, 43, 1.3);
      if (sees(frame, BL, board.left[0])) {
        face(board.left, SHADE.edge, 45, 1.3);
        hatch(board.left, 410, 0.3);
      }
      if (sees(frame, BR, board.right[0])) {
        face(board.right, SHADE.edge, 47, 1.3);
        hatch(board.right, 440, 0.3);
      }
      if (sees(frame, BN, board.front[0])) face(board.front, SHADE.board, 49, 2.1);
      ctx.globalAlpha = 1;
    },

    /** Screen point of a set landmark for the plate's letters: 'stack' (the crate's top sheet). */
    stackCorner(out) {
      const i = geo.stack[4 + 1];
      out[0] = xs[i];
      out[1] = ys[i];
      return out;
    },
  };
}
