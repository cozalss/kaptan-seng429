// Önemlilik — printed matter, inked once: the dial's face (paper, the heavy black bezel of the
// portrait's hanging scale, hand-inked ticks on its upper arc). No numbers: the plate shows a
// tilt, never a value. The rules' threshold mark is not part of the face — it is ruled over it
// every frame by a different hand (render), so it can cross the bezel. Canvas 2D only.

import { INK, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';

/** The face's cell (device px) and the dial's radius in it. */
export const DIAL_CELL = Object.freeze({ size: 256, radius: 124 });
/** The ticks' arc (radians off plumb, either side) and band (fractions of the radius). */
export const TICKS = Object.freeze({ reach: 0.92, step: 0.092, inner: 0.62, outer: 0.7, major: 0.55 });
const BEZEL = 0.12;

/** Points round the dial: φ off plumb, clockwise; r as a fraction of the radius. */
function polar(c, radius, phi, r) {
  return [c + Math.sin(phi) * radius * r, c - Math.cos(phi) * radius * r];
}

function wobbleLine(ctx, a, b, random, wobble) {
  const mx = (a[0] + b[0]) / 2 + (random() - 0.5) * wobble;
  const my = (a[1] + b[1]) / 2 + (random() - 0.5) * wobble;
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(mx, my, b[0], b[1]);
}

/** The dial face, inked once. */
export function drawDialFace(doc) {
  const { size, radius } = DIAL_CELL;
  const canvas = makeCanvas(doc, size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const c = size / 2;
  const random = seededRandom(3303);
  // the bezel (portrait: a thick black ring) and the paper face inside it
  ctx.fillStyle = INK.sumi;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK.sheet;
  ctx.beginPath();
  ctx.arc(c, c, radius * (1 - BEZEL), 0, Math.PI * 2);
  ctx.fill();
  // a hairline inner ring, as printed on the portrait's face
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, radius * (1 - BEZEL - 0.05), Math.PI * 1.5 - TICKS.reach - 0.06, Math.PI * 1.5 + TICKS.reach + 0.06);
  ctx.stroke();
  // ticks: minor every step, major at plumb and every third
  ctx.lineCap = 'round';
  const count = Math.round(TICKS.reach / TICKS.step);
  for (let i = -count; i <= count; i += 1) {
    const phi = i * TICKS.step;
    const major = i % 3 === 0;
    ctx.lineWidth = major ? 5 : 3;
    ctx.beginPath();
    wobbleLine(ctx, polar(c, radius, phi, major ? TICKS.major : TICKS.inner), polar(c, radius, phi, TICKS.outer), random, 1.6);
    ctx.stroke();
  }
  // the bezel's wear: the paper's tooth lifts flecks out of the black
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i += 1) {
    const a = random() * Math.PI * 2;
    const r = radius * (1 - BEZEL * random());
    ctx.globalAlpha = 0.25 + random() * 0.5;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 0.6 + random() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * A font string cache: canvas fonts are strings, and building one every frame allocates. Sizes are
 * rounded to half a pixel, so a plate only ever holds a handful.
 */
export function fontCache(weight, family) {
  const cache = new Map();
  return (px) => {
    const key = Math.round(px * 2);
    let font = cache.get(key);
    if (!font) {
      font = `${weight} ${key / 2}px ${family}`;
      cache.set(key, font);
    }
    return font;
  };
}
