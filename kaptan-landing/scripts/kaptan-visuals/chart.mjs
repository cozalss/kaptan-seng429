// The nautical chart ("seyir haritası", 3:2, drawn in a 2400 × 1600 box): an invented coastline
// with isobaths, soundings and a compass rose throwing rhumb lines, printed in the book's palette
// (sumi ink, indigo wash on rice paper). It is Bölüm 2's closing double-page spread: the course,
// the waypoints and the legend are NOT in the raster — they are live on the page (crisp type, the
// course inked by DrawSVG; src/components/services/chart-spread.js). The geometry they share lives
// in src/components/services/chart-course.js.

import { NORTH_RED, SANS, circle, f, group, line, path, poly, rect, rng, sharedDefs, smooth, text } from './kit.mjs';
import { contours, fbm, sampleGrid, thin } from './field.mjs';
import { CHART_BOX, COURSE, LEGEND } from '../../src/components/services/chart-course.js';

// The site palette (src/styles/tokens.css), not the kit's neutral greys.
const SUMI = '#121318';
const WASH = '#2B4261';
const PAPER = '#F3F1EC';
const PANEL = '#FBFAF6';

const BOX = CHART_BOX;
const SEED = 4242;
const ROSE = { x: 1790, y: 1080, R: 290 };
const RHUMB_NODE = [760, 560];
const TAU = Math.PI * 2;

const segDist = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** Elevation: > 0 land, < 0 water (≈ depth / 120 m). */
function elevation(x, y) {
  const u = x / BOX[0];
  const v = y / BOX[1];
  let e = 0.5 - 1.05 * u - 0.42 * v + 0.12;
  e += fbm(x / 780, y / 780, SEED) * 0.46;
  e += fbm(x / 230, y / 230, SEED + 7) * 0.1;
  e += fbm(x / 70, y / 70, SEED + 13) * 0.025;
  const islands = [
    [1500, 520, 110, 0.5],
    [1210, 900, 70, 0.42],
    [1960, 330, 60, 0.4],
    [2120, 1180, 90, 0.44],
  ];
  for (const [ix, iy, r, amp] of islands) e += amp * Math.exp(-((x - ix) ** 2 + (y - iy) ** 2) / (2 * r * r));
  // the legend is printed on dry land (a cartouche on the coast, as on old charts)
  const lx = LEGEND.x + LEGEND.w / 2;
  const ly = LEGEND.y + LEGEND.h / 2;
  e += 0.16 * Math.exp(-(((x - lx) / (LEGEND.w * 0.7)) ** 2 + ((y - ly) / (LEGEND.h * 0.9)) ** 2));
  // a deep channel along the plotted course (the course itself is drawn live on the page)
  let d = Infinity;
  for (let i = 0; i < COURSE.length - 1; i += 1) d = Math.min(d, segDist(x, y, COURSE[i], COURSE[i + 1]));
  e -= 0.55 * Math.exp(-(d * d) / (2 * 110 * 110));
  e -= 0.6 * Math.exp(-((x - ROSE.x) ** 2 + (y - ROSE.y) ** 2) / (2 * 380 * 380));
  return e;
}

let cachedBody = null;

function field() {
  const pad = 240;
  const step = 8;
  const x0 = -pad;
  const y0 = -pad;
  const cols = Math.ceil((BOX[0] + 2 * pad) / step);
  const rows = Math.ceil((BOX[1] + 2 * pad) / step);
  const edge = 40;
  return sampleGrid((x, y) => {
    const e = elevation(x, y);
    const border = Math.min(x - x0, y - y0, x0 + cols * step - x, y0 + rows * step - y);
    return border < edge ? Math.min(e, -0.5) : e;
  }, { x0, y0, cols, rows, step });
}

const loopsPath = (lines) => lines.map(({ points, closed }) => `${poly(thin(points))}${closed ? ' Z' : ''}`).join(' ');
const smoothLines = (lines, k = 3) => lines.map(({ points, closed }) => smooth(thin(points, k), closed)).join(' ');

/** Engraved hatching for the land (a pattern of fine ink diagonals). */
const HATCH_DEFS = `<pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
  <line x1="0" y1="0" x2="0" y2="16" stroke="${SUMI}" stroke-width="1.3" stroke-opacity="0.16"/></pattern>`;

function isobaths(grid) {
  const parts = [];
  // shallow water carries the indigo wash, each step shallower a little more; deep water is bare paper
  [-0.1, -0.05, -0.02].forEach((lv, i) => {
    parts.push(path(loopsPath(contours(grid, lv)), { fill: WASH, 'fill-opacity': [0.06, 0.09, 0.12][i], stroke: 'none', 'fill-rule': 'evenodd' }));
  });
  const levels = [-0.02, -0.05, -0.1, -0.17, -0.26, -0.37, -0.5];
  levels.forEach((lv, i) => {
    const firm = i === 1;
    parts.push(path(smoothLines(contours(grid, lv)), {
      stroke: WASH,
      'stroke-opacity': firm ? 0.7 : 0.42,
      'stroke-width': firm ? 2 : 1.3,
      'stroke-dasharray': i >= 4 ? '12 7' : undefined,
    }));
  });
  return group(parts);
}

