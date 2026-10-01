// Crew No. 01 · Sınıflandırıcı — the signalman: a young woman in a knit beanie and oilskin,
// sliding a folded signal flag into its pigeonhole in the flag locker. Every hole is one of the
// classifier's outputs (E1–E4, Filtre, Diğer). The flags are inked patterns; one tiny pennant
// tail is the plate's only red. Light comes from the locker (right); the shadow side is the left.
// Style: ./style.mjs, STYLE.md.

import { SANS } from '../kit.mjs';
import { INDIGO, INK, PAPER, RED, brush, crewPlate, curve, dry, mass, place, poly, sample, strokes, sumi, wash } from './style.mjs';

/* ── Brush helpers (local) ──────────────────────────────────────────────────────────────────── */

/** A lit-side contour that breaks: the stroke is cut at `cuts` (fractions of its length). */
function broken(r, pts, { w = 3, cuts = [0.45], gap = 0.07, ...o } = {}) {
  const s = sample(pts, 5);
  const n = s.length - 1;
  const bounds = [0, ...cuts.flatMap((c) => [c - gap / 2, c + gap / 2]), 1];
  const out = [];
  for (let i = 0; i < bounds.length; i += 2) {
    const a = Math.round(bounds[i] * n);
    const b = Math.round(bounds[i + 1] * n);
    if (b - a >= 2) out.push(brush(s.slice(a, b + 1), { w, taper: [0.2, 0.3], r, wobble: 0.3, step: 5, ...o }));
  }
  return out.join('');
}

/** A shadow-side contour: long, loaded, wobbling. */
const heavy = (r, pts, w, o = {}) => brush(pts, { w, taper: [0.12, 0.25], r, wobble: 0.3, ...o });

/* ── Flag patterns (ink only): drawn in the unit square, mapped onto any quad ───────────────── */

/** Bilinear map of the unit square onto quad [tl, tr, br, bl]. */
const onQuad = ([tl, tr, br, bl]) => (u, v) => {
  const top = [tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u];
  const bot = [bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u];
  return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
};

const cell = (m, u0, v0, u1, v1) => poly([m(u0, v0), m(u1, v0), m(u1, v1), m(u0, v1)]);

/** Signal-flag faces in sumi: ink, indigo wash and bare paper stand in for the colours. */
const PATTERNS = {
  checker: (m) => {
    const d = [];
    for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) if ((i + j) % 2 === 0) d.push(cell(m, i / 4, j / 4, (i + 1) / 4, (j + 1) / 4));
    return `<path d="${d.join(' ')}" fill="${INK}"/>`;
  },
  diagonal: (m) => `<path d="${poly([m(0, 0), m(1, 0), m(0, 1)])}" fill="${INK}"/>`,
  cross: (m) => `<path d="${cell(m, 0.38, 0, 0.62, 1)} ${cell(m, 0, 0.36, 1, 0.64)}" fill="${INK}"/>`,
  border: (m) => `<path d="${cell(m, 0, 0, 1, 1)} ${cell(m, 0.26, 0.26, 0.74, 0.74)}" fill="${INDIGO}" fill-rule="evenodd" fill-opacity="0.85"/>`,
  halves: (m) => `<path d="${cell(m, 0, 0, 0.5, 1)}" fill="${INK}"/>`,
  stripes: (m) => `<path d="${[0, 2, 4].map((k) => cell(m, 0, k / 5, 1, (k + 1) / 5)).join(' ')}" fill="${INDIGO}" fill-opacity="0.85"/>`,
  disc: (m) => {
    const pts = Array.from({ length: 14 }, (_, i) => m(0.5 + Math.cos((i / 14) * Math.PI * 2) * 0.22, 0.5 + Math.sin((i / 14) * Math.PI * 2) * 0.26));
    return `<path d="${curve(pts)}" fill="${INK}"/>`;
  },
};

