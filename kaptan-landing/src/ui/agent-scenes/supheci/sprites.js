// Şüpheci — printed matter, inked once into canvases: the loop's three draft proposals (fictional
// issuers, "Temsili"), each with a small price chart against its disclosure line, a note column and
// the size bar, plus the indigo Veto stamp. Canvas 2D only.

import { INK, inkLine, inkRect, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';
import { DISPLAY, MONO, SANS } from '../fonts.js';
import { CAST, LAYOUT } from './model.js';

/** One slip cell of the sheet (device px); its aspect is the slip's (1.0 : 0.68). */
export const SLIP_CELL = Object.freeze({ width: 560, height: 381 });
/** The Veto stamp's cell; the impression fills it but for a margin. */
export const STAMP_CELL = Object.freeze({ width: 236, height: 104 });

/** Slip space ([-1, 1]², y down) → cell px. */
const px = (x) => ((x + 1) / 2) * SLIP_CELL.width;
const py = (y) => ((y + 1) / 2) * SLIP_CELL.height;

/**
 * A price line for the chart, as (x, y) fractions of the chart box (y up), ending at the
 * disclosure. A leak climbs hard in the sessions just before it; the others wander flat.
 */
export function pricePath(kind, steps = 14) {
  const random = seededRandom(kind === 'leak' ? 11 : kind === 'clean' ? 23 : 37);
  const end = LAYOUT.chart.disclose;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * end;
    let y = 0.3 + (random() - 0.5) * 0.12;
    if (kind === 'leak') {
      const climb = Math.min(1, Math.max(0, (x - 0.42) / (end - 0.42)));
      y += climb * climb * 0.55;
    }
    out.push([x, y]);
  }
  return out;
}

function drawChart(ctx, slip, random) {
  const { x0, x1, y0, y1, disclose } = LAYOUT.chart;
  const left = px(x0);
  const right = px(x1);
  const top = py(y0);
  const bottom = py(y1);
  const w = right - left;
  const h = bottom - top;
  ctx.font = `400 13px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('Fiyat', left + 4, top + 12);
  // axes: a ruled L
  inkLine(ctx, left, top + 18, left, bottom, { width: 1.6, wobble: 0.4, random });
  inkLine(ctx, left, bottom, right, bottom, { width: 1.6, wobble: 0.4, random });
  // the disclosure: a dashed rule, its name at its head
  const dx = left + w * disclose;
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = INK.indigo;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(dx, top + 18);
  ctx.lineTo(dx, bottom);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = INK.indigo;
  ctx.textAlign = 'center';
  ctx.fillText('bildirim', dx, top + 12);
  ctx.textAlign = 'left';
  // the price, up to the disclosure (what came after is not on a draft)
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pricePath(slip.kind).forEach(([x, y], i) => {
    const X = left + x * w;
    const Y = bottom - y * (h - 22);
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  });
  ctx.stroke();
}

function drawNotes(ctx, slip, random) {
  const { x0, x1, head, lines } = LAYOUT.notes;
  const left = px(x0);
  const width = px(x1) - left;
  ctx.font = `500 14px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText('Gerekçe', left, py(head) + 4);
  lines.forEach((y, i) => {
    if (slip.phrase && i === 1) {
      ctx.font = `500 21px ${SANS}`;
      ctx.fillStyle = INK.sumi;
      ctx.fillText(slip.phrase, left, py(y) + 7, width);
      return;
    }
    const len = i === lines.length - 1 ? 0.45 + 0.15 * random() : 0.78 + 0.2 * random();
    inkLine(ctx, left, py(y), left + width * len, py(y), { width: 2, wobble: 0.45, random, color: 'rgba(18,19,24,0.6)' });
  });
}

function drawBar(ctx, slip) {
  const { x0, x1, y, h } = LAYOUT.bar;
  const left = px(x0);
  const right = px(x1);
  const top = py(y - h / 2);
  const bh = py(y + h / 2) - top;
  ctx.font = `500 14px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.textBaseline = 'middle';
  ctx.fillText('Büyüklük', px(-0.88), py(y) + 1);
  ctx.textBaseline = 'alphabetic';
  // the proposed size: a flat indigo wash inside the ruled bar
  ctx.fillStyle = INK.indigo;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(left + 3, top + 3, (right - left - 6) * slip.size, bh - 6);
  ctx.globalAlpha = 1;
  inkRect(ctx, left, top, right - left, bh, { width: 2, wobble: 0.4, overshoot: 1.5, seed: 300 + slip.index });
  // quarter ticks under the bar
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let q = 1; q < 4; q += 1) {
    const x = left + ((right - left) * q) / 4;
    ctx.moveTo(x, top + bh);
    ctx.lineTo(x, top + bh + 6);
  }
  ctx.stroke();
}

function drawSlip(ctx, slip, x, y) {
  const { width: w, height: h } = SLIP_CELL;
  const random = seededRandom(5100 + slip.index * 29);
  const inset = 5;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.textBaseline = 'alphabetic';
  const pad = px(-0.88);
  // folio line: "Temsili" and the draft's serial, in the book's small Inter
  ctx.font = `400 13px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('Temsili', pad, 30);
  ctx.textAlign = 'right';
  ctx.fillText(`Taslak öneri · No. ${String(slip.index + 51).padStart(3, '0')}`, w - pad, 30);
  ctx.textAlign = 'left';
  ctx.font = `500 15px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText(slip.issuer, pad, 56);
  inkLine(ctx, pad, 66, w - pad, 66, { width: 2.6, wobble: 0.5, random });
  // the rule code it was drafted under, mono in a ruled box
  ctx.font = `600 17px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(slip.code, w - pad - 8, 56);
  ctx.textAlign = 'left';
  ctx.font = `400 27px ${DISPLAY}`;
  ctx.fillText(slip.title, pad, 100, w - pad * 2);
  drawChart(ctx, slip, random);
  drawNotes(ctx, slip, random);
  drawBar(ctx, slip);
  inkRect(ctx, inset, inset, w - inset * 2, h - inset * 2, { width: 3, wobble: 0.6, overshoot: 1.5, seed: 90 + slip.index });
  ctx.restore();
}

/** The loop's drafts, one cell each, in a row. */
export function drawSlipSheet(doc) {
  const canvas = makeCanvas(doc, SLIP_CELL.width * CAST.length, SLIP_CELL.height);
  const ctx = canvas.getContext('2d');
  CAST.forEach((slip, i) => drawSlip(ctx, slip, i * SLIP_CELL.width, 0));
  return canvas;
}

/** Source x of slip i in the sheet. */
export const slipCellX = (i) => i * SLIP_CELL.width;

/** The Veto stamp: a double ruled box and the word, worn by the paper's tooth. */
export function drawStampSheet(doc) {
  const { width: w, height: h } = STAMP_CELL;
  const canvas = makeCanvas(doc, w, h);
  const ctx = canvas.getContext('2d');
  const random = seededRandom(733);
  ctx.strokeStyle = INK.indigo;
  ctx.fillStyle = INK.indigo;
  ctx.lineWidth = 7;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  ctx.font = `500 44px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Veto', w / 2, h / 2 + 2);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 220; i += 1) {
    ctx.globalAlpha = 0.3 + random() * 0.7;
    ctx.beginPath();
    ctx.arc(random() * w, random() * h, 0.6 + random() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
