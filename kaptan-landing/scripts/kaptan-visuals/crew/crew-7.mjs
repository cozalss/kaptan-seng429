// Crew No. 07 · Kural Motoru — the bosun: a broad man in his fifties, full dark beard gone grey
// at the chin, knit cap and heavy pea-coat, setting the brass engine-order telegraph into its
// notch without looking twice. The dial has four fixed sectors (E1–E4) and a notched quadrant:
// the same rule always lands in the same notch. The pointer's tip is the plate's only red.
// Style: ./style.mjs, STYLE.md.

import { SANS } from '../kit.mjs';
import { gripHand } from './hands.mjs';
import { INDIGO, INK, PAPER, RED, brush, crewPlate, dry, mass, place, rough, sample, strokes, sumi, wash } from './style.mjs';


/* ── Telegraph geometry ─────────────────────────────────────────────────────────────────────── */

const DIAL = { cx: 322, cy: 1118, r: 178, face: 138 };
const SECTORS = [
  { label: 'E1', from: -172, to: -131 },
  { label: 'E2', from: -131, to: -90 },
  { label: 'E3', from: -90, to: -49 },
  { label: 'E4', from: -49, to: -8 },
];
const SET = 2; // the lever sits in the E3 notch
const mid = ({ from, to }) => (from + to) / 2;
const LEVER_ANGLE = mid(SECTORS[SET]);
const GRIP_R = 272; // hand centre along the lever

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (r, deg, [cx, cy] = [DIAL.cx, DIAL.cy]) => [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r];
const ring = (r, n = 40, c) => Array.from({ length: n }, (_, i) => polar(r, (i / n) * 360, c));
const arc = (r, a0, a1, n = 24, c) => Array.from({ length: n + 1 }, (_, i) => polar(r, a0 + ((a1 - a0) * i) / n, c));
const circlePath = (cx, cy, rr) => `M${cx - rr} ${cy}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0Z`;

/* ── The telegraph (drawn crisp, in front of the figure) ────────────────────────────────────── */

function pedestal(r) {
  const out = [];
  const { cx, cy, r: R } = DIAL;
  const top = cy + R - 40;
  const [w0, w1] = [84, 104]; // half-widths of the column at the top and at the deck
  const col = [[cx - w0, top], [cx + w0, top], [cx + w1, 1500], [cx - w1, 1500]];
  out.push(mass(col, { sharp: true, fill: PAPER }));
  out.push(mass(col, { sharp: true, fill: INDIGO, opacity: 0.3 }));
  // shade side of the brass column (light from the upper left), hard highlight on the lit side
  out.push(wash([[cx + 22, top], [cx + w0, top], [cx + w1, 1500], [cx + 34, 1500]], { opacity: 0.46, sharp: true, edge: 1 }));
  out.push(brush([[cx - 46, top + 60], [cx - 56, 1480]], { w: 12, taper: [0.1, 0.3], r, fill: PAPER, opacity: 0.9, straight: true }));
  // the flared saddle under the drum, then mouldings down the column
  const saddle = [[cx - 60, top - 16], [cx + 60, top - 16], [cx + w0 + 22, top + 34], [cx - w0 - 22, top + 34]];
  out.push(mass(saddle, { sharp: true, fill: INK }));
  out.push(brush([[cx - 50, top - 6], [cx + 20, top - 6]], { w: 4, taper: [0.3, 0.3], fill: PAPER, opacity: 0.6, straight: true }));
  for (const y of [top + 52, 1400]) {
    const k = (y - top) / (1500 - top);
    const hw = w0 + (w1 - w0) * k + 10;
    out.push(brush([[cx - hw, y], [cx + hw, y + 2]], { w: y === 1400 ? 18 : 6, taper: [0.02, 0.02], r, straight: true }));
  }
  out.push(brush([[cx - w0, top], [cx - w1, 1500]], { w: [4, 5], taper: [0, 0], r, straight: true }));
  out.push(brush([[cx + w0, top], [cx + w1, 1500]], { w: [7, 10], taper: [0, 0], r, straight: true }));
  return out.join('');
}

function quadrant(r) {
  // notched arc above the drum: the lever's latch drops into one notch per sector
  const out = [];
  const a0 = SECTORS[0].from - 2;
  const a1 = SECTORS[3].to + 2;
  const inner = DIAL.r + 6;
  const outer = DIAL.r + 30;
  const band = [...arc(outer, a0, a1, 40), ...arc(inner, a1, a0, 40)];
  out.push(mass(band, { sharp: true, fill: PAPER }));
  out.push(mass(band, { sharp: true, fill: INDIGO, opacity: 0.42 }));
  out.push(brush(arc(outer, a0, a1, 40), { w: 4.5, taper: [0.02, 0.02], r, wobble: 0.1 }));
  out.push(brush(arc(inner, a0, a1, 40), { w: 2.6, taper: [0.02, 0.02], r, wobble: 0.1 }));
  for (const a of [a0, a1]) out.push(brush([polar(inner, a), polar(outer, a)], { w: 4, taper: [0, 0], straight: true }));
  // notches: square cuts in the outer rim at each sector centre
  SECTORS.forEach((s) => {
    const a = mid(s);
    const h = 3.6;
    const notch = [polar(outer + 1, a - h), polar(outer + 1, a + h), polar(outer - 15, a + h), polar(outer - 15, a - h)];
    out.push(mass(notch, { sharp: true, fill: INK }));
  });
  return out.join('');
}

