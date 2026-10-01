// Risk Kapısı — the barges: a punt's hull in an indigo wash, its cargo a stack of paper ruled like
// the edge of a ream (the proposal's size), the slab a rule shears off sliding away, the verdict
// stamp struck on the stack's side, a cast shadow and a wake on the water. Each barge is two boxes
// projected through the pinhole camera; faces turned from the eye are skipped. Nothing here
// allocates per frame.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { writeQuadAffine } from '../../../lib/ink3d/quad.js';
import { stillOutline } from '../../../lib/ink3d/paths.js';
import { BARGE, BOX_FACES, FACE, bargeAxes, deckY, writeBox } from './world.js';

const HULL = Object.freeze({ side: '#2b4261', end: '#1d2d44', deck: '#b3bdc9' });
const STACK = Object.freeze({ top: INK.sheet, lit: '#eef0ef', side: '#dfe3e6', end: '#d6dbe0' });
const LIGHT = Object.freeze([-0.55, 0.75, 0.35]); // from the upper left, a little in front
const STAMP = Object.freeze({ halfH: 0.13, rotate: -0.06 });
const FACE_NORMALS = 5;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ canvas: CanvasImageSource | null, widths: number[], cell: { width: number, height: number }, impression: number }} stamps
 */
export function createBargeInk(ctx, stamps) {
  const ax = new Float64Array(6);
  const pts = new Float64Array(24 * 3); // hull, stack, slab
  const xs = new Float32Array(24);
  const ys = new Float32Array(24);
  const normals = new Float64Array(FACE_NORMALS * 3);
  const tmp = new Float64Array(4);
  const xf = new Float32Array(7);
  const loop = new Uint8Array(4);
  let frame = null;
  let dpr = 1;

  function projectPoints(from, count) {
    for (let i = from; i < from + count; i += 1) {
      project(frame, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], tmp);
      xs[i] = tmp[0];
      ys[i] = tmp[1];
    }
  }

  function writeNormals() {
    // top, near, far, bow, stern
    normals[0] = 0;
    normals[1] = 1;
    normals[2] = 0;
    normals[3] = ax[3];
    normals[4] = 0;
    normals[5] = ax[5];
    normals[6] = -ax[3];
    normals[7] = 0;
    normals[8] = -ax[5];
    normals[9] = ax[0];
    normals[10] = 0;
    normals[11] = ax[2];
    normals[12] = -ax[0];
    normals[13] = 0;
    normals[14] = -ax[2];
  }

  function faceVisible(f, base) {
    const c = (base + BOX_FACES[f][0]) * 3;
    const e = frame.eye;
    return normals[f * 3] * (e[0] - pts[c]) + normals[f * 3 + 1] * (e[1] - pts[c + 1]) + normals[f * 3 + 2] * (e[2] - pts[c + 2]) > 0;
  }

  /** Light on a face: 0 turned away → 1 square to the sun. */
  const lit = (f) => Math.max(0, normals[f * 3] * LIGHT[0] + normals[f * 3 + 1] * LIGHT[1] + normals[f * 3 + 2] * LIGHT[2]);

  function setLoop(f, base) {
    const idx = BOX_FACES[f];
    for (let k = 0; k < 4; k += 1) loop[k] = base + idx[k];
  }

  function fillLoop(fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(xs[loop[0]], ys[loop[0]]);
    ctx.lineTo(xs[loop[1]], ys[loop[1]]);
    ctx.lineTo(xs[loop[2]], ys[loop[2]]);
    ctx.lineTo(xs[loop[3]], ys[loop[3]]);
    ctx.closePath();
    ctx.fill();
  }

  function outlineLoop(seed, width) {
    ctx.lineWidth = width;
    ctx.beginPath();
    stillOutline(ctx, xs, ys, loop, seed, 0.35);
    ctx.stroke();
  }

  /** Ruled page edges across a vertical face of the stack, from its bottom edge up. */
  function pages(heightWorld, alpha) {
    const n = Math.floor(heightWorld / BARGE.page);
    if (n < 1) return;
    const [a, b, c, d] = loop;
    ctx.globalAlpha = alpha * 0.32;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let k = 1; k <= n; k += 1) {
      const f = (k * BARGE.page) / heightWorld;
      if (f > 0.97) break;
      ctx.moveTo(xs[a] + (xs[d] - xs[a]) * f, ys[a] + (ys[d] - ys[a]) * f);
      ctx.lineTo(xs[b] + (xs[c] - xs[b]) * f, ys[b] + (ys[c] - ys[b]) * f);
    }
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  /** One box (hull or stack) at `base`: its visible faces, washed by how they face the light. */
  function drawBox(base, kind, alpha, seed, heightWorld) {
    ctx.strokeStyle = INK.sumi;
    for (let f = 1; f < FACE_NORMALS; f += 1) {
      if (!faceVisible(f, base)) continue;
      setLoop(f, base);
      const l = lit(f);
      if (kind === 0) fillLoop(f === FACE.near || f === FACE.far ? HULL.side : HULL.end);
      else fillLoop(f === FACE.bow || f === FACE.stern ? STACK.end : l > 0.2 ? STACK.lit : STACK.side);
      if (kind === 0 && (f === FACE.near || f === FACE.far)) {
        // the gunwale: a paper stroke just under the deck
        ctx.strokeStyle = INK.sheet;
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const [a, b, c, d] = loop;
        ctx.moveTo(xs[a] + (xs[d] - xs[a]) * 0.78, ys[a] + (ys[d] - ys[a]) * 0.78);
        ctx.lineTo(xs[b] + (xs[c] - xs[b]) * 0.78, ys[b] + (ys[c] - ys[b]) * 0.78);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = INK.sumi;
      }
      if (kind === 1) pages(heightWorld, alpha);
      outlineLoop(seed + f * 7, kind === 0 ? 1.4 : 1.1);
    }
    if (faceVisible(FACE.top, base)) {
      setLoop(FACE.top, base);
      fillLoop(kind === 0 ? HULL.deck : STACK.top);
      outlineLoop(seed + 3, kind === 0 ? 1.4 : 1.1);
    }
  }

  /** The verdict stamp, struck on the side of the stack that faces the viewer. */
  function drawStamp(barge, alpha) {
    if (barge.verdict < 0 || barge.stamp <= 0 || !stamps.canvas) return;
    const near = ax[5] >= 0 ? 1 : -1;
    const deck = deckY(barge.size, barge.bob);
    const h = barge.size * BARGE.cargoHeight;
    const box = stamps.widths[barge.verdict];
    const halfW = STAMP.halfH * (box / stamps.impression);
    const p = barge.stamp;
    const fall = 1 + 0.5 * (1 - p) * (1 - p);
    const cx = barge.x + ax[0] * -BARGE.cargoAft + ax[3] * (BARGE.cargoWidth + 0.004) * near;
    const cz = barge.z + ax[2] * -BARGE.cargoAft + ax[5] * (BARGE.cargoWidth + 0.004) * near;
    const cy = deck + Math.min(h * 0.55, h - STAMP.halfH - 0.02);
    const cr = Math.cos(STAMP.rotate);
    const sr = Math.sin(STAMP.rotate);
    // text runs along the barge, reading left to right on the near side
    const fx = ax[0] * near;
    const fz = ax[2] * near;
    writeQuadAffine(
      frame,
      cx,
      cy,
      cz,
      (fx * cr) * halfW * fall,
      sr * halfW * fall,
      (fz * cr) * halfW * fall,
      -fx * sr * STAMP.halfH * fall,
      cr * STAMP.halfH * fall,
      -fz * sr * STAMP.halfH * fall,
      tmp,
      xf,
      0,
    );
    ctx.setTransform(xf[0] * dpr, xf[1] * dpr, xf[2] * dpr, xf[3] * dpr, xf[4] * dpr, xf[5] * dpr);
    ctx.globalAlpha = alpha * Math.min(1, p * 3) * 0.94;
    const { cell, impression } = stamps;
    ctx.drawImage(stamps.canvas, barge.verdict * cell.width + (cell.width - box) / 2, (cell.height - impression) / 2, box, impression, -1, -1, 2, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return {
    begin(nextFrame, nextDpr) {
      frame = nextFrame;
      dpr = nextDpr;
    },

    /** Depth of a barge's centre from the eye (for back-to-front order). */
    depth(barge) {
      project(frame, barge.x, 0.3, barge.z, tmp);
      return tmp[2];
    },

    /** The cast shadow on the water and the wake behind a moving barge. */
    drawWater(barge, alpha) {
      bargeAxes(barge.yaw, ax);
      ctx.globalAlpha = alpha * barge.alpha;
      ctx.fillStyle = 'rgba(43, 66, 97, 0.16)';
      const sx = 0.2;
      const sz = -0.14;
      ctx.beginPath();
      for (let k = 0; k < 4; k += 1) {
        const l = k === 0 || k === 3 ? -1 : 1;
        const w = k < 2 ? -1 : 1;
        project(frame, barge.x + ax[0] * l * BARGE.halfLength + ax[3] * w * BARGE.halfWidth + sx, 0, barge.z + ax[2] * l * BARGE.halfLength + ax[5] * w * BARGE.halfWidth + sz, tmp);
        if (k === 0) ctx.moveTo(tmp[0], tmp[1]);
        else ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.closePath();
      ctx.fill();
      if (barge.wake <= 0.02) return;
      // two strokes opening out behind the stern
      const bx = barge.x - ax[0] * BARGE.halfLength;
      const bz = barge.z - ax[2] * BARGE.halfLength;
      const len = 0.75 * barge.wake;
      ctx.strokeStyle = INK.indigo;
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * barge.alpha * 0.45 * barge.wake;
      ctx.beginPath();
      for (let side = -1; side <= 1; side += 2) {
        project(frame, bx + ax[3] * side * 0.18, 0, bz + ax[5] * side * 0.18, tmp);
        ctx.moveTo(tmp[0], tmp[1]);
        project(frame, bx - ax[0] * len + ax[3] * side * (0.18 + len * 0.3), 0, bz - ax[2] * len + ax[5] * side * (0.18 + len * 0.3), tmp);
        ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.stroke();
    },

    /** The barge itself: hull, stack (and a shed slab), its stamp. */
    draw(barge, alpha, seed) {
      const a = alpha * barge.alpha;
      if (a <= 0.002) return;
      bargeAxes(barge.yaw, ax);
      writeNormals();
      const deck = deckY(barge.size, barge.bob);
      const h = barge.size * BARGE.cargoHeight;
      writeBox(pts, 0, ax, barge.x, barge.z, 0, deck, BARGE.keelLength, BARGE.keelWidth, BARGE.halfLength, BARGE.halfWidth);
      writeBox(pts, 24, ax, barge.x, barge.z, deck, deck + h, BARGE.cargoLength, BARGE.cargoWidth, BARGE.cargoLength, BARGE.cargoWidth, -BARGE.cargoAft);
      projectPoints(0, 16);
      ctx.globalAlpha = a;
      drawBox(0, 0, a, seed, deck);
      drawBox(8, 1, a, seed + 40, h);
      if (barge.slab >= 0) {
        // the sheared slab slides off astern, tips and sinks, fading
        const p = barge.slab;
        const drop = p * p * (deck + barge.slabTo * BARGE.cargoHeight + 0.1);
        const y0 = deck + barge.slabFrom * BARGE.cargoHeight - drop;
        const y1 = deck + barge.slabTo * BARGE.cargoHeight - drop;
        writeBox(pts, 48, ax, barge.x, barge.z, y0, y1, BARGE.cargoLength, BARGE.cargoWidth, BARGE.cargoLength, BARGE.cargoWidth, -BARGE.cargoAft - 0.75 * p);
        projectPoints(16, 8);
        const sa = a * (1 - p * p);
        ctx.globalAlpha = sa;
        drawBox(16, 1, sa, seed + 80, (barge.slabTo - barge.slabFrom) * BARGE.cargoHeight);
      }
      drawStamp(barge, a);
      ctx.globalAlpha = 1;
    },

    /** Where a barge's mooring line is made fast (near side forward, or far side for the harbour). */
    cleat(barge, side, along, out) {
      bargeAxes(barge.yaw, ax);
      const y = deckY(barge.size, barge.bob);
      out[0] = barge.x + ax[0] * along + ax[3] * BARGE.halfWidth * side;
      out[1] = y;
      out[2] = barge.z + ax[2] * along + ax[5] * BARGE.halfWidth * side;
      return out;
    },
  };
}
