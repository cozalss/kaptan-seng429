// Crew No. 04 · Kanıt — the bosun's mate keeps the old logbooks: a young woman, dark hair tied
// under an ink-black scarf, short sleeves, reading back through a bound logbook for voyages like
// this one. A folded paper band lies down the right-hand "result" column and she holds it flat:
// she reads what happened, never how it ended. A short red ribbon marker is the plate's only red.
// Style: ./style.mjs, STYLE.md.

import { INDIGO, INK, PAPER, RED, brush, crewPlate, dry, g, mass, place, sample, strokes, sumi, wash } from './style.mjs';

const SHEET = '#FBFAF6';

/* ── Local helpers ──────────────────────────────────────────────────────────────────────────── */

/** A livelier contour: more pressure wobble than the default brush, same palette. */
const ink = (pts, w, r, opts = {}) => brush(pts, { w, taper: [0.12, 0.3], r, wobble: 0.24, ...opts });

/** A wet-edged wash: the tint plus a darker rim where the pigment pooled as it dried. */
const wet = (pts, opacity, opts = {}) => wash(pts, { opacity, edge: 0.9, ...opts });

/** Pen lines (ruling, handwriting): one cheap stroked path for many marks. */
const pen = (d, { w = 1.2, color = INK, opacity = 1 } = {}) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const P = ([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
const polyline = (pts) => `M${pts.map(P).join('L')}`;

/* ── The open logbook (a spread in perspective) ─────────────────────────────────────────────── */

const SPREAD = { a: [382, 1112], b: [996, 1100], c: [1062, 1398], d: [326, 1412] }; // far-left, far-right, near-right, near-left
const BAND = [0.8, 0.97]; // the covered "result" column, as spread u

/** Point on the spread: u across both pages (gutter at 0.5), v far → near; pages bow up. */
function onBook(u, v) {
  const { a, b, c, d } = SPREAD;
  const vv = Math.sign(v) * Math.abs(v) ** 1.2;
  const top = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const bot = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u];
  const s = u < 0.5 ? u * 2 : (u - 0.5) * 2;
  const bow = -Math.sin(Math.PI * Math.min(1, s * 1.15)) * 14 * (1 - 0.35 * v);
  return [top[0] + (bot[0] - top[0]) * vv, top[1] + (bot[1] - top[1]) * vv + bow];
}

const edge = (u0, u1, v, n = 8) => Array.from({ length: n + 1 }, (_, i) => onBook(u0 + ((u1 - u0) * i) / n, v));
const side = (u, v0, v1, n = 6) => Array.from({ length: n + 1 }, (_, i) => onBook(u, v0 + ((v1 - v0) * i) / n));

function table(r) {
  const out = [];
  const top = [[30, 1090], [1170, 1080], [1220, 1440], [-20, 1450]];
  out.push(mass(top, { sharp: true, fill: PAPER }));
  out.push(mass(top, { sharp: true, fill: INDIGO, opacity: 0.46 }));
  const grain = [];
  for (let i = 0; i < 9; i += 1) {
    const t = (i + r() * 0.7) / 9;
    const y = 1096 + t ** 1.25 * 340;
    grain.push([[-10 + r() * 120, y + 3], [560 + r() * 80, y + 5 * (r() - 0.5)], [1210 - r() * 120, y - 3]]);
  }
  out.push(dry(strokes(grain, { w: 6, taper: [0.2, 0.3], r, fill: INK, opacity: 0.55, step: 40 })));
  out.push(ink([[30, 1090], [600, 1085], [1170, 1080]], 6, r, { taper: [0.02, 0.02], step: 30 }));
  // rain landing on the table: a few drops dried to wet-edged rings
  for (const [x, y, s] of [[150, 1300, 1], [214, 1352, 0.7], [1150, 1330, 1.2], [96, 1180, 0.6]]) {
    out.push(wet(Array.from({ length: 7 }, (_, i) => [x + Math.cos(i * 0.9) * 16 * s * (0.8 + r() * 0.4), y + Math.sin(i * 0.9) * 7 * s * (0.8 + r() * 0.4)]), 0.16));
  }
  out.push(mass([[-20, 1446], [1220, 1436], [1220, 1500], [-20, 1500]], { sharp: true, fill: INK }));
  return out.join('');
}

/** Three closed logbooks stacked at the far corner of the table — this one came off the top. */
function stack(r) {
  const out = [];
  const books = [
    { x0: 20, x1: 232, y: 1090, h: 40, dx: 0 },
    { x0: 30, x1: 226, y: 1050, h: 36, dx: 10 },
    { x0: 26, x1: 218, y: 1014, h: 34, dx: -4 },
  ];
  for (const { x0, x1, y, h, dx } of books) {
    const spine = [[x0 + dx, y - h], [x1 + dx, y - h - 4], [x1 + dx, y], [x0 + dx, y + 2]];
    out.push(sumi(spine, { angle: 2, sharp: true, fill: INK, base: 0.86 }));
    out.push(mass([[x0 + dx + 6, y - h], [x0 + dx + 20, y - h - 12], [x1 + dx + 10, y - h - 16], [x1 + dx, y - h - 4]], { sharp: true, fill: INDIGO, opacity: 0.7 }));
    out.push(ink([[x0 + dx + 20, y - h - 12], [x1 + dx + 10, y - h - 16]], 2.4, r, { straight: true, taper: [0, 0], step: 40 }));
    const lx = x0 + dx + (x1 - x0) * 0.42;
    out.push(mass([[lx, y - h + 9], [lx + 52, y - h + 8], [lx + 52, y - 9], [lx, y - 8]], { sharp: true, fill: PAPER, opacity: 0.9 }));
    out.push(pen(`M${lx + 8} ${y - h / 2}L${lx + 44} ${y - h / 2 - 1}`, { w: 2, opacity: 0.6 }));
  }
  out.push(wash([[14, 1094], [240, 1090], [250, 1110], [18, 1114]], { opacity: 0.35, sharp: true, edge: 0 }));
  return out.join('');
}

/**
 * One handwritten word: a run of small irregular strokes — low humps, the odd tall loop or a
 * descender — as control points on the page, smoothed into a single pen line.
 */
function word(r, u0, u1, v) {
  const h = 0.8 + v * 0.55; // nearer rows are bigger
  const pts = [];
  let u = u0;
  while (u < u1) {
    const [x, y] = onBook(u, v);
    const roll = r();
    if (roll < 0.09) pts.push([x - h, y - 1.5 * h], [x + 2 * h, y - 8 * h], [x - 1 * h, y - 6 * h], [x + 1 * h, y]); // looped ascender
    else if (roll < 0.16) pts.push([x, y + 5 * h], [x + 2 * h, y + 1 * h]); // descender
    else pts.push([x, y - (1 + r() * 3.4) * h], [x + 2 * h, y + r() * 0.8 * h]); // hump
    u += 0.007 + r() * 0.011;
  }
  return polyline(sample(pts, 5));
}

function logbook(r) {
  const out = [];
  const { a, b, c, d } = SPREAD;
  // cast shadow on the table (light from the upper right → shadow falls lower left)
  out.push(wet([[d[0] - 30, d[1] + 22], [c[0] - 10, c[1] + 26], [c[0] + 10, c[1] - 10], [d[0] - 40, d[1] - 60]], 0.32, { sharp: true }));
  // cover boards: an old dark binding showing round the page block
  const board = [[a[0] - 18, a[1] - 2], [b[0] + 18, b[1] - 6], [c[0] + 22, c[1] + 16], [d[0] - 22, d[1] + 20]];
  out.push(sumi(board, { angle: 4, sharp: true, fill: INK, base: 0.82 }));
  out.push(ink([[d[0] - 22, d[1] + 20], [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2 + 20], [c[0] + 22, c[1] + 16]], 3, r, { fill: PAPER, opacity: 0.35, straight: true, step: 40 }));
  // page block: the near edges of the leaves, a few pencil-thin lines under each page
  for (const [u0, u1] of [[0, 0.5], [0.5, 1]]) {
    const leaves = [];
    for (let k = 1; k <= 3; k += 1) leaves.push(polyline(edge(u0 + 0.004, u1 - 0.004, 1, 6).map(([x, y]) => [x, y + k * 4.5])));
    out.push(mass([...edge(u0, u1, 1), ...edge(u0, u1, 1).reverse().map(([x, y]) => [x, y + 15])], { sharp: true, fill: SHEET }));
    out.push(pen(leaves.join(''), { w: 1.3, opacity: 0.5 }));
  }
  // the two pages
  for (const [u0, u1] of [[0, 0.5], [0.5, 1]]) {
    const page = [...edge(u0, u1, 0, 10), ...side(u1, 0, 1).slice(1), ...edge(u0, u1, 1, 10).reverse().slice(1), ...side(u0, 0, 1).reverse().slice(1)];
    out.push(mass(page, { sharp: true, fill: SHEET }));
  }
  // gutter shade and the curl of the pages into it
  out.push(wash([...side(0.47, 0, 1), ...side(0.5, 0, 1).reverse()], { opacity: 0.22, sharp: true, edge: 0 }));
  out.push(wash([...side(0.5, 0, 1), ...side(0.52, 0, 1).reverse()], { opacity: 0.12, sharp: true, edge: 0 }));
  out.push(ink(side(0.5, 0, 1), 2.6, r, { taper: [0.1, 0.1], step: 14 }));
  // ruling: indigo rows and column rules (date, event, wind and sea, remarks, result)
  const rows = [];
  for (let v = 0.11; v < 0.97; v += 0.058) rows.push(v);
  const rules = [];
  for (const v of rows) {
    rules.push(polyline(edge(0.02, 0.485, v + 0.024, 6)));
    rules.push(polyline(edge(0.515, 0.985, v + 0.024, 6)));
  }
  out.push(pen(rules.join(''), { w: 1.1, color: INDIGO, opacity: 0.45 }));
  const cols = [0.1, 0.6, BAND[0] - 0.012];
  out.push(pen(cols.map((u) => polyline(side(u, 0.04, 0.99, 4))).join(''), { w: 1.4, color: INDIGO, opacity: 0.55 }));
  // header: an inked band across the top of each page
  for (const [u0, u1] of [[0.03, 0.47], [0.53, BAND[0] - 0.02]]) {
    out.push(mass([...edge(u0, u1, 0.04, 4), ...edge(u0, u1, 0.075, 4).reverse()], { sharp: true, fill: INK, opacity: 0.75 }));
  }
  // entries: handwritten, illegible — a few words per column, rows left short or blank
  const lines = [[], []]; // far half / near half (the near rows take a heavier pen)
  const put = (u0, u1, v) => {
    let u = u0 + r() * 0.012;
    const end = u1 - r() * (u1 - u0) * 0.5;
    while (u < end - 0.02) {
      const len = 0.022 + r() * 0.05;
      lines[v > 0.55 ? 1 : 0].push(word(r, u, Math.min(end, u + len), v));
      u += len + 0.014 + r() * 0.01;
    }
  };
  rows.forEach((v, i) => {
    const vv = v + 0.014;
    if (i % 5 === 3) return; // a skipped line
    put(0.028, 0.09, vv); // date
    put(0.12, 0.48, vv); // what happened
    if (i % 2 === 0) put(0.525, 0.59, vv); // wind / sea
    if (i % 3 !== 1) put(0.62, BAND[0] - 0.02, vv); // remarks
  });
  out.push(pen(lines[0].join(''), { w: 1.6, opacity: 0.62 }));
  out.push(pen(lines[1].join(''), { w: 2, opacity: 0.68 }));
  return out.join('');
}

/** The folded paper band over the result column (drawn over the page, under her hand). */
function band(r) {
  const out = [];
  const [u0, u1] = BAND;
  const L = side(u0, -0.05, 1.04, 8);
  const R = side(u1, -0.05, 1.04, 8);
  const shadow = [...L.map(([x, y]) => [x - 2, y + 2]), ...L.slice().reverse().map(([x, y]) => [x - 15, y + 9])];
  out.push(wash(shadow, { opacity: 0.4, sharp: true, edge: 0.6 }));
  const shape = [...L, ...R.slice().reverse()];
  out.push(mass(shape, { sharp: true, fill: PAPER }));
  const mid = side((u0 + u1) / 2 - 0.01, -0.05, 1.04, 8);
  out.push(mass(shape, { sharp: true, fill: INDIGO, opacity: 0.16 }));
  out.push(wet([...L, ...mid.slice().reverse()], 0.2, { sharp: true }));
  out.push(ink(mid, 1.8, r, { opacity: 0.6, taper: [0.1, 0.1], step: 14 }));
  out.push(dry(strokes([side(u1 - 0.03, 0.05, 0.5, 3), side(u1 - 0.025, 0.7, 1.0, 3)], { w: 5, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.8, step: 12 }), 90));
  out.push(ink(L, 3.2, r, { straight: true, taper: [0.02, 0.05], step: 14 }));
  out.push(ink(R, 2, r, { straight: true, taper: [0.02, 0.05], step: 14 }));
  out.push(ink([L[0], R[0]], 2.4, r, { straight: true, taper: [0, 0] }));
  out.push(ink([L[L.length - 1], R[R.length - 1]], 2.4, r, { straight: true, taper: [0, 0] }));
  return out.join('');
}

/** A red ribbon marker: a short end lying in the gutter, a tail just over the foot of the book. */
function ribbon(r) {
  const [x0, y0] = onBook(0.505, 0.84);
  const [x1, y1] = onBook(0.507, 1.0);
  const tail = [[x0 - 2.5, y0], [x0 + 2.5, y0], [x1 + 4, y1 + 4], [x1 + 4, y1 + 24], [x1, y1 + 19], [x1 - 3, y1 + 25], [x1 - 3, y1 + 4]];
  return [mass(tail, { sharp: true, fill: RED }), ink([[x1 - 3, y1 + 6], [x1 - 3, y1 + 22]], 1.2, r, { opacity: 0.5, straight: true })].join('');
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */

// a slim torso: shoulders about two face-widths, the flanks hidden under the arms
const TORSO = [[500, 690], [440, 706], [394, 728], [366, 772], [360, 860], [364, 960], [368, 1100], [806, 1100], [808, 960], [806, 860], [798, 786], [770, 740], [700, 712], [622, 694]];

function shirt(r) {
  const out = [];
  out.push(mass(TORSO, { fill: PAPER }));
  out.push(mass(TORSO, { fill: INDIGO, opacity: 0.55 }));
  // shade side (light from the upper right): a loaded second wash down the near flank and under the bust
  out.push(sumi([[394, 728], [366, 772], [360, 860], [364, 960], [368, 1100], [470, 1100], [452, 1010], [440, 930], [470, 900], [430, 850], [420, 780], [440, 734]], { fill: INDIGO, base: 0.78, angle: 86 }));
  out.push(wet([[470, 902], [540, 930], [620, 936], [700, 920], [640, 950], [540, 952]], 0.34));
  // cotton catching the light: hard paper strokes on the far shoulder and chest
  out.push(strokes([
    [[680, 728], [740, 748], [782, 790]],
    [[668, 950], [700, 1000], [712, 1060]],
  ], { w: 12, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.72 }));
  // decisive folds: pulled from both armpits toward the bust as she leans on her elbows, the
  // slack gathering at the waist above the table
  out.push(ink([[392, 870], [440, 900], [492, 916]], [3, 7, 2], r, { taper: [0.1, 0.6], opacity: 0.85 }));
  out.push(ink([[800, 868], [752, 900], [690, 920]], [3, 6, 2], r, { taper: [0.1, 0.6], opacity: 0.8 }));
  out.push(ink([[500, 990], [528, 1040], [534, 1098]], [2, 6, 4], r, { taper: [0.4, 0.1], opacity: 0.8 }));
  out.push(ink([[690, 1000], [676, 1050], [682, 1098]], [2, 5, 3], r, { taper: [0.4, 0.1], opacity: 0.7 }));
  // a breast pocket on the lit side
  out.push(ink([[650, 846], [730, 840], [734, 916], [656, 922], [650, 846]], 3, r, { taper: [0, 0], straight: true, opacity: 0.8, step: 12 }));
  out.push(ink([[648, 846], [732, 840], [733, 864], [652, 870]], 3, r, { taper: [0, 0.1], straight: true, opacity: 0.8, step: 12 }));
  // placket and buttons
  out.push(ink([[584, 800], [592, 900], [598, 1010], [600, 1100]], 4, r, { taper: [0.1, 0], step: 10 }));
  out.push(strokes([[[594, 850], [601, 857]], [[598, 950], [605, 957]], [[601, 1046], [608, 1053]]], { w: 7, taper: [0.2, 0.2], r, opacity: 0.8 }));
  // outer contours: heavy down the shade flank, thin and broken on the lit shoulder
  out.push(ink([[500, 690], [440, 706], [394, 728], [366, 772], [360, 860], [364, 960], [368, 1100]], [4, 7, 10, 12, 11, 9, 8], r, { taper: [0.05, 0], step: 10 }));
  out.push(ink([[622, 694], [700, 712], [770, 740]], [3, 3, 2], r, { taper: [0.1, 0.4] }));
  out.push(ink([[800, 800], [806, 880], [808, 960], [806, 1100]], [3, 4, 5, 5], r, { taper: [0.3, 0], step: 10 }));
  return out.join('');
}

function collar(r) {
  const out = [];
  out.push(mass([[498, 684], [626, 684], [610, 740], [590, 800], [560, 750]], { fill: PAPER }));
  out.push(wet([[504, 686], [622, 686], [606, 724], [548, 730]], 0.32));
  const near = [[494, 682], [530, 730], [574, 812], [470, 770], [446, 716]];
  const far = [[624, 684], [700, 746], [612, 812], [602, 760]];
  out.push(mass(near, { fill: PAPER, sharp: true }));
  out.push(wet(near, 0.3, { sharp: true }));
  out.push(mass(far, { fill: PAPER, sharp: true }));
  out.push(ink([...near, near[0]], [3, 5, 7, 6, 4, 3], r, { taper: [0, 0], straight: true, step: 10 }));
  out.push(ink([...far, far[0]], 3, r, { taper: [0, 0], straight: true, step: 10 }));
  return out.join('');
}

/** A cloud of curls: an ellipse whose rim bulges into `n` springy lobes. */
function curlyBlob(cx, cy, rx, ry, n, r, { amp = 0.16, tilt = 0 } = {}) {
  const pts = [];
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < n * 3; i += 1) {
    const a = (i / (n * 3)) * Math.PI * 2;
    const lobe = i % 3 === 1 ? 1 + amp * (0.7 + r() * 0.6) : i % 3 === 0 ? 1 - amp * 0.35 : 1 + amp * 0.35;
    const x = Math.cos(a) * rx * lobe;
    const y = Math.sin(a) * ry * lobe;
    pts.push([cx + x * ct - y * st, cy + x * st + y * ct]);
  }
  return pts;
}

/** Curl marks: short hooked strokes left as bare paper on a dark mass of hair. */
function curls(r, cx, cy, count, spread, { size = 13, opacity = 0.5 } = {}) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const x = cx + (r() - 0.5) * spread[0];
    const y = cy + (r() - 0.5) * spread[1];
    const s = size * (0.7 + r() * 0.6);
    const a0 = Math.PI * (0.6 + r() * 0.5);
    const pts = [];
    for (let k = 0; k <= 4; k += 1) {
      const a = a0 + k * 1.1;
      pts.push([x + Math.cos(a) * s * (1 - k * 0.12), y + Math.sin(a) * s * (1 - k * 0.12)]);
    }
    list.push(pts);
  }
  return strokes(list, { w: 2.4, taper: [0.3, 0.5], r, fill: PAPER, opacity, step: 5 });
}

