// Kanıt — printed matter, inked once into canvases: per round the event card (fictional issuer,
// its rule code in mono) and three index cards of past events, each with its heading on
// top and its later return — a small ink line — on the lower half; plus the indigo paper mask that
// covers that half until the code lifts it. Canvas 2D only.

import { INK, inkLine, inkRect, makeCanvas } from '../../../lib/ink3d/ink.js';
import { seededRandom } from '../../../lib/ink3d/random.js';
import { DISPLAY, MONO, SANS } from '../fonts.js';
import { PICKS, ROUNDS } from './model.js';
import { FOLD_Y } from './world.js';

/** One card cell of the sheet (device px); its aspect is the card's (0.30 : 0.42). */
export const CARD_CELL = Object.freeze({ width: 240, height: 336 });
/** The mask's cell: the covered half of a card. */
export const MASK_CELL = Object.freeze({ width: 240, height: Math.round((336 * (1 - FOLD_Y)) / 2) });

const COLUMNS = PICKS + 1;
const INSET = 5;
const PAD = 18;

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

/** The fictional later return as an ink line: a seeded wander that ends at `result` (−1…1). */
export function returnPath(result, seed, n = 9) {
  const random = seededRandom(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const drift = result * t;
    const jitter = i === 0 || i === n - 1 ? 0 : (random() - 0.5) * 0.35;
    out.push(Math.max(-1, Math.min(1, drift + jitter)));
  }
  return out;
}

function heading(ctx, { issuer, title }, folioRight, iw, random) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 11px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText(folioRight, PAD, PAD + 8);
  ctx.font = `500 13px ${SANS}`;
  ctx.fillStyle = INK.sumi;
  ctx.fillText(issuer, PAD, PAD + 32, iw - PAD * 2);
  inkLine(ctx, PAD, PAD + 42, iw - PAD, PAD + 42, { width: 2.4, wobble: 0.5, random });
  ctx.font = `400 22px ${DISPLAY}`;
  wrapLines(ctx, title, iw - PAD * 2, 2).forEach((line, i) => ctx.fillText(line, PAD, PAD + 74 + i * 24));
}

/** A past event's index card: heading above the fold, its later return below it. */
function drawPick(ctx, pick, x, y) {
  const { width: w, height: h } = CARD_CELL;
  const random = seededRandom(5100 + pick.sheet * 37);
  const iw = w - INSET * 2;
  const ih = h - INSET * 2;
  ctx.save();
  ctx.translate(x + INSET, y + INSET);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(0, 0, iw, ih);
  heading(ctx, pick, `Olay No. ${String(310 + pick.sheet * 7).padStart(4, '0')}`, iw, random);
  // the fold: a perforated rule where the heading ends and the return begins
  const fold = ((FOLD_Y + 1) / 2) * h - INSET;
  ctx.strokeStyle = INK.sumi;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD - 6, fold);
  ctx.lineTo(iw - PAD + 6, fold);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = `400 11px ${SANS}`;
  ctx.fillStyle = INK.muted;
  ctx.fillText('Sonraki getiri', PAD, fold + 22);
  // the return: a baseline and a small hand-drawn line
  const top = fold + 40;
  const bottom = ih - 22;
  const mid = (top + bottom) / 2;
  inkLine(ctx, PAD, mid, iw - PAD, mid, { width: 1.6, wobble: 0.3, random, color: 'rgba(18,19,24,0.45)' });
  const path = returnPath(pick.result, 900 + pick.sheet);
  const amp = (bottom - top) / 2 - 4;
  ctx.beginPath();
  path.forEach((v, i) => {
    const px = PAD + ((iw - PAD * 2) * i) / (path.length - 1);
    const py = mid - v * amp;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = INK.sumi;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  inkRect(ctx, 0, 0, iw, ih, { width: 3, wobble: 0.6, overshoot: 1.5, seed: 140 + pick.sheet });
  ctx.restore();
}

/** The event at hand: heading, its rule code in mono, the body as ruled ink lines. */
function drawQuery(ctx, query, x, y) {
  const { width: w, height: h } = CARD_CELL;
  const random = seededRandom(6100 + query.sheet * 41);
  const iw = w - INSET * 2;
  const ih = h - INSET * 2;
  ctx.save();
  ctx.translate(x + INSET, y + INSET);
  ctx.fillStyle = INK.sheet;
  ctx.fillRect(0, 0, iw, ih);
  heading(ctx, query, 'Yeni olay', iw, random);
  // the type, as the classifier stamped it
  const bx = PAD;
  const by = ih * 0.5;
  ctx.strokeStyle = INK.indigo;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(bx, by, 58, 30);
  ctx.font = `700 19px ${MONO}`;
  ctx.fillStyle = INK.indigo;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(query.code, bx + 29, by + 16);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const top = ih * 0.68;
  const gap = (ih * 0.22) / 4;
  for (let r = 0; r < 4; r += 1) {
    const len = r === 3 ? 0.4 + 0.2 * random() : 0.72 + 0.24 * random();
    inkLine(ctx, PAD, top + r * gap, PAD + (iw - PAD * 2) * len, top + r * gap, { width: 1.8, wobble: 0.45, random, color: 'rgba(18,19,24,0.62)' });
  }
  inkRect(ctx, 0, 0, iw, ih, { width: 3, wobble: 0.6, overshoot: 1.5, seed: 170 + query.sheet });
  ctx.restore();
}

/** Every round's cards, one row per round: the event card, then its three picks. */
export function drawCardSheet(doc) {
  const canvas = makeCanvas(doc, CARD_CELL.width * COLUMNS, CARD_CELL.height * ROUNDS.length);
  const ctx = canvas.getContext('2d');
  for (const round of ROUNDS) {
    const y = round.index * CARD_CELL.height;
    drawQuery(ctx, round.query, 0, y);
    for (const pick of round.picks) drawPick(ctx, pick, (pick.slot + 1) * CARD_CELL.width, y);
  }
  return canvas;
}

/** Source rect of a card (its `sheet` index) in the sheet. */
export function cardCell(sheet) {
  return { sx: (sheet % COLUMNS) * CARD_CELL.width, sy: Math.floor(sheet / COLUMNS) * CARD_CELL.height };
}

/** The mask: opaque indigo paper, dry-brushed (no word: at plate size it could only blur). */
export function drawMask(doc) {
  const { width: w, height: h } = MASK_CELL;
  const canvas = makeCanvas(doc, w, h);
  const ctx = canvas.getContext('2d');
  const random = seededRandom(77);
  ctx.fillStyle = INK.indigo;
  ctx.fillRect(INSET, 0, w - INSET * 2, h - INSET);
  // dry-brush: darker strokes across the wash
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i += 1) {
    const y = 6 + random() * (h - 16);
    const x0 = INSET + random() * 30;
    ctx.globalAlpha = 0.12 + random() * 0.18;
    ctx.strokeStyle = random() < 0.6 ? '#1c2c44' : '#3a557a';
    ctx.lineWidth = 1 + random() * 3;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + 60 + random() * (w - 120), y + (random() - 0.5) * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  inkRect(ctx, INSET, 0, w - INSET * 2, h - INSET, { width: 2.6, wobble: 0.5, seed: 33 });
  return canvas;
}