function flagFace(quad, pattern, r, { outline = 3 } = {}) {
  return [
    `<path d="${poly(quad)}" fill="${PAPER}"/>`,
    PATTERNS[pattern](onQuad(quad)),
    brush([...quad, quad[0]], { w: outline, taper: [0, 0], r, wobble: 0.2, straight: true }),
  ].join('');
}

/* ── The flag locker: 2 × 3 pigeonholes, slim, running off the right edge ───────────────────── */

const RACK = { x: 872, y: 380, cols: 2, rows: 3, cw: 138, ch: 172, frame: 22 };
const HOLES = [
  { label: 'E1', pattern: 'checker' },
  { label: 'E2', pattern: 'stripes' },
  { label: 'E3', pattern: null }, // the one she is filling
  { label: 'E4', pattern: 'cross' },
  { label: 'Filtre', pattern: 'border' },
  { label: 'Diğer', pattern: 'disc' },
];
const TARGET = 2;

function holeBox(i) {
  const col = i % RACK.cols;
  const row = Math.floor(i / RACK.cols);
  return [RACK.x + RACK.frame + col * (RACK.cw + RACK.frame), RACK.y + RACK.frame + row * (RACK.ch + RACK.frame), RACK.cw, RACK.ch];
}

function hole(r, i) {
  const out = [];
  const [hx, hy, hw, hh] = holeBox(i);
  const box = [[hx, hy], [hx + hw, hy], [hx + hw, hy + hh], [hx, hy + hh]];
  if (i === TARGET) {
    out.push(sumi(box, { angle: 90, sharp: true })); // the one black hole: where the eye goes
  } else {
    out.push(mass(box, { sharp: true, fill: PAPER }));
    out.push(mass(box, { sharp: true, fill: INDIGO, opacity: 0.42 }));
  }
  out.push(mass([[hx, hy], [hx + hw, hy], [hx + hw - 18, hy + 18], [hx + 14, hy + 18]], { sharp: true, fill: INK, opacity: i === TARGET ? 0.9 : 0.6 }));
  out.push(mass([[hx + hw - 18, hy + 18], [hx + hw, hy], [hx + hw, hy + hh], [hx + hw - 18, hy + hh]], { sharp: true, fill: INDIGO, opacity: 0.5 }));
  return out.join('');
}

function stack(r, i, pattern) {
  // two folded flags on the floor of the hole, the front one's face showing
  const [hx, hy, hw, hh] = holeBox(i);
  const fw = hw - 36;
  const fh = 48 + r() * 8;
  const fx = hx + 10 + r() * 6;
  const fy = hy + hh - fh - 4;
  const lift = 18 + r() * 10;
  return [
    mass([[fx + 8, fy - lift], [fx + fw - 2, fy - lift + 5], [fx + fw, fy + 2], [fx + 4, fy]], { sharp: true, fill: PAPER, opacity: 0.85 }),
    brush([[fx + 8, fy - lift], [fx + fw - 2, fy - lift + 5]], { w: 2.2, taper: [0.05, 0.05], r, straight: true }),
    flagFace([[fx, fy], [fx + fw, fy + (r() - 0.5) * 6], [fx + fw + 2, fy + fh], [fx - 2, fy + fh]], pattern, r, { outline: 2.6 }),
  ].join('');
}

function label(r, i, text) {
  const [hx, hy, hw] = holeBox(i);
  const ly = hy - RACK.frame / 2 - 2;
  const lw = text.length > 2 ? 76 : 50;
  const lx = hx + hw / 2 - lw / 2;
  return [
    mass([[lx, ly - 15], [lx + lw, ly - 15], [lx + lw, ly + 15], [lx, ly + 15]], { sharp: true, fill: PAPER }),
    brush([[lx, ly - 15], [lx + lw, ly - 15], [lx + lw, ly + 15], [lx, ly + 15], [lx, ly - 15]], { w: 2.2, taper: [0, 0], r, straight: true }),
    `<text x="${hx + hw / 2}" y="${ly + 7}" font-family="${SANS}" font-size="${text.length > 2 ? 17 : 20}" font-weight="600" letter-spacing="0.6" text-anchor="middle" fill="${INK}">${text}</text>`,
  ].join('');
}

