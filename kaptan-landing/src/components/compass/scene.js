// The ink scene renderer (Canvas 2D, no WebGL): paper slips projected through a pinhole camera,
// depth-sorted and drawn from a pre-inked sprite sheet with one affine transform each; three brush
// rings on one axis (back halves behind the slips, front halves over them); the approved slip,
// its stamp and the compass. It draws only when asked (the caller renders on demand) and keeps
// every per-frame buffer preallocated.

import { aimFrame, createFrame, project } from './camera.js';
import { writeCardTransform } from '../../lib/ink3d/quad.js';
import { FACE_MARGIN, drawCompass, drawCompassFace, drawNeedle } from './dial.js';
import { FUNNEL, SLIP, buildCards, createPoseBuffers, writeCardPoses } from './funnel.js';
import { INK, brushRibbon, makeCanvas, noise1 } from './ink.js';
import { CELL, SLIP_ASPECT, TONES, drawApprovedSlip, drawSlipSheet, drawStamp } from './sprites.js';

const RING_STEPS = 128;
const TAU = Math.PI * 2;
const MAX_YAW = 1.0; // radians: a slip never turns closer than ≈ 30° to edge-on
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const clamp01 = (x) => clamp(x, 0, 1);
/** Where the plumb line ends under the last ring (the counter tag hangs from here). */
const FOOT_Y = FUNNEL.rings[FUNNEL.rings.length - 1].y - 0.8;
const RAISE_SCALE = 0.07; // the survivor, lifted toward the reader, grows by this much …
const RAISE_SHADOW = 16; // … and its hard shadow lengthens by this many px

/**
 * @param {{ canvas: HTMLCanvasElement, dpr: number, cards: number,
 *   onLabels?: (labels: {x:number,y:number,alpha:number}[]) => void,
 *   onAnchors?: (anchors: import('./layout.js').Anchors) => void }} options
 *   onAnchors: the projected points the counter tag and the act caption are placed against
 */
