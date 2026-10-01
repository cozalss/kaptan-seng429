// The compass of act IV, inked live in 2D (it is drawn only in the last act). It is laid down the
// way a brush would lay it, never faded in: the outer ring is stroked clockwise from north and
// the paper face follows the brush as a sweeping sector; once the ring closes, the face is set
// down on its hard ink shadow. Then the inner rings and degree ticks, the rose in two washes (a
// pale indigo underwash, then the sumi facets point by point), Bodoni K · D · G · B one letter at
// a time, and the north-red needle drawn out from the hub. Every fill is at full strength, so no
// frame shows a grey half-inked disc.

import { INK, noise1 } from './ink.js';

const TAU = Math.PI * 2;
const NORTH = -Math.PI / 2;
const DISPLAY = "'Bodoni Moda Display', 'Didot', Georgia, serif";
const UNDERWASH = 'rgba(43, 66, 97, 0.26)'; // INK.indigo, thinned like a wash
const SHADOW_PX = 7; // the book's hard panel shadow
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const stage = (t, from, to) => clamp01((t - from) / (to - from));
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * How far each layer of the compass is drawn for an ink amount 0 → 1 (pure; drawing order).
 * ring/face: the outer stroke and the paper face it sweeps (always the same arc);
 * shadow: the hard shadow's offset (0 → 1 of SHADOW_PX) once the ring has closed;
 * wash/rose: the two washes of the rose (rose counts points, 0 → 8); letters: 0 → 4.
 * @param {number} ink
 */
export function compassStages(ink) {
  const ring = stage(ink, 0, 0.3);
  return {
    ring,
    face: ring,
    shadow: easeOut(stage(ink, 0.3, 0.4)),
    inner: stage(ink, 0.1, 0.4),
    ticks: stage(ink, 0.28, 0.62),
    hub: stage(ink, 0.42, 0.6),
    wash: easeOut(stage(ink, 0.48, 0.66)),
    rose: 8 * stage(ink, 0.62, 0.86),
    letters: 4 * stage(ink, 0.8, 0.97),
  };
}

/** A brush circle drawn clockwise from north up to `amount` of a turn, thickening mid-stroke. */
function brushCircle(ctx, cx, cy, r, amount, width, seed) {
  if (amount <= 0) return;
  const steps = Math.max(8, Math.ceil(96 * amount));
  const end = amount * TAU;
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * end + NORTH + seed;
    const a1 = ((i + 1) / steps) * end + NORTH + seed;
    const along = i / steps;
    const taper = Math.min(1, along * 6 + 0.25) * Math.min(1, (1 - along) * 5 + 0.45 + (amount < 1 ? 0 : 0.55));
    ctx.lineWidth = width * taper * (0.75 + 0.5 * noise1(i * 0.35 + seed * 10));
    ctx.beginPath();
    ctx.arc(cx, cy, r + (noise1(i * 0.2 + seed) - 0.5) * width * 0.5, a0, a1 + 0.01);
    ctx.stroke();
  }
}

