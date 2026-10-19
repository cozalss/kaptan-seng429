// Printed matter of the ink scene, drawn once into canvases: the sheet of small disclosure slips
// (ink line work, no legible text — at their size text would only blur), the one approved slip at
// full resolution (real type) and the north-red ONAYLANDI stamp. Every document
// is fictional: no real company, price or signal.

import { VARIANTS, seededRandom } from './funnel.js';
import { INK, inkLine, inkRect, makeCanvas } from './ink.js';

/** Sprite-sheet cell of one small slip (device px; drawn at ≈ ½ this size on screen). */
export const CELL = Object.freeze({ width: 144, height: 200 });
/** Rows of the sheet: how a slip looks in the scene. */
export const TONES = Object.freeze({ lit: 0, shade: 1, struck: 2 });

/** The approved order slip (a draft: a person signs it off; no automatic order). */
export const SLIP_ROWS = Object.freeze([
  Object.freeze({ label: 'Şirket', value: 'ÖRNEK ENERJİ A.Ş. · ORNEK' }),
  Object.freeze({ label: 'Olay', value: 'E1 · Pay geri alım işlemleri' }),
  Object.freeze({ label: 'Kanıt', value: 'Benzer geçmiş olaylar · getiriler gizli' }),
  Object.freeze({ label: 'Kural', value: 'E1 kuralı · risk kapısı R01–R16' }),
  Object.freeze({ label: 'Risk', value: 'İşlem başına %0,5' }),
  Object.freeze({ label: 'Tutma', value: '20–40 gün' }),
  Object.freeze({ label: 'Son söz', value: 'İnsan' }),
]);

const DISPLAY = "'Bodoni Moda Display', 'Didot', Georgia, serif";
const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/** Waits (briefly) for the faces the printed matter uses. */
export async function fontsReady(doc, timeout = 900) {
  if (!doc.fonts?.load) return;
  const wait = Promise.all([doc.fonts.load(`40px ${DISPLAY}`, 'ÖNERİ'), doc.fonts.load(`16px ${SANS}`, 'Şirket')]);
  await Promise.race([wait, new Promise((resolve) => setTimeout(resolve, timeout))]).catch(() => {});
}

/** Line work of one small slip: header bar, code box, text rows, a variant flourish. */
function drawSlipBody(ctx, variant, w, h, { lineColor, random }) {
  const pad = w * 0.11;
  // Header: a heavy bar (the company line) and a small boxed code at the right.
  ctx.fillStyle = lineColor;
  ctx.fillRect(pad, pad * 1.05, w * (0.36 + 0.14 * random()), h * 0.028);
  inkRect(ctx, w - pad - w * 0.2, pad * 0.85, w * 0.2, h * 0.075, { width: 2, wobble: 0.4, seed: variant + 7, color: lineColor });
  inkLine(ctx, pad, h * 0.2, w - pad, h * 0.2, { width: 2.4, wobble: 0.5, random, color: lineColor });
  const rows = 5 + (variant % 3);
  const top = h * 0.27;
  const gap = (h * 0.5) / rows;
  for (let r = 0; r < rows; r += 1) {
    const len = r === rows - 1 ? 0.35 + 0.2 * random() : 0.62 + 0.26 * random();
    inkLine(ctx, pad, top + r * gap, pad + (w - pad * 2) * len, top + r * gap, { width: 2.2, wobble: 0.5, random, color: lineColor });
  }
  if (variant % 2 === 0) {
    // a signature scribble at the foot
    ctx.beginPath();
    const sy = h * 0.86;
    ctx.moveTo(pad, sy);
    for (let i = 1; i <= 6; i += 1) ctx.quadraticCurveTo(pad + i * w * 0.07 - w * 0.03, sy - h * 0.05 * (i % 2 ? 1 : -0.4), pad + i * w * 0.07, sy);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    inkRect(ctx, pad, h * 0.8, w - pad * 2, h * 0.09, { width: 1.8, wobble: 0.4, seed: variant + 3, color: lineColor });
  }
}

/** One cell: sheet, outline, line work in a tone. */
function drawSlipCell(ctx, x, y, variant, tone) {
  const { width: w, height: h } = CELL;
  const random = seededRandom(1000 + variant * 13 + tone);
  const inset = 5;
  ctx.save();
  ctx.translate(x + inset, y + inset);
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const struck = tone === TONES.struck;
  ctx.fillStyle = tone === TONES.shade ? INK.wash : INK.sheet;
  ctx.fillRect(0, 0, iw, ih);
  if (tone === TONES.shade) {
    // flat sumi shading: a posterised indigo wash with a few dry-brush hatches
    ctx.save();
    ctx.globalAlpha = 0.14;
    for (let i = -ih; i < iw; i += 14) inkLine(ctx, i, ih, i + ih * 0.6, 0, { width: 1.4, wobble: 0.3, random, color: INK.indigo });
    ctx.restore();
  }
  drawSlipBody(ctx, variant, iw, ih, { lineColor: struck ? 'rgba(18,19,24,0.4)' : INK.sumi, random });
  inkRect(ctx, 0, 0, iw, ih, { width: 4, wobble: 0.7, overshoot: 2, seed: variant * 5 + tone, color: INK.sumi });
  if (struck) {
    // struck out: one confident diagonal and a short return stroke
    inkLine(ctx, iw * 0.06, ih * 0.9, iw * 0.94, ih * 0.1, { width: 6, wobble: 1.4, random, color: INK.sumi });
    inkLine(ctx, iw * 0.12, ih * 0.14, iw * 0.9, ih * 0.84, { width: 3, wobble: 1.2, random, color: INK.sumi });
  }
  ctx.restore();
}

