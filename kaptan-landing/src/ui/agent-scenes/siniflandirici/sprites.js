// Sınıflandırıcı — printed matter, inked once into canvases: one slip per disclosure of the day
// (fictional issuers, "Temsili") and the six indigo type stamps. Canvas 2D only.

import { INK, inkLine, inkRect, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';
import { DISPLAY, MONO, SANS } from '../fonts.js';
import { BINS, CAST } from './model.js';

/** One slip cell of the sheet (device px); its aspect is the slip's (0.31 : 0.43). */
export const SLIP_CELL = Object.freeze({ width: 248, height: 344 });
/** One stamp cell; the impression is centred in it. */
export const STAMP_CELL = Object.freeze({ width: 256, height: 128 });

/** Where the slip's title sits, in the slip's [-1, 1] space (the reader underlines it). */
export const TITLE_LINE = Object.freeze({ y: -0.3, from: -0.8, to: 0.62 });

const COLUMNS = 6;

/** Word-wraps `text` into at most `max` lines of `width` px (canvas font already set). */
export function wrapLines(ctx, text, width, max = 2) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = `${kept[max - 1]}…`;
  return kept;
}

function drawSlip(ctx, slip, x, y) {
  const { width: w, height: h } = SLIP_CELL;
  const random = seededRandom(4200 + slip.index * 31);
  const inset = 5;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const pad = 20;
  ctx.save();
  ctx.translate(x + inset, y + inset);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(0, 0, iw, ih);
  ctx.textBaseline = 'alphabetic';
  // folio line: "Temsili" and a serial, in the book's small Inter
  ctx.font = `400 11px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('Temsili', pad, pad + 8);
  ctx.textAlign = 'right';
  ctx.fillText(`No. ${String(slip.index + 101).padStart(3, '0')}`, iw - pad, pad + 8);
  ctx.textAlign = 'left';
  ctx.font = `500 13px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText(slip.issuer, pad, pad + 32, iw - pad * 2);
  inkLine(ctx, pad, pad + 42, iw - pad, pad + 42, { width: 2.6, wobble: 0.5, random });
  // the title: Bodoni, up to two lines, its first line on TITLE_LINE
  ctx.font = `400 23px ${DISPLAY}`;
  const titleY = ((TITLE_LINE.y + 1) / 2) * h - inset;
  wrapLines(ctx, slip.title, iw - pad * 2, 2).forEach((line, i) => ctx.fillText(line, pad, titleY + i * 25));
  // body copy as ruled ink lines: at this size letters would only blur
  const top = ih * 0.52;
  const rows = 6;
  const gap = (ih * 0.3) / rows;
  for (let r = 0; r < rows; r += 1) {
    const len = r === rows - 1 ? 0.4 + 0.2 * random() : 0.72 + 0.24 * random();
    inkLine(ctx, pad, top + r * gap, pad + (iw - pad * 2) * len, top + r * gap, { width: 1.8, wobble: 0.45, random, color: 'rgba(18,19,24,0.62)' });
  }
  // a signature at the foot
  ctx.beginPath();
  const sy = ih * 0.91;
  ctx.moveTo(pad, sy);
  for (let i = 1; i <= 5; i += 1) ctx.quadraticCurveTo(pad + i * 15 - 7, sy - 9 * (i % 2 ? 1 : -0.4), pad + i * 15, sy);
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  inkRect(ctx, 0, 0, iw, ih, { width: 3, wobble: 0.6, overshoot: 1.5, seed: 90 + slip.index });
  ctx.restore();
}

/** The day's slips, one cell each (COLUMNS × rows). */
export function drawSlipSheet(doc) {
  const rows = Math.ceil(CAST.length / COLUMNS);
  const canvas = makeCanvas(doc, SLIP_CELL.width * COLUMNS, SLIP_CELL.height * rows);
  const ctx = canvas.getContext('2d');
  CAST.forEach((slip, i) => drawSlip(ctx, slip, (i % COLUMNS) * SLIP_CELL.width, Math.floor(i / COLUMNS) * SLIP_CELL.height));
  return canvas;
}

/** Source rect of slip i in the sheet. */
export function slipCell(i) {
  return { sx: (i % COLUMNS) * SLIP_CELL.width, sy: Math.floor(i / COLUMNS) * SLIP_CELL.height };
}

/** The width of a stamp's impression inside its cell (px), for sizing it on a slip. */
export function stampBox(bin) {
  return BINS[bin].mono ? 150 : 206;
}

function drawStamp(ctx, bin, x, y) {
  const { width: w, height: h } = STAMP_CELL;
  const box = stampBox(bin);
  const bh = 86;
  const left = x + (w - box) / 2;
  const top = y + (h - bh) / 2;
  const random = seededRandom(700 + bin * 17);
  ctx.save();
  ctx.strokeStyle = INK.indigo;
  ctx.fillStyle = INK.indigo;
  ctx.lineWidth = 7;
  ctx.strokeRect(left + 4, top + 4, box - 8, bh - 8);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(left + 14, top + 14, box - 28, bh - 28);
  const { code, mono } = BINS[bin];
  ctx.font = mono ? `700 50px ${MONO}` : `500 40px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, x + w / 2, y + h / 2 + 2, box - 36);
  // wear: the paper's tooth lifts flecks out of the impression
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i += 1) {
    ctx.globalAlpha = 0.3 + random() * 0.7;
    ctx.beginPath();
    ctx.arc(left + random() * box, top + random() * bh, 0.6 + random() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The six stamps, one cell each, in BINS order. */
export function drawStampSheet(doc) {
  const canvas = makeCanvas(doc, STAMP_CELL.width * BINS.length, STAMP_CELL.height);
  const ctx = canvas.getContext('2d');
  BINS.forEach((_, bin) => drawStamp(ctx, bin, bin * STAMP_CELL.width, 0));
  return canvas;
}
