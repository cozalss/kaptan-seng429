// Pure drawing data for the four inked landmarks of "Bölüm 4 · Rota" (no DOM): a buoy at I, a
// lighthouse at II, a shoal with its depth figures at III and the harbour mole at IV. Each one is
// drawn around its waterline point (x, y) at scale `s` (1 ≈ 100 px tall), as path data in three
// layers — paper (to sit in front of the sea), indigo wash and sumi ink — plus chart figures.
// Also places each landmark in the open water beside its waypoint, clear of the caption panels.

import { inkStroke } from './rota-sea.js';

const round = (value) => Math.round(value * 10) / 10;
const poly = (points) => `M ${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L ')} Z`;

/** Waterline ripples either side of an object `half` wide (shared by every landmark). */
function ripples(x, y, half, s) {
  return [
    inkStroke([[x - half - 26 * s, y + 1], [x - half * 0.5, y - 1.5 * s], [x - half * 0.1, y + 1]], 2.4 * s),
    inkStroke([[x + half * 0.2, y + 1.5], [x + half * 0.7, y - 1 * s], [x + half + 30 * s, y + 2]], 2.6 * s),
    inkStroke([[x - half * 0.6, y + 7 * s], [x + half * 0.9, y + 6 * s]], 1.4 * s),
  ];
}

/** I · a can buoy with a cone topmark, rolling a little in the swell. */
export function buoy(x, y, s = 1) {
  const body = [[x - 15 * s, y], [x + 15 * s, y], [x + 10 * s, y - 40 * s], [x - 10 * s, y - 40 * s]];
  const band = [[x - 13.4 * s, y - 13 * s], [x + 13.4 * s, y - 13 * s], [x + 11.4 * s, y - 27 * s], [x - 11.4 * s, y - 27 * s]];
  const cone = [[x - 9 * s, y - 64 * s], [x + 9 * s, y - 64 * s], [x, y - 80 * s]];
  return {
    paper: [poly(body)],
    wash: [poly(band)],
    ink: [
      inkStroke([[x - 15 * s, y], [x - 10 * s, y - 40 * s]], 4.2 * s, { lift: 0.6 }),
      inkStroke([[x + 10 * s, y - 40 * s], [x + 15 * s, y]], 2.4 * s, { lift: 0.6 }),
      inkStroke([[x - 11 * s, y - 40 * s], [x + 11 * s, y - 40.5 * s]], 2.6 * s),
      inkStroke([[x, y - 40 * s], [x + 0.5 * s, y - 64 * s]], 3 * s, { lift: 0.5 }),
      poly(cone),
      ...ripples(x, y, 15 * s, s),
    ],
    figures: [],
    box: [x - 45 * s, y - 80 * s, x + 47 * s, y + 8 * s],
  };
}

