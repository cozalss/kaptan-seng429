// Kural Motoru — printed matter, inked once into canvases: one punched evidence card per distinct
// input (fictional issuers, "Temsili") and the telegraph's dial face with its E1–E4 sectors, as in
// the portrait. Canvas 2D only.

import { INK, inkLine, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';
import { MONO, SANS } from '../fonts.js';
import { INPUTS } from './model.js';
import { PUNCH } from './world.js';

/** One card cell of the sheet (device px); its aspect is the card's (0.34 : 0.19). */
export const CARD_CELL = Object.freeze({ width: 340, height: 190 });
/** The dial face cell; the face's radius is DIAL_FACE.r px about its centre. */
export const DIAL_FACE = Object.freeze({ size: 320, r: 150 });

const HOLE = Object.freeze({ w: 15, h: 26 });

/** Pixel centre of punch column i in a card cell. */
export function punchX(i) {
  return ((PUNCH.cols[i] + 1) / 2) * CARD_CELL.width;
}
export const PUNCH_Y = ((PUNCH.row + 1) / 2) * CARD_CELL.height;

function drawCard(ctx, input, x, y) {
  const { width: w, height: h } = CARD_CELL;
  const random = seededRandom(5200 + input.index * 37);
  const cut = 26; // the punched card's clipped corner
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK.sheet;
  ctx.beginPath();
  ctx.moveTo(cut + 3, 3);
  ctx.lineTo(w - 3, 3);
  ctx.lineTo(w - 3, h - 3);
  ctx.lineTo(3, h - 3);
  ctx.lineTo(3, cut + 3);
  ctx.closePath();
  ctx.fill();
  // printed column guides behind the punch row: faint ruled boxes, the punched ones cut through
  for (let i = 0; i < input.holes.length; i += 1) {
    const cx = punchX(i);
    if (input.holes[i]) {
      ctx.fillStyle = INK.sumi;
      ctx.fillRect(cx - HOLE.w / 2, PUNCH_Y - HOLE.h / 2, HOLE.w, HOLE.h);
    } else {
      ctx.strokeStyle = 'rgba(43, 66, 97, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(cx - HOLE.w / 2, PUNCH_Y - HOLE.h / 2, HOLE.w, HOLE.h);
    }
  }
  inkLine(ctx, 14, PUNCH_Y + 22, w - 14, PUNCH_Y + 22, { width: 1.6, wobble: 0.4, random, color: 'rgba(18,19,24,0.55)' });
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 13px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('Temsili', 16, PUNCH_Y + 42);
  ctx.textAlign = 'right';
  ctx.fillText(`No. ${input.serial}`, w - 16, PUNCH_Y + 42);
  ctx.textAlign = 'left';
  ctx.font = `600 17px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText(input.issuer, 16, PUNCH_Y + 68, w - 32);
  // the structured field: the rule code in mono, the value in Inter
  ctx.font = `700 19px ${MONO}`;
  ctx.fillText(input.code, 16, PUNCH_Y + 98);
  const codeW = ctx.measureText(input.code).width + 10;
  ctx.font = `400 16px ${SANS}`;
  ctx.fillText(input.field, 16 + codeW, PUNCH_Y + 98, w - 32 - codeW);
  inkLine(ctx, 16, PUNCH_Y + 108, w * (0.55 + 0.25 * random()), PUNCH_Y + 108, { width: 1.3, wobble: 0.4, random, color: 'rgba(18,19,24,0.5)' });
  ctx.beginPath();
  ctx.moveTo(cut + 3, 3);
  ctx.lineTo(w - 3, 3);
  ctx.lineTo(w - 3, h - 3);
  ctx.lineTo(3, h - 3);
  ctx.lineTo(3, cut + 3);
  ctx.closePath();
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Every distinct card, one cell each in a row (INPUTS order). */
export function drawCardSheet(doc) {
  const canvas = makeCanvas(doc, CARD_CELL.width * INPUTS.length, CARD_CELL.height);
  const ctx = canvas.getContext('2d');
  INPUTS.forEach((input, i) => drawCard(ctx, input, i * CARD_CELL.width, 0));
  return canvas;
}

const SECTOR_LABELS = Object.freeze(['E1', 'E2', 'E3', 'E4']);

/**
 * The telegraph's face: paper, the upper half cut into four sectors E1–E4 (left to right, washed
 * alternately), a tick ring, and the "eşik altı" mark at the foot. The rim and needle are drawn live.
 */
export function drawDialFace(doc) {
  const { size, r } = DIAL_FACE;
  const canvas = makeCanvas(doc, size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.fillStyle = INK.sheet;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  const inner = r * 0.3;
  const outer = r * 0.86;
  for (let s = 0; s < 4; s += 1) {
    const a0 = Math.PI + (s * Math.PI) / 4;
    ctx.fillStyle = s % 2 ? '#dfe1e3' : '#cfd4d9';
    ctx.beginPath();
    ctx.arc(c, c, outer, a0, a0 + Math.PI / 4);
    ctx.arc(c, c, inner, a0 + Math.PI / 4, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let s = 0; s <= 4; s += 1) {
    const a = Math.PI + (s * Math.PI) / 4;
    ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    ctx.lineTo(c + Math.cos(a) * outer, c + Math.sin(a) * outer);
  }
  ctx.moveTo(c + outer, c);
  ctx.arc(c, c, outer, 0, Math.PI, true);
  ctx.stroke();
  // labels on the sector centres
  ctx.fillStyle = INK.sumi;
  ctx.font = `600 34px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let s = 0; s < 4; s += 1) {
    const a = Math.PI + ((s + 0.5) * Math.PI) / 4;
    const rr = r * 0.66;
    ctx.fillText(SECTOR_LABELS[s], c + Math.cos(a) * rr, c + Math.sin(a) * rr);
  }
  // the tick ring round the lower half and the foot mark (eşik altı)
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 1; i < 12; i += 1) {
    const a = (i * Math.PI) / 12;
    const r0 = i === 6 ? r * 0.62 : r * 0.8;
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r * 0.9, c + Math.sin(a) * r * 0.9);
  }
  ctx.stroke();
  return canvas;
}