/**
 * Sheet of small slips: VARIANTS columns × 3 tone rows (lit, shade, struck).
 * @param {Document} doc
 */
export function drawSlipSheet(doc) {
  const canvas = makeCanvas(doc, CELL.width * VARIANTS, CELL.height * 3);
  const ctx = canvas.getContext('2d');
  for (let tone = 0; tone < 3; tone += 1) {
    for (let v = 0; v < VARIANTS; v += 1) drawSlipCell(ctx, v * CELL.width, tone * CELL.height, v, tone);
  }
  return canvas;
}

/** Aspect of the approved slip (width / height); the small slips share it. */
export const SLIP_ASPECT = CELL.width / CELL.height;

/**
 * The approved slip at full resolution: Bodoni title, ruled rows of Inter.
 * @param {Document} doc
 * @param {number} height  device px
 */
export function drawApprovedSlip(doc, height) {
  const h = Math.round(Math.min(Math.max(height, 400), 1800));
  const w = Math.round(h * SLIP_ASPECT);
  const canvas = makeCanvas(doc, w, h);
  const ctx = canvas.getContext('2d');
  const u = h / 1000; // layout unit
  const random = seededRandom(77);
  const inset = 6 * u;
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2);
  const pad = 58 * u;
  ctx.fillStyle = INK.sumi;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${22 * u}px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('KAPtan', pad, pad + 10 * u);
  ctx.textAlign = 'right';
  ctx.fillText('No. 001', w - pad, pad + 10 * u);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK.sumi;
  ctx.font = `${92 * u}px ${DISPLAY}`;
  ctx.fillText('ÖNERİ FİŞİ', pad - 4 * u, pad + 128 * u);
  inkLine(ctx, pad, pad + 162 * u, w - pad, pad + 162 * u, { width: 3.2 * u, wobble: 0.8 * u, random });
  const rowTop = pad + 222 * u;
  const rowGap = 60 * u;
  SLIP_ROWS.forEach((row, i) => {
    const y = rowTop + i * rowGap;
    ctx.font = `${22 * u}px ${SANS}`;
    ctx.fillStyle = INK.muted;
    ctx.fillText(row.label, pad, y);
    ctx.font = `500 ${27 * u}px ${SANS}`;
    ctx.fillStyle = INK.sumi;
    ctx.fillText(row.value, pad + 150 * u, y, w - pad * 2 - 150 * u);
    inkLine(ctx, pad, y + 28 * u, w - pad, y + 28 * u, { width: 1.4 * u, wobble: 0.5 * u, random, color: 'rgba(18,19,24,0.35)' });
  });
  ctx.font = `${22 * u}px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('Otomatik emir yok', pad, h - pad);
  inkRect(ctx, inset, inset, w - inset * 2, h - inset * 2, { width: 5 * u, wobble: 1.2 * u, overshoot: 4 * u, seed: 5 });
  return canvas;
}

/**
 * The one north-red ONAYLANDI stamp: double border, Bodoni caps, worn by the paper's grain.
 * @param {Document} doc
 * @param {number} width  device px
 */
export function drawStamp(doc, width) {
  const w = Math.round(Math.min(Math.max(width, 200), 1100));
  const h = Math.round(w * 0.34);
  const canvas = makeCanvas(doc, w, h);
  const ctx = canvas.getContext('2d');
  const u = w / 1000;
  const random = seededRandom(1926);
  ctx.strokeStyle = INK.north;
  ctx.fillStyle = INK.north;
  ctx.lineWidth = 14 * u;
  ctx.strokeRect(16 * u, 16 * u, w - 32 * u, h - 32 * u);
  ctx.lineWidth = 5 * u;
  ctx.strokeRect(42 * u, 42 * u, w - 84 * u, h - 84 * u);
  ctx.font = `800 ${150 * u}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ONAYLANDI', w / 2, h / 2 + 8 * u, w - 150 * u);
  // Wear: the paper's tooth lifts flecks of ink out of the impression.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i += 1) {
    const r = (0.6 + random() * 2.4) * u * 1.6;
    ctx.globalAlpha = 0.35 + random() * 0.65;
    ctx.beginPath();
    ctx.arc(random() * w, random() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