/** The paper face, swept as a sector behind the brush (a full disc once the ring closes). */
function drawFace(ctx, cx, cy, r, sweep, shadow) {
  if (sweep <= 0) return;
  if (shadow > 0) {
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.arc(cx + SHADOW_PX * shadow, cy + SHADOW_PX * shadow, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = INK.sheet;
  ctx.beginPath();
  if (sweep >= 1) ctx.arc(cx, cy, r, 0, TAU);
  else {
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, NORTH, NORTH + sweep * TAU);
    ctx.closePath();
  }
  ctx.fill();
}

function drawTicks(ctx, cx, cy, r, amount, unit) {
  const count = 72;
  const shown = Math.floor(count * amount);
  ctx.lineCap = 'round';
  for (let i = 0; i < shown; i += 1) {
    const deg = i * 5;
    const major = deg % 90 === 0;
    const mid = deg % 30 === 0;
    const len = major ? 0.11 : mid ? 0.075 : 0.04;
    const a = (deg * Math.PI) / 180 + NORTH;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.lineWidth = unit * (major ? 2.4 : mid ? 1.6 : 1);
    ctx.beginPath();
    ctx.moveTo(cx + cos * r * 0.9, cy + sin * r * 0.9);
    ctx.lineTo(cx + cos * r * (0.9 - len), cy + sin * r * (0.9 - len));
    ctx.stroke();
  }
}

/** The eight rose points: four long cardinal points and four short ones between them. */
const ROSE = Object.freeze([
  ...[0, 1, 2, 3].map((i) => Object.freeze({ angle: (i * Math.PI) / 2 + NORTH, length: 0.62, half: 0.1 })),
  ...[0, 1, 2, 3].map((i) => Object.freeze({ angle: (i * Math.PI) / 2 + Math.PI / 4 + NORTH, length: 0.36, half: 0.07 })),
]);

function pointPath(ctx, cx, cy, angle, length, half, side) {
  const tip = [cx + Math.cos(angle) * length, cy + Math.sin(angle) * length];
  const flank = angle + side * (Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(...tip);
  ctx.lineTo(cx + Math.cos(flank) * half, cy + Math.sin(flank) * half);
  ctx.closePath();
}

/** First wash: a pale indigo star that spreads out from the hub. */
function drawUnderwash(ctx, cx, cy, r, amount) {
  if (amount <= 0) return;
  ctx.fillStyle = UNDERWASH;
  ROSE.forEach(({ angle, length, half }) => {
    const reach = r * length * (0.25 + 0.75 * amount);
    [-1, 1].forEach((side) => {
      pointPath(ctx, cx, cy, angle, reach, r * half * 1.35, side);
      ctx.fill();
    });
  });
}

/** Second wash: the sumi facets, one point after another (each drawn whole, never faded). */
function drawRose(ctx, cx, cy, r, points, unit) {
  const whole = Math.floor(points);
  if (whole <= 0 && points <= 0) return;
  ctx.strokeStyle = INK.sumi;
  ctx.lineJoin = 'round';
  ctx.lineWidth = unit * 1.2;
  // short points first (they sit under the long ones), in the order they are listed
  const order = [4, 5, 6, 7, 0, 1, 2, 3];
  for (let n = 0; n < order.length && n < Math.ceil(points); n += 1) {
    const { angle, length, half } = ROSE[order[n]];
    const grow = n < whole ? 1 : easeOut(points - whole); // the point being laid is still being pulled out
    const reach = r * length * grow;
    pointPath(ctx, cx, cy, angle, reach, r * half, -1);
    ctx.fillStyle = INK.sumi;
    ctx.fill();
    pointPath(ctx, cx, cy, angle, reach, r * half, 1);
    ctx.fillStyle = INK.sheet;
    ctx.fill();
    ctx.stroke();
  }
}

function drawLetters(ctx, cx, cy, r, letters) {
  const shown = Math.floor(letters);
  if (shown <= 0) return;
  ctx.fillStyle = INK.sumi;
  ctx.font = `${Math.round(r * 0.17)}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['K', 'D', 'G', 'B'].slice(0, shown).forEach((letter, i) => {
    const a = (i * Math.PI) / 2 + NORTH;
    ctx.fillText(letter, cx + Math.cos(a) * r * 0.69, cy + Math.sin(a) * r * 0.69 + r * 0.01);
  });
}

/** The needle: slender lozenge drawn out from the hub; north half red, south half an inked outline. */
export function drawNeedle(ctx, cx, cy, r, angle, reach, unit) {
  if (reach <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const len = r * 0.6 * reach;
  const half = r * 0.055;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -len);
  ctx.lineTo(half, 0);
  ctx.lineTo(-half, 0);
  ctx.closePath();
  ctx.fillStyle = INK.north;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, len * 0.82);
  ctx.lineTo(half, 0);
  ctx.lineTo(-half, 0);
  ctx.closePath();
  ctx.fillStyle = INK.sheet;
  ctx.fill();
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = unit * 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, half * 1.05, 0, TAU);
  ctx.fillStyle = INK.sumi;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.4, 0, TAU);
  ctx.fillStyle = INK.sheet;
  ctx.fill();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx  in CSS px
 * @param {{ x: number, y: number, r: number, ink: number, needle: number, needleIn: number }} compass  x, y, r in px
 */
export function drawCompass(ctx, { x, y, r, ink, needle, needleIn }) {
  if (ink <= 0) return;
  drawCompassFace(ctx, { x, y, r, ink });
  drawNeedle(ctx, x, y, r, needle, easeOut(needleIn), Math.max(r / 200, 0.6));
}

/** Margin around the face a cached print of it needs (the hard shadow, the brush's overshoot). */
export const FACE_MARGIN = SHADOW_PX + 12;

/**
 * Everything but the needle (once fully inked it never changes, so the renderer can print it once
 * and reuse it).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, r: number, ink: number }} face
 */
export function drawCompassFace(ctx, { x, y, r, ink }) {
  if (ink <= 0) return;
  const unit = Math.max(r / 200, 0.6);
  const s = compassStages(ink);
  ctx.save();
  ctx.globalAlpha = 1;
  drawFace(ctx, x, y, r, s.face, s.shadow);
  ctx.strokeStyle = INK.sumi;
  ctx.lineCap = 'round';
  brushCircle(ctx, x, y, r, s.ring, unit * 6.5, 0);
  brushCircle(ctx, x, y, r * 0.9, s.inner, unit * 1.8, 1.4);
  drawTicks(ctx, x, y, r, s.ticks, unit);
  brushCircle(ctx, x, y, r * 0.52, s.hub, unit * 1.2, 2.6);
  drawUnderwash(ctx, x, y, r, s.wash);
  drawRose(ctx, x, y, r, s.rose, unit);
  drawLetters(ctx, x, y, r, s.letters);
  ctx.restore();
}