function lever(r) {
  const out = [];
  const a = LEVER_ANGLE;
  const n = [Math.cos(rad(a + 90)), Math.sin(rad(a + 90))];
  const side = (rr, k) => {
    const [x, y] = polar(rr, a);
    return [x + n[0] * k, y + n[1] * k];
  };
  // the arm comes out from behind the drum, tapering to the grip
  const arm = [side(DIAL.r - 10, -15), side(GRIP_R - 60, -10), side(GRIP_R - 60, 10), side(DIAL.r - 10, 15)];
  out.push(mass(arm, { sharp: true, fill: PAPER }));
  out.push(mass(arm, { sharp: true, fill: INDIGO, opacity: 0.35 }));
  out.push(brush([side(DIAL.r - 10, -15), side(GRIP_R - 60, -10)], { w: 3.6, taper: [0, 0], straight: true }));
  out.push(brush([side(DIAL.r - 10, 15), side(GRIP_R - 60, 10)], { w: 5, taper: [0, 0], straight: true }));
  out.push(brush([side(DIAL.r + 2, -4), side(GRIP_R - 70, -2)], { w: 4, taper: [0.2, 0.2], fill: PAPER, straight: true }));
  // the latch block seated in the notch
  const latch = [side(DIAL.r + 8, -11), side(DIAL.r + 34, -11), side(DIAL.r + 34, 11), side(DIAL.r + 8, 11)];
  out.push(mass(latch, { sharp: true, fill: INK }));
  // grip: a turned handle along the lever (the hand closes over it)
  const g0 = GRIP_R - 66;
  const g1 = GRIP_R + 70;
  const grip = [side(g0, -12), side(g1 - 8, -13), side(g1, -8), side(g1, 8), side(g1 - 8, 13), side(g0, 12)];
  out.push(mass(grip, { sharp: true, fill: PAPER }));
  out.push(mass(grip, { sharp: true, fill: INDIGO, opacity: 0.5 }));
  out.push(brush([...grip, grip[0]], { w: 3.4, taper: [0, 0], straight: true }));
  // knob on the end
  const [kx, ky] = polar(g1 + 12, a);
  out.push(`<path d="${circlePath(kx, ky, 17)}" fill="${INK}"/>`);
  out.push(brush([[kx - 9, ky - 4], [kx - 3, ky - 10]], { w: 4, taper: [0.3, 0.3], fill: PAPER, opacity: 0.8 }));
  return out.join('');
}

