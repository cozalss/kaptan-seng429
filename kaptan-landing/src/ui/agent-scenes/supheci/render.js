// Şüpheci — the renderer (Canvas 2D). Per frame: aim the pinhole camera, project the set, then draw
// back to front: the sea and the ship's rail, cast shadows, the drafts crate, the board, the slips
// (each an affine-mapped sprite carrying its own ink: the ring round a find, the ruled cut on the
// size bar, the strike and the Veto stamp, the struck-out "büyüt" ghost), the spyglass's field on
// the pinned slip, the screen-set words (sızıntı, abartı, küçült, büyüt, açık yok), the spyglass
// itself and the plate's letters (a · b · c). Every buffer is allocated once.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { writeQuadAffine } from '../../../lib/ink3d/quad.js';
import { DISPLAY, SANS } from '../fonts.js';
import { CAST, LAYOUT, SPOTS, STAGES } from './model.js';
import { createProps } from './props.js';
import { createSpyglass } from './spyglass.js';
import { SLIP_CELL, STAMP_CELL, drawSlipSheet, drawStampSheet, slipCellX } from './sprites.js';
import { CAMERA, SLIP, SPYGLASS, slipPoint, slipPose, spyglassPose } from './world.js';

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const MAGNIFY = 1.7;
const RING = Object.freeze({ rx: 0.26, ry: 0.2, steps: 30, turn: 1.12 });
const STAMP = Object.freeze({ x: 0.5, y: -0.46, rot: -0.14, h: 0.3 });
const GHOST = Object.freeze({ len: 0.34, arrow: 0.2 });
const DASH = Object.freeze([4, 3]);
const NO_DASH = Object.freeze([]);
const HW = SLIP.halfW;
const HH = SLIP.halfH;
const BAR = LAYOUT.bar;
/** Draw order: the pinned slip, then the one leaving, then the one arriving (it passes in front). */
const STAGE_ORDER = Object.freeze([STAGES.board, STAGES.leave, STAGES.approach]);

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createSkepticRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const pose = new Float64Array(9);
  const spyPose = new Float64Array(9);
  const xf = new Float32Array(CAST.length * 7);
  const pt = new Float32Array(2);
  const corner = new Float32Array(2);
  const cBar = Object.freeze(slipPoint(BAR.x0, BAR.y + BAR.h / 2));
  const size = { width: 1, height: 1, dpr: 1 };
  const props = createProps(ctx);
  const glass = createSpyglass(ctx);

  const images = { slips: null, stamp: null };
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
  promote('stamp', drawStampSheet(doc));

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

  function placeSlip(k, slip) {
    slipPose(slip, pose);
    writeQuadAffine(frame, pose[0], pose[1], pose[2], pose[3], pose[4], pose[5], pose[6], pose[7], pose[8], tmp, xf, k * 7);
  }

  /** The slip's own space on the canvas, in world units (x right, y down). */
  function slipSpace(k) {
    const o = k * 7;
    const d = size.dpr;
    ctx.setTransform(xf[o] * d, xf[o + 1] * d, xf[o + 2] * d, xf[o + 3] * d, xf[o + 4] * d, xf[o + 5] * d);
    ctx.scale(1 / HW, 1 / HH);
  }

  /** px per world unit on a slip's plane. */
  function slipScale(k) {
    const o = k * 7;
    return Math.sqrt(Math.abs(xf[o] * xf[o + 3] - xf[o + 1] * xf[o + 2]) / (HW * HH)) || 1;
  }

  /** A point given in slip space ([-1, 1]², y down) on the canvas (CSS px), into `pt`. */
  function onSlip(k, sx, sy) {
    const o = k * 7;
    pt[0] = xf[o + 4] + xf[o] * sx + xf[o + 2] * sy;
    pt[1] = xf[o + 5] + xf[o + 1] * sx + xf[o + 3] * sy;
    return pt;
  }

  function drawSprite(k, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.slips, slipCellX(k), 0, SLIP_CELL.width, SLIP_CELL.height, -HW, -HH, HW * 2, HH * 2);
  }

  /** The spyglass's field on the pinned slip: the slip under it, magnified, in a ruled ring. */
  function drawField(k, spy, alpha) {
    const fx = spy.fx * HW;
    const fy = spy.fy * HH;
    const r = SPYGLASS.view;
    const s = slipScale(k);
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK.sheet;
    ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
    ctx.translate(fx, fy);
    ctx.scale(MAGNIFY, MAGNIFY);
    ctx.translate(-fx, -fy);
    drawSprite(k, alpha);
    ctx.restore();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.8 / s;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.7 / s;
    ctx.beginPath();
    ctx.arc(fx, fy, r - 3.2 / s, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** A hand-drawn ring round a find, inked on over `p` (0 → 1): a little more than one turn. */
  function drawRing(spot, p, s, alpha) {
    const cx = spot[0] * HW;
    const cy = spot[1] * HH;
    const steps = Math.max(2, Math.round(RING.steps * p));
    const sweep = Math.PI * 2 * RING.turn * p;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 2.3 / s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const a = -2.3 + (sweep * i) / steps;
      const wob = 1 + 0.06 * Math.sin(a * 3 + 1) + 0.05 * (a / (Math.PI * 2));
      const x = cx + Math.cos(a) * RING.rx * wob;
      const y = cy + Math.sin(a) * RING.ry * wob;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /** Paper laid over part of the size bar, the removed part left as a dashed outline. */
  function wipeBar(from, to, p, s, alpha) {
    const y = BAR.y * HH;
    const h = BAR.h * HH;
    if (to - from < 1e-3 || p <= 0) return;
    ctx.globalAlpha = alpha * p;
    ctx.fillStyle = INK.sheet;
    ctx.fillRect(from, y - h / 2 + 2 / s, to - from, h - 4 / s);
    ctx.globalAlpha = alpha * p * 0.6;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 1 / s;
    ctx.setLineDash(DASH);
    ctx.lineDashOffset = 0;
    ctx.strokeRect(from, y - h / 2 + 3.5 / s, to - from - 1.5 / s, h - 7 / s);
    ctx.setLineDash(NO_DASH);
  }

  function drawCut(slip, cast, s, alpha) {
    const x0 = BAR.x0 * HW;
    const x1 = BAR.x1 * HW;
    const y = BAR.y * HH;
    const h = BAR.h * HH;
    const end = x0 + (x1 - x0) * cast.size;
    const cut = x0 + (x1 - x0) * cast.size * 0.5;
    wipeBar(cut + 1.5 / s, end, slip.wipe, s, alpha);
    // the ruled cut: down across the bar, overhanging it
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 2.6 / s;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cut, y - h * 1.15);
    ctx.lineTo(cut + 0.004, y - h * 1.15 + h * 2.3 * slip.cut);
    ctx.stroke();
  }

  function drawVeto(slip, cast, s, alpha) {
    const x0 = BAR.x0 * HW;
    wipeBar(x0 + 1.5 / s, x0 + (BAR.x1 * HW - x0) * cast.size, slip.strike, s, alpha);
    // the strike: one brush stroke corner to corner, thick at its start
    const p = slip.strike;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.6 / s;
    ctx.beginPath();
    const ax = -0.9 * HW;
    const ay = -0.84 * HH;
    const bx = 0.9 * HW;
    const by = 0.9 * HH;
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + (bx - ax) * p, ay + (by - ay) * p + 0.02 * Math.sin(Math.PI * p));
    ctx.stroke();
    if (slip.stamp <= 0) return;
    const q = slip.stamp;
    const fall = (1 - q) * (1 - q);
    const h = STAMP.h;
    const w = h * (STAMP_CELL.width / STAMP_CELL.height);
    ctx.save();
    ctx.globalAlpha = alpha * Math.min(1, q * 3) * 0.94;
    ctx.translate(STAMP.x * HW, STAMP.y * HH);
    ctx.rotate(STAMP.rot);
    ctx.scale(1 + 0.5 * fall, 1 + 0.5 * fall);
    ctx.drawImage(images.stamp, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** The joke: a ghosted extension of the bar with its arrow, then one ruled line through it. */
  function drawGhost(slip, s, alpha) {
    if (slip.ghost <= 0.002) return;
    const x1 = BAR.x1 * HW;
    const y = BAR.y * HH;
    const h = BAR.h * HH;
    const g = slip.ghost;
    ctx.globalAlpha = alpha * g * 0.6;
    ctx.strokeStyle = INK.muted;
    ctx.lineWidth = 1.1 / s;
    ctx.setLineDash(DASH);
    ctx.strokeRect(x1, y - h / 2, GHOST.len * g, h);
    ctx.setLineDash(NO_DASH);
    const ax = x1 + GHOST.len + 0.04;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.lineTo(ax + GHOST.arrow * g, y);
    ctx.moveTo(ax + GHOST.arrow * g - 0.05, y - 0.04);
    ctx.lineTo(ax + GHOST.arrow * g, y);
    ctx.lineTo(ax + GHOST.arrow * g - 0.05, y + 0.04);
    ctx.stroke();
  }

  /** The slip's own ink, in its space: ring, cut or strike and stamp, or the struck ghost. */
  function drawMarks(k, slip, alpha) {
    const cast = CAST[k];
    const s = slipScale(k);
    if (slip.ring > 0) drawRing(cast.kind === 'leak' ? SPOTS.leak : SPOTS.puff, slip.ring, s, alpha);
    if (cast.verdict === 'kucult' && slip.cut > 0) drawCut(slip, cast, s, alpha);
    else if (cast.verdict === 'veto' && slip.strike > 0) drawVeto(slip, cast, s, alpha);
    else if (cast.verdict === 'aynen') drawGhost(slip, s, alpha);
  }

  function labelFont(k) {
    const px = Math.max(9, Math.min(12, slipScale(k) * 0.125));
    ctx.font = `500 ${px}px ${SANS}`;
    return px;
  }

  /** A word set beside the slip on the board, with a hairline leader from (lx, ly) in slip space. */
  function label(k, text, lx, ly, tx, ty, align, alpha, colour = INK.indigo, strike = 0) {
    if (alpha <= 0.01) return;
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const px = labelFont(k);
    onSlip(k, lx, ly);
    const ax = pt[0];
    const ay = pt[1];
    onSlip(k, tx, ty);
    const gap = 3;
    const ex = align === 'right' ? pt[0] + gap : pt[0] - gap;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 0.8;
    if (lx !== tx || ly !== ty) {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ex, pt[1]);
      ctx.stroke();
    }
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    // set on a scrap of paper, so the rail's lines never run through the word
    const w = ctx.measureText(text).width;
    const left = align === 'center' ? pt[0] - w / 2 : align === 'right' ? pt[0] - w : pt[0];
    ctx.fillStyle = INK.paper;
    ctx.globalAlpha = Math.min(1, alpha * 1.4) * 0.92;
    ctx.fillRect(left - 2, pt[1] - px * 0.62, w + 4, px * 1.24);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.fillText(text, pt[0], pt[1]);
    if (strike > 0) {
      // struck out: one ruled line through the word, overhanging it
      const x0 = left;
      ctx.globalAlpha = Math.min(1, alpha * 2.2);
      ctx.strokeStyle = INK.sumi;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0 - 4, pt[1] + 1);
      ctx.lineTo(x0 - 4 + (w + 8) * strike, pt[1] - 1);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawLabels(k, slip, alpha) {
    const cast = CAST[k];
    const a = alpha * (slip.stage === STAGES.board ? 1 : 1 - clamp01(slip.move * 5));
    if (a <= 0.01) return;
    if (cast.kind === 'leak') {
      label(k, cast.finding, SPOTS.leak[0] - RING.rx / HW, SPOTS.leak[1], -1.07, SPOTS.leak[1], 'right', a * slip.tag);
      label(k, 'küçült', BAR.x1 + 0.03, BAR.y, 1.07, BAR.y, 'left', a * slip.wipe);
    } else if (cast.kind === 'puff') {
      label(k, cast.finding, SPOTS.puff[0] + RING.rx / HW, SPOTS.puff[1], 1.07, SPOTS.puff[1], 'left', a * slip.tag);
    } else {
      label(k, 'açık yok', 1.07, -0.12, 1.07, -0.12, 'left', a * slip.clear);
      const gx = BAR.x1 + (GHOST.len / 2) / HW;
      label(k, 'büyüt', gx, BAR.y - 0.3, gx, BAR.y - 0.3, 'center', a * slip.ghost * 0.75, INK.muted, slip.ghostStrike);
    }
  }

  function drawPins(k, alpha) {
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const r = Math.max(1.6, slipScale(k) * 0.03);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      onSlip(k, side * 0.94, -0.92);
      ctx.moveTo(pt[0] + r, pt[1]);
      ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function drawSlips(state, alpha) {
    const spy = state.spy;
    for (let o = 0; o < STAGE_ORDER.length; o += 1) {
      for (let k = 0; k < CAST.length; k += 1) {
        const slip = state.slips[k];
        if (slip.stage !== STAGE_ORDER[o] || slip.alpha <= 0.002) continue;
        placeSlip(k, slip);
        if (xf[k * 7 + 6] <= 0.4) continue;
        const a = alpha * slip.alpha;
        slipSpace(k);
        drawSprite(k, a);
        const pinned = slip.stage === STAGES.board;
        if (pinned && spy.slip === k && spy.view > 0.01) drawField(k, spy, a * spy.view);
        drawMarks(k, slip, a);
        if (pinned) drawPins(k, a * clamp01(slip.u / 0.15));
        drawLabels(k, slip, alpha);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGlass(state, alpha) {
    const spy = state.spy;
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    spyglassPose(spy.fx, spy.fy, spy.bob, spyPose);
    glass.place(frame, spyPose);
    project(frame, spyPose[6], spyPose[7], spyPose[8], tmp);
    glass.drawSight(tmp[0], tmp[1], SPYGLASS.view * tmp[3], alpha * spy.view);
    glass.draw(alpha, spy.bob);
  }

  /** The plate's letters with hairline leaders: a (the drafts), b (the spyglass), c (the size bar). */
  function drawLetters(alpha) {
    const px = Math.max(13, Math.min(17, props.scale * 0.2));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = `400 ${px}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    props.stackCorner(corner);
    letter('a', corner[0], corner[1], -px * 0.6, -px * 1.4);
    const a = glass.anchor;
    letter('b', a[4], a[5], -px * 0.4, px * 1.5);
    // c: the size bar, where it is pinned on the board
    project(frame, cBar[0], cBar[1], cBar[2], tmp);
    letter('c', tmp[0], tmp[1], -px * 0.4, px * 1.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function letter(text, x, y, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 0.25, y + dy * 0.25);
    ctx.lineTo(x + dx * 0.72, y + dy * 0.72);
    ctx.stroke();
    if (!placeKey(plateKeys, text, x + dx, y + dy, ctx.globalAlpha)) ctx.fillText(text, x + dx, y + dy);
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
      props.project(frame);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      props.drawSea(size.width, size.height, intro);
      props.drawRail(intro);
      props.drawShadows(frame, intro);
      props.drawCrate(frame, intro);
      props.drawBoard(frame, intro);
      drawSlips(state, intro);
      drawGlass(state, intro);
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