/** II · a lighthouse on a rock: shaded tower, lantern, three strokes of light. */
export function lighthouse(x, y, s = 1) {
  const rock = [[x - 58 * s, y + 2], [x - 40 * s, y - 14 * s], [x - 14 * s, y - 22 * s], [x + 18 * s, y - 20 * s], [x + 44 * s, y - 9 * s], [x + 56 * s, y + 2]];
  const top = y - 118 * s;
  const tower = [[x - 15 * s, y - 18 * s], [x + 15 * s, y - 18 * s], [x + 9 * s, top], [x - 9 * s, top]];
  const shade = [[x + 1 * s, y - 18 * s], [x + 15 * s, y - 18 * s], [x + 9 * s, top], [x + 0.5 * s, top]];
  const cap = [[x - 12 * s, top - 22 * s], [x + 12 * s, top - 22 * s], [x, top - 36 * s]];
  const ray = (dx, dy, w) => inkStroke([[x + dx * 16 * s, top - 13 * s + dy * 6 * s], [x + dx * 62 * s, top - 13 * s + dy * 20 * s]], w * s);
  return {
    paper: [poly(tower)],
    wash: [poly(shade), poly(rock)],
    ink: [
      inkStroke([[x - 15 * s, y - 18 * s], [x - 9 * s, top]], 4.6 * s, { lift: 0.6 }),
      inkStroke([[x + 9 * s, top], [x + 15 * s, y - 18 * s]], 2.2 * s, { lift: 0.6 }),
      inkStroke([[x - 12 * s, top + 0.5], [x + 12 * s, top]], 3 * s),
      inkStroke([[x - 8 * s, y - 60 * s], [x + 11.5 * s, y - 61 * s]], 1.6 * s),
      poly([[x - 7 * s, top], [x + 7 * s, top], [x + 7 * s, top - 4 * s], [x - 7 * s, top - 4 * s]]),
      inkStroke([[x - 7 * s, top - 4 * s], [x - 7 * s, top - 21 * s]], 2.2 * s, { lift: 0.5 }),
      inkStroke([[x + 7 * s, top - 4 * s], [x + 7 * s, top - 21 * s]], 2.2 * s, { lift: 0.5 }),
      poly(cap),
      ray(1, -1, 2.2),
      ray(1, 0.4, 1.6),
      ray(-1, -1, 1.8),
      inkStroke(rock.slice(0, 4), 3.6 * s),
      inkStroke(rock.slice(3), 2.4 * s),
      ...ripples(x, y, 58 * s, s),
    ],
    figures: [],
    box: [x - 84 * s, top - 36 * s, x + 88 * s, y + 8 * s],
  };
}

/** III · a shoal: a sandbank awash, its danger line dotted, soundings in fathoms around it. */
export function shoal(x, y, s = 1) {
  const bank = [[x - 70 * s, y], [x - 40 * s, y - 9 * s], [x + 6 * s, y - 13 * s], [x + 48 * s, y - 7 * s], [x + 72 * s, y + 1], [x + 30 * s, y + 9 * s], [x - 30 * s, y + 8 * s]];
  const dots = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const dx = Math.cos(a) * 98 * s;
    const dy = Math.sin(a) * 30 * s;
    const r = 1.7 * s;
    return `M ${round(x + dx - r)} ${round(y + dy)} a ${round(r)} ${round(r)} 0 1 0 ${round(2 * r)} 0 a ${round(r)} ${round(r)} 0 1 0 ${round(-2 * r)} 0 Z`;
  });
  return {
    paper: [],
    wash: [poly(bank)],
    ink: [
      inkStroke([[x - 70 * s, y], [x - 40 * s, y - 9 * s], [x + 6 * s, y - 13 * s], [x + 48 * s, y - 7 * s], [x + 72 * s, y + 1]], 2.8 * s),
      inkStroke([[x - 22 * s, y + 4 * s], [x + 30 * s, y + 3 * s]], 1.4 * s),
      // a rock awash: the chart's cross
      inkStroke([[x + 24 * s, y - 34 * s], [x + 40 * s, y - 34 * s]], 2.4 * s, { lift: 0.5 }),
      inkStroke([[x + 32 * s, y - 42 * s], [x + 32 * s, y - 26 * s]], 2.4 * s, { lift: 0.5 }),
      ...dots,
    ],
    figures: [
      { x: x - 118 * s, y: y - 22 * s, text: '7' },
      { x: x - 58 * s, y: y - 38 * s, text: '4' },
      { x: x + 112 * s, y: y - 10 * s, text: '5' },
      { x: x - 6 * s, y: y + 40 * s, text: '3' },
      { x: x + 70 * s, y: y + 36 * s, text: '6' },
    ],
    box: [x - 126 * s, y - 52 * s, x + 126 * s, y + 46 * s],
  };
}

