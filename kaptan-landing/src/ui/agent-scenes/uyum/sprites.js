// Uyum — printed matter, inked once into canvases: one slip per disclosure of the loop (fictional
// issuers), each with its company-file line and a blank gap between two body lines; the
// pale hidden line the lantern raises (illegible by design but for "…talimat…" — never a real
// prompt); and the indigo measure stamp. Canvas 2D only.

import { INK, inkLine, inkRect, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';
import { DISPLAY, SANS } from '../fonts.js';
import { CAST } from './model.js';

/** One slip cell of the sheet (device px); its aspect is the slip's (0.33 : 0.46). */
export const SLIP_CELL = Object.freeze({ width: 248, height: 344 });
/** The hidden line's cell, and the stamp's. */
export const HIDDEN_CELL = Object.freeze({ width: 220, height: 48 });
export const STAMP_CELL = Object.freeze({ width: 168, height: 72 });

/** Rows on the slip, in the slip's [-1, 1] space (y down). */
export const ROWS = Object.freeze({
  title: -0.3,
  file: 0.02, // "Şirket dosyası · SPK tedbiri" and its field
  fieldFrom: 0.3, // the field box, x from → to
  fieldTo: 0.84,
  body: 0.17, // first body line
  gap: 0.095, // between body lines
  hidden: 0.4075, // the blank gap between the second and third body lines
});

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

/** Slip-space coordinate (−1 … 1) → px inside a cell of that size. */
const toPx = (v, size) => ((v + 1) / 2) * size;

function drawSlip(ctx, slip, x, y) {
  const { width: w, height: h } = SLIP_CELL;
  const random = seededRandom(5100 + slip.index * 37);
  const inset = 5;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const pad = 20;
  ctx.save();
  ctx.translate(x + inset, y + inset);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(0, 0, iw, ih);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 11px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText(`No. ${String(slip.index + 201).padStart(3, '0')}`, pad, pad + 8);
  ctx.font = `500 13px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText(slip.issuer, pad, pad + 32, iw - pad * 2);
  inkLine(ctx, pad, pad + 42, iw - pad, pad + 42, { width: 2.6, wobble: 0.5, random });
  ctx.font = `400 23px ${DISPLAY}`;
  const titleY = toPx(ROWS.title, h) - inset;
  wrapLines(ctx, slip.title, iw - pad * 2, 2).forEach((line, i) => ctx.fillText(line, pad, titleY + i * 25));
  // the company-file line: a label and an empty ruled field the light may fill
  const fy = toPx(ROWS.file, h) - inset;
  ctx.font = `400 11px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('SPK tedbiri', pad, fy + 4);
  const fx0 = toPx(ROWS.fieldFrom, w) - inset;
  const fx1 = toPx(ROWS.fieldTo, w) - inset;
  inkLine(ctx, fx0, fy + 9, fx1, fy + 9, { width: 1.2, wobble: 0.3, random, color: 'rgba(18,19,24,0.5)' });
  // body copy as ruled ink lines, with a wide gap between the second and third lines
  for (let r = 0; r < 5; r += 1) {
    const ry = toPx(ROWS.body + r * ROWS.gap + (r >= 2 ? ROWS.gap * 2 : 0), h) - inset;
    const len = r === 4 ? 0.42 + 0.2 * random() : 0.72 + 0.24 * random();
    inkLine(ctx, pad, ry, pad + (iw - pad * 2) * len, ry, { width: 1.8, wobble: 0.45, random, color: 'rgba(18,19,24,0.62)' });
  }
  ctx.beginPath();
  const sy = ih * 0.92;
  ctx.moveTo(pad, sy);
  for (let i = 1; i <= 5; i += 1) ctx.quadraticCurveTo(pad + i * 15 - 7, sy - 9 * (i % 2 ? 1 : -0.4), pad + i * 15, sy);
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  inkRect(ctx, 0, 0, iw, ih, { width: 3, wobble: 0.6, overshoot: 1.5, seed: 120 + slip.index });
  ctx.restore();
}

/** The loop's slips, one cell each in a single row. */
export function drawSlipSheet(doc) {
  const canvas = makeCanvas(doc, SLIP_CELL.width * CAST.length, SLIP_CELL.height);
  const ctx = canvas.getContext('2d');
  CAST.forEach((slip, i) => drawSlip(ctx, slip, i * SLIP_CELL.width, 0));
  return canvas;
}

/**
 * The hidden line: pale indigo scribble, like the body lines but wavering, with one fragment
 * ("…talimat…") just legible. Never a real prompt.
 */
export function drawHiddenLine(doc) {
  const { width: w, height: h } = HIDDEN_CELL;
  const canvas = makeCanvas(doc, w, h);
  const ctx = canvas.getContext('2d');
  const random = seededRandom(6061);
  const mid = h / 2 + 2;
  ctx.strokeStyle = INK.indigo;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  const scribble = (x0, x1) => {
    ctx.beginPath();
    ctx.moveTo(x0, mid);
    for (let x = x0; x < x1; x += 7) ctx.quadraticCurveTo(x + 3.5, mid - 6 - random() * 4, x + 7, mid + (random() - 0.5) * 3);
    ctx.stroke();
  };
  ctx.font = `italic 500 30px ${SANS}`;
  ctx.fillStyle = INK.indigo;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const word = '…talimat…';
  const tw = Math.min(ctx.measureText(word).width, w - 40);
  ctx.fillText(word, w / 2, mid - 2, w - 40);
  scribble(4, w / 2 - tw / 2 - 6);
  scribble(w / 2 + tw / 2 + 6, w - 4);
  return canvas;
}

/** The measure stamp the light raises on the company file: a double-ruled indigo "Tedbir". */
export function drawStamp(doc) {
  const { width: w, height: h } = STAMP_CELL;
  const canvas = makeCanvas(doc, w, h);
  const ctx = canvas.getContext('2d');
  const random = seededRandom(7313);
  ctx.strokeStyle = INK.indigo;
  ctx.fillStyle = INK.indigo;
  ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.lineWidth = 2;
  ctx.strokeRect(13, 13, w - 26, h - 26);
  ctx.font = `600 30px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Tedbir', w / 2, h / 2 + 1, w - 34);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 140; i += 1) {
    ctx.globalAlpha = 0.3 + random() * 0.7;
    ctx.beginPath();
    ctx.arc(random() * w, random() * h, 0.5 + random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