function face(r) {
  const out = [];
  const outline = [[474, 392], [560, 368], [650, 360], [700, 370], [708, 420], [701, 448], [711, 480], [708, 500], [722, 528], [714, 544], [702, 550], [700, 570], [690, 586], [682, 602], [660, 622], [626, 632], [584, 624], [536, 592], [502, 556], [478, 500]];
  out.push(mass(outline, { fill: PAPER }));
  // one shade wash on the plane toward the ear: its edge follows the cheek — out round the
  // cheekbone, in under it, then along the jaw to the chin
  out.push(wet([[478, 400], [522, 396], [542, 432], [536, 470], [546, 512], [572, 556], [606, 596], [640, 628], [590, 624], [536, 594], [500, 556], [478, 494]], 0.27));
  out.push(wet([[680, 546], [704, 550], [692, 560]], 0.28));
  out.push(mass([[650, 590], [674, 588], [668, 596], [654, 597]], { fill: INDIGO, opacity: 0.3 }));
  // contours: jaw and chin heavy (the form turns under), the far cheek and brow light and broken
  out.push(ink([[476, 480], [484, 528], [502, 558], [536, 592], [584, 624], [626, 633], [660, 622], [682, 602]], [3, 6, 9, 11, 11, 9, 5, 3], r, { taper: [0.1, 0.1] }));
  out.push(ink([[700, 372], [708, 420], [702, 446]], [2, 3.5, 2.5], r, { taper: [0.1, 0.4] }));
  out.push(ink([[704, 462], [711, 482], [708, 500]], [2, 3, 3], r, { taper: [0.4, 0.2] }));
  out.push(ink([[702, 554], [700, 572], [690, 588], [682, 604]], [3, 4, 4, 3], r, { taper: [0.2, 0.2] }));
  // ear
  const ear = [[494, 452], [474, 446], [462, 474], [466, 506], [480, 528], [498, 524]];
  out.push(mass(ear, { fill: PAPER }));
  out.push(ink(ear, [3, 6, 7, 6, 4, 3], r, { taper: [0.2, 0.3] }));
  out.push(ink([[482, 468], [476, 488], [484, 506]], 2.4, r));
  // brows: dark, drawn a little together
  out.push(ink([[548, 434], [574, 422], [606, 421], [628, 430]], [3, 7, 6, 2], r, { taper: [0.1, 0.5] }));
  out.push(ink([[658, 428], [680, 421], [702, 425]], [5, 4, 2], r, { taper: [0.1, 0.5] }));
  // eyes lowered to the page: the lid a heavy arc, a sliver of iris under it, lashes at the
  // outer corner, the crease above; the far eye the same, foreshortened
  out.push(ink([[560, 459], [586, 454], [612, 461]], 2, r, { opacity: 0.5 }));
  out.push(mass([[578, 484], [606, 483], [604, 492], [593, 497], [581, 493]], { fill: INK }));
  out.push(ink([[546, 474], [566, 480], [592, 484], [620, 477]], [2, 7, 7, 3], r, { taper: [0.1, 0.3] }));
  out.push(ink([[572, 499], [592, 503], [610, 498]], 1.8, r, { opacity: 0.4 }));
  out.push(strokes([[[549, 476], [534, 470]], [[551, 479], [537, 484]]], { w: 2.8, taper: [0.1, 0.7], r }));
  out.push(mass([[673, 481], [691, 480], [689, 488], [682, 491], [675, 488]], { fill: INK }));
  out.push(ink([[662, 474], [680, 481], [700, 474]], [2, 5, 3], r, { taper: [0.15, 0.2] }));
  out.push(strokes([[[698, 475], [710, 469]], [[699, 477], [710, 479]]], { w: 2.2, taper: [0.1, 0.7], r }));
  // nose: the shade-side contour from the eye, the tip breaking the cheek line, the wing
  out.push(ink([[654, 478], [664, 498], [680, 518], [694, 536]], [1, 3, 4, 5], r, { taper: [0.5, 0.1] }));
  out.push(ink([[708, 500], [723, 528], [716, 545], [700, 549]], [3, 5, 5, 3], r, { taper: [0.1, 0.2] }));
  out.push(ink([[670, 538], [664, 549], [678, 555]], [2, 4, 3], r));
  out.push(mass([[684, 549], [696, 547], [692, 555]], { fill: INK }));
  // mouth, pressed in concentration: the parting line, the upper lip's edge
  out.push(ink([[634, 582], [656, 578], [676, 580], [692, 576]], [2, 4, 4, 2], r, { taper: [0.2, 0.3] }));
  out.push(mass([[640, 578], [654, 568], [666, 572], [680, 567], [694, 574], [676, 579], [656, 580]], { fill: INDIGO, opacity: 0.22 }));
  out.push(ink([[646, 590], [662, 596], [680, 590]], 2.2, r, { opacity: 0.5 }));
  return out.join('');
}