function drum(r) {
  const out = [];
  const { cx, cy, r: R, face: F } = DIAL;
  // side of the drum (it is a thick brass case seen a little from the right)
  const back = ring(R, 44, [cx + 16, cy + 6]);
  out.push(mass(back, { fill: INK }));
  // bezel: one flat ink ring, a hard darker crescent on the shade side, sharp paper glints
  out.push(mass(ring(R, 44), { fill: PAPER }));
  out.push(mass(ring(R, 44), { fill: INK, opacity: 0.78 }));
  out.push(mass([...arc(R - 1, -30, 120, 20), ...arc(F + 4, 120, -30, 20)], { fill: INK, opacity: 0.6 }));
  out.push(brush(arc(R - 14, -176, -122, 14), { w: [2, 9, 10, 3], taper: [0.35, 0.5], fill: PAPER, opacity: 0.95, wobble: 0 }));
  out.push(brush(arc(R - 12, 168, 186, 5), { w: [1, 5, 1], taper: [0.4, 0.4], fill: PAPER, opacity: 0.85, wobble: 0 }));
  out.push(brush(arc(F + 10, -112, -100, 4), { w: [1, 4, 1], taper: [0.4, 0.4], fill: PAPER, opacity: 0.8, wobble: 0 }));
  // bezel bolts: ink dots, each with a pin of light
  for (let i = 0; i < 8; i += 1) {
    const [sx, sy] = polar((R + F) / 2 + 4, 22.5 + i * 45);
    out.push(`<path d="${circlePath(sx, sy, 6.5)}" fill="${INK}"/>`);
    out.push(`<path d="${circlePath(sx - 2, sy - 2, 1.8)}" fill="${PAPER}" fill-opacity="0.8"/>`);
  }
  // the face: bare paper
  out.push(`<path d="${circlePath(cx, cy, F)}" fill="${PAPER}"/>`);
  // sectors: the upper half ruled into four, each labelled
  SECTORS.forEach((s, i) => {
    const wedge = [polar(30, s.from), ...arc(F - 10, s.from, s.to, 10), polar(30, s.to)];
    if (i % 2 === 1) out.push(mass(wedge, { sharp: true, fill: INDIGO, opacity: 0.2 }));
  });
  for (const a of [SECTORS[0].from, ...SECTORS.map((s) => s.to)]) {
    out.push(brush([polar(30, a), polar(F - 2, a)], { w: 2.8, taper: [0.05, 0], straight: true }));
  }
  out.push(brush(arc(F - 36, SECTORS[0].from, SECTORS[3].to, 30), { w: 1.8, taper: [0, 0], opacity: 0.7 }));
  SECTORS.forEach((s) => {
    const [tx, ty] = polar(F - 62, mid(s));
    out.push(`<text x="${tx.toFixed(1)}" y="${(ty + 9).toFixed(1)}" font-family="${SANS}" font-size="27" font-weight="700" letter-spacing="0.4" text-anchor="middle" fill="${INK}">${s.label}</text>`);
    // tick at the notch position
    out.push(brush([polar(F - 30, mid(s)), polar(F - 6, mid(s))], { w: 4, taper: [0, 0], straight: true }));
  });
  // lower half: fine ticks
  for (let a = 10; a <= 170; a += 10) out.push(brush([polar(F - 18, a), polar(F - 6, a)], { w: 1.8, taper: [0, 0], straight: true, opacity: 0.7 }));
  // rims
  out.push(`<path d="${circlePath(cx, cy, F)}" fill="none" stroke="${INK}" stroke-width="5"/>`);
  out.push(brush([...ring(R, 60), polar(R, 0)], { w: [5, 6, 8, 10, 9, 6, 5, 5], taper: [0, 0], r, wobble: 0.08 }));
  // pointer: from the hub to the E3 notch, the tip in red
  const a = LEVER_ANGLE;
  const n = [Math.cos(rad(a + 90)), Math.sin(rad(a + 90))];
  const at = (rr, k) => {
    const [x, y] = polar(rr, a);
    return [x + n[0] * k, y + n[1] * k];
  };
  out.push(mass([at(-26, -5), at(F - 104, -5), at(F - 104, 5), at(-26, 5)], { sharp: true, fill: INK }));
  out.push(mass([at(F - 106, -9), at(F - 80, 0), at(F - 106, 9)], { sharp: true, fill: RED }));
  out.push(`<path d="${circlePath(cx, cy, 20)}" fill="${INK}"/>`);
  out.push(`<path d="${circlePath(cx - 5, cy - 5, 5)}" fill="${PAPER}" fill-opacity="0.7"/>`);
  return out.join('');
}