/** IV · the harbour mole: a dark breakwater of laid blocks running out to a beacon at its head. */
export function mole(x, y, s = 1, { length = 260, side = -1 } = {}) {
  const tip = x;
  const root = x + side * length;
  const lo = Math.min(tip, root);
  const hi = Math.max(tip, root);
  const top = y - 16 * s;
  const wall = [[lo, y], [hi, y], [hi, top + 2 * s], [lo, top]];
  const joints = [];
  for (let k = lo + 20 * s; k < hi - 10 * s; k += 28 * s) {
    joints.push(inkStroke([[k, top + 3 * s], [k + 1, y - 2 * s]], 1.4 * s, { lift: 0.5 }));
  }
  joints.push(inkStroke([[lo, top + 8 * s], [hi, top + 8.5 * s]], 1.2 * s));
  const bx = tip - side * 14 * s;
  const tower = [[bx - 7 * s, top], [bx + 7 * s, top], [bx + 5 * s, top - 44 * s], [bx - 5 * s, top - 44 * s]];
  return {
    paper: [poly(wall), poly(tower)],
    wash: [poly(wall), poly([[lo, y + 2 * s], [hi, y + 2 * s], [hi, y + 9 * s], [lo, y + 9 * s]])],
    ink: [
      ...joints,
      inkStroke([[lo - 6 * s, top - 1], [hi + 4 * s, top + 0.5]], 3.6 * s),
      inkStroke([[lo, y], [hi, y + 0.5]], 4.4 * s),
      inkStroke([[bx - 7 * s, top], [bx - 5 * s, top - 44 * s]], 3.2 * s, { lift: 0.6 }),
      inkStroke([[bx + 5 * s, top - 44 * s], [bx + 7 * s, top]], 1.8 * s, { lift: 0.6 }),
      inkStroke([[bx - 6 * s, top - 22 * s], [bx + 6 * s, top - 22 * s]], 1.4 * s),
      poly([[bx - 9 * s, top - 44 * s], [bx + 9 * s, top - 44 * s], [bx, top - 58 * s]]),
      ...ripples((lo + hi) / 2, y + 4 * s, (hi - lo) / 2, s),
    ],
    figures: [],
    box: [lo - 30 * s, top - 58 * s, hi + 30 * s, y + 12 * s],
  };
}

export const LANDMARKS = Object.freeze([buoy, lighthouse, shoal, mole]);

/** Landmark heights at scale 1 (box above / below the waterline), for fitting them into a slot. */
const EXTENT = Object.freeze([
  { up: 80, down: 8, half: 46 },
  { up: 154, down: 8, half: 86 },
  { up: 52, down: 46, half: 126 },
  { up: 72, down: 12, half: 150 },
]);

/**
 * Where landmark `index` sits beside its waypoint: in the open column (the side away from its
 * panel), in the gap between the panels above and below on that side, scaled by perspective
 * (`depth` 0 far … 1 near) and shrunk to fit the gap. Null when there is no room.
 * @param {{ index: number, mark: {x: number, y: number}, side: 1 | -1, depth: number,
 *   panels: {left: number, top: number, right: number, bottom: number}[],
 *   width: number, lane: number, floor?: number }} options  side: +1 = open water to the right
 * @returns {{ x: number, y: number, s: number } | null}
 */
export function landmarkSlot({ index, mark, side, depth, panels, width, lane, floor = Infinity }) {
  const extent = EXTENT[index];
  if (!extent || !mark || !(width > 0)) return null;
  const near = Math.min(Math.max(Number.isFinite(depth) ? depth : 0, 0), 1);
  const wanted = 0.95 + 0.6 * near;
  const inner = mark.x + side * (lane / 2 + 24);
  const outer = side > 0 ? width - 12 : 12;
  const columnWidth = Math.abs(outer - inner);
  if (columnWidth < 80) return null;
  const x = inner + side * columnWidth * 0.5;
  // Free water on that side: below the last panel that starts above the mark, above the next one.
  const onSide = panels.filter((p) => (side > 0 ? p.right > inner : p.left < inner));
  const above = Math.max(mark.y - 40, ...onSide.filter((p) => p.top <= mark.y).map((p) => p.bottom + 18));
  const below = Math.min(floor, ...onSide.filter((p) => p.top > mark.y).map((p) => p.top - 18));
  const room = below - above;
  const tall = extent.up + extent.down;
  const s = Math.min(wanted, room / tall, (columnWidth * 0.9) / (2 * extent.half));
  if (!(s >= 0.55)) return null;
  const y = above + extent.up * s + (room - tall * s) * 0.55;
  return { x: round(x), y: round(y), s: Math.round(s * 100) / 100 };
}
