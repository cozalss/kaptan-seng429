// Risk Kapısı — printed matter, inked once into a canvas: the four indigo verdict stamps a barge's
// stack is struck with (Aynen, Küçült, Reddet, İptal). Canvas 2D only.

import { INK, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';
import { SANS } from '../fonts.js';
import { VERDICTS } from './model.js';

/** One stamp cell (device px); the impression is centred in it, IMPRESSION px high. */
export const STAMP_CELL = Object.freeze({ width: 280, height: 120 });
export const IMPRESSION = 78;
const FONT = `500 38px ${SANS}`;

/** The impression's width (px) for a verdict: its word plus the double border, never past the cell. */
export function stampWidth(textWidth) {
  return Math.min(STAMP_CELL.width - 8, Math.round(textWidth + 56));
}

function drawStamp(ctx, word, x, y, seed) {
  const { width: w, height: h } = STAMP_CELL;
  ctx.font = FONT;
  const box = stampWidth(ctx.measureText(word).width);
  const left = x + (w - box) / 2;
  const top = y + (h - IMPRESSION) / 2;
  const random = seededRandom(seed);
  ctx.save();
  ctx.strokeStyle = INK.indigo;
  ctx.fillStyle = INK.indigo;
  ctx.lineWidth = 6;
  ctx.strokeRect(left + 3, top + 3, box - 6, IMPRESSION - 6);
  ctx.lineWidth = 2.2;
  ctx.strokeRect(left + 12, top + 12, box - 24, IMPRESSION - 24);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, x + w / 2, y + h / 2 + 2, box - 30);
  // wear: the paper's tooth lifts flecks out of the impression
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 220; i += 1) {
    ctx.globalAlpha = 0.3 + random() * 0.7;
    ctx.beginPath();
    ctx.arc(left + random() * box, top + random() * IMPRESSION, 0.6 + random() * 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return box;
}

/** The verdict stamps, one cell each in VERDICTS order; returns the canvas and each impression's width. */
export function drawStampSheet(doc) {
  const canvas = makeCanvas(doc, STAMP_CELL.width * VERDICTS.length, STAMP_CELL.height);
  const ctx = canvas.getContext('2d');
  const widths = VERDICTS.map((word, i) => (ctx ? drawStamp(ctx, word, i * STAMP_CELL.width, 0, 900 + i * 13) : stampWidth(word.length * 20)));
  return { canvas, widths };
}