function telegraph(r) {
  return [pedestal(r), quadrant(r), lever(r), drum(r)].join('');
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */

const COAT = [[600, 716], [470, 746], [388, 800], [344, 900], [322, 1060], [306, 1260], [296, 1500], [1180, 1500], [1172, 1260], [1162, 1060], [1146, 900], [1110, 806], [1030, 748], [880, 712]];
const V_POINT = [716, 1096]; // where the lapels cross (double-breasted, closing to his left)

/**
 * Heavy wool as one loaded-brush mass: a flat, high indigo+ink body (no regular dry pattern);
 * the brush's travel is shown only by a few hand-placed broken streaks (see `streak`).
 */
function wool(pts, { ink = 0.72, sharp = false } = {}) {
  return [
    mass(pts, { fill: PAPER, sharp }),
    mass(pts, { fill: INDIGO, opacity: 0.96, sharp }),
    mass(pts, { fill: INK, opacity: ink, sharp }),
  ].join('');
}

/** One broad, broken dry-brush streak of paper, its hairs running the way the stroke travels. */
function streak(pts, r, { w = 44, o = 0.22 } = {}) {
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return dry(brush(pts, { w, taper: [0.3, 0.5], r, wobble: 0.4, fill: PAPER, opacity: o }), angle, true);
}

function coat(r) {
  const out = [];
  out.push(wool(COAT));
  // rain soaking the shade side: a darker wet pass that dried with a hard rim
  out.push(wash([[1010, 760], [1110, 806], [1146, 900], [1162, 1060], [1172, 1260], [1180, 1500], [1020, 1500], [1040, 1300], [1000, 1140], [1030, 960], [990, 840]], { color: INK, opacity: 0.3, edge: 1.4 }));
  // the loaded brush dragged round the lit shoulder and down the front: few, broad, broken
  out.push(streak([[356, 900], [392, 822], [470, 772], [566, 746]], r, { w: 64, o: 0.42 }));
  out.push(streak([[400, 930], [452, 850], [540, 804]], r, { w: 44, o: 0.3 }));
  out.push(streak([[368, 1000], [372, 1140], [360, 1300], [350, 1440]], r, { w: 62, o: 0.36 }));
  out.push(streak([[470, 1160], [492, 1290], [500, 1440]], r, { w: 40, o: 0.2 }));
  out.push(streak([[1100, 1300], [1120, 1440]], r, { w: 30, o: 0.1 }));
  // two hard paper highlights where the shoulder turns into the light
  out.push(brush([[392, 812], [440, 776], [520, 752]], { w: [5, 15, 4], taper: [0.3, 0.6], r, fill: PAPER, opacity: 0.92, wobble: 0.35 }));
  out.push(brush([[358, 902], [368, 862], [384, 836]], { w: [4, 11, 2], taper: [0.3, 0.6], r, fill: PAPER, opacity: 0.88, wobble: 0.35 }));
  // the cream jumper in the V between the lapels
  const jumper = [[600, 720], [700, 748], [800, 744], [890, 716], V_POINT];
  out.push(mass(jumper, { fill: PAPER, sharp: true }));
  out.push(wash([[800, 744], [890, 716], [V_POINT[0] + 6, V_POINT[1]], [760, 900]], { opacity: 0.3, sharp: true, edge: 0.8 }));
  // a cable down the jumper's centre, as in a fisherman's knit
  const cable = [[], []];
  for (let y = 770; y <= 1030; y += 16) {
    const k = Math.sin((y - 770) / 24) * 10;
    cable[0].push([706 + k, y]);
    cable[1].push([706 - k, y]);
  }
  out.push(strokes(cable, { w: 2.6, taper: [0.1, 0.3], r, opacity: 0.4 }));
  // lapels: a lighter flat indigo so they separate from the body; one streak each along the roll
  const lapelNear = [[890, 716], [944, 734], [912, 816], [958, 846], [890, 962], [800, 1080], V_POINT, [760, 940], [800, 800]];
  out.push(mass(lapelNear, { fill: PAPER }), mass(lapelNear, { fill: INDIGO, opacity: 0.92 }), mass(lapelNear, { fill: INK, opacity: 0.28 }));
  out.push(streak([[900, 740], [840, 860], [790, 980]], r, { w: 30, o: 0.18 }));
  out.push(brush([[892, 718], [800, 800], [760, 940], [V_POINT[0] + 2, V_POINT[1]]], { w: [3, 5, 5, 4], taper: [0.1, 0.1], r, fill: PAPER, opacity: 0.75, wobble: 0.3 }));
  out.push(brush([[944, 736], [912, 816], [958, 848], [890, 964], [800, 1082], [V_POINT[0] + 4, V_POINT[1] + 4]], { w: [4, 5, 7, 10, 8, 5], taper: [0.05, 0.2], r, wobble: 0.3 }));
  const lapelFar = [[600, 716], [566, 756], [592, 798], [570, 830], [620, 950], V_POINT, [672, 880], [648, 760]];
  out.push(mass(lapelFar, { fill: PAPER }), mass(lapelFar, { fill: INDIGO, opacity: 0.92 }), mass(lapelFar, { fill: INK, opacity: 0.2 }));
  out.push(streak([[600, 780], [620, 880], [660, 980]], r, { w: 26, o: 0.2 }));
  out.push(brush([[648, 760], [672, 880], [V_POINT[0] - 2, V_POINT[1]]], { w: [3, 4, 3], taper: [0.1, 0.2], r, fill: PAPER, opacity: 0.7 }));
  out.push(brush([[566, 758], [592, 800], [570, 832], [622, 952], [V_POINT[0] - 4, V_POINT[1] + 4]], { w: [2.5, 3, 4, 6, 6], taper: [0.1, 0.2], r, wobble: 0.3 }));
  // the closing edge running down from the cross, the buttons in two rows
  out.push(brush([[V_POINT[0], V_POINT[1]], [760, 1200], [780, 1340], [790, 1500]], { w: [6, 6, 5, 4], taper: [0.05, 0], r, wobble: 0.3 }));
  out.push(brush([[V_POINT[0] + 8, V_POINT[1] + 20], [768, 1200], [788, 1340]], { w: 3, taper: [0.2, 0.4], r, fill: PAPER, opacity: 0.3 }));
  for (const [bx, by] of [[640, 1210], [876, 1236], [652, 1372], [890, 1392]]) {
    out.push(`<path d="${circlePath(bx, by, 18)}" fill="${INK}"/>`);
    out.push(brush([[bx - 11, by - 5], [bx - 4, by - 12], [bx + 6, by - 13]], { w: 3.2, taper: [0.3, 0.3], fill: PAPER, opacity: 0.85 }));
  }
  // decisive folds: the wool dragging down from under the arm, and at the far hip
  out.push(brush([[468, 1010], [494, 1120], [516, 1250], [520, 1330]], { w: [2, 8, 6, 2], taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.4, wobble: 0.4 }));
  out.push(brush([[476, 1016], [504, 1130], [526, 1240]], { w: [2, 6, 2], taper: [0.3, 0.5], r, opacity: 0.8 }));
  out.push(brush([[1016, 1300], [1034, 1380], [1028, 1456]], { w: [2, 7, 3], taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.32, wobble: 0.4 }));
  out.push(brush([[980, 1330], [1010, 1400]], { w: [2, 5, 2], taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.25 }));
  // welt pocket
  out.push(brush([[936, 1320], [1060, 1310]], { w: 4, taper: [0.1, 0.1], r, fill: PAPER, opacity: 0.4 }));
  // contour: thin and broken where the light hits the shoulder, heavy down the shade side
  out.push(brush([[600, 716], [520, 730], [470, 746]], { w: [2, 3, 2], taper: [0.2, 0.3], r, wobble: 0.3 }));
  out.push(brush([[430, 770], [388, 800], [356, 860]], { w: [2, 3.5, 3], taper: [0.3, 0.3], r, wobble: 0.3 }));
  out.push(brush([[340, 930], [322, 1060], [306, 1260], [296, 1500]], { w: [4, 6, 7, 6], taper: [0.2, 0], r, wobble: 0.3 }));
  out.push(brush([[880, 712], [1030, 748], [1110, 806], [1146, 900], [1162, 1060], [1172, 1260], [1180, 1500]], { w: [5, 8, 11, 12, 11, 10, 9], taper: [0.05, 0], r, wobble: 0.2 }));
  return out.join('');
}

function collar(r) {
  // the jumper's roll neck under the beard, the pea-coat collar standing up behind it
  const out = [];
  const back = [[556, 700], [574, 646], [620, 680], [860, 680], [906, 626], [952, 690], [944, 740], [890, 716], [600, 720]];
  out.push(wool(back, { angle: 20, ink: 0.35 }));
  out.push(brush([[574, 648], [556, 700], [586, 740]], { w: [3, 5, 4], taper: [0.1, 0.2], r, wobble: 0.3 }));
  out.push(brush([[906, 628], [952, 692], [944, 742]], { w: [4, 7, 6], taper: [0.1, 0.2], r, wobble: 0.3 }));
  out.push(brush([[916, 656], [934, 704]], { w: 6, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.4 }));
  const roll = [[592, 690], [640, 716], [720, 736], [820, 728], [890, 700], [894, 730], [820, 762], [720, 770], [630, 752], [596, 726]];
  out.push(mass(roll, { fill: PAPER }));
  out.push(wash([[760, 734], [890, 702], [894, 730], [820, 762], [760, 768]], { opacity: 0.32, edge: 0.6 }));
  const ribs = [];
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    const x = 604 + t * 284;
    const y = 712 + Math.sin(t * Math.PI) * 22 - t * 8;
    ribs.push([[x, y], [x + 2, y + 30]]);
  }
  out.push(strokes(ribs, { w: 2.2, taper: [0.3, 0.3], r, opacity: 0.4 }));
  out.push(brush([[596, 728], [630, 754], [720, 772], [822, 764], [896, 732]], { w: [3, 4, 5, 5, 4], taper: [0.1, 0.1], r, wobble: 0.3 }));
  return out.join('');
}

