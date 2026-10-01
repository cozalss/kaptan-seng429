// Sınıflandırıcı — the renderer (Canvas 2D). Per frame: aim the pinhole camera, project the
// locker, then draw back to front: the ground (rule, cast shadows), slips still far off behind the
// locker, the locker's body and cubbies (with the slip sliding into one, clipped to its hole), its
// paper front, plaques and tallies, the reader's easel, then every free slip depth-sorted — each an
// affine-mapped sprite, shaded by how far it turns from the eye, carrying its reading rule, title
// underline and type stamp. The plate's letters (a · b · c) sit on top. Every buffer is allocated
// once; nothing here allocates per frame.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { writeQuadAffine } from '../../../lib/ink3d/quad.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { DISPLAY } from '../fonts.js';
import { createLocker } from './locker.js';
import { CAST, STAGES, TIMING } from './model.js';
import { SLIP_CELL, STAMP_CELL, TITLE_LINE, drawSlipSheet, drawStampSheet, slipCell, stampBox } from './sprites.js';
import { CAMERA, LOCKER_AXES, SLIP, STATION, STREAM, insideDepth, slipPlacement } from './world.js';

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const STAMP_H = 0.2; // world units: the impression's height on a slip
const STAMP_AT = Object.freeze([0.07, 0.02, -0.11]); // slip-plane x, y (down), rotation
const ENTRY_PITCH = 0.5; // radians a slip is tipped up as it enters its cubby
const IMPACT_S = 0.28; // seconds the stamp's impact ticks show after it lands
const TRAIL_STEPS = 18;
const TRAIL_DASH = Object.freeze([5, 4]);
const NO_DASH = Object.freeze([]);
/** Impact ticks round a landing stamp: angle, length (world units), pairs. */
const IMPACT_TICKS = Object.freeze([-2.6, 0.05, -1.95, 0.06, -1.2, 0.05, 0.4, 0.05, 2.9, 0.04]);
const EASEL = Object.freeze({ spread: 0.34, depth: 0.28 });
/** Swell strokes under the horizon: x (plate fraction), length (fraction), depth 0 far → 1 near. */
const SWELL = Object.freeze([
  0.04, 0.07, 0.08, 0.2, 0.05, 0.05, 0.31, 0.09, 0.14, 0.52, 0.06, 0.04, 0.63, 0.1, 0.1, 0.83, 0.05, 0.06,
  0.11, 0.08, 0.3, 0.42, 0.07, 0.26, 0.72, 0.09, 0.34, 0.02, 0.12, 0.55, 0.3, 0.08, 0.62, 0.9, 0.06, 0.45,
]);

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createClassifierRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const pos = new Float64Array(3);
  const xf = new Float32Array(CAST.length * 7);
  const flatness = new Float32Array(CAST.length);
  const shade = new Float32Array(CAST.length);
  const keys = new Float32Array(CAST.length);
  const order = new Uint8Array(CAST.length);
  const axes = new Float64Array(6);
  const letters = new Float64Array(4);
  const trailSlip = { stage: STAGES.flight, fly: 0, slide: 0, u: 0, stamp: 0, flutter: 0 };
  const size = { width: 1, height: 1, dpr: 1 };
  const locker = createLocker(ctx);
  const { right: LR, normal: LN } = LOCKER_AXES;

  const images = { slips: null, stamps: null };
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
  promote('stamps', drawStampSheet(doc));

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

  /** The slip's two half-axes: facing the eye (with drift wobble) blended into lying flat. */
  function writeAxes(slip, flat) {
    const R = frame.right;
    const U = frame.up;
    const F = frame.forward;
    const drift = slip.stage === STAGES.stream ? 1 - slip.stream : 0;
    const yaw = 1.0 * Math.sin(slip.u * 1.05 + slip.flutter) * drift + 0.15 * drift;
    const tilt = 0.55 * Math.sin(slip.u * 0.9 + slip.flutter * 1.3) * drift - 0.06;
    const roll = 0.45 * Math.sin(slip.u * 0.7 + slip.flutter * 0.6) * drift + (slip.stage === STAGES.flight ? 0.5 * Math.sin(Math.PI * slip.fly) : 0) - 0.035;
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
    if (flat > 0) {
      const f = flat * flat * (3 - 2 * flat);
      ax += (LR[0] - ax) * f;
      ay += (LR[1] - ay) * f;
      az += (LR[2] - az) * f;
      // it goes in nose-up (so a level eye still sees its face) and lies down as it slides home
      const lie = slip.stage === STAGES.slide ? slip.slide : 0;
      const pitch = ENTRY_PITCH * (1 - lie);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      bx += (-LN[0] * cp - bx) * f;
      by += (sp - by) * f;
      bz += (-LN[2] * cp - bz) * f;
    }
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const la = Math.hypot(ax, ay, az) || 1;
    const lb = Math.hypot(bx, by, bz) || 1;
    ax /= la;
    ay /= la;
    az /= la;
    bx /= lb;
    by /= lb;
    bz /= lb;
    axes[0] = (cr * ax + sr * bx) * SLIP.halfW;
    axes[1] = (cr * ay + sr * by) * SLIP.halfW;
    axes[2] = (cr * az + sr * bz) * SLIP.halfW;
    axes[3] = (-sr * ax + cr * bx) * SLIP.halfH;
    axes[4] = (-sr * ay + cr * by) * SLIP.halfH;
    axes[5] = (-sr * az + cr * bz) * SLIP.halfH;
    // how squarely the slip faces the eye (its normal against the view ray)
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

  /** Places every visible slip: affine, depth, flatness, shade. Returns how many are free. */
  function placeSlips(state) {
    let free = 0;
    for (let k = 0; k < CAST.length; k += 1) {
      const slip = state.slips[k];
      keys[k] = -1;
      if (slip.stage === STAGES.hidden || slip.alpha <= 0.002) continue;
      const flat = slipPlacement(slip, CAST[k].binIndex, pos);
      const facing = writeAxes(slip, flat);
      writeQuadAffine(frame, pos[0], pos[1], pos[2], axes[0], axes[1], axes[2], axes[3], axes[4], axes[5], tmp, xf, k * 7);
      if (xf[k * 7 + 6] <= 0.4) continue;
      flatness[k] = flat;
      shade[k] = 1 - facing;
      keys[k] = xf[k * 7 + 6];
      if (slip.stage !== STAGES.slide || insideDepth(slip) < SLIP.halfH) {
        order[free] = k;
        free += 1;
      }
    }
    // far first (n ≤ 12: insertion sort, no allocation)
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

  /** px per world unit on a slip's plane (for line weights drawn in its own space). */
  function slipScale(k) {
    const o = k * 7;
    return Math.sqrt(Math.abs(xf[o] * xf[o + 3] - xf[o + 1] * xf[o + 2]) / (SLIP.halfW * SLIP.halfH)) || 1;
  }

  function drawSlip(k, slip, alphaScale) {
    const fog = 1 - 0.55 * clamp01((keys[k] - 11) / 12);
    const alpha = slip.alpha * fog * alphaScale;
    if (alpha <= 0.002) return;
    setSlipTransform(k);
    const { sx, sy } = slipCell(k);
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.slips, sx, sy, SLIP_CELL.width, SLIP_CELL.height, -1, -1, 2, 2);
    const turned = shade[k];
    const inside = slip.stage === STAGES.slide ? slip.slide : 0;
    const dark = Math.max(0.42 * turned * turned, 0.7 * inside);
    if (dark > 0.01) {
      ctx.globalAlpha = alpha * dark;
      ctx.fillStyle = inside > 0 ? INK.sumi : INK.indigo;
      ctx.fillRect(-1, -1, 2, 2);
    }
    if (slip.read > 0 || slip.stamp > 0) drawMarks(k, slip, alpha);
    ctx.globalAlpha = 1;
  }

  /** On the slip's own plane (world units, y down): reading rule, title underline, stamp. */
  function drawMarks(k, slip, alpha) {
    const s = slipScale(k);
    ctx.scale(1 / SLIP.halfW, 1 / SLIP.halfH);
    const hw = SLIP.halfW;
    const hh = SLIP.halfH;
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'round';
    // the title, underlined once the reading rule has passed it
    const underline = clamp01((slip.read - 0.22) / 0.26);
    if (underline > 0) {
      const y = (TITLE_LINE.y + 0.07) * hh;
      const x0 = TITLE_LINE.from * hw;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.7 / s;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + (TITLE_LINE.to - TITLE_LINE.from) * hw * underline, y + 0.004);
      ctx.stroke();
    }
    // the reading rule: a straightedge laid across the slip, overhanging it, moving down
    if (slip.read > 0 && slip.read < 1) {
      const y = (-0.86 + 1.72 * slip.read) * hh;
      const fade = Math.min(1, slip.read * 8, (1 - slip.read) * 8);
      ctx.globalAlpha = alpha * fade;
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
    if (slip.stamp > 0) {
      const bin = CAST[k].binIndex;
      const box = stampBox(bin);
      const h = STAMP_H;
      const w = h * (box / 86);
      const p = slip.stamp;
      const fall = (1 - p) * (1 - p);
      ctx.globalAlpha = alpha * Math.min(1, p * 3) * 0.94;
      ctx.translate(STAMP_AT[0], STAMP_AT[1]);
      ctx.rotate(STAMP_AT[2]);
      ctx.scale(1 + 0.55 * fall, 1 + 0.55 * fall);
      ctx.drawImage(images.stamps, bin * STAMP_CELL.width + (STAMP_CELL.width - box) / 2, (STAMP_CELL.height - 86) / 2, box, 86, -w / 2, -h / 2, w, h);
      const hit = (slip.u - (TIMING.stampAt + TIMING.stampFor)) / IMPACT_S;
      if (hit > 0 && hit < 1) drawImpact(w, h, hit, alpha, s * (1 + 0.55 * fall));
    }
  }

  /** The comic's impact ticks round a stamp as it lands: short strokes flying out, then gone. */
  function drawImpact(w, h, hit, alpha, s) {
    ctx.globalAlpha = alpha * (1 - hit);
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.3 / s;
    ctx.beginPath();
    const r0 = 0.62 + 0.35 * hit;
    for (let i = 0; i < IMPACT_TICKS.length; i += 2) {
      const ca = Math.cos(IMPACT_TICKS[i]);
      const sa = Math.sin(IMPACT_TICKS[i]);
      const len = IMPACT_TICKS[i + 1];
      ctx.moveTo(ca * w * r0, sa * h * (r0 + 0.3));
      ctx.lineTo(ca * (w * r0 + len), sa * (h * (r0 + 0.3) + len));
    }
    ctx.stroke();
  }

  /** The course of a slip in flight: a dashed ink arc behind it, drawn on and let go. */
  function drawTrail(state) {
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    for (let k = 0; k < CAST.length; k += 1) {
      const slip = state.slips[k];
      if (slip.stage !== STAGES.flight && slip.stage !== STAGES.slide) continue;
      const head = slip.stage === STAGES.flight ? slip.fly : 1;
      const tail = Math.max(0, head - 0.55);
      const fade = slip.stage === STAGES.slide ? 1 - slip.slide : 1;
      ctx.globalAlpha = 0.5 * fade * state.intro;
      ctx.setLineDash(TRAIL_DASH);
      ctx.beginPath();
      for (let i = 0; i <= TRAIL_STEPS; i += 1) {
        trailSlip.fly = tail + ((head - tail) * i) / TRAIL_STEPS;
        slipPlacement(trailSlip, CAST[k].binIndex, pos);
        project(frame, pos[0], pos[1] - SLIP.halfH * 0.2, pos[2], tmp);
        if (i === 0) ctx.moveTo(tmp[0], tmp[1]);
        else ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    }
    ctx.globalAlpha = 1;
  }

  /** Soft ground shadows under the free slips (none once a slip is in the locker). */
  function drawSlipShadows(state, alphaScale) {
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = INK.indigo;
    for (let k = 0; k < CAST.length; k += 1) {
      const slip = state.slips[k];
      if (keys[k] < 0 || slip.stage === STAGES.slide) continue;
      slipPlacement(slip, CAST[k].binIndex, pos);
      project(frame, pos[0], 0, pos[2], tmp);
      const r = 0.34 * tmp[3];
      const lift = clamp01(1 - pos[1] / 5);
      ctx.globalAlpha = 0.06 * lift * slip.alpha * alphaScale;
      ctx.beginPath();
      ctx.ellipse(tmp[0], tmp[1], r, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The world behind: the sea's horizon as a ruled hairline across the plate (the portrait's sea),
   * and a few dry indigo strokes of swell under it.
   */
  function drawGround(alpha) {
    const F = frame.forward;
    const far = 600;
    project(frame, frame.eye[0] + F[0] * far, 0, frame.eye[2] + F[2] * far, tmp);
    const hy = tmp[1];
    const w = size.width;
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    stillLine(ctx, -4, hy, w + 4, hy, 5, 0.35, true);
    ctx.stroke();
    // swell: short horizontal strokes, denser and longer toward the viewer
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'round';
    for (let i = 0; i < SWELL.length; i += 3) {
      const depth = SWELL[i + 2];
      const y = hy + depth * size.height * 0.2;
      ctx.globalAlpha = alpha * (0.1 + 0.16 * depth);
      ctx.lineWidth = 0.8 + depth * 1.4;
      ctx.beginPath();
      const x = SWELL[i] * w;
      stillLine(ctx, x, y, x + SWELL[i + 1] * w * (0.5 + depth), y, i, 0.5, true);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The reader's easel: two legs and a ledge, the slip read on it. */
  function drawEasel(alpha) {
    const ledge = STATION[1] - SLIP.halfH - 0.03;
    const R = frame.right;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      project(frame, STATION[0] + R[0] * EASEL.spread * side, ledge, STATION[2] + R[2] * EASEL.spread * side - 0.05, tmp);
      const x0 = tmp[0];
      const y0 = tmp[1];
      project(frame, STATION[0] + R[0] * EASEL.spread * 1.5 * side, 0, STATION[2] + R[2] * EASEL.spread * 1.5 * side - EASEL.depth, tmp);
      stillLine(ctx, x0, y0, tmp[0], tmp[1], 70 + side, 0.5, true);
    }
    // the back leg
    project(frame, STATION[0], ledge + 0.2, STATION[2] - 0.1, tmp);
    const bx = tmp[0];
    const by = tmp[1];
    project(frame, STATION[0], 0, STATION[2] - 0.95, tmp);
    stillLine(ctx, bx, by, tmp[0], tmp[1], 77, 0.5, true);
    ctx.stroke();
    // the ledge: a short thick bar under the slip
    project(frame, STATION[0] - R[0] * (SLIP.halfW + 0.08), ledge, STATION[2] - R[2] * (SLIP.halfW + 0.08), tmp);
    const lx = tmp[0];
    const ly = tmp[1];
    project(frame, STATION[0] + R[0] * (SLIP.halfW + 0.08), ledge, STATION[2] + R[2] * (SLIP.halfW + 0.08), tmp);
    ctx.lineWidth = Math.max(1.8, tmp[3] * 0.025);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The plate's letters with hairline leaders: a (the stream), b (the reader), c (the locker). */
  function drawLetters(alpha) {
    const size = Math.max(13, Math.min(17, locker.scale * 0.2));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = `400 ${size}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = (text, px, py, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(px + dx * 0.25, py + dy * 0.25);
      ctx.lineTo(px + dx * 0.75, py + dy * 0.75);
      ctx.stroke();
      if (!placeKey(plateKeys, text, px + dx, py + dy, ctx.globalAlpha)) ctx.fillText(text, px + dx, py + dy);
    };
    // a: on the drift path, a third of the way in
    const s = 0.55;
    const u = 1 - s;
    const px = u * u * u * STREAM[0][0] + 3 * u * u * s * STREAM[1][0] + 3 * u * s * s * STREAM[2][0] + s * s * s * STREAM[3][0];
    const py = u * u * u * STREAM[0][1] + 3 * u * u * s * STREAM[1][1] + 3 * u * s * s * STREAM[2][1] + s * s * s * STREAM[3][1];
    const pz = u * u * u * STREAM[0][2] + 3 * u * u * s * STREAM[1][2] + 3 * u * s * s * STREAM[2][2] + s * s * s * STREAM[3][2];
    project(frame, px, py + 0.62, pz, tmp);
    letter('a', tmp[0], tmp[1], 0, -size * 1.3);
    project(frame, STATION[0] - SLIP.halfW - 0.12, STATION[1] + SLIP.halfH, STATION[2], tmp);
    letter('b', tmp[0], tmp[1], -size * 1.1, -size * 0.9);
    locker.corner(letters);
    letter('c', letters[2], letters[3], -size * 0.9, -size * 1.1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function drawStack(hole) {
    // two resting slips in each cubby, sunk in its shade
    ctx.fillStyle = INK.sheet;
    const { right: r, normal: n } = LOCKER_AXES;
    const p = locker.geo.points;
    {
      for (let s = 0; s < hole.stack.length; s += 1) {
        const i = hole.stack[s];
        project(frame, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], tmp);
        const cx = tmp[0];
        const cy = tmp[1];
        project(frame, p[i * 3] + r[0] * SLIP.halfW, p[i * 3 + 1], p[i * 3 + 2] + r[2] * SLIP.halfW, tmp);
        const ax = tmp[0] - cx;
        const ay = tmp[1] - cy;
        project(frame, p[i * 3] - n[0] * SLIP.halfH, p[i * 3 + 1], p[i * 3 + 2] - n[2] * SLIP.halfH, tmp);
        const bx = tmp[0] - cx;
        const by = tmp[1] - cy;
        ctx.globalAlpha = 0.26;
        ctx.beginPath();
        ctx.moveTo(cx - ax - bx, cy - ay - by);
        ctx.lineTo(cx + ax - bx, cy + ay - by);
        ctx.lineTo(cx + ax + bx, cy + ay + by);
        ctx.lineTo(cx - ax + bx, cy - ay + by);
        ctx.closePath();
        ctx.fill();
      }
    }
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
      // the paper's tooth, re-inked only when the plate changes size
      if (!grain || grain.width !== canvas.width || grain.height !== canvas.height) grain = drawPaperGrain(doc, canvas.width, canvas.height);
    },
    /** @param {ReturnType<import('./model.js').createFrameState>} state */
    render(state) {
      const d = size.dpr;
      const intro = state.intro;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      aim(state);
      locker.project(frame);
      const free = placeSlips(state);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawGround(intro);
      locker.drawShadow(frame, intro);
      drawSlipShadows(state, intro);
      // slips far enough off to pass behind the locker go first
      const lockerDepth = locker.centreDepth() + 0.8;
      let k0 = 0;
      while (k0 < free && keys[order[k0]] > lockerDepth) {
        drawSlip(order[k0], state.slips[order[k0]], intro);
        k0 += 1;
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = intro;
      locker.drawBody(frame, drawStack);
      // a slip sliding into its cubby, seen only through the hole
      for (let k = 0; k < CAST.length; k += 1) {
        const slip = state.slips[k];
        if (keys[k] < 0 || slip.stage !== STAGES.slide || insideDepth(slip) < SLIP.halfH) continue;
        ctx.save();
        ctx.setTransform(d, 0, 0, d, 0, 0);
        locker.clipToHole(CAST[k].binIndex);
        drawSlip(k, slip, intro);
        ctx.restore();
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = intro;
      locker.drawFront();
      locker.drawPlaques(state.target, state.targetGlow);
      locker.drawRibbon();
      locker.drawTallies(state.tallies);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawEasel(intro);
      drawTrail(state);
      for (let i = k0; i < free; i += 1) drawSlip(order[i], state.slips[order[i]], intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
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
