// Kanıt — the renderer (Canvas 2D). Per frame: aim the pinhole camera, project the chest and the
// counter, then draw back to front: the ground (horizon, swell, cast shadows), the event memory
// with its open drawer (a card rising out of it between the tray and the drawer's front), the card
// whose heading is being read, the code's counter, the ledge and the row of chosen cards — each
// with its indigo mask until the code's rod pulls it down — the rule that closes the choice, the
// card in flight, the event card on its easel (the plate's one north-red mark: the logbook's
// ribbon), the plate's letters and the paper's grain. Every buffer is allocated once.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { writeCardTransform } from '../../../lib/ink3d/quad.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { DISPLAY, SANS } from '../fonts.js';
import { createChest } from './chest.js';
import { createCounter } from './counter.js';
import { PICKS, ROUNDS, STAGES } from './model.js';
import { CARD_CELL, MASK_CELL, cardCell, drawCardSheet, drawMask } from './sprites.js';
import { CAMERA, CARD, FOLD_Y, LEDGE_Y, QUERY_AT, QUERY_CARD, SLOTS, cardPlacement, queryPlacement } from './world.js';

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const smoothstep = (t) => t * t * (3 - 2 * t);
const EASEL = Object.freeze({ spread: 0.34, depth: 0.28 });
const TRAIL_STEPS = 18;
const TRAIL_DASH = Object.freeze([5, 4]);
const NO_DASH = Object.freeze([]);
const XF = 7; // floats per card transform
const QUERY_SLOT = PICKS; // the event card's transform sits after the picks'
const FOLD_SRC = (CARD_CELL.height * (1 + FOLD_Y)) / 2; // source px of a card above its fold
/** The logbook ribbon under the event card, in card space (x, y down): a notched tail. */
const RIBBON = Object.freeze([-0.42, 0.97, -0.28, 0.97, -0.28, 1.36, -0.35, 1.28, -0.42, 1.36]);
/** Swell strokes under the horizon: x (plate fraction), length (fraction), depth 0 far → 1 near. */
const SWELL = Object.freeze([
  0.04, 0.07, 0.08, 0.2, 0.05, 0.05, 0.31, 0.09, 0.14, 0.52, 0.06, 0.04, 0.63, 0.1, 0.1, 0.83, 0.05, 0.06,
  0.11, 0.08, 0.3, 0.42, 0.07, 0.26, 0.72, 0.09, 0.34, 0.02, 0.12, 0.55, 0.3, 0.08, 0.62, 0.9, 0.06, 0.45,
]);

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createEvidenceRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const pos = new Float64Array(3);
  const pt = new Float64Array(4);
  const xf = new Float32Array((PICKS + 1) * XF);
  const visible = new Uint8Array(PICKS + 1);
  const trailCard = { stage: STAGES.flight, fly: 0, rise: 1, read: 1 };
  const size = { width: 1, height: 1, dpr: 1 };
  const chest = createChest(ctx);
  const counter = createCounter(ctx);

  const images = { cards: null, mask: null };
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
  promote('cards', drawCardSheet(doc));
  promote('mask', drawMask(doc));

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

  /** Places the picked cards and the event card: their affines (CSS px). */
  function placeCards(state) {
    const round = state.round;
    for (let i = 0; i < PICKS; i += 1) {
      const card = state.cards[i];
      visible[i] = 0;
      if (card.stage === STAGES.hidden || card.alpha <= 0.002) continue;
      const grow = cardPlacement(card, round, i, pos);
      const flying = card.stage === STAGES.flight ? Math.sin(Math.PI * card.fly) : 0;
      const placed = card.stage === STAGES.placed ? 1 : card.fly;
      const yaw = 0.18 * (1 - placed) + 0.06 * placed;
      const tilt = -0.05 - 0.08 * placed;
      const roll = 0.35 * flying + (i - 1) * 0.025 * placed;
      writeCardTransform(frame, pos[0], pos[1], pos[2], yaw, tilt, roll, CARD.halfW * grow, CARD.halfH * grow, tmp, xf, i * XF);
      visible[i] = 1;
    }
    visible[QUERY_SLOT] = 0;
    if (state.query.alpha > 0.002) {
      queryPlacement(state.query.arrive, pos);
      const swing = 1 - state.query.arrive;
      writeCardTransform(frame, pos[0], pos[1], pos[2], 0.12 + 0.5 * swing, -0.06, -0.03 + 0.3 * swing, QUERY_CARD.halfW, QUERY_CARD.halfH, tmp, xf, QUERY_SLOT * XF);
      visible[QUERY_SLOT] = 1;
    }
  }

  function setCardTransform(k) {
    const o = k * XF;
    const d = size.dpr;
    ctx.setTransform(xf[o] * d, xf[o + 1] * d, xf[o + 2] * d, xf[o + 3] * d, xf[o + 4] * d, xf[o + 5] * d);
  }

  /** px per sprite unit on a card's plane (for line weights drawn in its own space). */
  function cardScale(k) {
    const o = k * XF;
    return Math.sqrt(Math.abs(xf[o] * xf[o + 3] - xf[o + 1] * xf[o + 2])) || 1;
  }

  /** Screen point of sprite-space (x, y) on card k. */
  function onCard(k, x, y, out) {
    const o = k * XF;
    out[0] = xf[o] * x + xf[o + 2] * y + xf[o + 4];
    out[1] = xf[o + 1] * x + xf[o + 3] * y + xf[o + 5];
    return out;
  }

  /** A reading rule across the card (a straightedge overhanging it), from y0 to y1 as p runs. */
  function readingRule(p, y0, y1, s) {
    if (p <= 0 || p >= 1) return;
    const y = y0 + (y1 - y0) * p;
    const fade = Math.min(1, p * 8, (1 - p) * 8);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * fade;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 1.2 / s;
    ctx.beginPath();
    ctx.moveTo(-1.18, y);
    ctx.lineTo(1.18, y);
    ctx.moveTo(-1.18, y - 0.07);
    ctx.lineTo(-1.18, y + 0.07);
    ctx.moveTo(1.18, y - 0.07);
    ctx.lineTo(1.18, y + 0.07);
    ctx.stroke();
    ctx.globalAlpha = a;
  }

  function drawPick(state, i, alpha) {
    const card = state.cards[i];
    const pick = ROUNDS[state.round].picks[i];
    const a = card.alpha * alpha * (card.stage === STAGES.placed || card.stage === STAGES.flight ? state.fade : 1);
    if (a <= 0.002) return;
    setCardTransform(i);
    ctx.globalAlpha = a;
    const { sx, sy } = cardCell(pick.sheet);
    if (card.mask > 0) {
      ctx.drawImage(images.cards, sx, sy, CARD_CELL.width, CARD_CELL.height, -1, -1, 2, 2);
    } else {
      // covered: only the heading half is ever inked, so no fade can let the return show through
      ctx.drawImage(images.cards, sx, sy, CARD_CELL.width, FOLD_SRC, -1, -1, 2, 1 + FOLD_Y);
    }
    const s = cardScale(i);
    // the mask: covers the return from the fold down, until the code pulls it off
    if (card.mask < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1, -1, 2, 2);
      ctx.clip();
      ctx.globalAlpha = a * (1 - card.mask * card.mask);
      ctx.drawImage(images.mask, 0, 0, MASK_CELL.width, MASK_CELL.height, -1, FOLD_Y + card.mask * (1.05 - FOLD_Y), 2, 1 - FOLD_Y);
      ctx.restore();
    }
    // the heading — and only the heading — read; then the tick that accepts it
    ctx.lineCap = 'round';
    readingRule(card.read, -0.86, FOLD_Y - 0.06, s);
    if (card.tick > 0) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = INK.indigo;
      ctx.lineWidth = 2 / s;
      ctx.beginPath();
      const t = card.tick;
      ctx.moveTo(0.52, -0.5);
      const k1 = Math.min(1, t * 2.5);
      ctx.lineTo(0.52 + 0.1 * k1, -0.5 + 0.1 * k1);
      if (t > 0.4) {
        const k2 = (t - 0.4) / 0.6;
        ctx.lineTo(0.62 + 0.2 * k2, -0.4 - 0.25 * k2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawQuery(state, alpha) {
    if (!visible[QUERY_SLOT]) return;
    const a = state.query.alpha * alpha;
    setCardTransform(QUERY_SLOT);
    ctx.globalAlpha = a;
    // the logbook's ribbon, hanging from under the event at hand
    ctx.fillStyle = INK.north;
    ctx.beginPath();
    ctx.moveTo(RIBBON[0], RIBBON[1]);
    for (let k = 2; k < RIBBON.length; k += 2) ctx.lineTo(RIBBON[k], RIBBON[k + 1]);
    ctx.closePath();
    ctx.fill();
    const { sx, sy } = cardCell(ROUNDS[state.round].query.sheet);
    ctx.drawImage(images.cards, sx, sy, CARD_CELL.width, CARD_CELL.height, -1, -1, 2, 2);
    ctx.lineCap = 'round';
    readingRule(state.query.read, -0.86, 0.0, cardScale(QUERY_SLOT));
    ctx.globalAlpha = 1;
  }

  /** The course of a card in flight: a dashed ink arc behind it, drawn on and let go. */
  function drawTrail(state, alpha) {
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    for (let i = 0; i < PICKS; i += 1) {
      const card = state.cards[i];
      if (card.stage !== STAGES.flight) continue;
      const head = card.fly;
      const tail = Math.max(0, head - 0.55);
      ctx.globalAlpha = 0.5 * alpha * (1 - clamp01((head - 0.85) / 0.15));
      ctx.setLineDash(TRAIL_DASH);
      ctx.beginPath();
      for (let k = 0; k <= TRAIL_STEPS; k += 1) {
        trailCard.fly = tail + ((head - tail) * k) / TRAIL_STEPS;
        cardPlacement(trailCard, state.round, i, pos);
        project(frame, pos[0], pos[1] - CARD.halfH * 0.2, pos[2], tmp);
        if (k === 0) ctx.moveTo(tmp[0], tmp[1]);
        else ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    }
    ctx.globalAlpha = 1;
  }

  /** The world behind: the sea's horizon as a ruled hairline, a few dry strokes of swell under it. */
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

  /** Soft ground shadows: under the easel, the ledge's cards and a card in flight. */
  function shadow(x, y, z, r, a) {
    project(frame, x, 0, z, tmp);
    const rr = r * tmp[3];
    ctx.globalAlpha = 0.06 * a * clamp01(1 - y / 5);
    ctx.beginPath();
    ctx.ellipse(tmp[0], tmp[1], rr, rr * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShadows(state, alpha) {
    ctx.fillStyle = INK.indigo;
    shadow(QUERY_AT[0], 0.5, QUERY_AT[2] - 0.2, 0.5, alpha);
    shadow((SLOTS[0][0] + SLOTS[2][0]) / 2, 0.5, SLOTS[0][2] - 0.15, 1.5, alpha);
    for (let i = 0; i < PICKS; i += 1) {
      const card = state.cards[i];
      if (card.stage !== STAGES.flight) continue;
      cardPlacement(card, state.round, i, pos);
      shadow(pos[0], pos[1], pos[2], 0.32, alpha);
    }
    ctx.globalAlpha = 1;
  }

  /** The event card's easel: two legs and a ledge. */
  function drawEasel(alpha) {
    const ledge = QUERY_AT[1] - QUERY_CARD.halfH - 0.03;
    const R = frame.right;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      project(frame, QUERY_AT[0] + R[0] * EASEL.spread * side, ledge, QUERY_AT[2] + R[2] * EASEL.spread * side - 0.05, tmp);
      const x0 = tmp[0];
      const y0 = tmp[1];
      project(frame, QUERY_AT[0] + R[0] * EASEL.spread * 1.5 * side, 0, QUERY_AT[2] + R[2] * EASEL.spread * 1.5 * side - EASEL.depth, tmp);
      stillLine(ctx, x0, y0, tmp[0], tmp[1], 70 + side, 0.5, true);
    }
    project(frame, QUERY_AT[0], ledge + 0.2, QUERY_AT[2] - 0.1, tmp);
    const bx = tmp[0];
    const by = tmp[1];
    project(frame, QUERY_AT[0], 0, QUERY_AT[2] - 0.95, tmp);
    stillLine(ctx, bx, by, tmp[0], tmp[1], 77, 0.5, true);
    ctx.stroke();
    project(frame, QUERY_AT[0] - R[0] * (QUERY_CARD.halfW + 0.08), ledge, QUERY_AT[2] - R[2] * (QUERY_CARD.halfW + 0.08), tmp);
    const lx = tmp[0];
    const ly = tmp[1];
    project(frame, QUERY_AT[0] + R[0] * (QUERY_CARD.halfW + 0.08), ledge, QUERY_AT[2] + R[2] * (QUERY_CARD.halfW + 0.08), tmp);
    ctx.lineWidth = Math.max(1.8, tmp[3] * 0.025);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The row's long ledge on three trestle legs, the chosen cards stand on it. */
  function drawLedge(alpha) {
    const x0 = SLOTS[0][0] - CARD.halfW - 0.2;
    const x1 = SLOTS[PICKS - 1][0] + CARD.halfW + 0.2;
    const z = SLOTS[0][2];
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let k = 0; k < 3; k += 1) {
      const x = x0 + 0.15 + ((x1 - x0 - 0.3) * k) / 2;
      project(frame, x, LEDGE_Y, z - 0.03, tmp);
      const ax = tmp[0];
      const ay = tmp[1];
      project(frame, x - 0.06, 0, z + 0.12, tmp);
      stillLine(ctx, ax, ay, tmp[0], tmp[1], 80 + k, 0.45, true);
      project(frame, x + 0.05, 0, z - 0.4, tmp);
      stillLine(ctx, ax, ay, tmp[0], tmp[1], 84 + k, 0.45, true);
    }
    ctx.stroke();
    project(frame, x0, LEDGE_Y, z, tmp);
    const lx = tmp[0];
    const ly = tmp[1];
    project(frame, x1, LEDGE_Y, z, tmp);
    ctx.lineWidth = Math.max(2, tmp[3] * 0.028);
    ctx.beginPath();
    stillLine(ctx, lx, ly, tmp[0], tmp[1], 88, 0.4, true);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The rule that closes the choice: a ruled bracket over the row, with its two words. */
  function drawClose(state, alpha) {
    if (state.close <= 0) return;
    const a = alpha * state.fade;
    if (a <= 0.002) return;
    const y = SLOTS[0][1] + CARD.halfH + 0.12;
    const z = SLOTS[0][2];
    project(frame, SLOTS[0][0] - CARD.halfW, y, z, tmp);
    const ax = tmp[0];
    const ay = tmp[1];
    project(frame, SLOTS[PICKS - 1][0] + CARD.halfW, y, z, tmp);
    const bx = ax + (tmp[0] - ax) * state.close;
    const by = ay + (tmp[1] - ay) * state.close;
    const tick = Math.max(4, tmp[3] * 0.08);
    ctx.globalAlpha = a;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay + tick);
    ctx.lineTo(ax, ay);
    stillLine(ctx, ax, ay, bx, by, 91, 0.3, false);
    if (state.close >= 1) ctx.lineTo(bx, by + tick);
    ctx.stroke();
    const sizePx = Math.max(9, Math.min(12, tmp[3] * 0.11));
    ctx.font = `400 ${sizePx}px ${SANS}`;
    ctx.fillStyle = INK.indigo;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.globalAlpha = a * clamp01((state.close - 0.5) * 2);
    ctx.fillText('seçim kapandı', (ax + tmp[0]) / 2, (ay + tmp[1]) / 2 - 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  /** The code's rod: out under the ledge from the counter, then a hook up that pulls the mask down. */
  function drawRod(state, alpha) {
    const j = state.reveal;
    if (j < 0 || state.rod <= 0 || !visible[j]) return;
    const card = state.cards[j];
    counter.rodBase(pt);
    const sx = pt[0];
    const sy = pt[1];
    project(frame, SLOTS[j][0] + CARD.halfW * 0.45, LEDGE_Y - 0.12, SLOTS[j][2], tmp);
    const tx = tmp[0];
    const ty = tmp[1];
    const out = smoothstep(Math.min(1, state.rod * 1.5));
    const ex = sx + (tx - sx) * out;
    const ey = sy + (ty - sy) * out;
    // the hook rises to the mask's hem once the rod is there, and comes down with it
    const hemY = onCard(j, 0.45, 1, pt)[1];
    const reach = clamp01((state.rod - 0.66) / 0.34);
    const hook = Math.max(reach, card.mask > 0 ? 1 : 0) * (1 - card.mask);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    if (hook > 0) ctx.lineTo(ex, ey + (hemY - ey) * hook);
    ctx.stroke();
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 2.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The plate's letters with hairline leaders: a (the memory), b (the row), c (the code). */
  function drawLetters(alpha) {
    const sizePx = Math.max(13, Math.min(17, chest.scale * 0.2));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = `400 ${sizePx}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = (text, px, py, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(px + dx * 0.25, py + dy * 0.25);
      ctx.lineTo(px + dx * 0.75, py + dy * 0.75);
      ctx.stroke();
      if (!placeKey(plateKeys, text, px + dx, py + dy, ctx.globalAlpha)) ctx.fillText(text, px + dx, py + dy);
    };
    chest.corner(pt);
    letter('a', pt[0], pt[1], sizePx * 0.8, -sizePx * 0.9);
    // b: under the ledge, between the row's first two cards
    project(frame, (SLOTS[0][0] + SLOTS[1][0]) / 2, LEDGE_Y - 0.05, SLOTS[1][2], tmp);
    letter('b', tmp[0], tmp[1], -sizePx * 1.0, sizePx * 1.2);
    counter.corner(pt);
    letter('c', pt[0], pt[1], sizePx * 0.2, -sizePx * 1.2);
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
      chest.project(frame, state.drawer, state.open);
      counter.project(frame);
      placeCards(state);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawGround(intro);
      chest.drawShadow(frame, intro);
      drawShadows(state, intro);
      ctx.globalAlpha = intro;
      chest.drawBody(frame);
      chest.drawFront();
      chest.drawDrawerInside(frame);
      // a card still low in its drawer rises between the tray and the drawer's front
      let rising = -1;
      for (let i = 0; i < PICKS; i += 1) if (visible[i] && state.cards[i].stage === STAGES.rise && state.cards[i].rise < 0.45) rising = i;
      if (rising >= 0) drawPick(state, rising, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = intro;
      chest.drawDrawerFront(frame);
      // cards out of the drawer, at the reading place
      for (let i = 0; i < PICKS; i += 1) {
        const card = state.cards[i];
        if (!visible[i] || i === rising || (card.stage !== STAGES.rise && card.stage !== STAGES.read)) continue;
        drawPick(state, i, intro);
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = intro;
      counter.draw(frame, state, ROUNDS[state.round].picks);
      drawLedge(intro);
      for (let i = 0; i < PICKS; i += 1) if (visible[i] && state.cards[i].stage === STAGES.placed) drawPick(state, i, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawRod(state, intro);
      drawClose(state, intro);
      drawTrail(state, intro);
      for (let i = 0; i < PICKS; i += 1) if (visible[i] && state.cards[i].stage === STAGES.flight) drawPick(state, i, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawEasel(intro);
      drawQuery(state, intro);
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