function head(r) {
  const out = [];
  // face, three-quarter to the left: profile down the left edge, ear on the right
  const face = [[576, 398], [880, 410], [874, 470], [862, 540], [834, 604], [784, 652], [706, 690], [636, 688], [594, 650], [574, 600], [566, 570], [562, 552], [574, 530], [584, 500], [588, 474], [582, 448], [578, 424]];
  out.push(mass(face, { fill: PAPER }));
  const ear = [[852, 448], [874, 436], [892, 454], [894, 492], [882, 528], [860, 536]];
  out.push(mass(ear, { fill: PAPER }));
  // one shadow plane (light from the upper left): temple, cheek toward the ear and down to the
  // beard line; plus the band under the cap and under the nose
  out.push(wash([[760, 420], [872, 422], [868, 480], [846, 526], [800, 546], [746, 560], [736, 540], [770, 516], [786, 488], [774, 452]], { opacity: 0.28, edge: 0.7 }));
  out.push(wash([[586, 412], [870, 422], [868, 440], [720, 434], [592, 426]], { opacity: 0.2, edge: 0 }));
  out.push(wash([[586, 560], [626, 556], [640, 572], [596, 576]], { opacity: 0.3, edge: 0 }));
  out.push(brush([[854, 450], [876, 436], [894, 456], [895, 494], [882, 530], [862, 538]], { w: [3, 5, 7, 7, 5, 3], taper: [0.2, 0.3], r }));
  out.push(brush([[872, 462], [880, 488], [870, 512]], { w: 3, taper: [0.3, 0.3], r }));
  // profile in the light: only a whisper at the forehead, the brow ridge standing out, the socket
  out.push(brush([[579, 414], [580, 428]], { w: 2, taper: [0.4, 0.4], r, opacity: 0.7 }));
  out.push(brush([[583, 440], [589, 454], [592, 464], [587, 478]], { w: [2, 5, 5, 2], taper: [0.2, 0.4], r, wobble: 0.3 }));
  // nose: bridge from the brow, a heavy rounded tip turned down toward the dial, the near wing
  out.push(brush([[652, 466], [646, 492], [632, 520], [616, 538]], { w: [1.5, 3, 4, 3], taper: [0.5, 0.2], r, wobble: 0.3 }));
  out.push(brush([[590, 532], [576, 546], [575, 562], [592, 571], [612, 568]], { w: [2, 5, 7, 6, 3], taper: [0.35, 0.3], r, wobble: 0.2 }));
  out.push(brush([[640, 550], [652, 562], [636, 573], [620, 569]], { w: [2, 5, 5, 2], taper: [0.2, 0.3], r }));
  out.push(mass([[598, 566], [614, 562], [610, 573]], { fill: INK }));
  // brows: heavy, knitted — the inner ends pulled down toward the nose, the outer ends lifting
  const brow = (x0, y0, x1, y1, n, lift = 4) => {
    const list = [];
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      list.push([[x - 4, y + 6], [x + 14, y - lift + r() * 4]]);
    }
    return list;
  };
  out.push(strokes(brow(594, 448, 626, 458, 5), { w: 5, taper: [0.2, 0.5], r }));
  out.push(strokes(brow(668, 462, 772, 446, 11, 7), { w: 5.8, taper: [0.2, 0.5], r }));
  out.push(strokes(brow(690, 456, 756, 448, 4), { w: 2, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.7 }));
  // the knot between the brows
  out.push(strokes([[[650, 438], [656, 452], [654, 466]], [[640, 446], [644, 462]]], { w: [1.5, 3.5, 1.5], taper: [0.3, 0.4], r, opacity: 0.85 }));
  // eyes narrowed on the dial: heavy upper lid, the iris sitting low and forward, the lower lid
  // pushed up in a squint
  out.push(brush([[672, 486], [690, 479], [716, 477], [744, 482], [762, 490]], { w: [2, 6, 8, 6, 2], taper: [0.1, 0.3], r }));
  out.push(mass([[690, 482], [711, 481], [710, 492], [700, 495], [690, 491]], { fill: INK }));
  out.push(brush([[686, 495], [710, 497], [738, 493], [752, 490]], { w: [1.5, 3.2, 2.6, 1.5], taper: [0.3, 0.3], r, opacity: 0.85 }));
  out.push(brush([[684, 470], [714, 464], [748, 470]], { w: 2.2, taper: [0.3, 0.3], r, opacity: 0.55 }));
  out.push(brush([[596, 486], [608, 481], [630, 483]], { w: [3, 7, 3], taper: [0.2, 0.3], r }));
  out.push(mass([[599, 485], [611, 485], [609, 492], [601, 491]], { fill: INK }));
  out.push(brush([[600, 496], [622, 494]], { w: 1.8, taper: [0.3, 0.3], r, opacity: 0.7 }));
  // age and squint: bag under the eye, crow's feet fanning out, the cheekbone
  out.push(strokes([
    [[694, 510], [720, 515], [746, 506]],
    [[766, 478], [790, 468]], [[768, 489], [794, 488]], [[766, 498], [788, 510]],
    [[754, 522], [778, 532]],
  ], { w: [1.5, 2.6, 1.2], taper: [0.3, 0.4], r, opacity: 0.8 }));
  // beard: full and dark, from the sideburn down round the chin, grey at the chin and corners
  const beard = [[852, 440], [860, 500], [850, 566], [818, 632], [766, 690], [702, 730], [640, 732], [596, 706], [572, 664], [566, 614], [574, 586], [604, 580], [636, 588], [668, 586], [704, 572], [740, 554], [782, 546], [816, 524], [834, 470]];
  out.push(mass(beard, { fill: PAPER }), mass(beard, { fill: INK, opacity: 0.93 }));
  // the brush's travel through the beard: two broad broken sweeps, down and round the jaw
  out.push(streak([[820, 520], [800, 600], [760, 668]], r, { w: 34, o: 0.2 }));
  out.push(streak([[690, 600], [676, 660], [650, 712]], r, { w: 30, o: 0.16 }));
  // the cheek edge of the beard broken into downward hairs
  const beardTop = sample([[834, 474], [816, 524], [782, 546], [740, 554], [704, 572], [668, 586], [636, 588], [604, 580], [578, 588]], 22);
  out.push(strokes(beardTop.filter(() => r() > 0.25).map(([x, y]) => [[x + (r() - 0.5) * 8, y - 4 - r() * 12], [x - 2 - r() * 6, y + 16]]), { w: 4.4, taper: [0.75, 0.1], r }));
  // the outer edge alive: hair flicks leaving the mass, outward and down, uneven in length
  const edge = sample([[854, 548], [846, 580], [818, 632], [766, 690], [702, 730], [640, 732], [596, 706], [572, 664], [566, 620]], 26);
  const flicks = [];
  edge.forEach(([x, y], i) => {
    const [px, py] = edge[Math.max(0, i - 1)];
    const [nx, ny] = edge[Math.min(edge.length - 1, i + 1)];
    const len = Math.hypot(nx - px, ny - py) || 1;
    const o = [(ny - py) / len, -(nx - px) / len]; // outward normal (the edge runs clockwise)
    const k = 8 + r() * 14 + (i % 3 === 0 ? 8 : 0);
    const dx = o[0] * 0.45 + (x > 700 ? -0.1 : -0.15);
    const dy = o[1] * 0.45 + 0.8;
    flicks.push([[x - o[0] * 10, y - o[1] * 10], [x + dx * k * 0.5, y + dy * k * 0.5], [x + dx * k + (r() - 0.5) * 6, y + dy * k]]);
  });
  out.push(strokes(flicks, { w: 3.6, taper: [0.05, 0.85], r, wobble: 0.3 }));
  // a few long paper strands combed down through the chin and at the mouth corners
  const grey = [];
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = 612 + t * 170 + (r() - 0.5) * 16;
    const y0 = 630 + Math.sin(t * Math.PI) * 14 + r() * 18;
    const len = 38 + r() * 46;
    const lean = (t - 0.45) * 30 + (r() - 0.5) * 18;
    grey.push([[x, y0], [x + lean * 0.35 + (r() - 0.5) * 6, y0 + len * 0.5], [x + lean, y0 + len]]);
  }
  out.push(strokes(grey, { w: 2.4, taper: [0.4, 0.5], r, fill: PAPER, opacity: 0.8 }));
  out.push(strokes([
    [[592, 598], [582, 634]], [[694, 590], [704, 628]],
    [[828, 520], [812, 566]], [[842, 500], [836, 540]],
  ], { w: 2.2, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.65 }));
  // mouth: the parting in the beard, a small lower lip catching the light
  out.push(mass([[626, 618], [646, 615], [662, 618], [650, 626], [632, 626]], { fill: PAPER }));
  out.push(mass([[626, 618], [646, 615], [662, 618], [650, 626], [632, 626]], { fill: INDIGO, opacity: 0.4 }));
  out.push(brush([[606, 612], [630, 614], [654, 611], [680, 614]], { w: [2, 4, 4, 2], taper: [0.2, 0.3], r }));
  const tache = [];
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = 600 + t * 86;
    tache.push([[x - 4, 584 + Math.sin(t * Math.PI) * 3], [x + (t - 0.4) * 20, 610]]);
  }
  out.push(strokes(tache, { w: 2, taper: [0.4, 0.4], r, fill: PAPER, opacity: 0.38 }));

  // knit cap: ink, pulled low, the cuff rolled and ribbed, a fold at the crown
  const cap = [[560, 410], [548, 340], [572, 272], [640, 226], [730, 214], [812, 236], [870, 290], [888, 364], [884, 426], [800, 416], [700, 410], [620, 412]];
  out.push(sumi(cap, { angle: 72 }));
  const cuff = [[552, 360], [700, 352], [886, 360], [884, 426], [760, 414], [640, 414], [560, 414]];
  out.push(mass(cuff, { fill: INK }));
  out.push(brush([[554, 362], [700, 354], [884, 362]], { w: 4.4, taper: [0.05, 0.1], r, fill: PAPER, opacity: 0.8 }));
  const capRibs = [];
  for (let i = 0; i < 20; i += 1) {
    const t = i / 19;
    capRibs.push([[562 + t * 316, 368 - Math.sin(t * Math.PI) * 6], [566 + t * 312, 408 + Math.sin(t * Math.PI) * 4]]);
  }
  out.push(strokes(capRibs, { w: 2.4, taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.42 }));
  out.push(dry(strokes([[[586, 318], [640, 262], [730, 240]], [[610, 336], [680, 290]]], { w: 12, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.5 }), -32));
  out.push(brush([[760, 230], [786, 262], [800, 300]], { w: 3.4, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.4 }));
  return out.join('');
}

