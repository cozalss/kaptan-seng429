// Uyum — the renderer (Canvas 2D). Per frame: aim the pinhole camera, project the props, then draw
// back to front: the sea's horizon and swell, the ship's rail, cast shadows, slips far off, the
// sealed box (a stopped slip dropping through its slot is clipped to above the lid), the desk under
// the lantern's light, the free slips depth-sorted — each an affine-mapped sprite carrying what the
// light raised and what Uyum inked on it (tick, ring, strike, flag) — then the lantern itself and
// the plate's letters (a · b · c). Every buffer is allocated once; nothing here allocates per frame.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { writeQuadAffine } from '../../../lib/ink3d/quad.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { DISPLAY } from '../fonts.js';
import { CAST, STAGES, VERDICTS } from './model.js';
import { createScenery } from './scenery.js';
import { HIDDEN_CELL, ROWS, SLIP_CELL, STAMP_CELL, drawHiddenLine, drawSlipSheet, drawStamp } from './sprites.js';
import { BOX_AXES, CAMERA, DESK, SLIP, WAIT, slipPose } from './world.js';

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const TRAIL_STEPS = 16;
const TRAIL_DASH = Object.freeze([5, 4]);
const NO_DASH = Object.freeze([]);
const DIM = 0.2; // how dark a slip on the desk reads before the lantern is turned up
/** Swell strokes under the horizon: x (plate fraction), length (fraction), depth 0 far → 1 near. */
const SWELL = Object.freeze([
  0.03, 0.08, 0.1, 0.18, 0.05, 0.04, 0.34, 0.09, 0.16, 0.55, 0.06, 0.05, 0.66, 0.1, 0.12, 0.86, 0.05, 0.07,
  0.12, 0.07, 0.32, 0.44, 0.07, 0.28, 0.74, 0.09, 0.36, 0.05, 0.1, 0.58, 0.9, 0.06, 0.46,
]);

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createUyumRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const pose = new Float64Array(5);
  const pos = new Float64Array(3);
  const xf = new Float32Array(CAST.length * 7);
  const shade = new Float32Array(CAST.length);
  const keys = new Float32Array(CAST.length);
  const order = new Uint8Array(CAST.length);
  const axes = new Float64Array(6);
  const corner = new Float64Array(2);
  const trail = { stage: STAGES.flight, fly: 0, drop: 0, exit: 0, u: 0, mark: 0, flutter: 0, stream: 1 };
  const size = { width: 1, height: 1, dpr: 1 };
  const scenery = createScenery(ctx);
  const { right: BR } = BOX_AXES;

  const images = { slips: null, hidden: null, stamp: null };
  let grain = null;
  const promote = (key, source) => {
    images[key] = source;
    if (typeof createImageBitmap !== 'function') return;
    createImageBitmap(source)
      .then((bitmap) => {
        if (images[key] === source) images[key] = bitmap;
        else bitmap.close?.();
      })
      .catch(() => {}); // the canvas itself keeps working as the source
  };
  promote('slips', drawSlipSheet(doc));
  promote('hidden', drawHiddenLine(doc));
  promote('stamp', drawStamp(doc));

  function aim(state) {
    const focal = Math.min(size.height / CAMERA.spanY, size.width / CAMERA.spanX) * CAMERA.distance;
    aimFrame(frame, {
      target: CAMERA.target,
      yaw: CAMERA.yaw + state.camera.yaw,
      pitch: CAMERA.pitch + state.camera.pitch,
      distance: CAMERA.distance,
      focal,
      cx: size.width * CAMERA.centerX,
      cy: size.height * CAMERA.centerY,
    });
  }

  /**
   * The slip's two half-axes: facing the eye (with drift wobble), blended onto the desk's board
   * (pose[3]) and then upright into the slot's plane (pose[4]). Returns how squarely it faces the eye.
   */
  function writeAxes(slip) {
    const R = frame.right;
    const U = frame.up;
    const F = frame.forward;
    const drift = slip.stage === STAGES.stream ? 1 - slip.stream : 0;
    const flight = slip.stage === STAGES.flight ? Math.sin(Math.PI * slip.fly) : 0;
    const going = slip.stage === STAGES.exit ? slip.exit : 0;
    const yaw = 1.0 * Math.sin(slip.u * 1.05 + slip.flutter) * drift - 0.15 * drift + 0.5 * going;
    const tilt = 0.55 * Math.sin(slip.u * 0.9 + slip.flutter * 1.3) * drift - 0.05 + 0.3 * going;
    const roll = 0.45 * Math.sin(slip.u * 0.7 + slip.flutter * 0.6) * drift - 0.4 * flight - 0.6 * going * going + 0.03;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    let ax = cy * R[0] + sy * F[0];
    let ay = cy * R[1] + sy * F[1];
    let az = cy * R[2] + sy * F[2];
    let bx = ct * U[0] + st * F[0];
    let by = ct * U[1] + st * F[1];
    let bz = ct * U[2] + st * F[2];
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const rax = cr * ax + sr * bx;
    const ray = cr * ay + sr * by;
    const raz = cr * az + sr * bz;
    bx = -sr * ax + cr * bx;
    by = -sr * ay + cr * by;
    bz = -sr * az + cr * bz;
    ax = rax;
    ay = ray;
    az = raz;
    const d = pose[3] * pose[3] * (3 - 2 * pose[3]);
    if (d > 0) {
      ax += (DESK.right[0] - ax) * d;
      ay += (DESK.right[1] - ay) * d;
      az += (DESK.right[2] - az) * d;
      bx += (DESK.up[0] - bx) * d;
      by += (DESK.up[1] - by) * d;
      bz += (DESK.up[2] - bz) * d;
    }
    const s = pose[4] * pose[4] * (3 - 2 * pose[4]);
    if (s > 0) {
      ax += (BR[0] - ax) * s;
      ay += (BR[1] - ay) * s;
      az += (BR[2] - az) * s;
      bx += (0 - bx) * s;
      by += (1 - by) * s;
      bz += (0 - bz) * s;
    }
    const la = Math.hypot(ax, ay, az) || 1;
    const lb = Math.hypot(bx, by, bz) || 1;
    axes[0] = (ax / la) * SLIP.halfW;
    axes[1] = (ay / la) * SLIP.halfW;
    axes[2] = (az / la) * SLIP.halfW;
    axes[3] = (bx / lb) * SLIP.halfH;
    axes[4] = (by / lb) * SLIP.halfH;
    axes[5] = (bz / lb) * SLIP.halfH;
    const nx = axes[1] * axes[5] - axes[2] * axes[4];
    const ny = axes[2] * axes[3] - axes[0] * axes[5];
    const nz = axes[0] * axes[4] - axes[1] * axes[3];
    const nl = Math.hypot(nx, ny, nz) || 1;
    const vx = frame.eye[0] - pos[0];
    const vy = frame.eye[1] - pos[1];
    const vz = frame.eye[2] - pos[2];
    const vl = Math.hypot(vx, vy, vz) || 1;
    return Math.abs((nx * vx + ny * vy + nz * vz) / (nl * vl));
  }

  /** Places every visible slip: affine, depth, shade. Returns how many are free (not dropping). */
  function placeSlips(state) {
    let free = 0;
    for (let k = 0; k < CAST.length; k += 1) {
      const slip = state.slips[k];
      keys[k] = -1;
      if (slip.stage === STAGES.hidden || slip.alpha <= 0.002) continue;
      slipPose(slip, pose);
      pos[0] = pose[0];
      pos[1] = pose[1];
      pos[2] = pose[2];
      const facing = writeAxes(slip);
      writeQuadAffine(frame, pos[0], pos[1], pos[2], axes[0], axes[1], axes[2], axes[3], axes[4], axes[5], tmp, xf, k * 7);
      if (xf[k * 7 + 6] <= 0.4) continue;
      shade[k] = 1 - facing;
      keys[k] = xf[k * 7 + 6];
      if (slip.stage === STAGES.drop) continue;
      order[free] = k;
      free += 1;
    }
    for (let i = 1; i < free; i += 1) {
      const v = order[i];
      let j = i - 1;
      while (j >= 0 && keys[order[j]] < keys[v]) {
        order[j + 1] = order[j];
        j -= 1;
      }
      order[j + 1] = v;
    }
    return free;
  }

  function setSlipTransform(k) {
    const o = k * 7;
    const d = size.dpr;
    ctx.setTransform(xf[o] * d, xf[o + 1] * d, xf[o + 2] * d, xf[o + 3] * d, xf[o + 4] * d, xf[o + 5] * d);
  }

  /** px per world unit on a slip's plane. */
  function slipScale(k) {
    const o = k * 7;
    return Math.sqrt(Math.abs(xf[o] * xf[o + 3] - xf[o + 1] * xf[o + 2]) / (SLIP.halfW * SLIP.halfH)) || 1;
  }

  function drawSlip(k, slip, alphaScale) {
    const fog = 1 - 0.55 * clamp01((keys[k] - 12) / 14);
    const alpha = slip.alpha * fog * alphaScale;
    if (alpha <= 0.002) return;
    setSlipTransform(k);
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.slips, k * SLIP_CELL.width, 0, SLIP_CELL.width, SLIP_CELL.height, -1, -1, 2, 2);
    const turned = shade[k];
    const onDesk = slip.stage === STAGES.desk ? 1 - slip.lit : 0;
    const dark = Math.max(0.42 * turned * turned, DIM * onDesk);
    if (dark > 0.01) {
      ctx.globalAlpha = alpha * dark;
      ctx.fillStyle = INK.indigo;
      ctx.fillRect(-1, -1, 2, 2);
    }
    if (slip.scan > 0 || slip.reveal > 0 || slip.mark > 0) drawMarks(k, slip, alpha);
    ctx.globalAlpha = 1;
  }

  /** On the slip's own plane (world units, y down): straightedge, what the light raised, Uyum's ink. */
  function drawMarks(k, slip, alpha) {
    const s = slipScale(k);
    const kind = CAST[k].kind;
    const hw = SLIP.halfW;
    const hh = SLIP.halfH;
    ctx.scale(1 / hw, 1 / hh);
    ctx.lineCap = 'round';
    if (slip.reveal > 0 && kind === VERDICTS.inject) {
      // the pale line between the lines, raised by the light
      const w = hw * 1.78;
      const h = w * (HIDDEN_CELL.height / HIDDEN_CELL.width);
      ctx.globalAlpha = alpha * slip.reveal * 0.78;
      ctx.drawImage(images.hidden, -w / 2, ROWS.hidden * hh - h * 0.5, w, h);
    }
    if (slip.reveal > 0 && kind === VERDICTS.tedbir) {
      const fx0 = ROWS.fieldFrom * hw;
      const fx1 = ROWS.fieldTo * hw;
      const w = (fx1 - fx0) * 0.92;
      const h = w * (STAMP_CELL.height / STAMP_CELL.width);
      ctx.globalAlpha = alpha * slip.reveal * 0.92;
      ctx.drawImage(images.stamp, (fx0 + fx1) / 2 - w / 2, ROWS.file * hh - h * 0.55, w, h);
    }
    if (slip.scan > 0 && slip.scan < 1) {
      const y = (-0.86 + 1.72 * slip.scan) * hh;
      ctx.globalAlpha = alpha * Math.min(1, slip.scan * 8, (1 - slip.scan) * 8);
      ctx.strokeStyle = INK.indigo;
      ctx.lineWidth = 1.2 / s;
      ctx.beginPath();
      ctx.moveTo(-hw - 0.07, y);
      ctx.lineTo(hw + 0.07, y);
      ctx.moveTo(-hw - 0.07, y - 0.035);
      ctx.lineTo(-hw - 0.07, y + 0.035);
      ctx.moveTo(hw + 0.07, y - 0.035);
      ctx.lineTo(hw + 0.07, y + 0.035);
      ctx.stroke();
    }
    if (slip.mark > 0) drawVerdict(kind, slip.mark, alpha, s);
    if (slip.flag > 0) drawFlag(slip.flag, alpha, s);
  }

  /** Uyum's ink: a tick in the empty field, a ring round the stamp, a ruled strike through the hidden line. */
  function drawVerdict(kind, mark, alpha, s) {
    const hw = SLIP.halfW;
    const hh = SLIP.halfH;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    if (kind === VERDICTS.pass) {
      ctx.strokeStyle = INK.indigo;
      ctx.lineWidth = 2 / s;
      const x = (ROWS.fieldFrom + 0.12) * hw;
      const y = ROWS.file * hh;
      const a = Math.min(1, mark * 2.2);
      const b = clamp01(mark * 2.2 - 1);
      ctx.moveTo(x, y - 0.006);
      ctx.lineTo(x + 0.03 * a, y + 0.026 * a);
      if (b > 0) ctx.lineTo(x + 0.03 + 0.07 * b, y + 0.026 - 0.07 * b);
    } else if (kind === VERDICTS.tedbir) {
      ctx.strokeStyle = INK.sumi;
      ctx.lineWidth = 1.6 / s;
      const cx = ((ROWS.fieldFrom + ROWS.fieldTo) / 2) * hw;
      const cy = ROWS.file * hh - 0.004;
      const start = -2.4;
      ctx.ellipse(cx, cy, (ROWS.fieldTo - ROWS.fieldFrom) * hw * 0.62, 0.075, -0.06, start, start + Math.PI * 2.15 * mark);
    } else {
      ctx.strokeStyle = INK.sumi;
      ctx.lineWidth = 1.5 / s;
      const y = ROWS.hidden * hh - 0.01;
      const x0 = -hw * 0.92;
      const x1 = hw * 0.9;
      ctx.moveTo(x0, y + 0.006);
      ctx.lineTo(x0 + (x1 - x0) * mark, y + 0.006 - 0.012 * mark);
    }
    ctx.stroke();
  }

  /** The injection flag: a pin at the slip's top right and an indigo pennant on it. */
  function drawFlag(flag, alpha, s) {
    const hw = SLIP.halfW;
    const hh = SLIP.halfH;
    const x = hw * 0.72;
    const y0 = -hh * 0.92;
    const pole = 0.22 * flag;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.3 / s;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + 0.02 * flag, y0 - pole);
    ctx.stroke();
    if (flag < 0.25) return;
    const p = (flag - 0.25) / 0.75;
    const tx = x + 0.02 * flag;
    const ty = y0 - pole;
    ctx.fillStyle = INK.indigo;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + 0.15 * p, ty + 0.04 + 0.01 * p);
    ctx.lineTo(tx, ty + 0.09);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /** The course of a stopped slip: a dashed ink arc behind it, from the desk to the slot. */
  function drawTrail(state) {
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    for (let k = 0; k < CAST.length; k += 1) {
      const slip = state.slips[k];
      if (slip.stage !== STAGES.flight && slip.stage !== STAGES.drop) continue;
      const head = slip.stage === STAGES.flight ? slip.fly : 1;
      const tail = Math.max(0, head - 0.55);
      const fade = slip.stage === STAGES.drop ? 1 - slip.drop : 1;
      ctx.globalAlpha = 0.5 * fade * state.intro;
      ctx.setLineDash(TRAIL_DASH);
      ctx.beginPath();
      for (let i = 0; i <= TRAIL_STEPS; i += 1) {
        trail.fly = tail + ((head - tail) * i) / TRAIL_STEPS;
        slipPose(trail, pose);
        project(frame, pose[0], pose[1] - SLIP.halfH * 0.2, pose[2], tmp);
        if (i === 0) ctx.moveTo(tmp[0], tmp[1]);
        else ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    }
    ctx.globalAlpha = 1;
  }

  /** Soft ground shadows under the free slips. */
  function drawSlipShadows(state, alphaScale) {
    ctx.fillStyle = INK.indigo;
    for (let k = 0; k < CAST.length; k += 1) {
      const slip = state.slips[k];
      if (keys[k] < 0 || slip.stage === STAGES.drop || slip.stage === STAGES.desk) continue;
      slipPose(slip, pose);
      project(frame, pose[0], 0, pose[2], tmp);
      const r = 0.34 * tmp[3];
      ctx.globalAlpha = 0.06 * clamp01(1 - pose[1] / 5) * slip.alpha * alphaScale;
      ctx.beginPath();
      ctx.ellipse(tmp[0], tmp[1], r, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The sea's horizon as a ruled hairline and a few dry indigo strokes of swell (the portrait's sea). */
  function drawGround(alpha) {
    const F = frame.forward;
    project(frame, frame.eye[0] + F[0] * 600, 0, frame.eye[2] + F[2] * 600, tmp);
    const hy = tmp[1];
    const w = size.width;
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    stillLine(ctx, -4, hy, w + 4, hy, 5, 0.35, true);
    ctx.stroke();
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'round';
    for (let i = 0; i < SWELL.length; i += 3) {
      const depth = SWELL[i + 2];
      const y = hy + depth * size.height * 0.11;
      ctx.globalAlpha = alpha * (0.1 + 0.16 * depth);
      ctx.lineWidth = 0.8 + depth * 1.2;
      ctx.beginPath();
      const x = SWELL[i] * w;
      stillLine(ctx, x, y, x + SWELL[i + 1] * w * (0.5 + depth), y, i, 0.5, true);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The plate's letters with hairline leaders: a (the stream), b (the desk under the lantern), c (the box). */
  function drawLetters(alpha) {
    const px = Math.max(13, Math.min(17, scenery.deskScale * 0.17));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = `400 ${px}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = (text, x, y, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * 0.25, y + dy * 0.25);
      ctx.lineTo(x + dx * 0.75, y + dy * 0.75);
      ctx.stroke();
      if (!placeKey(plateKeys, text, x + dx, y + dy, ctx.globalAlpha)) ctx.fillText(text, x + dx, y + dy);
    };
    project(frame, WAIT[0] + SLIP.halfW + 0.05, WAIT[1] + SLIP.halfH, WAIT[2], tmp);
    letter('a', tmp[0], tmp[1], px * 0.9, -px * 0.9);
    scenery.deskCorner(corner);
    letter('b', corner[0], corner[1], -px * 1.1, px * 0.5);
    scenery.boxCorner(corner);
    letter('c', corner[0], corner[1], px * 0.9, -px * 1.1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  return {
    canvas,
    setSize(width, height, dpr) {
      size.width = Math.max(1, width);
      size.height = Math.max(1, height);
      size.dpr = dpr;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      if (!grain || grain.width !== canvas.width || grain.height !== canvas.height) grain = drawPaperGrain(doc, canvas.width, canvas.height);
    },
    /** @param {ReturnType<import('./model.js').createFrameState>} state */
    render(state) {
      const d = size.dpr;
      const intro = state.intro;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      aim(state);
      scenery.project(frame);
      const free = placeSlips(state);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawGround(intro);
      scenery.drawBoxShadow(frame, intro);
      scenery.drawDeskShadow(frame, intro);
      drawSlipShadows(state, intro);
      // slips far enough off to pass behind the box go first
      const boxDepth = scenery.centreDepth() + 0.8;
      let k0 = 0;
      while (k0 < free && keys[order[k0]] > boxDepth) {
        drawSlip(order[k0], state.slips[order[k0]], intro);
        k0 += 1;
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      scenery.drawBoxBody(frame, intro);
      scenery.drawBoxFront(intro, state.glow, state.orders);
      // a stopped slip going down through the grille: only what is above the lid shows
      for (let k = 0; k < CAST.length; k += 1) {
        const slip = state.slips[k];
        if (keys[k] < 0 || slip.stage !== STAGES.drop) continue;
        ctx.save();
        ctx.setTransform(d, 0, 0, d, 0, 0);
        scenery.clipAboveSlot();
        drawSlip(k, slip, intro);
        ctx.restore();
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      scenery.drawBottle(frame, intro);
      scenery.drawDesk(intro, state.lantern.lit);
      scenery.drawBeam(frame, intro, state.lantern);
      drawTrail(state);
      for (let i = k0; i < free; i += 1) drawSlip(order[i], state.slips[order[i]], intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      scenery.drawLantern(frame, intro, state.lantern);
      drawLetters(intro);
      if (grain) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(grain, 0, 0);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    },
    dispose() {
      grain = null;
      canvas.width = 0;
      canvas.height = 0;
      for (const key of Object.keys(images)) {
        images[key]?.close?.();
        images[key] = null;
      }
    },
  };
}