// the headscarf, tied at the nape
const SCARF = [[714, 364], [718, 306], [696, 256], [648, 220], [580, 206], [516, 216], [458, 246], [410, 296], [384, 352], [372, 410], [386, 452], [436, 452], [466, 410], [500, 380], [570, 366], [644, 358]];

function head(r) {
  const out = [];
  // dark hair bunched at the nape under the knot — one ink mass with the scarf
  out.push(sumi(curlyBlob(424, 520, 60, 88, 9, r, { tilt: 0.2 }), { angle: 70, base: 0.92 }));
  out.push(curls(r, 424, 540, 4, [70, 110]));
  // neck (stays put while the head tips forward over the page)
  const neck = [[512, 560], [606, 606], [616, 706], [506, 710]];
  const neckOut = [
    mass(neck, { fill: PAPER }),
    wet([[512, 590], [604, 628], [612, 662], [510, 676]], 0.34),
    ink([[512, 600], [506, 656], [506, 708]], [4, 7, 6], r),
    ink([[612, 650], [614, 680], [616, 704]], [2, 3, 2], r),
  ];
  const back = out.splice(0);
  out.push(face(r));
  // hair at the temple, in front of the ear, and a few strands swept sideways out of the scarf
  out.push(sumi([[462, 412], [500, 384], [540, 374], [522, 396], [504, 424], [498, 452], [482, 448], [466, 440]], { angle: 60, base: 0.92 }));
  out.push(ink([[494, 444], [484, 480], [490, 516]], [4, 3, 1], r, { taper: [0.1, 0.6] }));
  out.push(ink([[694, 364], [706, 382], [698, 402]], [3, 3, 1.5], r, { taper: [0.2, 0.6] }));
  // the headscarf: a loaded ink mass, a pale hem along the forehead, a sheen where it rounds
  out.push(sumi(SCARF, { angle: -20, fill: INK, base: 0.9 }));
  out.push(brush(SCARF.slice(0, 11), { w: 3, taper: [0.1, 0.1], r, wobble: 0.3, step: 10 }));
  out.push(ink([[474, 392], [510, 373], [570, 361], [644, 353], [714, 362]], [3, 6, 6, 5, 3], r, { fill: PAPER, opacity: 0.6, taper: [0.1, 0.1] }));
  // a lock swept sideways out of the scarf over the near temple, two loose strands
  out.push(sumi([[644, 364], [602, 384], [564, 404], [536, 430], [510, 460], [518, 420], [546, 392], [592, 370]], { angle: 30, base: 0.92 }));
  out.push(ink([[610, 374], [574, 390], [546, 412], [528, 442], [524, 468]], [2, 3.5, 3.5, 2, 1], r, { taper: [0.2, 0.5] }));
  out.push(ink([[664, 362], [642, 374], [624, 392]], [2, 3, 1], r, { taper: [0.2, 0.6] }));
  out.push(dry(strokes([
    [[560, 238], [620, 228], [676, 250]],
    [[640, 262], [690, 290], [704, 326]],
  ], { w: 10, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.45 }), -25));
  // fabric folds gathered toward the knot
  out.push(strokes([[[600, 300], [520, 330], [440, 400]], [[640, 272], [540, 282], [430, 350]]], { w: 3, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.35 }));
  // the knot and its two tails
  const tails = [
    [[362, 474], [330, 520], [300, 598], [322, 590], [318, 610], [352, 548], [384, 488]],
    [[392, 484], [384, 546], [392, 632], [402, 614], [416, 626], [410, 546], [408, 488]],
  ];
  for (const t of tails) out.push(sumi(t, { angle: 76, fill: INK, base: 0.9, sharp: true }));
  const knot = [[376, 416], [346, 404], [340, 440], [362, 488], [400, 492], [418, 458], [404, 424]];
  out.push(sumi(knot, { angle: 40, fill: INK, base: 0.9 }));
  out.push(ink([[330, 530], [312, 590]], 2.4, r, { fill: PAPER, opacity: 0.4 }));
  out.push(ink([[396, 520], [400, 610]], 2.4, r, { fill: PAPER, opacity: 0.4 }));
  out.push(strokes([[[352, 420], [368, 446], [398, 452]], [[364, 470], [390, 478]]], { w: 2.6, taper: [0.2, 0.4], r, fill: PAPER, opacity: 0.45 }));
  const tip = { transform: 'translate(4 18)' };
  return [g(back, tip), ...neckOut, g(out, tip)].join('');
}