function locker(r) {
  const out = [];
  const W = RACK.frame + RACK.cols * (RACK.cw + RACK.frame);
  const H = RACK.frame + RACK.rows * (RACK.ch + RACK.frame);
  const { x, y } = RACK;
  const face = [[x, y], [x + W, y], [x + W, 1500], [x, 1500]];
  out.push(mass(face, { sharp: true, fill: PAPER }));
  out.push(wash(face, { opacity: 0.1, sharp: true, edge: 0 }));
  // one drawer under the holes, a brass pull
  const dy = y + H + 16;
  out.push(brush([[x + 16, dy], [x + W - 16, dy], [x + W - 16, dy + 140], [x + 16, dy + 140], [x + 16, dy]], { w: 2.6, taper: [0, 0], r, straight: true, opacity: 0.8 }));
  out.push(wash([[x + 16, dy + 104], [x + W - 16, dy + 104], [x + W - 16, dy + 140], [x + 16, dy + 140]], { opacity: 0.18, sharp: true, edge: 0 }));
  out.push(brush([[x + W / 2 - 30, dy + 56], [x + W / 2 - 26, dy + 68], [x + W / 2 + 26, dy + 68], [x + W / 2 + 30, dy + 56]], { w: 5, taper: [0.1, 0.1], r }));
  const grain = [];
  for (let i = 0; i < 7; i += 1) grain.push([[x + 8 + i * (W / 7) + r() * 12, y + 8], [x + 12 + i * (W / 7), 1496]]);
  out.push(dry(strokes(grain, { w: 2.6, taper: [0.1, 0.1], r, fill: INK, opacity: 0.3 }), 90));
  HOLES.forEach(({ label: text, pattern }, i) => {
    out.push(hole(r, i));
    if (pattern) out.push(stack(r, i, pattern));
    out.push(label(r, i, text));
  });
  // frame: the shadow edge (left, toward her) loaded, the far edge thin and broken
  out.push(brush([[x - 2, y], [x + W + 10, y - 2]], { w: 6, taper: [0, 0], r }));
  out.push(brush([[x, y - 2], [x - 1, 900], [x - 2, 1500]], { w: [9, 7, 8], taper: [0, 0], r, wobble: 0.3 }));
  out.push(broken(r, [[x + W, y], [x + W + 1, 900], [x + W + 1, 1500]], { w: 3, cuts: [0.3, 0.7] }));
  // the pennant: a swallow-tail hanging out of the E2 hole — the one red on the plate
  const [px, py, pw, ph] = holeBox(1);
  const pt = [[px + pw - 40, py + ph - 8], [px + pw - 12, py + ph - 8], [px + pw - 14, py + ph + 36], [px + pw - 25, py + ph + 22], [px + pw - 36, py + ph + 40]];
  out.push(mass(pt, { sharp: true, fill: RED }));
  out.push(brush([...pt, pt[0]], { w: 2, taper: [0, 0], r, straight: true }));
  return out.join('');
}

