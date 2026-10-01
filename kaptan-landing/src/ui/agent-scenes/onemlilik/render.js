// Önemlilik — the renderer (Canvas 2D). Per frame: aim the pinhole camera, project the balance,
// then draw back to front: the sea's horizon and the ship's rail behind, ground shadows, the
// purser's chest, the spar and the hanger, the back cords, the beam, the dial (its face, the rules'
// threshold, the needle), the pans, the loads — the amount's weight and the two ledgers, with a
// dashed course behind whatever is in flight — and the front cords. The plate's letters (a · b · c)
// sit on top, the paper's grain over all. Every buffer is allocated once.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { DISPLAY } from '../fonts.js';
import { CAST, TIMING } from './model.js';
import { createProps } from './props.js';
import { createRig } from './rig.js';
import { drawDialFace, fontCache } from './sprites.js';
import { BALANCE, CAMERA, CHEST, bookPlacement, bookYaw, weightPlacement } from './world.js';

const TRAIL_STEPS = 16;
const TRAIL_DASH = Object.freeze([5, 4]);
const NO_DASH = Object.freeze([]);
/** The ship's rail behind the balance (the portrait's): world z, post spacing, its height. */
const RAIL = Object.freeze({ z: -4.6, from: -9, to: 11, step: 2.2, top: 1.05 });
/** Swell strokes under the horizon: x (plate fraction), length (fraction), depth 0 far → 1 near. */
const SWELL = Object.freeze([
  0.04, 0.07, 0.08, 0.2, 0.05, 0.05, 0.31, 0.09, 0.14, 0.52, 0.06, 0.04, 0.63, 0.1, 0.1, 0.83, 0.05, 0.06,
  0.11, 0.08, 0.3, 0.42, 0.07, 0.26, 0.72, 0.09, 0.34, 0.02, 0.12, 0.55,
]);

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createBalanceRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const pos = new Float64Array(3);
  const trail = { visible: true, fly: 0, leave: 0, alpha: 1 };
  const size = { width: 1, height: 1, dpr: 1 };
  const letterFont = fontCache(400, DISPLAY);
  const images = { dial: null };
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
  promote('dial', drawDialFace(doc));
  const rig = createRig(ctx, images);
  const props = createProps(ctx);

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

  /** The sea's horizon as a ruled hairline and a few dry strokes of swell under it. */
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
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'round';
    for (let i = 0; i < SWELL.length; i += 3) {
      const depth = SWELL[i + 2];
      const y = hy + depth * size.height * 0.16;
      ctx.globalAlpha = alpha * (0.1 + 0.14 * depth);
      ctx.lineWidth = 0.8 + depth * 1.2;
      ctx.beginPath();
      const x = SWELL[i] * w;
      stillLine(ctx, x, y, x + SWELL[i + 1] * w * (0.5 + depth), y, i, 0.5, true);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The ship's rail behind: posts under a heavy top rail, the deck's edge at their feet. */
  function drawRail(alpha) {
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha * 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let seed = 800;
    for (let x = RAIL.from; x <= RAIL.to; x += RAIL.step) {
      project(frame, x, 0, RAIL.z, tmp);
      const x0 = tmp[0];
      const y0 = tmp[1];
      project(frame, x, RAIL.top, RAIL.z, tmp);
      stillLine(ctx, x0, y0, tmp[0], tmp[1], seed, 0.3, true);
      seed += 1;
    }
    ctx.stroke();
    project(frame, RAIL.from, RAIL.top, RAIL.z, tmp);
    const tx = tmp[0];
    const ty = tmp[1];
    project(frame, RAIL.to, RAIL.top, RAIL.z, tmp);
    ctx.globalAlpha = alpha * 0.55;
    ctx.lineWidth = Math.max(1.8, tmp[3] * 0.04);
    ctx.beginPath();
    stillLine(ctx, tx, ty, tmp[0], tmp[1], 860, 0.6, true);
    ctx.stroke();
    // the deck's edge under the rail
    project(frame, RAIL.from, 0, RAIL.z, tmp);
    const dx = tmp[0];
    const dy = tmp[1];
    project(frame, RAIL.to, 0, RAIL.z, tmp);
    ctx.globalAlpha = alpha * 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    stillLine(ctx, dx, dy, tmp[0], tmp[1], 870, 0.5, true);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The dashed course behind a load in flight, drawn on and let go. */
  function drawTrail(state, which, alpha) {
    const load = which < 0 ? state.weight : state.books[which];
    if (!load.visible || load.fly >= 1 || load.fly <= 0) return;
    const head = load.fly;
    const tail = Math.max(0, head - 0.5);
    ctx.globalAlpha = 0.5 * alpha * Math.min(1, (1 - head) * 6);
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.setLineDash(TRAIL_DASH);
    ctx.beginPath();
    for (let i = 0; i <= TRAIL_STEPS; i += 1) {
      trail.fly = tail + ((head - tail) * i) / TRAIL_STEPS;
      if (which < 0) weightPlacement(trail, state.theta, pos);
      else bookPlacement(which, trail, state.weighing, state.theta, pos);
      project(frame, pos[0], pos[1] + 0.12, pos[2], tmp);
      if (i === 0) ctx.moveTo(tmp[0], tmp[1]);
      else ctx.lineTo(tmp[0], tmp[1]);
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = 1;
  }

  /** The loads: the ledgers (lower one first) and the weight, each where its clock puts it. */
  function drawLoads(state, alpha) {
    const c = CAST[state.weighing];
    for (let k = 0; k < state.books.length; k += 1) {
      const book = state.books[k];
      if (!book.visible || book.alpha <= 0.002) continue;
      bookPlacement(k, book, state.weighing, state.theta, pos);
      props.drawBook(frame, alpha * book.alpha, k, pos, c.books[k], bookYaw(book));
    }
    const weight = state.weight;
    if (weight.visible && weight.alpha > 0.002) {
      weightPlacement(weight, state.theta, pos);
      // the tag swings as it is carried and settles once set down
      const swing = weight.fly < 1 ? 0.35 * Math.sin(weight.fly * Math.PI * 2.2) * (1 - weight.fly) : 0.05 * Math.sin(state.u * 2.1) * Math.exp(-(state.u - TIMING.weightFrom - TIMING.weightFor) * 1.5);
      props.drawWeight(frame, alpha * weight.alpha, pos, c.weight, swing + 0.25 * weight.leave);
    }
  }

  /** One letter at (x, y) + (dx, dy), with a hairline leader back to the point. */
  function letter(text, x, y, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 0.25, y + dy * 0.25);
    ctx.lineTo(x + dx * 0.75, y + dy * 0.75);
    ctx.stroke();
    if (!placeKey(plateKeys, text, x + dx, y + dy, ctx.globalAlpha)) ctx.fillText(text, x + dx, y + dy);
  }

  /** The plate's letters with hairline leaders: a (the amount), b (the ledgers), c (the dial). */
  function drawLetters(alpha) {
    const px = rig.scr.pivot[3];
    const fs = Math.max(13, Math.min(17, px * 0.22));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = letterFont(fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // a: by the left pan, where the amount is set down
    const [lx, , lz] = BALANCE.pivot;
    const pan = rig.scr.pan[0];
    const rim = rig.scr.rim[0];
    letter('a', pan[0] - rim[0] - 2, pan[1] - rim[1], -fs * 1.0, fs * 0.6);
    // b: the chest the ledgers come from
    project(frame, CHEST.x + CHEST.width / 2 + 0.05, CHEST.height + 0.2, CHEST.z, tmp);
    letter('b', tmp[0], tmp[1], fs * 0.9, -fs * 1.0);
    // c: the dial
    project(frame, lx - BALANCE.dialR * 0.75, BALANCE.pivot[1] + BALANCE.dialR * 0.75, lz + BALANCE.dialZ, tmp);
    letter('c', tmp[0], tmp[1], -fs * 1.0, -fs * 0.8);
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
      rig.place(frame, state.theta);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawGround(intro);
      drawRail(intro);
      props.drawChestShadow(frame, intro);
      rig.drawShadows(frame, intro, state.theta);
      props.drawChest(frame, intro, state.label);
      rig.drawSpar(frame, intro);
      rig.drawHanger(frame, intro);
      rig.drawCords(intro, false);
      rig.drawBeam(intro);
      rig.drawDial(frame, intro, d);
      rig.drawPans(intro, d);
      drawTrail(state, -1, intro);
      drawTrail(state, 0, intro);
      drawTrail(state, 1, intro);
      drawLoads(state, intro);
      rig.drawCords(intro, true);
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
      images.dial?.close?.();
      images.dial = null;
    },
  };
}