/* ── Arms ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * A bare limb segment from `a` to `b` (w0 → w1 wide), paper with a shade wash and contours:
 * heavy on the `shade` side (+1 / −1 of the left normal), thin and broken on the lit side.
 */
function bare(r, a, b, w0, w1, { shade = 1, heavy = [10, 9, 7, 6, 5], capA = true, capB = true } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n = [-d[1], d[0]];
  const at = (k, s) => {
    const kk = Math.min(1, Math.max(0, k));
    const half = (w0 + (w1 - w0) * kk) / 2;
    const swell = 1 + Math.sin(kk * Math.PI) * 0.06;
    return [a[0] + d[0] * len * k + n[0] * s * half * swell, a[1] + d[1] * len * k + n[1] * s * half * swell];
  };
  const ks = [0, 0.25, 0.5, 0.75, 1];
  const S = ks.map((k) => at(k, shade));
  const L = ks.map((k) => at(k, -shade));
  const endA = capA ? [at((-w0 / len) * 0.4, -0.55 * shade), at((-w0 / len) * 0.5, 0), at((-w0 / len) * 0.4, 0.55 * shade)] : [];
  const endB = capB ? [at(1 + (w1 / len) * 0.3, 0)] : [];
  const out = [mass([...endA, ...S, ...endB, ...L.slice().reverse()], { fill: PAPER })];
  out.push(wet([...S, ...ks.slice().reverse().map((k) => at(k, shade * 0.3))], 0.24));
  out.push(ink(capA ? [endA[1], endA[2], ...S] : S, capA ? [heavy[0] * 0.5, heavy[0] * 0.8, ...heavy] : heavy, r, { taper: [0.05, 0.2] }));
  out.push(ink(L.slice(0, 3), [2.5, 3.5, 3], r, { taper: [0.2, 0.3] }));
  out.push(ink([at(0.62, -shade), at(0.82, -shade), at(1, -shade)], [3, 2.5, 2], r, { taper: [0.3, 0.1] }));
  return out.join('');
}