/** The folded flag she is sliding into the E3 hole (its front edge still proud of the frame). */
function packet(r) {
  const [hx, hy, hw, hh] = holeBox(TARGET);
  const fy = hy + hh - 70;
  const quad = [[hx - 6, fy + 2], [hx + hw - 44, fy - 4], [hx + hw - 42, fy + 58], [hx - 8, fy + 64]];
  return [
    mass([[hx + 2, fy - 24], [hx + hw - 48, fy - 28], [hx + hw - 44, fy - 4], [hx - 6, fy + 2]], { sharp: true, fill: PAPER, opacity: 0.85 }),
    brush([[hx + 2, fy - 24], [hx + hw - 48, fy - 28]], { w: 2.2, taper: [0.05, 0.05], r, straight: true }),
    flagFace(quad, 'diagonal', r),
  ].join('');
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */

// Back (left) rounds over the shoulder blade; the chest (right) turns toward the light.
const BACK = [[392, 664], [300, 690], [236, 744], [206, 834], [202, 960], [212, 1120], [226, 1300], [234, 1500]];
const FRONT = [[688, 1500], [684, 1300], [688, 1130], [702, 990], [704, 870], [684, 770], [640, 708], [584, 680]];
const BODY = [...BACK, ...FRONT];

function jacket(r) {
  const out = [];
  out.push(mass(BODY, { fill: PAPER }));
  out.push(mass(BODY, { fill: INDIGO, opacity: 0.44 }));
  // shade plane: the back, away from the locker light — one loaded sumi pass with a hard inner edge
  const shade = [...BACK.slice(1), [352, 1500], [340, 1320], [338, 1150], [346, 1010], [352, 930]];
  out.push(sumi(shade, { fill: INDIGO, base: 0.84, angle: 88 }));
  out.push(brush([[352, 930], [346, 1010], [338, 1150], [340, 1320], [352, 1500]], { w: [2, 4, 5, 4, 3], taper: [0.3, 0], r, wobble: 0.3, opacity: 0.55 }));
  // a second, lighter plane on the belly under the arm (the form turning away below the chest)
  out.push(wash([[330, 890], [420, 940], [506, 950], [560, 904], [660, 846], [688, 838], [690, 884], [610, 930], [530, 990], [430, 1000], [340, 960]], { opacity: 0.26, edge: 0.6 }));
  // zip placket and storm flap
  out.push(brush([[548, 770], [560, 1000], [568, 1250], [574, 1500]], { w: [4, 6, 6, 5], taper: [0.1, 0], r, wobble: 0.25 }));
  out.push(broken(r, [[526, 780], [536, 1000], [544, 1250], [550, 1500]], { w: 2.4, cuts: [0.4, 0.75], opacity: 0.7 }));
  // chest pocket flap (lit side, thin)
  out.push(broken(r, [[596, 1000], [680, 994], [684, 1030], [600, 1036], [596, 1000]], { w: 2.8, cuts: [0.3], straight: true }));
  // folds: pulled up to the reaching arm, and bunched at the waist
  out.push(strokes([
    [[392, 990], [424, 1060], [440, 1150]],
    [[470, 1010], [490, 1070]],
    [[676, 900], [636, 1000], [610, 1100], [604, 1180]],
  ], { w: [9, 6, 2], taper: [0.05, 0.6], r, wobble: 0.3, opacity: 0.85 }));
  out.push(strokes([
    [[250, 1392], [300, 1414], [380, 1410]],
    [[420, 1360], [470, 1396], [520, 1400]],
    [[590, 1348], [640, 1384], [684, 1380]],
  ], { w: [3, 8, 3], taper: [0.2, 0.3], r, wobble: 0.3, opacity: 0.8 }));
  // oilskin shine: hard paper highlights on the lit side
  out.push(strokes([
    [[672, 800], [686, 890], [690, 960]],
    [[664, 1150], [670, 1280], [668, 1420]],
    [[600, 1180], [612, 1290]],
  ], { w: [6, 13, 4], taper: [0.25, 0.5], r, fill: PAPER, opacity: 0.92 }));
  out.push(strokes([[[372, 1170], [364, 1300], [366, 1440]]], { w: [3, 7, 2], taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.45 }));
  // contours: loaded on the shadow side (back), thin and broken where the light hits (chest)
  out.push(heavy(r, BACK, [5, 9, 12, 11, 10, 10, 9, 8], { taper: [0.06, 0] }));
  out.push(broken(r, [...FRONT].reverse(), { w: [3.6, 3, 3, 2.6, 3, 3.4, 3.6, 4], cuts: [0.3, 0.62], gap: 0.06, taper: [0.2, 0.2] }));
  return out.join('');
}

function collar(r) {
  const out = [];
  // storm collar turned up high round the neck (hides most of it): the plate's dark mass with the cap
  const band = [[378, 604], [428, 582], [490, 590], [540, 596], [574, 588], [608, 582], [624, 626], [626, 684], [596, 724], [506, 738], [424, 726], [372, 680]];
  out.push(mass(band, { fill: PAPER }));
  out.push(mass(band, { fill: INDIGO, opacity: 0.96 }));
  out.push(mass(band, { fill: INK, opacity: 0.5 }));
  out.push(dry(mass(band, { fill: INK, opacity: 0.7 }), 8, true));
  out.push(mass([[560, 594], [606, 584], [582, 668]], { fill: INK }));
  out.push(brush([[420, 600], [480, 606], [546, 606]], { w: 4, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.45 }));
  out.push(brush([[610, 606], [618, 648], [612, 690]], { w: [3, 7, 2], taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.8 }));
  // rim: the turned edge thin in the light, the underside and back loaded
  out.push(broken(r, [[378, 604], [428, 582], [490, 590], [540, 596]], { w: 3, cuts: [0.55] }));
  out.push(heavy(r, [[380, 602], [368, 648], [384, 700], [436, 730], [506, 740], [592, 726], [624, 688]], [10, 11, 10, 9, 7, 4, 2], { taper: [0.05, 0.3] }));
  out.push(broken(r, [[604, 582], [624, 626], [626, 684]], { w: 2.8, cuts: [0.5], gap: 0.12 }));
  return out.join('');
}

function head(r) {
  const out = [];
  // hair: the back of the skull, dark, from under the beanie down the nape into a low knot
  const hair = [[350, 390], [344, 444], [360, 500], [394, 546], [440, 570], [470, 548], [466, 470], [460, 396]];
  out.push(sumi(hair, { angle: 60 }));
  out.push(strokes([[[372, 410], [380, 470], [410, 530], [436, 556]], [[398, 404], [408, 470], [430, 520]]], { w: 3, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.45 }));
  const bun = [[372, 516], [348, 548], [356, 592], [396, 610], [432, 588], [432, 544], [406, 516]];
  out.push(sumi(bun, { angle: 30 }));
  out.push(brush([[366, 544], [382, 582], [410, 594]], { w: 3, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.6 }));
  out.push(heavy(r, [[350, 396], [343, 450], [356, 500], [362, 520]], [8, 10, 8, 4]));
  out.push(heavy(r, [[364, 526], [346, 556], [356, 594], [392, 612]], [6, 10, 9, 5]));
  // neck: only a short strip shows between the jaw and the turned-up collar
  const neck = [[484, 548], [566, 574], [572, 610], [476, 612]];
  out.push(mass(neck, { fill: PAPER }));
  out.push(wash([[484, 556], [560, 580], [562, 604], [480, 606]], { opacity: 0.34 }));
  out.push(heavy(r, [[482, 560], [478, 600]], 6, { taper: [0.2, 0.2] }));
  // face, three-quarter to the right: forehead, the far brow and a sliver of the far cheek,
  // the nose tip standing proud of it, soft round chin, round jaw back to the ear
  const face = [[468, 394], [566, 386], [580, 410], [576, 428], [586, 446], [590, 462], [602, 480], [596, 490], [586, 494], [590, 504], [585, 513], [588, 522], [580, 534], [586, 552], [582, 570], [562, 586], [526, 590], [498, 574], [482, 548], [474, 500]];
  out.push(mass(face, { fill: PAPER }));
  // the one face shadow: cheek plane toward the ear, round under the jaw and chin
  out.push(wash([[474, 404], [502, 414], [508, 466], [502, 516], [514, 552], [546, 574], [580, 568], [564, 588], [524, 592], [496, 574], [480, 546], [472, 496]], { opacity: 0.28 }));
  // profile: lit, thin, broken — forehead/brow, far cheek, nose tip
  out.push(broken(r, [[566, 388], [580, 410], [576, 428], [586, 446], [590, 462]], { w: [2.6, 3.2, 2.6, 3, 2.6], cuts: [0.42], gap: 0.1 }));
  out.push(brush([[589, 458], [602, 479], [597, 490], [585, 494]], { w: [2.6, 4, 4.5, 3], taper: [0.2, 0.25], r }));
  // lips (≈12 behind the nose tip), then the chin, turning under into the heavy jaw
  out.push(brush([[587, 497], [590, 504], [585, 512]], { w: [2, 2.8, 2], taper: [0.3, 0.3], r }));
  out.push(brush([[586, 515], [589, 522], [580, 534], [586, 550], [583, 566]], { w: [2, 2.8, 2.4, 3.2, 5], taper: [0.2, 0], r }));
  out.push(heavy(r, [[583, 562], [576, 578], [560, 588], [528, 592], [500, 578], [484, 552]], [5, 9, 11, 10, 7, 3], { taper: [0, 0.35] }));
  // nose bridge (the near side of the nose, inside the face) and the nostril wing
  out.push(brush([[568, 432], [580, 452], [590, 470]], { w: [1.6, 2.4, 2], taper: [0.4, 0.3], r, opacity: 0.7 }));
  out.push(brush([[584, 474], [576, 482], [582, 490]], { w: [2, 4.5, 3], taper: [0.3, 0.3], r }));
  // far cheekbone: a small plane beyond the bridge
  out.push(brush([[580, 438], [586, 450]], { w: [1.4, 2.2], taper: [0.4, 0.4], r, opacity: 0.55 }));
  // ear
  const ear = [[484, 442], [464, 446], [457, 478], [464, 506], [484, 514]];
  out.push(mass(ear, { fill: PAPER }));
  out.push(brush(ear, { w: [3, 7, 8, 6, 3], taper: [0.2, 0.3], r }));
  out.push(brush([[474, 460], [470, 480], [478, 496]], { w: 2.4, taper: [0.3, 0.3], r }));
  // brows
  out.push(brush([[502, 410], [526, 401], [556, 406]], { w: [3, 7, 2], taper: [0.2, 0.5], r }));
  out.push(brush([[566, 408], [577, 412]], { w: [4, 2], taper: [0.2, 0.5], r }));
  // near eye: almond, iris turned toward the locker, lashes flicked at the outer corner
  out.push(mass([[502, 433], [518, 424], [540, 424], [555, 433], [536, 441], [512, 441]], { fill: PAPER }));
  out.push(mass([[533, 424], [548, 425], [550, 437], [537, 441], [530, 433]], { fill: INK }));
  out.push(brush([[494, 428], [502, 433], [518, 423], [540, 422], [556, 433]], { w: [2, 3.4, 5.5, 5, 2.6], taper: [0.1, 0.3], r }));
  out.push(brush([[510, 440], [528, 444], [546, 439]], { w: 1.8, taper: [0.3, 0.3], r, opacity: 0.55 }));
  out.push(mass([[539, 427], [543, 426], [543, 431]], { fill: PAPER }));
  out.push(strokes([[[502, 429], [492, 421]], [[497, 431], [486, 427]]], { w: 2.4, taper: [0.1, 0.6], r }));
  // far eye: a lash line tucked behind the bridge
  out.push(brush([[568, 432], [579, 429]], { w: [4, 1.6], taper: [0.2, 0.4], r }));
  // mouth: the parting line (soft upturn), a shadow under the lower lip
  out.push(brush([[566, 507], [578, 508], [587, 506]], { w: [1.6, 3.6, 2.4], taper: [0.35, 0.2], r }));
  out.push(mass([[568, 520], [583, 518], [579, 527], [569, 527]], { fill: INDIGO, opacity: 0.38 }));
  // a small silver hoop at the lobe
  out.push(`<circle cx="476" cy="524" r="8" fill="none" stroke="${INK}" stroke-width="2.6"/>`);
  // a lock of hair loose over the temple
  out.push(brush([[470, 392], [486, 420], [480, 452], [472, 478]], { w: [3, 5, 3, 1], taper: [0.1, 0.5], r }));
  // beanie: rounded, folded cuff, dry-brush knit
  const cap = [[352, 394], [344, 330], [374, 276], [440, 244], [528, 240], [588, 266], [610, 320], [602, 382], [480, 396]];
  out.push(sumi(cap, { angle: 78 }));
  const cuff = [[350, 354], [470, 346], [608, 334], [602, 382], [480, 394], [356, 400]];
  out.push(mass(cuff, { fill: INK }));
  out.push(brush([[352, 356], [470, 348], [606, 336]], { w: 4, taper: [0.05, 0.1], fill: PAPER, opacity: 0.8 }));
  const ribs = [];
  for (let i = 0; i < 18; i += 1) {
    const t = i / 17;
    ribs.push([[358 + t * 242, 360 - t * 22], [360 + t * 240, 396 - t * 14]]);
  }
  out.push(strokes(ribs, { w: 2.4, taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.45 }));
  out.push(dry(strokes([[[392, 312], [450, 266], [540, 256]]], { w: 12, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.55 }), -30));
  out.push(heavy(r, [[354, 398], [343, 340], [360, 294], [396, 262]], [10, 11, 8, 3], { taper: [0, 0.4] }));
  return out.join('');
}

/* Near arm reaching across the body into the E3 hole: oilskin shell with a shade band underneath. */
const ARM = {
  top: [[300, 704], [390, 752], [470, 796], [524, 820], [610, 770], [680, 716], [722, 690]],
  bottom: [[762, 772], [660, 826], [560, 900], [506, 952], [420, 950], [320, 900], [236, 828]],
};

function arms(r) {
  const out = [];
  const shape = [...ARM.top, ...ARM.bottom, [238, 760]];
  out.push(mass(shape, { fill: PAPER }));
  out.push(mass(shape, { fill: INDIGO, opacity: 0.6 }));
  // underside of the sleeve: the hard-edged shade band
  out.push(sumi([[330, 876], [420, 912], [508, 912], [560, 868], [660, 800], [756, 748], ...ARM.bottom.slice(0, 5), [330, 902]], { fill: INDIGO, base: 0.85, angle: -10 }));
  // shoulder seam: where the sleeve is set into the body, round over the top of the shoulder
  out.push(broken(r, [[404, 676], [360, 712], [336, 770]], { w: [2.4, 3, 3.4], cuts: [0.5], gap: 0.12, opacity: 0.85 }));
  out.push(heavy(r, [[336, 770], [334, 830], [348, 890]], [4, 7, 9], { taper: [0.2, 0.1] }));
  // cuff: the sleeve end, dark opening where the wrist comes out
  out.push(mass([[708, 694], [722, 690], [762, 772], [746, 780]], { fill: INK, opacity: 0.85 }));
  // folds at the elbow crook and along the forearm
  out.push(strokes([
    [[486, 818], [506, 860], [502, 906]],
    [[540, 836], [520, 866]],
    [[620, 780], [640, 810]],
  ], { w: [3, 7, 2], taper: [0.2, 0.4], r, wobble: 0.3, opacity: 0.85 }));
  // shine along the top of the sleeve
  out.push(strokes([
    [[330, 740], [400, 778], [456, 808]],
    [[566, 806], [630, 766], [680, 730]],
  ], { w: [4, 11, 3], taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.9 }));
  // contours: underside loaded (the form turning away), top thin and broken in the light
  out.push(heavy(r, [...ARM.bottom].reverse(), [8, 11, 12, 11, 10, 8, 5], { taper: [0.05, 0.1] }));
  out.push(broken(r, ARM.top, { w: [3.4, 3, 2.6, 3.4, 2.8, 2.6, 3], cuts: [0.28, 0.66], gap: 0.06 }));
  return out.join('');
}

/**
 * The reaching hand, back view, local frame: wrist at (0, 0), fingers toward +x, thumb side −y.
 * The wrist is bent down; the fingers curl and stagger so their tips push the flag packet.
 */
function reachHand(r) {
  const out = [];
  // a finger: ink capsule under a paper one nudged toward the light, so the contour is heavy
  // underneath and all but gone on top
  const finger = (pts, w) => [
    brush(pts, { w: w + 5, taper: [0, 0.2], tip: 0.5, r, wobble: 0.15 }),
    place(brush(pts, { w, taper: [0, 0.2], tip: 0.45, r, wobble: 0.1, fill: PAPER }), { origin: [0.6, -2] }),
  ].join('');
  // fingers, pinky first (behind), staggered: each curls down a little more than the last
  out.push(finger([[98, 30], [124, 38], [142, 52], [146, 64]], 18));
  out.push(finger([[104, 12], [142, 18], [166, 32], [174, 48]], 21));
  out.push(finger([[106, -6], [150, -4], [182, 10], [192, 28]], 22));
  out.push(finger([[102, -24], [144, -26], [170, -18], [180, -2]], 22));
  // the curl: the last joint of each finger turns down into shadow
  out.push(wash([[160, -24], [182, -12], [196, 20], [176, 50], [150, 62], [152, 40], [164, 14]], { opacity: 0.2, edge: 0.3 }));
  out.push(strokes([[[152, -30], [156, -20]], [[160, -12], [164, -2]], [[152, 14], [158, 24]]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.6 }));
  // back of the hand
  const back = [[0, -34], [52, -40], [104, -38], [114, -14], [112, 22], [104, 44], [56, 46], [0, 38]];
  out.push(mass(back, { fill: PAPER }));
  out.push(wash([[20, 24], [70, 30], [108, 30], [104, 46], [56, 48], [8, 40]], { opacity: 0.27 }));
  out.push(wash([[120, 24], [150, 30], [168, 48], [146, 60], [126, 50]], { opacity: 0.22, edge: 0.2 }));
  // contour: top of the hand thin, the heel / little-finger side loaded
  out.push(broken(r, [[0, -34], [52, -40], [100, -38]], { w: [2.6, 3, 2.4], cuts: [0.5], gap: 0.14 }));
  out.push(heavy(r, [[2, 38], [56, 47], [100, 42]], [8, 8, 5], { taper: [0.1, 0.3] }));
  // knuckles and the finger splits
  out.push(strokes([[[104, -20], [110, -14]], [[108, 2], [113, 8]], [[106, 22], [110, 28]]], { w: 2.4, taper: [0.3, 0.3], r, opacity: 0.7 }));
  out.push(strokes([[[40, -20], [96, -18]], [[44, 8], [98, 6]]], { w: 1.6, taper: [0.4, 0.4], r, opacity: 0.35 }));
  // thumb: on the near side, lifted off the hand, its pad on the packet's top edge
  out.push(finger([[34, -30], [72, -52], [108, -66], [136, -68]], 23));
  out.push(brush([[40, -36], [76, -60], [112, -76], [130, -78]], { w: [1, 3, 2.6, 1.6], taper: [0.3, 0.4], r, opacity: 0.8 }));
  out.push(brush([[124, -74], [132, -66]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.7 }));
  out.push(heavy(r, [[36, -26], [70, -40], [96, -42]], [2, 5, 1.5], { taper: [0.3, 0.5] }));
  // nails on the fingertips that show
  out.push(strokes([[[172, -10], [178, -2]], [[184, 14], [189, 22]]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.7 }));
  return out.join('');
}

function hands(r) {
  // near hand: bent at the wrist, fingertips on the packet's face, thumb on its top edge
  return place(reachHand(r), { origin: [738, 730], angle: -8, scale: 0.98 });
}

export default crewPlate({
  n: 1,
  title: 'Sınıflandırıcı',
  seed: 0x0b01,
  detail: { x: 0.56, y: 0.34, zoom: 1.7 },
  railY: 1330,
  boat: [110, 0.8],
  draw: (r) => ({
    back: locker(r),
    figure: [jacket(r), head(r), collar(r), packet(r), arms(r), hands(r)].join('\n'),
  }),
});