/* ── Arm and hand (in front of the telegraph) ───────────────────────────────────────────────── */

const HAND_SCALE = 1.12;
const HAND_ANGLE = LEVER_ANGLE + 90; // local y along the lever, wrist to the right
const GRIP = polar(GRIP_R, LEVER_ANGLE);
const WRIST = [GRIP[0] + Math.cos(rad(HAND_ANGLE)) * 150 * HAND_SCALE, GRIP[1] + Math.sin(rad(HAND_ANGLE)) * 150 * HAND_SCALE];
const ELBOW = [960, 1150];

/** A point on the forearm: `k` units back from the wrist along the arm, `s` across (+ = top). */
function onForearm(k, s) {
  const dx = ELBOW[0] - WRIST[0];
  const dy = ELBOW[1] - WRIST[1];
  const len = Math.hypot(dx, dy);
  const u = [dx / len, dy / len];
  const n = [u[1], -u[0]]; // top side (up-right)
  return [WRIST[0] + u[0] * k + n[0] * s, WRIST[1] + u[1] * k + n[1] * s];
}

function arm(r) {
  const out = [];
  const top = (k, s) => onForearm(k, s * 0.9);
  // one silhouette: cuff → forearm top → crook of the elbow → up the inside of the upper arm →
  // shoulder cap → down the outside of the arm (inside the coat's edge, so the body shows beyond
  // it) → elbow → forearm underside → cuff
  const outer = [[1080, 790], [1122, 836], [1132, 960], [1104, 1136], [1040, 1226], [976, 1248]];
  const outline = [top(0, 70), top(160, 80), top(330, 92), [1004, 1030], [1000, 900], [1018, 806], ...outer, top(360, -92), top(180, -80), top(0, -70)];
  // the arm's cast shadow on the coat below the forearm, and on the body beside the upper arm
  out.push(mass([top(40, -70), top(200, -84), top(370, -96), [976, 1248], [1000, 1290], top(380, -150), top(200, -130), top(40, -110)], { fill: INK, opacity: 0.45 }));
  // a paper gap all round, so the sleeve reads in front of the coat
  out.push(brush([top(10, -74), top(180, -84), top(360, -96), [976, 1252], [1042, 1232], [1108, 1140], [1136, 960], [1126, 832], [1082, 786]], { w: [5, 6, 7, 7, 6, 4, 3, 2, 1], taper: [0.1, 0.3], r, fill: PAPER, opacity: 0.85, wobble: 0.35 }));
  out.push(brush([top(330, 98), [1000, 1030], [996, 900], [1014, 806]], { w: [5, 4, 3, 2], taper: [0.1, 0.3], r, fill: PAPER, opacity: 0.8 }));
  // the sleeve a value lighter than the body: indigo with less ink
  out.push(mass(outline, { fill: PAPER }), mass(outline, { fill: INDIGO, opacity: 0.96 }), mass(outline, { fill: INK, opacity: 0.42 }));
  // light along the top of the forearm and down the shoulder, following the form
  out.push(streak([top(40, 44), top(180, 52), top(320, 58)], r, { w: 50, o: 0.3 }));
  out.push(streak([[1040, 820], [1066, 920], [1060, 1060]], r, { w: 56, o: 0.2 }));
  out.push(brush([top(60, 62), top(160, 70), top(250, 76)], { w: [3, 7, 2], taper: [0.3, 0.6], r, fill: PAPER, opacity: 0.85, wobble: 0.35 }));
  out.push(brush([[1034, 806], [1076, 796], [1108, 818]], { w: [2, 6, 2], taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.8 }));
  // the crook of the elbow: the sleeve bunches into a few folds
  out.push(strokes([
    [top(290, 72), top(322, 30), top(318, -20)],
    [top(250, 60), top(282, 18)],
    [[1016, 1060], [1030, 1110], [1024, 1160]],
  ], { w: [2, 6, 3], taper: [0.3, 0.4], r, opacity: 0.9 }));
  out.push(strokes([[top(338, -30), [960, 1200], [1000, 1216]], [[1060, 1160], [1086, 1120]]], { w: [2, 5, 2], taper: [0.3, 0.4], r, opacity: 0.8 }));
  out.push(brush([top(300, 50), top(330, 10)], { w: 5, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.4 }));
  // turned-back cuff with a seam
  const cuff = [top(-2, -72), top(-2, 72), top(64, 76), top(64, -76)];
  out.push(mass(cuff, { fill: INK, opacity: 0.45 }));
  out.push(brush([top(64, 76), top(64, -76)], { w: 3.4, taper: [0.1, 0.1], r, fill: PAPER, opacity: 0.55 }));
  // contours: the underside heavy (it turns away from the light), the top light and broken
  out.push(brush([top(0, -70), top(180, -80), top(360, -92), [976, 1248], [1040, 1228], [1104, 1138], [1132, 960]], { w: [5, 8, 10, 12, 11, 9, 6], taper: [0.05, 0.15], r, wobble: 0.25 }));
  out.push(brush([[1122, 836], [1080, 790]], { w: [4, 2], taper: [0.2, 0.4], r }));
  out.push(brush([top(0, 70), top(90, 76)], { w: [3, 2], taper: [0.1, 0.4], r, wobble: 0.3 }));
  out.push(brush([top(150, 80), top(260, 88), top(320, 92)], { w: [2.5, 3.5, 2], taper: [0.3, 0.3], r, wobble: 0.3 }));
  out.push(brush([[1004, 1030], [1000, 900], [1018, 806]], { w: [4, 3, 2], taper: [0.1, 0.4], r, wobble: 0.3 }));
  out.push(brush([top(0, -70), top(0, 70)], { w: 5, taper: [0.05, 0.05], r }));
  return out.join('');
}

function hand(r) {
  return place(gripHand(r), { origin: GRIP, angle: HAND_ANGLE, scale: HAND_SCALE });
}

export default crewPlate({
  n: 7,
  title: 'Kural Motoru',
  seed: 0x0b07,
  detail: { x: 0.42, y: 0.485, zoom: 1.38 },
  railY: 1190,
  storm: 'left',
  draw: (r) => ({
    figure: [coat(r), collar(r), head(r)].join('\n'),
    front: [telegraph(r), rough([arm(r), hand(r)].join(''))].join('\n'),
  }),
});