/** A short sleeve: flat indigo, a darker loaded wash on the shade side, a turned-up hem band. */
function sleeveCap(r, shape, hem, shadeEdge, litEdge) {
  const out = [mass(shape, { fill: PAPER }), mass(shape, { fill: INDIGO, opacity: 0.6 })];
  const cx = shape.reduce((s, p) => s + p[0], 0) / shape.length;
  const cy = shape.reduce((s, p) => s + p[1], 0) / shape.length;
  out.push(mass([...shadeEdge, ...shadeEdge.slice().reverse().map(([x, y]) => [x + (cx - x) * 0.5, y + (cy - y) * 0.5])], { fill: INDIGO, opacity: 0.4 }));
  // hem band: a paler turned-up edge
  const [h0, h1] = hem;
  const up = (p, k) => [p[0], p[1] - k];
  out.push(mass([h0, h1, up(h1, 22), up(h0, 22)], { sharp: true, fill: PAPER, opacity: 0.3 }));
  out.push(ink([up(h0, 22), up(h1, 22)], 3, r, { taper: [0.05, 0.05], opacity: 0.8 }));
  out.push(ink([h0, h1], 5, r, { taper: [0.05, 0.05] }));
  out.push(ink(shadeEdge, [5, 9, 11, 10], r, { taper: [0.1, 0.02] }));
  out.push(ink(litEdge, [2.5, 3, 3], r, { taper: [0.2, 0.1] }));
  return out.join('');
}

