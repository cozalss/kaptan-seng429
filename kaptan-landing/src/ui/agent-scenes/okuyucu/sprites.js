// Okuyucu — printed matter, inked once into canvases: the loop's pages of continuous-feed paper
// (sprocket margins, as in the portrait; fictional issuers), the nine value tags and the
// blank reading form with its three fields and its struck-through "Oran" row. Canvas 2D only.

import { INK, inkLine, inkRect, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';
import { DISPLAY, SANS } from '../fonts.js';
import { CAST, FIELDS, VALUE_ROWS } from './model.js';

/** One page cell (device px); its aspect is the page's on the desk. */
export const PAGE_CELL = Object.freeze({ width: 336, height: 280 });
/** One tag cell: a value phrase on a strip of paper. */
export const TAG_CELL = Object.freeze({ width: 300, height: 50 });
/** The blank form. */
export const FORM_CELL = Object.freeze({ width: 300, height: 380 });

const PAGE_MARGIN = 30; // sprocket margin each side
const PAGE_PAD = 12;
const VALUE_FONT = 14;
const VALUE_LEAD = Object.freeze([64, 18, 104]); // ruled text before each value on its line

/** Form layout (cell px): the three field slots, then the "Oran" row. */
export const FORM_LAYOUT = Object.freeze({
  left: 20,
  right: 280,
  slotTops: Object.freeze([112, 184, 256]),
  slotH: 40,
  oranY: 344, // the struck row's centre line
  oranLeft: 92,
  oranH: 34,
});

/** Slot centres in the form's [-1, 1] space (y down), in FIELDS order; slot half-size too. */
export const FORM_SLOTS = Object.freeze(
  FORM_LAYOUT.slotTops.map((top) =>
    Object.freeze({
      x: ((FORM_LAYOUT.left + FORM_LAYOUT.right) / 2 / FORM_CELL.width) * 2 - 1,
      y: ((top + FORM_LAYOUT.slotH / 2) / FORM_CELL.height) * 2 - 1,
      halfW: (FORM_LAYOUT.right - FORM_LAYOUT.left) / FORM_CELL.width,
      halfH: FORM_LAYOUT.slotH / FORM_CELL.height,
    }),
  ),
);

const pageY = (row) => ((row + 1) / 2) * PAGE_CELL.height;

/** Body lines of a page (cell px y), the value rows among them. */
const BODY_ROWS = Object.freeze([104, pageY(VALUE_ROWS[0]), 158, pageY(VALUE_ROWS[1]), 211, pageY(VALUE_ROWS[2]), 262]);

function drawSprockets(ctx, w, h) {
  ctx.strokeStyle = 'rgba(18,19,24,0.5)';
  ctx.lineWidth = 1.2;
  for (let y = 12; y < h; y += 20) {
    for (const x of [PAGE_MARGIN / 2, w - PAGE_MARGIN / 2]) {
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // the perforations that tear the margins off, and the fold at the top of the page
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(18,19,24,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAGE_MARGIN, 0);
  ctx.lineTo(PAGE_MARGIN, h);
  ctx.moveTo(w - PAGE_MARGIN, 0);
  ctx.lineTo(w - PAGE_MARGIN, h);
  ctx.moveTo(0, 1);
  ctx.lineTo(w, 1);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * One page; writes each value's page-space [x0, x1] into `spots` at (page·3 + field)·2.
 */
function drawPage(ctx, page, x, y, spots) {
  const { width: w, height: h } = PAGE_CELL;
  const random = seededRandom(5100 + page.index * 37);
  const left = PAGE_MARGIN + PAGE_PAD;
  const right = w - PAGE_MARGIN - PAGE_PAD;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(0, 0, w, h);
  drawSprockets(ctx, w, h);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 10px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText(`No. ${String(page.index + 201)}`, left, 20);
  ctx.font = `500 12px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText(page.issuer, left, 42, right - left);
  inkLine(ctx, left, 50, right, 50, { width: 2.2, wobble: 0.4, random });
  ctx.font = `400 21px ${DISPLAY}`;
  ctx.fillText(page.title, left, 79, right - left);
  // body copy as ruled ink lines; the three values are set in type on their lines
  const body = 'rgba(18,19,24,0.55)';
  ctx.font = `500 ${VALUE_FONT}px ${SANS}`;
  BODY_ROWS.forEach((row, r) => {
    const field = VALUE_ROWS.findIndex((v) => Math.abs(pageY(v) - row) < 0.5);
    if (field < 0) {
      const len = r === BODY_ROWS.length - 1 ? 0.45 + 0.15 * random() : 0.8 + 0.2 * random();
      inkLine(ctx, left, row, left + (right - left) * len, row, { width: 1.7, wobble: 0.4, random, color: body });
      return;
    }
    const text = page.values[field];
    const x0 = left + VALUE_LEAD[field];
    const width = Math.min(ctx.measureText(text).width, right - x0 - 8);
    inkLine(ctx, left, row, x0 - 7, row, { width: 1.7, wobble: 0.4, random, color: body });
    ctx.fillStyle = INK.sumi;
    ctx.fillText(text, x0, row + 4.5, right - x0 - 8);
    if (x0 + width + 7 < right - 10) inkLine(ctx, x0 + width + 7, row, right - 6 * random(), row, { width: 1.7, wobble: 0.4, random, color: body });
    const o = (page.index * FIELDS.length + field) * 2;
    spots[o] = (x0 / w) * 2 - 1;
    spots[o + 1] = ((x0 + width) / w) * 2 - 1;
  });
  ctx.restore();
}

/** The loop's pages, one cell each, stacked in a column. Returns the sheet and the value spans. */
export function drawPageSheet(doc) {
  const canvas = makeCanvas(doc, PAGE_CELL.width, PAGE_CELL.height * CAST.length);
  const ctx = canvas.getContext('2d');
  const spots = new Float32Array(CAST.length * FIELDS.length * 2);
  CAST.forEach((page, i) => drawPage(ctx, page, 0, i * PAGE_CELL.height, spots));
  return { canvas, spots };
}

/** Source y of page i in the sheet. */
export const pageCellY = (i) => i * PAGE_CELL.height;

function drawTag(ctx, text, seed, x, y) {
  const { width: w, height: h } = TAG_CELL;
  const inset = 3;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2);
  inkRect(ctx, inset, inset, w - inset * 2, h - inset * 2, { width: 2.6, wobble: 0.5, overshoot: 1.2, seed });
  ctx.font = `500 24px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 34, h / 2 + 1, w - 48);
  ctx.restore();
}

/** Nine tags: row = page, column = field. */
export function drawTagSheet(doc) {
  const canvas = makeCanvas(doc, TAG_CELL.width * FIELDS.length, TAG_CELL.height * CAST.length);
  const ctx = canvas.getContext('2d');
  CAST.forEach((page, p) => page.values.forEach((text, f) => drawTag(ctx, text, 300 + p * 7 + f, f * TAG_CELL.width, p * TAG_CELL.height)));
  return canvas;
}

/** Source rect of the tag for page p, field f. */
export const tagCell = (p, f) => ({ sx: f * TAG_CELL.width, sy: p * TAG_CELL.height });

/** The blank reading form: title, three labelled slots, and the "Oran" row, struck through. */
export function drawFormSheet(doc) {
  const { width: w, height: h } = FORM_CELL;
  const L = FORM_LAYOUT;
  const canvas = makeCanvas(doc, w, h);
  const ctx = canvas.getContext('2d');
  const random = seededRandom(6400);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 31px ${DISPLAY}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText('Okuma formu', L.left, 64, L.right - L.left);
  inkLine(ctx, L.left, 76, L.right, 76, { width: 2.6, wobble: 0.5, random });
  ctx.font = `500 19px ${SANS}`;
  FIELDS.forEach((field, i) => {
    const top = L.slotTops[i];
    ctx.fillStyle = INK.sumi;
    ctx.fillText(field.label, L.left, top - 8);
    inkRect(ctx, L.left, top, L.right - L.left, L.slotH, { width: 1.5, wobble: 0.45, overshoot: 1, seed: 640 + i, color: 'rgba(18,19,24,0.7)' });
  });
  // Oran: not this agent's job — the row is left empty and ruled out
  const top = L.oranY - L.oranH / 2;
  ctx.fillStyle = INK.muted;
  ctx.fillText('Oran', L.left, L.oranY + 7);
  inkRect(ctx, L.oranLeft, top, L.right - L.oranLeft, L.oranH, { width: 1.2, wobble: 0.45, seed: 660, color: 'rgba(18,19,24,0.45)' });
  inkLine(ctx, L.left - 6, L.oranY + 3, L.right + 6, L.oranY - 3, { width: 2.4, wobble: 0.6, random, color: INK.indigo });
  inkRect(ctx, 4, 4, w - 8, h - 8, { width: 3, wobble: 0.6, overshoot: 1.5, seed: 670 });
  return canvas;
}