function land(grid) {
  const coast = contours(grid, 0);
  const parts = [];
  parts.push(path(loopsPath(coast), { fill: PANEL, stroke: 'none', 'fill-rule': 'evenodd' }));
  parts.push(path(loopsPath(coast), { fill: 'url(#hatch)', stroke: 'none', 'fill-rule': 'evenodd' }));
  [0.08, 0.17, 0.28, 0.4].forEach((lv) => {
    parts.push(path(smoothLines(contours(grid, lv)), { stroke: SUMI, 'stroke-opacity': 0.28, 'stroke-width': 1.1 }));
  });
  // a double coastline, as engraved: a fine line a few metres out, then the firm shore
  parts.push(path(smoothLines(contours(grid, -0.012), 2), { stroke: SUMI, 'stroke-width': 1, 'stroke-opacity': 0.55 }));
  parts.push(path(smoothLines(coast, 2), { stroke: SUMI, 'stroke-width': 2.6 }));
  return group(parts);
}

function soundings(r) {
  const parts = [];
  const placed = [];
  const pad = 60;
  const clear = (x, y) =>
    Math.hypot(x - ROSE.x, y - ROSE.y) > ROSE.R + 70 &&
    !(x > LEGEND.x - pad && x < LEGEND.x + LEGEND.w + pad && y > LEGEND.y - pad && y < LEGEND.y + LEGEND.h + pad) &&
    // keep the channel under the live course readable
    COURSE.slice(1).every((b, i) => segDist(x, y, COURSE[i], b) > 46) &&
    // and the boat, which rests at landfall
    Math.hypot(x - COURSE[COURSE.length - 1][0], y - (COURSE[COURSE.length - 1][1] - 70)) > 150 &&
    // and the book's gutter (the fold down the middle of the spread)
    Math.abs(x - BOX[0] / 2) > 40;
  for (let k = 0; k < 5000 && placed.length < 280; k += 1) {
    const x = 120 + r() * (BOX[0] - 240);
    const y = 120 + r() * (BOX[1] - 240);
    const e = elevation(x, y);
    if (e > -0.03 || !clear(x, y)) continue;
    if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 80)) continue;
    placed.push([x, y]);
    const depth = Math.round(-e * 120);
    parts.push(text(x, y, String(depth), { family: SANS, size: 21, fill: WASH, 'fill-opacity': 0.85, anchor: 'middle' }));
  }
  return group(parts);
}

function rhumbs() {
  const parts = [];
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * TAU;
    const major = i % 4 === 0;
    parts.push(line(ROSE.x, ROSE.y, ROSE.x + Math.cos(a) * 3600, ROSE.y + Math.sin(a) * 3600, {
      stroke: SUMI,
      'stroke-width': major ? 1.1 : 0.8,
      'stroke-opacity': major ? 0.3 : 0.16,
    }));
  }
  // a secondary node of the rhumb net, as on old portolan charts
  const [nx, ny] = RHUMB_NODE;
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * TAU + TAU / 64;
    parts.push(line(nx, ny, nx + Math.cos(a) * 2600, ny + Math.sin(a) * 2600, { stroke: SUMI, 'stroke-width': 0.8, 'stroke-opacity': 0.14 }));
  }
  parts.push(circle(nx, ny, 14, { fill: PANEL, stroke: SUMI, 'stroke-width': 1.2 }));
  return group(parts);
}

function kite(cx, cy, a, len, half, north = false) {
  const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
  const l = [cx + Math.cos(a - Math.PI / 2) * half, cy + Math.sin(a - Math.PI / 2) * half];
  const rr = [cx + Math.cos(a + Math.PI / 2) * half, cy + Math.sin(a + Math.PI / 2) * half];
  return [
    path(`${poly([[cx, cy], l, tip])} Z`, { fill: north ? NORTH_RED : SUMI, stroke: SUMI, 'stroke-width': 1.2 }),
    path(`${poly([[cx, cy], rr, tip])} Z`, { fill: PANEL, stroke: SUMI, 'stroke-width': 1.2 }),
  ].join('');
}