function arms(r) {
  const out = [];
  // her left arm (viewer's right): elbow planted wide on the table, forearm coming back toward
  // the band, foreshortened
  out.push(bare(r, [912, 898], [1070, 1078], 98, 92, { shade: 1, capA: false }));
  out.push(sleeveCap(r,
    [[700, 712], [772, 732], [828, 760], [880, 800], [925, 836], [958, 856], [896, 916], [858, 938], [818, 900], [800, 840], [790, 780]],
    [[958, 858], [856, 938]],
    [[858, 938], [818, 900], [800, 840], [792, 780]],
    [[776, 734], [860, 780], [926, 836], [956, 856]],
  ));
  out.push(bare(r, [1072, 1082], [1004, 1168], 98, 72, { shade: 1, heavy: [8, 7, 6, 5, 4], capB: false }));
  // her right arm (viewer's left): hanging close to the body, elbow on the table's far edge,
  // the forearm reaching down and in to the left-hand page
  out.push(bare(r, [328, 936], [302, 1098], 100, 96, { shade: 1, capA: false }));
  out.push(sleeveCap(r,
    [[440, 710], [386, 730], [344, 766], [312, 834], [292, 900], [274, 950], [330, 962], [396, 956], [400, 880], [404, 800], [420, 736]],
    [[272, 950], [398, 956]],
    [[386, 730], [344, 768], [310, 836], [290, 904], [274, 950]],
    [[400, 880], [396, 954]],
  ));
  out.push(bare(r, [306, 1098], [452, 1212], 100, 72, { shade: 1, heavy: [11, 10, 8, 6, 5], capB: false }));
  return out.join('');
}

