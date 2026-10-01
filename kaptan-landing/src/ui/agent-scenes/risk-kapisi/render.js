// Risk Kapısı — the renderer (Canvas 2D). Per frame: aim the pinhole camera, then draw back to
// front: the rain, the railing and the far quay with its rule tags and bollards, the harbour's
// lines, the water with the barges' shadows and wakes, the far half of the gate, every barge
// depth-sorted (the harbour's two included), the gauge arms and the boom over them, the near quay
// with the queue's lines, the near half of the gate with the kill switch, and the plate's letters
// (a · b · c). Every buffer is allocated once; nothing here allocates per frame.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { DISPLAY } from '../fonts.js';
import { createBargeInk } from './barges.js';
import { CANAL, CAST, HARBOUR, RULE_COUNT, STAGES } from './model.js';
import { createScenery } from './scenery.js';
import { IMPRESSION, STAMP_CELL, drawStampSheet } from './sprites.js';
import { BOLLARD, BOLLARD_X, CAMERA, HARBOUR_POSTS, POST, QUAY, QUEUE_POSTS } from './world.js';

const TOTAL = CAST.length + HARBOUR.length;
const TIED = Object.freeze([STAGES.arrive, STAGES.moored, STAGES.shift, STAGES.drift]);

/** The harbour's barges as barge states that never change (bob aside). */
function harbourBarges() {
  return HARBOUR.map((b) => ({ stage: STAGES.moored, alpha: 1, x: b.x, z: CANAL.back, yaw: 0, size: b.size, slab: -1, slabFrom: 0, slabTo: 0, stamp: 0, verdict: -1, wake: 0, bob: 0, seed: b.seed }));
}

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createGateRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const end = new Float64Array(3);
  const pt = new Float64Array(2);
  const keys = new Float32Array(TOTAL);
  const order = new Uint8Array(TOTAL);
  const harbour = harbourBarges();
  const size = { width: 1, height: 1, dpr: 1 };
  const sheet = drawStampSheet(doc);
  const stamps = { canvas: sheet.canvas, widths: sheet.widths, cell: STAMP_CELL, impression: IMPRESSION };
  const scenery = createScenery(ctx);
  const ink = createBargeInk(ctx, stamps);
  let grain = null;
  if (typeof createImageBitmap === 'function') {
    createImageBitmap(sheet.canvas)
      .then((bitmap) => {
        if (stamps.canvas === sheet.canvas) stamps.canvas = bitmap;
        else bitmap.close?.();
      })
      .catch(() => {}); // the canvas itself keeps working as the source
  }

  const bargeAt = (state, i) => (i < CAST.length ? state.barges[i] : harbour[i - CAST.length]);

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

  /** Visible barges, far first (n ≤ 9: insertion sort, no allocation). Returns the count. */
  function sortBarges(state) {
    let n = 0;
    for (let i = 0; i < TOTAL; i += 1) {
      const barge = bargeAt(state, i);
      if (barge.stage === STAGES.hidden || barge.alpha <= 0.002) continue;
      keys[i] = ink.depth(barge);
      order[n] = i;
      n += 1;
    }
    for (let i = 1; i < n; i += 1) {
      const v = order[i];
      let j = i - 1;
      while (j >= 0 && keys[order[j]] < keys[v]) {
        order[j + 1] = order[j];
        j -= 1;
      }
      order[j + 1] = v;
    }
    return n;
  }

  /** The harbour's lines: bow and stern, made fast to the far quay's posts — they never slacken. */
  function drawHarbourLines(alpha) {
    for (let b = 0; b < harbour.length; b += 1) {
      for (let e = 0; e < 2; e += 1) {
        const post = HARBOUR_POSTS[b * 2 + e];
        ink.cleat(harbour[b], -1, e ? 0.36 : -0.36, end);
        scenery.rope(post[0], post[1] + POST.height, post[2], end[0], end[1], end[2], 1, alpha * 0.85);
      }
    }
  }

  /** The queue's lines: made fast to a moored barge, or hanging slack into the water. */
  function drawQueueLines(state, alpha) {
    for (let p = 0; p < QUEUE_POSTS.length; p += 1) {
      const post = QUEUE_POSTS[p];
      const x = CANAL.queue[p];
      let tied = 0;
      let barge = null;
      for (let k = 0; k < CAST.length; k += 1) {
        const b = state.barges[k];
        if (b.alpha <= 0.01 || b.ropeX !== x || !TIED.includes(b.stage)) continue;
        if (b.rope > tied || !barge) {
          tied = b.rope;
          barge = b;
        }
      }
      // let go, the line is hauled in to a coil on the quay by its post
      const cx = post[0] + 0.24;
      const cz = post[2] + 0.1;
      scenery.coil(cx, cz, alpha);
      if (barge && tied > 0.01) {
        ink.cleat(barge, 1, 0.34, end);
        const f = 1 - tied;
        end[0] += (cx - end[0]) * f;
        end[1] += (QUAY.top - end[1]) * f;
        end[2] += (cz - end[2]) * f;
        scenery.rope(post[0], post[1] + POST.height * 0.8, post[2], end[0], end[1], end[2], tied, alpha);
      }
    }
  }

  /** The plate's letters with hairline leaders: a (the queue), b (the rules), c (the kill switch). */
  function drawLetters(alpha) {
    const s = Math.max(13, Math.min(17, scenery.scale * 0.24));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = `400 ${s}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = (text, px, py, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(px + dx * 0.25, py + dy * 0.25);
      ctx.lineTo(px + dx * 0.75, py + dy * 0.75);
      ctx.stroke();
      if (!placeKey(plateKeys, text, px + dx, py + dy, ctx.globalAlpha)) ctx.fillText(text, px + dx, py + dy);
    };
    project(frame, CANAL.queue[0], 1.0, CANAL.main, tmp);
    letter('a', tmp[0], tmp[1], -s * 0.3, -s * 1.2);
    project(frame, BOLLARD_X[5], QUAY.top + BOLLARD.height + 0.1, BOLLARD.z, tmp);
    letter('b', tmp[0], tmp[1], -s * 0.6, -s * 1.5);
    scenery.leverPoint(pt);
    letter('c', pt[0], pt[1], s * 1.2, s * 1.3);
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
      scenery.begin(frame, size.width);
      ink.begin(frame, d);
      for (let b = 0; b < harbour.length; b += 1) harbour[b].bob = 0.01 * Math.sin(state.t * 1.3 + harbour[b].seed);
      const n = sortBarges(state);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      scenery.drawFar(intro);
      const lettered = scenery.drawTags(state.rules, intro);
      scenery.drawBollards(intro);
      scenery.drawWater(intro);
      for (let i = 0; i < n; i += 1) ink.drawWater(bargeAt(state, order[i]), intro);
      drawHarbourLines(intro);
      scenery.drawGateBack(intro);
      for (let i = 0; i < n; i += 1) {
        const k = order[i];
        ink.draw(bargeAt(state, k), intro, k < CAST.length ? 100 + k * 37 : harbour[k - CAST.length].seed * 50);
      }
      scenery.drawArms(state.rules, intro);
      scenery.drawNearQuay(intro);
      drawQueueLines(state, intro);
      scenery.drawGateFront(state.lever, intro, true);
      // small labels over bollards whose tags are too small to letter (phones), over everything
      if (lettered < RULE_COUNT) scenery.drawRuleLabels(state.rules, intro);
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
      stamps.canvas?.close?.();
      stamps.canvas = null;
    },
  };
}
