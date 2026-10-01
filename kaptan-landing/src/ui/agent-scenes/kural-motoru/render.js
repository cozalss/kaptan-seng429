// Kural Motoru — the renderer (Canvas 2D). Per frame: aim the pinhole camera, project the bench,
// then draw back to front: the ground (horizon, swell, the bench's cast shadow), the cabinet and
// backboard, the plaques and the slate with its ruling, the telegraph on its mount (face sprite,
// rim, needle with the portrait's north-red tip), the trays' insides, the cards in the trays and
// the card dropping into one, the trays' front lips, the rail with its flap, the cards on the rail
// and in the hopper, the hopper's front plate, the reading bridge and its pins, the "same input,
// same decision" bracket, and the plate's letters (a · b · c). Every buffer is allocated once.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { writeQuadAffine } from '../../../lib/ink3d/quad.js';
import { DISPLAY, MONO, SANS } from '../fonts.js';
import { createBench } from './machine.js';
import { CAST, GATES, INPUTS, MAX_SLOTS, RAIL, REPEAT_CARD, STAGES } from './model.js';
import { CARD_CELL, DIAL_FACE, drawCardSheet, drawDialFace } from './sprites.js';
import { BENCH, BRIDGE, CAMERA, CARD, DIAL, HOPPER, PUNCH, SLATE, cardPlacement, slotRest } from './world.js';

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
/** Swell strokes under the horizon: x (plate fraction), length (fraction), depth 0 far → 1 near. */
const SWELL = Object.freeze([
  0.04, 0.07, 0.08, 0.2, 0.05, 0.05, 0.31, 0.09, 0.14, 0.52, 0.06, 0.04, 0.63, 0.1, 0.1, 0.83, 0.05, 0.06,
  0.11, 0.08, 0.3, 0.42, 0.07, 0.26, 0.72, 0.09, 0.34, 0.02, 0.12, 0.55, 0.3, 0.08, 0.62, 0.9, 0.06, 0.45,
]);
const PIN_THROUGH = 0.1; // world units a pin sinks through a punched hole
const DIAL_CELL_R = DIAL_FACE.size / 2 / DIAL_FACE.r; // sprite half-extent in face radii
const BOLTS = 10;
const NOTE = 'aynı girdi, aynı karar';

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createRuleEngineRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const pos = new Float64Array(3);
  const rest = [0, 0, 0];
  const xf = new Float32Array(7);
  const size = { width: 1, height: 1, dpr: 1 };
  const bench = createBench(ctx);
  const { xs, ys, geo } = bench;

  const images = { cards: null, dial: null };
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
  promote('dial', drawDialFace(doc));

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

  /** Sets the canvas transform to a world quad facing +z (centre, half extents) → sprite [-1, 1]². */
  function setPlaneTransform(cx, cy, cz, hw, hh) {
    writeQuadAffine(frame, cx, cy, cz, hw, 0, 0, 0, hh, 0, tmp, xf, 0);
    const d = size.dpr;
    ctx.setTransform(xf[0] * d, xf[1] * d, xf[2] * d, xf[3] * d, xf[4] * d, xf[5] * d);
  }

  /** One card at a world centre: its sprite, then a flat wash for shade (0 none). */
  function drawCard(input, cx, cy, cz, alpha, shade) {
    if (alpha <= 0.002) return;
    setPlaneTransform(cx, cy, cz, CARD.halfW, CARD.halfH);
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.cards, input * CARD_CELL.width, 0, CARD_CELL.width, CARD_CELL.height, -1, -1, 2, 2);
    if (shade > 0.01) {
      ctx.globalAlpha = alpha * shade;
      ctx.fillStyle = INK.indigo;
      ctx.fillRect(-0.985, -0.97, 1.97, 1.94);
    }
    ctx.globalAlpha = 1;
  }

  /** The world behind: the sea's horizon as a ruled hairline and a few dry strokes of swell. */
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

  /** The slate: the card's code and value set against the written threshold, then the verdict. */
  function drawSlate(slate, alpha) {
    const s = geo.slate;
    ctx.globalAlpha = alpha;
    bench.face(s.quad, INK.sheet, 800, 1.2);
    if (slate.card < 0 || slate.alpha <= 0) return;
    const input = INPUTS[CAST[slate.card].input];
    const q = s.quad;
    const h = Math.hypot(xs[q[3]] - xs[q[0]], ys[q[3]] - ys[q[0]]);
    const w = Math.hypot(xs[q[1]] - xs[q[0]], ys[q[1]] - ys[q[0]]);
    const type = Math.max(8, Math.min(13, h * 0.3));
    // two lines when they fit at ≥ 8 px; on a small plate the value line alone (the needle and
    // the plaque's underline carry the verdict)
    const twoLines = h >= type * 2.4;
    const top = (ys[q[3]] + ys[q[2]]) / 2;
    const y0 = twoLines ? top + h * 0.3 : top + h / 2;
    ctx.globalAlpha = alpha * slate.alpha;
    ctx.fillStyle = INK.sumi;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // line 1, written left to right: "E1  %0,31 ≥ %0,25"
    ctx.save();
    ctx.beginPath();
    ctx.rect(xs[q[0]] - 2, ys[q[3]] - 2, (w + 4) * slate.write, h + 4);
    ctx.clip();
    const x0 = xs[s.line0];
    ctx.font = `600 ${type * 1.05}px ${MONO}`;
    ctx.fillText(input.code, x0, y0);
    const cw = ctx.measureText(input.code).width + type * 0.5;
    ctx.font = `400 ${type}px ${SANS}`;
    ctx.fillText(input.slate, x0 + cw, y0, w * 0.86 - cw);
    ctx.restore();
    if (slate.verdict <= 0 || !twoLines) return;
    // line 2, the verdict, inked as the needle swings
    const gate = GATES[input.gateIndex];
    ctx.globalAlpha = alpha * slate.alpha * slate.verdict;
    const x1 = xs[s.line0];
    const y1 = top + h * 0.72;
    ctx.font = `400 ${type}px ${SANS}`;
    ctx.fillText('→', x1, y1);
    const aw = ctx.measureText('→ ').width;
    ctx.font = gate.mono ? `600 ${type * 1.05}px ${MONO}` : `500 ${type}px ${SANS}`;
    ctx.fillText(gate.code, x1 + aw, y1);
    ctx.textBaseline = 'alphabetic';
  }

  /** The telegraph: face sprite, bezel with bolts, the handle, the needle (north-red tip), hub. */
  function drawDial(needle, alpha) {
    const ext = DIAL.r * DIAL_CELL_R;
    setPlaneTransform(DIAL.x, DIAL.y, DIAL.z, ext, ext);
    const k = 1 / DIAL_CELL_R; // the face's radius in sprite units
    const px = Math.sqrt(Math.abs(xf[0] * xf[3] - xf[1] * xf[2])) || 1; // CSS px per sprite unit
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.dial, -1, -1, 2, 2);
    ctx.strokeStyle = INK.sumi;
    ctx.fillStyle = INK.sumi;
    // the bezel: a heavy dark ring, a hairline inside it, bolts round it
    ctx.lineWidth = k * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, k * 1.06, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1 / px;
    ctx.beginPath();
    ctx.arc(0, 0, k * 0.97, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = INK.sheet;
    for (let i = 0; i < BOLTS; i += 1) {
      const a = (i / BOLTS) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * k * 1.06, Math.sin(a) * k * 1.06, k * 0.028, 0, Math.PI * 2);
      ctx.fill();
    }
    // the handle the portrait's hand holds: up and to the left of the bezel, with its knob
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = k * 0.07;
    ctx.beginPath();
    ctx.moveTo(-k * 0.2, -k * 1.12);
    ctx.lineTo(-k * 0.32, -k * 1.42);
    ctx.stroke();
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.arc(-k * 0.34, -k * 1.46, k * 0.075, 0, Math.PI * 2);
    ctx.fill();
    // the needle (sprite y runs down: the world angle a points to (cos a, −sin a))
    const ca = Math.cos(needle);
    const sa = -Math.sin(needle);
    const len = k * 0.5;
    const tail = k * 0.14;
    const nx = -sa;
    const ny = ca;
    const half = k * 0.04;
    ctx.beginPath();
    ctx.moveTo(-ca * tail + nx * half, -sa * tail + ny * half);
    ctx.lineTo(ca * len * 0.74 + nx * half * 0.8, sa * len * 0.74 + ny * half * 0.8);
    ctx.lineTo(ca * len * 0.74 - nx * half * 0.8, sa * len * 0.74 - ny * half * 0.8);
    ctx.lineTo(-ca * tail - nx * half, -sa * tail - ny * half);
    ctx.closePath();
    ctx.fill();
    // the plate's one north-red mark: the needle's tip, as in the portrait
    ctx.fillStyle = INK.north;
    ctx.beginPath();
    ctx.moveTo(ca * len * 0.74 + nx * half * 1.5, sa * len * 0.74 + ny * half * 1.5);
    ctx.lineTo(ca * len, sa * len);
    ctx.lineTo(ca * len * 0.74 - nx * half * 1.5, sa * len * 0.74 - ny * half * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.arc(0, 0, k * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Cards resting in the trays (back slot first), sinking out of sight when the trays empty. */
  function drawTrayCards(state, alpha) {
    for (let g = 0; g < GATES.length; g += 1) {
      for (let s = 0; s < MAX_SLOTS; s += 1) {
        const entry = state.trays[g][s];
        if (entry.card < 0 || entry.alpha <= 0) continue;
        slotRest(g, s, rest);
        drawCard(CAST[entry.card].input, rest[0], rest[1] - entry.sink * 0.42, rest[2], alpha * entry.alpha, s === 0 ? 0.2 : 0.06);
      }
      // the card dropping into this tray goes in front of those already there
      for (let k = 0; k < CAST.length; k += 1) {
        const card = state.cards[k];
        if (card.stage !== STAGES.drop || CAST[k].gateIndex !== g) continue;
        cardPlacement(card, k, pos);
        drawCard(CAST[k].input, pos[0], pos[1], pos[2], alpha, 0.06 * card.drop);
      }
    }
  }

  /** Cards on the rail and in the hopper: the deck (back to front), then the moving ones. */
  function drawRailCards(state, alpha) {
    for (let pass = 2; pass >= 0; pass -= 1) {
      for (let k = 0; k < CAST.length; k += 1) {
        const card = state.cards[k];
        if (card.stage !== STAGES.hopper || Math.round(card.deck) !== pass) continue;
        cardPlacement(card, k, pos);
        drawCard(CAST[k].input, pos[0], pos[1], pos[2], alpha * card.alpha, 0.1 * card.deck);
      }
    }
    for (let k = 0; k < CAST.length; k += 1) {
      const card = state.cards[k];
      if (card.stage !== STAGES.feed && card.stage !== STAGES.read && card.stage !== STAGES.travel) continue;
      cardPlacement(card, k, pos);
      drawCard(CAST[k].input, pos[0], pos[1], pos[2], alpha, 0);
    }
  }

  /** The bridge's six pins: down onto the card, through it where it is punched. */
  function drawPins(state, alpha) {
    const holes = INPUTS[CAST[state.pinCard].input].holes;
    const cardTop = BENCH.railTop + CARD.halfH * 2;
    const reach = BRIDGE.pinRest - cardTop + 0.012;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.3, bench.scale * 0.022);
    ctx.beginPath();
    for (let i = 0; i < PUNCH.cols.length; i += 1) {
      const x = BRIDGE.x + PUNCH.cols[i] * CARD.halfW;
      const tip = BRIDGE.pinRest - state.pins * reach - (holes[i] ? state.pins * PIN_THROUGH : 0);
      project(frame, x, BRIDGE.bar, BRIDGE.z + 0.02, tmp);
      const x0 = tmp[0];
      const y0 = tmp[1];
      project(frame, x, tip, BRIDGE.z + 0.02, tmp);
      ctx.moveTo(x0, y0);
      ctx.lineTo(tmp[0], tmp[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * The repeat, answered: when No. 201 lands a second time beside its twin, an indigo bracket joins
   * the two punch rows and an "=" is ruled beside it.
   */
  function drawBracket(state, alpha) {
    const { ink, alpha: a } = state.bracket;
    if (ink <= 0 || a <= 0) return;
    const g = CAST[REPEAT_CARD].gateIndex;
    const sink = state.trays[g][1].sink * 0.42;
    slotRest(g, 0, rest);
    const bx = RAIL.gates[g] - CARD.halfW - 0.13;
    project(frame, bx, rest[1] - PUNCH.row * CARD.halfH - sink, rest[2], tmp);
    const x0 = tmp[0];
    const y0 = tmp[1];
    project(frame, rest[0] - CARD.halfW, rest[1] - PUNCH.row * CARD.halfH - sink, rest[2], tmp);
    const t0 = tmp[0];
    slotRest(g, 1, rest);
    project(frame, bx, rest[1] - PUNCH.row * CARD.halfH - sink, rest[2], tmp);
    const x1 = tmp[0];
    const y1 = tmp[1];
    project(frame, rest[0] - CARD.halfW, rest[1] - PUNCH.row * CARD.halfH - sink, rest[2], tmp);
    const t1 = tmp[0];
    ctx.globalAlpha = alpha * a;
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // the ticks reach in to each card's edge; the spine joins them as the ink runs down
    const e = clamp01(ink * 2);
    ctx.moveTo(t0 - 1, y0);
    ctx.lineTo(t0 - 1 + (x0 - t0 + 1) * e, y0);
    if (ink > 0.5) {
      const f = clamp01((ink - 0.5) * 2);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
      ctx.lineTo(x0 + (x1 - x0) * f + (t1 - x1 - 1) * Math.max(0, f * 2 - 1), y0 + (y1 - y0) * f);
    }
    ctx.stroke();
    if (ink < 0.85) {
      ctx.globalAlpha = 1;
      return;
    }
    // the "=" ruled beside the spine
    const s = Math.max(4, bench.scale * 0.07);
    const mx = (x0 + x1) / 2 - s * 1.6;
    const my = (y0 + y1) / 2;
    const f = clamp01((ink - 0.85) / 0.15);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(mx - s * 0.6, my - s * 0.3);
    ctx.lineTo(mx - s * 0.6 + s * 1.2 * f, my - s * 0.3);
    ctx.moveTo(mx - s * 0.6, my + s * 0.3);
    ctx.lineTo(mx - s * 0.6 + s * 1.2 * f, my + s * 0.3);
    ctx.stroke();
    // and on the cabinet's front, under the tray, the plate's one written line about it
    const note = clamp01((ink - 0.6) / 0.4);
    project(frame, RAIL.gates[g], BENCH.cabinetTop * 0.5, BENCH.cabinet[5], tmp);
    const type = Math.max(8, Math.min(11, bench.scale * 0.13));
    ctx.globalAlpha = alpha * a * note;
    ctx.fillStyle = INK.indigo;
    ctx.font = `500 ${type}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(NOTE, tmp[0], tmp[1]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  /** The plate's letters with hairline leaders: a (the cards), b (the written rules), c (the decision). */
  function drawLetters(alpha) {
    const type = Math.max(13, Math.min(17, bench.scale * 0.22));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = `400 ${type}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = (text, px, py, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(px + dx * 0.25, py + dy * 0.25);
      ctx.lineTo(px + dx * 0.75, py + dy * 0.75);
      ctx.stroke();
      if (!placeKey(plateKeys, text, px + dx, py + dy, ctx.globalAlpha)) ctx.fillText(text, px + dx, py + dy);
    };
    project(frame, HOPPER.x - 0.1, BENCH.railTop + CARD.halfH * 2 + 0.2, -0.2, tmp);
    letter('a', tmp[0], tmp[1], type * 0.2, -type * 1.4);
    project(frame, SLATE[0], SLATE[3], BENCH.backZ, tmp);
    letter('b', tmp[0], tmp[1], -type * 1.1, -type * 0.9);
    project(frame, DIAL.x + DIAL.r * 1.08, DIAL.y + DIAL.r * 0.5, DIAL.z, tmp);
    letter('c', tmp[0], tmp[1], type * 1.1, -type * 0.8);
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
      bench.project(frame);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawGround(intro);
      bench.drawShadow(frame, intro);
      ctx.globalAlpha = intro;
      bench.drawBody(frame);
      bench.drawPlaques(state.target, state.targetInk);
      drawSlate(state.slate, intro);
      ctx.globalAlpha = intro;
      bench.drawDialMount();
      drawDial(state.needle, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = intro;
      bench.drawTrayInsides(frame);
      drawTrayCards(state, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = intro;
      bench.drawTrayFronts(frame);
      bench.drawRail(frame, state.flap.gate, state.flap.open);
      drawRailCards(state, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = intro;
      bench.drawHopper(frame);
      drawPins(state, intro);
      ctx.globalAlpha = intro;
      bench.drawBridge(frame);
      drawBracket(state, intro);
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