function compassRose() {
  const { x, y, R } = ROSE;
  const parts = [];
  parts.push(circle(x, y, R + 14, { fill: PAPER, 'fill-opacity': 0.92, stroke: 'none' }));
  parts.push(circle(x, y, R, { stroke: SUMI, 'stroke-width': 2.4 }));
  parts.push(circle(x, y, R - 22, { stroke: SUMI, 'stroke-width': 1.1 }));
  const ticks = [];
  for (let d = 0; d < 360; d += 1) {
    const a = (d / 360) * TAU - Math.PI / 2;
    const len = d % 10 === 0 ? 22 : d % 5 === 0 ? 14 : 7;
    ticks.push(`M${f(x + Math.cos(a) * R)} ${f(y + Math.sin(a) * R)} L${f(x + Math.cos(a) * (R - len))} ${f(y + Math.sin(a) * (R - len))}`);
  }
  parts.push(path(ticks.join(' '), { stroke: SUMI, 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  for (let d = 30; d < 360; d += 30) {
    const a = (d / 360) * TAU - Math.PI / 2;
    const tx = x + Math.cos(a) * (R + 34);
    const ty = y + Math.sin(a) * (R + 34);
    parts.push(text(tx, ty + 7, String(d).padStart(3, '0'), { size: 19, weight: 500, fill: SUMI, 'fill-opacity': 0.75, anchor: 'middle', transform: `rotate(${d} ${f(tx)} ${f(ty)})` }));
  }
  parts.push(circle(x, y, R * 0.62, { stroke: SUMI, 'stroke-width': 1.1 }));
  parts.push(circle(x, y, R * 0.6, { stroke: SUMI, 'stroke-opacity': 0.4, 'stroke-width': 0.8 }));
  const star = [];
  const spec = [
    [16, R * 0.34, 8, 11.25],
    [8, R * 0.5, 13, 22.5],
    [4, R * 0.7, 20, 45],
    [4, R * 0.96, 30, 0],
  ];
  spec.forEach(([count, len, half, offset]) => {
    for (let i = 0; i < count; i += 1) {
      const deg = offset + (360 / count) * i;
      const a = (deg / 360) * TAU - Math.PI / 2;
      star.push(kite(x, y, a, len, half, count === 4 && offset === 0 && i === 0));
    }
  });
  parts.push(star.join(''));
  parts.push(circle(x, y, 12, { fill: PANEL, stroke: SUMI, 'stroke-width': 1.4 }));
  // the north mark: a small ink arrowhead over the rose (Kuzey)
  parts.push(path(`M${x} ${y - R - 92} L${x + 16} ${y - R - 50} L${x} ${y - R - 60} L${x - 16} ${y - R - 50} Z`, { fill: SUMI, stroke: 'none' }));
  return group(parts);
}

function neatline() {
  const [W, H] = BOX;
  const o = 46;
  const i = 70;
  const parts = [];
  parts.push(`<path d="M-20 -20 H${W + 20} V${H + 20} H-20 Z M${o} ${o} V${H - o} H${W - o} V${o} Z" fill="${PAPER}" fill-rule="evenodd"/>`);
  parts.push(rect(o, o, W - 2 * o, H - 2 * o, { stroke: SUMI, 'stroke-width': 2.6 }));
  parts.push(rect(i, i, W - 2 * i, H - 2 * i, { stroke: SUMI, 'stroke-width': 1.1 }));
  const bar = 60;
  const bars = [];
  for (let x = i, k = 0; x < W - i; x += bar, k += 1) {
    if (k % 2) continue;
    const w = Math.min(bar, W - i - x);
    bars.push(`M${x} ${o + 7} h${w} v10 h${-w} Z M${x} ${H - o - 17} h${w} v10 h${-w} Z`);
  }
  for (let y = i, k = 0; y < H - i; y += bar, k += 1) {
    if (k % 2) continue;
    const h = Math.min(bar, H - i - y);
    bars.push(`M${o + 7} ${y} v${h} h10 v${-h} Z M${W - o - 17} ${y} v${h} h10 v${-h} Z`);
  }
  parts.push(path(bars.join(' '), { fill: SUMI, stroke: 'none' }));
  for (let k = 1; k < 10; k += 1) {
    if (k === 5) continue; // the gutter
    const x = i + ((W - 2 * i) * k) / 10;
    parts.push(text(x, o - 12, `${k * 6}′`, { size: 18, fill: SUMI, 'fill-opacity': 0.7, anchor: 'middle' }));
  }
  for (let k = 1; k < 7; k += 1) {
    const y = i + ((H - 2 * i) * k) / 7;
    parts.push(text(o - 12, y, `${k * 5}′`, { size: 18, fill: SUMI, 'fill-opacity': 0.7, anchor: 'middle', transform: `rotate(-90 ${f(o - 12)} ${f(y)})` }));
  }
  return group(parts);
}

/** The chart body in the 2400 × 1600 box (cached). */
export function chartBody() {
  if (cachedBody) return cachedBody;
  const grid = field();
  cachedBody = [
    rect(-20, -20, BOX[0] + 40, BOX[1] + 40, { fill: PAPER }),
    isobaths(grid),
    land(grid),
    rhumbs(),
    soundings(rng(SEED)),
    compassRose(),
    neatline(),
  ].join('');
  return cachedBody;
}

const doc = (px, view, inner, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${px[0]}" height="${px[1]}" viewBox="${view.map(f).join(' ')}" preserveAspectRatio="xMidYMid slice">${sharedDefs(defs)}${inner}</svg>`;

export function chartSvg({ px }) {
  return doc(px, [0, 0, ...BOX], chartBody(), HATCH_DEFS);
}