export function createInkScene({ canvas, dpr, cards: total, onLabels = () => {}, onAnchors = () => {} }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const cards = buildCards(total);
  const count = cards.length;
  const poses = createPoseBuffers(count);
  const xf = new Float32Array((count + 1) * 7); // a, b, c, d, x, y, depth per card
  const order = new Uint16Array(count);
  const sortKeys = new Float32Array(count);
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const ringX = new Float32Array(RING_STEPS + 1);
  const ringY = new Float32Array(RING_STEPS + 1);
  const ringD = new Float32Array(RING_STEPS + 1);
  const labels = FUNNEL.rings.map(() => ({ x: 0, y: 0, alpha: 0 }));
  const anchors = {
    foot: { x: 0, y: 0 },
    rings: FUNNEL.rings.map(() => ({ x: 0, y: 0 })),
    plate: { x: 0, y: 0, w: 0, h: 0 },
    compass: { x: 0, y: 0, r: 0 },
  };
  const ringDrop = [0, 0, 0]; // act III: how far each ring has fallen (world units)
  const size = { width: 1, height: 1, dpr };
  // Sprites are inked into canvases, then promoted to ImageBitmaps: a GPU canvas can keep those
  // uploaded, where a plain source canvas may be re-uploaded on every drawImage.
  const images = { sheet: null, approved: null, stamp: null };
  const promote = (key, source) => {
    images[key] = source;
    if (typeof createImageBitmap !== 'function') return;
    createImageBitmap(source)
      .then((bitmap) => {
        if (images[key] === source) images[key] = bitmap;
        else bitmap.close();
      })
      .catch(() => {}); // the canvas itself keeps working as the source
  };
  promote('sheet', drawSlipSheet(doc));
  const byDepth = (a, b) => sortKeys[b] - sortKeys[a];
  // the fully inked compass face, printed once (act IV then only turns the needle over it)
  const face = { canvas: null, r: 0, dpr: 0 };

  function drawInkedCompass(compass) {
    const { x, y, r } = compass;
    if (compass.ink < 1) {
      drawCompass(ctx, compass);
      return;
    }
    const d = size.dpr;
    const half = r + FACE_MARGIN;
    if (!face.canvas || Math.abs(face.r - r) > 0.5 || face.dpr !== d) {
      const side = Math.ceil(half * 2 * d);
      face.canvas = face.canvas ?? makeCanvas(doc, side, side);
      face.canvas.width = side;
      face.canvas.height = side;
      const fctx = face.canvas.getContext('2d');
      fctx.setTransform(d, 0, 0, d, 0, 0);
      drawCompassFace(fctx, { x: half, y: half, r, ink: 1 });
      face.r = r;
      face.dpr = d;
    }
    ctx.drawImage(face.canvas, x - half, y - half, half * 2, half * 2);
    drawNeedle(ctx, x, y, r, compass.needle, 1, Math.max(r / 200, 0.6));
  }

  function ensureHiRes() {
    const needed = Math.round(size.height * 0.72 * size.dpr * 1.25);
    if (images.approved && images.approved.height >= Math.min(needed, 1800) * 0.95) return;
    const slip = drawApprovedSlip(doc, needed);
    promote('approved', slip);
    promote('stamp', drawStamp(doc, slip.width * 0.72));
  }

  function aim(pose, pointer) {
    const { camera } = pose;
    const focal = Math.min(size.height / camera.spanY, size.width / camera.spanX) * camera.distance;
    aimFrame(frame, {
      target: camera.target,
      yaw: camera.yaw + pointer[0] * 0.12,
      pitch: camera.pitch + pointer[1] * 0.04,
      distance: camera.distance,
      focal,
      cx: size.width * camera.centerX,
      cy: size.height * (camera.centerY ?? 0.5),
    });
  }

  /** Samples ring k into the ring buffers; returns the centre depth. */
  function sampleRing(k) {
    const { radius } = FUNNEL.rings[k];
    const y = FUNNEL.rings[k].y - ringDrop[k];
    for (let i = 0; i <= RING_STEPS; i += 1) {
      const a = (i / RING_STEPS) * TAU;
      project(frame, Math.cos(a) * radius, y, Math.sin(a) * radius, tmp);
      ringX[i] = tmp[0];
      ringY[i] = tmp[1];
      ringD[i] = tmp[2];
    }
    project(frame, 0, y, 0, tmp);
    return tmp[2];
  }

  /** Brush strokes of ring k: back (behind the slips) or front half, up to its ink-in amount. */
  function drawRing(k, front, ink, alpha) {
    if (ink <= 0 || alpha <= 0) return;
    const centre = sampleRing(k);
    const last = Math.max(2, Math.round(ink * RING_STEPS));
    const base = Math.max(1.4, size.height / 330) * (front ? 1 : 0.72);
    const reach = FUNNEL.rings[k].radius * 0.55;
    const width = (i) => {
      const along = i / last;
      const taper = Math.min(1, along * 8 + 0.2) * Math.min(1, (1 - along) * 8 + (ink >= 1 ? 1 : 0.15));
      // the brush lifts where the ring turns away (its silhouette), so back and front meet thin
      const turn = 0.2 + 0.8 * Math.min(1, Math.abs(ringD[i] - centre) / reach);
      return base * (0.55 + 0.9 * noise1(i * 0.21 + k * 7.3)) * taper * turn;
    };
    ctx.fillStyle = INK.sumi;
    ctx.globalAlpha = alpha * (front ? 1 : 0.5);
    let runStart = -1;
    for (let i = 0; i <= last; i += 1) {
      const inFront = ringD[i] < centre;
      const take = inFront === front && i < last;
      if (take && runStart < 0) runStart = Math.max(i - 1, 0);
      if (!take && runStart >= 0) {
        brushRibbon(ctx, ringX, ringY, runStart, Math.min(i + 1, last + 1), width);
        runStart = -1;
      }
    }
    ctx.globalAlpha = 1;
    if (front) {
      // the stage's name hangs off the ring's right-hand edge (placed in the DOM)
      const { radius } = FUNNEL.rings[k];
      const y = FUNNEL.rings[k].y - ringDrop[k];
      project(frame, frame.right[0] * radius, y, frame.right[2] * radius, tmp);
      labels[k].x = tmp[0];
      labels[k].y = tmp[1];
    }
  }

  /** The plumb line all three rings hang on: a fine dashed axis, like a drawing's centre line. */
  function drawAxis(alpha) {
    if (alpha <= 0) return;
    project(frame, 0, FUNNEL.rings[0].y + 1.2 - ringDrop[0], 0, tmp);
    const x0 = tmp[0];
    const y0 = tmp[1];
    project(frame, 0, FOOT_Y - ringDrop[2], 0, tmp);
    ctx.save();
    ctx.globalAlpha = alpha * 0.45;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 5, 2, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.stroke();
    ctx.restore();
  }

  function drawCards(pose) {
    writeCardPoses(cards, pose.clock, poses);
    const halfW = SLIP.width / 2;
    const halfH = SLIP.height / 2;
    const camYaw = pose.camera.yaw;
    let n = 0;
    for (let i = 0; i < count; i += 1) {
      const fade = poses.state[i * 3];
      if (fade >= 0.999) continue;
      const turn = poses.angles[i * 4];
      const yaw = clamp(poses.angles[i * 4 + 1] + 0.55 * Math.sin(turn + camYaw), -MAX_YAW, MAX_YAW);
      const tilt = clamp(poses.angles[i * 4 + 2], -0.85, 0.85);
      writeCardTransform(
        frame,
        poses.position[i * 3],
        poses.position[i * 3 + 1],
        poses.position[i * 3 + 2],
        yaw,
        tilt,
        poses.angles[i * 4 + 3],
        halfW,
        halfH,
        tmp,
        xf,
        i * 7,
      );
      const depth = xf[i * 7 + 6];
      const x = xf[i * 7 + 4];
      const y = xf[i * 7 + 5];
      if (depth <= 0.5 || x < -80 || y < -80 || x > size.width + 80 || y > size.height + 80) continue;
      sortKeys[i] = depth;
      order[n] = i;
      n += 1;
    }
    const sorted = order.subarray(0, n).sort(byDepth);
    const near = pose.camera.distance - 3;
    const far = pose.camera.distance + 3;
    const d = size.dpr;
    for (let k = 0; k < n; k += 1) {
      const i = sorted[k];
      const o = i * 7;
      const fade = poses.state[i * 3];
      const struck = poses.state[i * 3 + 1] > 0;
      const variant = poses.state[i * 3 + 2];
      const turn = poses.angles[i * 4];
      const yaw = poses.angles[i * 4 + 1] + 0.55 * Math.sin(turn + camYaw);
      const tone = struck ? TONES.struck : yaw > 0.45 ? TONES.shade : TONES.lit;
      const fog = 1 - 0.4 * clamp01((xf[o + 6] - near) / (far - near));
      ctx.globalAlpha = fog * (1 - fade);
      ctx.setTransform(xf[o] * d, xf[o + 1] * d, xf[o + 2] * d, xf[o + 3] * d, xf[o + 4] * d, xf[o + 5] * d);
      ctx.drawImage(images.sheet, variant * CELL.width, tone * CELL.height, CELL.width, CELL.height, -1, -1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  /** The approved slip: world pose in the column, lifted into a page plate (screen space). */
  function drawApproved(pose) {
    const { slip, stamp: seal } = pose;
    ensureHiRes();
    const o = count * 7;
    writeCardTransform(frame, slip.world[0], slip.world[1], slip.world[2], slip.yaw, 0, slip.roll, SLIP.width / 2, SLIP.height / 2, tmp, xf, o);
    const t = slip.lift;
    const grow = 1 + RAISE_SCALE * slip.raise;
    const plateH = slip.plate.h * Math.min(size.height, size.width * pose.fit) * grow;
    const plateW = plateH * (images.approved.width / images.approved.height);
    const ca = Math.cos(slip.plate.angle);
    const sa = Math.sin(slip.plate.angle);
    const pa = (plateW / 2) * ca;
    const pb = (plateW / 2) * sa;
    const pc = -(plateH / 2) * sa;
    const pd = (plateH / 2) * ca;
    const px = slip.plate.x * size.width;
    const py = slip.plate.y * size.height;
    const m = (a, b) => a + (b - a) * t;
    const d = size.dpr;
    const a = m(xf[o], pa);
    const b = m(xf[o + 1], pb);
    const c = m(xf[o + 2], pc);
    const e = m(xf[o + 3], pd);
    const x = m(xf[o + 4], px);
    const y = m(xf[o + 5], py);
    if (t > 0) {
      // the plate's hard ink shadow (the book's panels), grows in with the lift
      const drop = (7 + RAISE_SHADOW * slip.raise) * t;
      ctx.setTransform(a * d, b * d, c * d, e * d, (x + drop) * d, (y + drop) * d);
      ctx.globalAlpha = t;
      ctx.fillStyle = INK.sumi;
      ctx.fillRect(-0.985, -0.99, 1.97, 1.98);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(a * d, b * d, c * d, e * d, x * d, y * d);
    // in the column it is one slip among the others; lifted, the full page takes over
    const swap = clamp01(t / 0.3);
    if (swap < 1) {
      ctx.globalAlpha = 1 - swap;
      ctx.drawImage(images.sheet, 0, TONES.lit * CELL.height, CELL.width, CELL.height, -1, -1, 2, 2);
    }
    if (swap > 0) {
      ctx.globalAlpha = swap;
      ctx.drawImage(images.approved, -1, -1, 2, 2);
    }
    ctx.globalAlpha = 1;
    if (seal.visible) {
      const s = seal.scale;
      ctx.save();
      ctx.translate(0.08, 0.56);
      ctx.rotate(-0.14);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp01(seal.press * 2.2) * (0.86 + 0.14 * seal.ink);
      const sw = 1.44;
      const sh = sw * (images.stamp.height / images.stamp.width) * (images.approved.width / images.approved.height);
      ctx.drawImage(images.stamp, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** The screen points the DOM parts hang on (the tag, the docked caption). */
  function writeAnchors(pose) {
    project(frame, 0, FOOT_Y - ringDrop[2], 0, tmp);
    anchors.foot.x = tmp[0];
    anchors.foot.y = tmp[1];
    FUNNEL.rings.forEach(({ radius, y }, k) => {
      // the ring's left-hand edge (its label hangs off the right)
      project(frame, -frame.right[0] * radius, y - ringDrop[k], -frame.right[2] * radius, tmp);
      anchors.rings[k].x = tmp[0];
      anchors.rings[k].y = tmp[1];
    });
    const scale = Math.min(size.height, size.width * pose.fit);
    const { plate } = pose.slip;
    anchors.plate.h = plate.h * scale;
    anchors.plate.w = anchors.plate.h * SLIP_ASPECT;
    anchors.plate.x = plate.x * size.width;
    anchors.plate.y = plate.y * size.height;
    anchors.compass.x = pose.compass.x * size.width;
    anchors.compass.y = pose.compass.y * size.height;
    anchors.compass.r = pose.compass.r * scale;
    onAnchors(anchors);
  }

  return {
    canvas,
    setSize(width, height, nextDpr = size.dpr) {
      size.width = Math.max(1, width);
      size.height = Math.max(1, height);
      size.dpr = nextDpr;
      canvas.width = Math.round(size.width * size.dpr);
      canvas.height = Math.round(size.height * size.dpr);
      ensureHiRes(); // re-inked only if it grew; done now, as the section approaches, not mid-scroll
    },
    /** @param {ReturnType<import('./timeline.js').poseAt>} pose @param {number[]} pointer */
    render(pose, pointer = [0, 0]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      aim(pose, pointer);
      const d = size.dpr;
      const ringAlpha = 1 - pose.rings.fade;
      for (let k = 0; k < ringDrop.length; k += 1) ringDrop[k] = pose.rings.drop * (2.2 + k * 0.9);
      const lifted = pose.slip.lift > 0;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawAxis(ringAlpha * Math.min(...pose.rings.ink));
      for (let k = 0; k < FUNNEL.rings.length; k += 1) drawRing(k, false, pose.rings.ink[k], ringAlpha);
      if (pose.rings.fade < 1) drawCards(pose);
      if (!lifted) drawApproved(pose);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      for (let k = 0; k < FUNNEL.rings.length; k += 1) {
        labels[k].alpha = ringAlpha * clamp01((pose.rings.ink[k] - 0.6) / 0.4);
        drawRing(k, true, pose.rings.ink[k], ringAlpha);
      }
      onLabels(labels);
      writeAnchors(pose);
      if (pose.compass.visible) {
        drawInkedCompass({ ...pose.compass, x: anchors.compass.x, y: anchors.compass.y, r: anchors.compass.r });
      }
      if (lifted) drawApproved(pose);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
      if (face.canvas) {
        face.canvas.width = 0;
        face.canvas.height = 0;
        face.canvas = null;
      }
      Object.keys(images).forEach((key) => {
        images[key]?.close?.();
        images[key] = null;
      });
    },
  };
}