/**
 * A hand pressing flat on the page, back of the hand up, fingers slightly spread. Local frame as
 * hands.mjs: wrist at (0, 0) (≈ 62 wide), fingers toward +x (≈ 215 long), thumb side = −y. The
 * contour is left open at the wrist so it runs on into the forearm.
 */
function pressHand(r, { spread = 1 } = {}) {
  const out = [];
  const rad = (deg) => (deg * Math.PI) / 180;
  const fingers = [
    { b: [100, 26], a: 16 * spread, L: 70, w: 17 }, // little
    { b: [112, 10], a: 6 * spread, L: 90, w: 19 }, // ring
    { b: [117, -7], a: -1 * spread, L: 100, w: 20 }, // middle
    { b: [111, -24], a: -9 * spread, L: 90, w: 19 }, // index
  ];
  const frame = ({ b, a, L, w }) => {
    const d = [Math.cos(rad(a)), Math.sin(rad(a))];
    const n = [-d[1], d[0]];
    return (t, k) => [b[0] + d[0] * L * t + (n[0] * k * w) / 2, b[1] + d[1] * L * t + (n[1] * k * w) / 2];
  };
  // cast shadow under the little-finger side: the hand lies pressed on the paper
  out.push(wet([[0, 36], [60, 44], [102, 40], [150, 60], [170, 66], [140, 70], [98, 52], [40, 52], [0, 46]], 0.3));
  // thumb, splayed out from the heel of the hand
  const T = frame({ b: [46, -30], a: -38 * spread, L: 66, w: 26 });
  out.push(mass([T(-0.2, 1), T(0.45, 1.02), T(0.85, 0.82), T(1.02, 0), T(0.85, -0.85), T(0.45, -1), T(-0.1, -1)], { fill: PAPER }));
  out.push(ink([T(0.1, -1), T(0.45, -1), T(0.85, -0.85), T(1.02, 0), T(0.86, 0.8)], [2.5, 3, 3, 3.5, 3], r, { taper: [0.2, 0.2] }));
  out.push(ink([T(0.84, -0.4), T(0.8, 0.1), T(0.84, 0.5)], 1.6, r, { opacity: 0.5 }));
  // back of the hand
  const back = [[-8, -31], [40, -34], [112, -34], [122, -14], [120, 6], [114, 22], [104, 36], [60, 41], [-8, 32]];
  out.push(mass(back, { fill: PAPER }));
  out.push(wet([[0, 18], [56, 28], [100, 26], [104, 36], [60, 41], [0, 32]], 0.24));
  // fingers, little first: joint bumps, the shade side heavier, a nail at each tip
  for (const f of fingers) {
    const F = frame(f);
    const sideP = [F(0.42, 1.05), F(0.6, 0.94), F(0.8, 0.9), F(0.94, 0.72)];
    const sideM = [F(0.94, -0.72), F(0.8, -0.9), F(0.6, -0.94), F(0.42, -1.05)];
    out.push(mass([F(-0.15, 1), F(0.05, 1), ...sideP, F(1.02, 0), ...sideM, F(0.05, -1), F(-0.15, -1)], { fill: PAPER }));
    out.push(ink([F(0.12, 1), ...sideP, F(1.02, 0)], [3, 4.5, 4, 4, 3.5, 2.5], r, { taper: [0.2, 0.05], wobble: 0.15 }));
    out.push(ink([F(1.02, 0), ...sideM, F(0.2, -1)], [2.5, 2.5, 2.5, 2, 2, 1.5], r, { taper: [0.05, 0.4], wobble: 0.15 }));
    out.push(ink([F(0.56, -0.55), F(0.58, 0.55)], 1.8, r, { opacity: 0.45, taper: [0.3, 0.3] }));
    out.push(ink([F(0.85, -0.45), F(0.81, 0.05), F(0.85, 0.5)], 1.6, r, { opacity: 0.55 }));
    // the knuckle: a small dark arc where the finger leaves the hand
    out.push(ink([F(-0.02, -0.5), F(0.03, -0.1), F(0.01, 0.4)], 2.4, r, { opacity: 0.45, taper: [0.3, 0.5] }));
  }
  // back-of-hand contours: heavy on the little-finger side, thin toward the thumb, open at the wrist
  out.push(ink([[-12, 32], [30, 38], [70, 41], [102, 37]], [7, 7, 6, 4], r, { taper: [0.02, 0.3] }));
  out.push(ink([[-12, -31], [20, -33], [44, -36]], [3, 3, 2], r, { taper: [0.02, 0.4] }));
  out.push(ink([[92, -36], [104, -33]], 2.4, r, { taper: [0.3, 0.3] }));
  // tendons fanning to the knuckles, faint
  out.push(strokes([[[40, -12], [96, -20]], [[42, 4], [100, 4]], [[40, 18], [92, 22]]], { w: 1.6, taper: [0.4, 0.4], r, opacity: 0.28 }));
  return out.join('');
}

function hands(r) {
  return [
    // her right hand presses the left-hand page, fingers spread
    place(pressHand(r, { spread: 1.15 }), { origin: [452, 1212], angle: 24, scale: [0.95, 1.12] }),
    // her left hand holds the band flat over the result column, fingers closer together
    place(pressHand(r, { spread: 0.7 }), { origin: [1004, 1166], angle: 305, scale: [0.88, 1.12], mirror: true }),
  ].join('');
}

export default crewPlate({
  n: 4,
  title: 'Kanıt',
  seed: 0x0b04,
  detail: { x: 0.58, y: 0.545, zoom: 1.45 },
  railY: 1085,
  boat: [1080, 0.8],
  draw: (r) => ({
    figure: [shirt(r), collar(r), head(r), table(r), stack(r), logbook(r), band(r), ribbon(r), arms(r), hands(r)].join('\n'),
  }),
});
