// Crew No. 08 · Risk Kapısı — the last gate, and it is not an AI: sixteen fixed rules (R01–R16).
// A young deckhand in a safety harness over a dark oilskin stands at the gangway gate in the
// rail and holds its heavy lever-latch shut in her fist. A tag on the latch's key ring is
// stamped R01–R16; the small kill-switch handle beside it is the plate's only red.
// Style: ./style.mjs, STYLE.md.

import { SANS } from '../kit.mjs';
import { INDIGO, INK, PAPER, RED, brush, crewPlate, dry, mass, place, rail, strokes, sumi, wash } from './style.mjs';

/* ── Geometry shared by the gate, the lever and the arm ─────────────────────────────────────── */

const RAIL_Y = 1040; // gunwale of the rail the gate sits in
const RAIL_TOP = RAIL_Y - 190;
const TILT = 14;
const railAt = (x, base) => base - (x / 1200 - 0.5) * 2 * TILT;

const GATE = { l: 26, r: 318 }; // hinge post … latch post
const GRIP = { bar: [236, 912], angle: 21, scale: 1.06 }; // where the fist closes on the lever
const rad = (GRIP.angle * Math.PI) / 180;
const ALONG = [Math.cos(rad), Math.sin(rad)]; // bar → wrist
const LEVER = [-Math.sin(rad), Math.cos(rad)]; // down the lever, toward the pivot
const at = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];
const PIVOT = at(GRIP.bar, LEVER, 168);
const LEVER_TOP = at(GRIP.bar, LEVER, -128);
const WRIST = at(GRIP.bar, ALONG, 160 * GRIP.scale);
const ELBOW = [556, 1040];
const SHOULDER = [650, 790];

const HEAD = [764, 432]; // local origin of the head: between the eyes, at eye level

/* ── Small drawing helpers (local to this plate) ────────────────────────────────────────────── */

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ring = (cx, cy, rr, w, opacity = 1) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-opacity="${opacity}"/>`;
const dot = (cx, cy, rr, fill = INK, opacity = 1) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr}" fill="${fill}" fill-opacity="${opacity}"/>`;

/* ── The gangway gate: steel frame, bars, kick plate, lever-latch ───────────────────────────── */

function gate(r) {
  const out = [];
  const { l, r: gr } = GATE;
  const top = (x) => railAt(x, RAIL_TOP) + 6;
  // kick plate: a wet indigo sheet with a pooled rim, rivets along its edges
  const plate = [[l, 1112], [gr, 1108], [gr, 1500], [l, 1500]];
  out.push(mass(plate, { sharp: true, fill: PAPER }));
  out.push(sumi(plate, { fill: INDIGO, base: 0.72, angle: 90, sharp: true }));
  out.push(wash([[l + 10, 1300], [gr - 20, 1260], [gr - 10, 1500], [l + 10, 1500]], { color: INK, opacity: 0.28, edge: 0.8, sharp: true }));
  out.push(dry(strokes([[[l + 40, 1130], [l + 46, 1480]], [[gr - 60, 1126], [gr - 54, 1490]]], { w: 14, taper: [0.1, 0.3], r, fill: PAPER, opacity: 0.35 }), 90));
  const rivets = [];
  for (let x = l + 30; x < gr - 10; x += 44) rivets.push(dot(x, 1132, 4.5, INK), dot(x - 1, 1129, 1.6, PAPER, 0.8));
  out.push(rivets.join(''));
  // balusters between the top bar and the kick plate
  const bars = [];
  // (indigo, lighter than the ink lever so the lever reads in front of them)
  for (let x = l + 50; x < gr - 20; x += 50) bars.push([[x, top(x) + 10], [x + 1, 1110]]);
  out.push(strokes(bars, { w: 6, taper: [0, 0], r, wobble: 0.2, fill: INDIGO, opacity: 0.7 }));
  // mid bar
  out.push(brush([[l, 1004], [gr, 1000]], { w: 11, taper: [0, 0], r, wobble: 0.12, straight: true, fill: INDIGO, opacity: 0.85 }));
  // frame: heavy top bar, both posts; the latch post rises above the rail with a cap
  out.push(brush([[l - 8, top(l)], [gr + 8, top(gr)]], { w: 22, taper: [0, 0], r, wobble: 0.1, straight: true }));
  out.push(brush([[l + 6, top(l) - 3], [gr - 20, top(gr) - 3]], { w: 3, taper: [0.1, 0.4], fill: PAPER, opacity: 0.55, straight: true }));
  out.push(brush([[l, top(l) - 6], [l + 1, 1500]], { w: 24, taper: [0, 0], r, wobble: 0.1 }));
  out.push(brush([[gr + 14, 772], [gr + 15, 1500]], { w: 26, taper: [0, 0], r, wobble: 0.1 }));
  out.push(mass([[gr - 4, 764], [gr + 32, 764], [gr + 30, 780], [gr - 2, 780]], { sharp: true }));
  out.push(brush([[gr + 8, 790], [gr + 9, 1040]], { w: 3, taper: [0.1, 0.5], fill: PAPER, opacity: 0.5 }));
  // hinges on the hinge post
  for (const y of [900, 1210]) out.push(mass(box(l - 16, y, l + 28, y + 40), { sharp: true }), brush([[l - 10, y + 8], [l - 10, y + 32]], { w: 2.4, taper: [0, 0], fill: PAPER, opacity: 0.6 }));
  // latch housing on the mid rail, the pivot boss
  const [px, py] = PIVOT;
  out.push(sumi([[px - 42, py - 40], [px + 44, py - 44], [px + 46, py + 48], [px - 40, py + 50]], { angle: 90, sharp: true, fill: INDIGO, base: 0.8 }));
  out.push(brush([[px - 42, py - 40], [px + 44, py - 44], [px + 46, py + 48], [px - 40, py + 50], [px - 42, py - 40]], { w: 3.4, taper: [0, 0], r, straight: true }));
  for (const [dx, dy] of [[-30, -30], [32, -32], [34, 36], [-28, 38]]) out.push(dot(px + dx, py + dy, 4, PAPER, 0.8));
  // keeper on the latch post: a claw the lever top drops into
  const [tx, ty] = LEVER_TOP;
  out.push(mass([[tx - 14, ty - 2], [gr + 4, ty - 8], [gr + 4, ty + 34], [tx - 14, ty + 30]], { sharp: true }));
  out.push(brush([[tx - 10, ty + 4], [gr - 2, ty]], { w: 2.4, taper: [0.1, 0.1], fill: PAPER, opacity: 0.6, straight: true }));
  return out.join('');
}

/** The lever itself: pivot to keeper, a knob on top, the tail hooked under the housing. */
function lever(r) {
  const out = [];
  const [px, py] = PIVOT;
  const tail = at(PIVOT, LEVER, 34);
  const knob = at(LEVER_TOP, LEVER, -16);
  // paper halo: the lever is cut out of the bars behind it
  out.push(brush([at(PIVOT, LEVER, -50), at(LEVER_TOP, LEVER, -4)], { w: [50, 42], taper: [0, 0], fill: PAPER, straight: true }));
  out.push(dot(knob[0], knob[1], 28, PAPER));
  out.push(brush([tail, LEVER_TOP], { w: [28, 20], taper: [0, 0], r, wobble: 0.06, straight: true }));
  out.push(brush([at(PIVOT, LEVER, -20), at(LEVER_TOP, LEVER, 12)].map(([x, y]) => [x - 6, y]), { w: 3.2, taper: [0.2, 0.3], fill: PAPER, opacity: 0.6, straight: true }));
  out.push(dot(knob[0], knob[1], 17), dot(knob[0] - 5, knob[1] - 6, 5, PAPER, 0.7));
  out.push(dot(px, py, 20), ring(px, py, 11, 3), dot(px - 4, py - 5, 3, PAPER, 0.9));
  return out.join('');
}

/** Key ring on the pivot, the rule tag stamped R01–R16, the kill-switch with the red handle. */
function latchTags(r) {
  const out = [];
  const [px, py] = PIVOT;
  const eye = [px - 4, py + 60];
  const rc = [eye[0] + 2, eye[1] + 30];
  out.push(brush([[eye[0], eye[1] - 8], [eye[0] + 1, eye[1] + 8]], { w: 4, taper: [0, 0] }));
  out.push(ring(rc[0], rc[1], 22, 4.4));
  // two keys, hanging off the ring at an angle
  const key = [
    `<path d="M0 -13a13 13 0 1 0 0.1 0Z M0 -5a5 5 0 1 1 -0.1 0Z" fill="${INK}" fill-rule="evenodd"/>`,
    mass([[-4, 12], [4, 12], [4, 74], [-4, 74]], { sharp: true }),
    mass([[4, 52], [14, 52], [14, 58], [9, 58], [9, 64], [4, 64]], { sharp: true }),
  ].join('');
  out.push(place(key, { origin: [rc[0] - 18, rc[1] + 16], angle: 34, scale: 0.9 }));
  out.push(place(key, { origin: [rc[0] - 4, rc[1] + 22], angle: 10, scale: 0.8 }));
  // the rule tag: a card on a wire loop, rotated as it hangs
  const tag = [
    `<path d="M-78 0 L78 0 L78 70 L-78 70 Z" fill="${PAPER}"/>`,
    brush([[-78, 0], [78, 0], [78, 70], [-78, 70], [-78, 0]], { w: 3.4, taper: [0, 0], r, wobble: 0.15, straight: true }),
    brush([[-70, 8], [70, 8], [70, 62], [-70, 62], [-70, 8]], { w: 1.4, taper: [0, 0], opacity: 0.55, straight: true }),
    ring(0, 16, 5.5, 2.2),
    `<text x="0" y="50" font-family="${SANS}" font-size="30" font-weight="700" letter-spacing="1.2" text-anchor="middle" fill="${INK}">R01–R16</text>`,
  ].join('');
  const tagOrigin = [rc[0] + 52, rc[1] + 12];
  out.push(brush([[rc[0] + 18, rc[1] + 12], [tagOrigin[0] - 1, tagOrigin[1] + 12]], { w: 2.4, taper: [0, 0] }));
  out.push(place(tag, { origin: tagOrigin, angle: -4 }));
  // kill switch on the latch post: an ink box, the handle is the one red on the plate
  const [bx, by] = [GATE.r - 2, 1150];
  out.push(mass(box(bx - 26, by - 30, bx + 30, by + 36), { sharp: true }));
  out.push(brush([[bx - 20, by - 24], [bx + 22, by - 24]], { w: 2, taper: [0.1, 0.1], fill: PAPER, opacity: 0.6, straight: true }));
  out.push(brush([[bx + 2, by], [bx + 36, by - 30]], { w: 7, taper: [0, 0], straight: true }));
  out.push(place(mass(box(-26, -9, 26, 9), { sharp: true, fill: RED }) + brush([[-26, -9], [26, -9], [26, 9], [-26, 9], [-26, -9]], { w: 2, taper: [0, 0], straight: true }), { origin: [bx + 40, by - 34], angle: -42 }));
  return out.join('');
}

/** A wet indigo cloud behind the shade side of the head, and spray thrown over the rail. */
function weather(r) {
  const out = [];
  // spray flung over the rail: a few round drops, a couple dragged by the wind
  const drops = [];
  for (let i = 0; i < 14; i += 1) {
    const x = 40 + r() * 400;
    const y = 690 + r() * 130;
    const s = 1.6 + r() * 3.4;
    drops.push(i % 4 === 0 ? brush([[x, y], [x - 10 - s * 3, y + 4 + s * 2]], { w: s * 1.6, taper: [0, 0.9], fill: INDIGO, opacity: 0.55 }) : dot(x, y, s, INDIGO, 0.55));
  }
  out.push(drops.join(''));
  return out.join('');
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */

// Torso turned a quarter toward the gate: shoulders slope, the lit front plane (light from the
// gate, upper left) meets a hard-edged shade plane down her far flank.
const BODY = [[700, 668], [652, 698], [614, 746], [594, 820], [586, 940], [580, 1100], [572, 1300], [568, 1500], [1070, 1500], [1076, 1260], [1072, 1040], [1060, 880], [1034, 780], [980, 712], [904, 680], [850, 672]];
const SHADE_EDGE = [[930, 700], [906, 800], [888, 930], [880, 1100], [886, 1300], [894, 1500]];

function oilskin(r) {
  const out = [];
  out.push(mass(BODY, { fill: PAPER }), mass(BODY, { fill: INDIGO, opacity: 0.86 }));
  // shade plane: one flat dark wash, hard edge where the torso turns away
  out.push(mass([...SHADE_EDGE, [1070, 1500], [1076, 1260], [1072, 1040], [1060, 880], [1034, 780], [980, 712]], { fill: INK, opacity: 0.62 }));
  // oilskin shine: hard paper highlights on the fold crests and the chest
  out.push(strokes([
    [[748, 872], [786, 904], [826, 912]],
    [[604, 1150], [598, 1230]],
    [[650, 1100], [686, 1098], [718, 1106]],
    [[800, 1100], [836, 1098], [864, 1106]],
    [[748, 1190], [760, 1250], [758, 1310]],
    [[640, 800], [664, 846]],
  ], { w: [6, 11, 4], taper: [0.35, 0.5], r, wobble: 0.3, fill: PAPER, opacity: 0.85 }));
  // decisive folds: armpit pull, the bunching under the chest strap, the long waist fold
  out.push(brush([[694, 868], [730, 910], [754, 956], [762, 992]], { w: [9, 7, 3, 1], taper: [0.05, 0.6], r }));
  out.push(strokes([
    [[626, 1064], [668, 1082], [714, 1076]],
    [[790, 1062], [830, 1082], [870, 1074]],
    [[600, 1180], [640, 1200], [680, 1196]],
  ], { w: [2, 10, 1], taper: [0.2, 0.5], r }));
  out.push(brush([[726, 1124], [736, 1230], [732, 1340], [724, 1440]], { w: [6, 5, 3, 1], taper: [0.1, 0.6], r }));
  out.push(brush([[870, 1120], [866, 1230]], { w: [6, 3], taper: [0.1, 0.6], r, fill: PAPER, opacity: 0.4 }));
  // zip and storm flap, bending with the turn of the chest
  out.push(brush([[808, 790], [792, 900], [790, 1040], [800, 1250], [812, 1500]], { w: [5, 4, 5, 6, 6], taper: [0.1, 0], r }));
  // contours: thin and broken in the light, heavy where the flank turns away
  out.push(brush([[582, 1120], [576, 1220], [572, 1310]], { w: [2.5, 4, 2.5], taper: [0.2, 0.4], r, wobble: 0.4 }));
  out.push(brush([[572, 1350], [569, 1430], [568, 1500]], { w: [2.5, 3.5, 4], taper: [0.3, 0], r, wobble: 0.4 }));
  out.push(brush([[904, 684], [976, 714], [1034, 780], [1060, 880], [1072, 1040], [1076, 1260], [1070, 1500]], { w: [4, 8, 12, 10, 12, 9, 10], taper: [0.05, 0], r, wobble: 0.4 }));
  return out.join('');
}

/** Near arm hanging at her side, in the shade, bent a little at the elbow, cut by the caption. */
const NEAR_ARM = [[990, 716], [1050, 770], [1082, 880], [1098, 1040], [1104, 1160], [1090, 1300], [1064, 1500], [940, 1500], [964, 1300], [980, 1170], [970, 1040], [962, 900], [958, 800]];

function nearArm(r) {
  return [
    mass(NEAR_ARM, { fill: PAPER }),
    mass(NEAR_ARM, { fill: INDIGO, opacity: 0.95 }),
    mass([[1030, 760], [1072, 850], [1094, 1000], [1104, 1160], [1090, 1300], [1064, 1500], [1016, 1500], [1040, 1300], [1052, 1160], [1046, 1000], [1030, 870], [1004, 780]], { fill: INK, opacity: 0.62 }),
    brush([[958, 820], [964, 960], [974, 1100], [978, 1170]], { w: 3.4, taper: [0.4, 0.1], r, fill: PAPER, opacity: 0.75 }),
    brush([[980, 1196], [966, 1300], [946, 1500]], { w: 3.4, taper: [0.1, 0], r, fill: PAPER, opacity: 0.75 }),
    brush([[986, 800], [994, 900], [998, 1010]], { w: [4, 10, 3], taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.8 }),
    brush([[1000, 724], [1060, 790], [1086, 900], [1100, 1060], [1104, 1160], [1088, 1300], [1062, 1500]], { w: [5, 9, 11, 10, 11, 9, 8], taper: [0.1, 0], r, wobble: 0.3 }),
    strokes([[[986, 1136], [1020, 1160], [1060, 1150]], [[994, 1180], [1030, 1196]]], { w: [1, 5, 1], taper: [0.3, 0.4], r, opacity: 0.9 }),
    brush([[990, 1150], [1024, 1172], [1056, 1164]], { w: 3, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.55 }),
  ].join('');
}

/** Webbing strap: paper band with an indigo wash, inked edges, stitch dashes. */
function strap(r, centre, width = 34, shade = null) {
  const out = [];
  const n = centre.length;
  const edge = (s) => centre.map((p, i) => {
    const a = centre[Math.max(0, i - 1)];
    const b = centre[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] - ((b[1] - a[1]) / len) * s * width / 2, p[1] + ((b[0] - a[0]) / len) * s * width / 2];
  });
  const L = edge(1);
  const R = edge(-1);
  const shape = [...L, ...R.slice().reverse()];
  out.push(mass(shape, { fill: PAPER }));
  out.push(mass(shape, { fill: INDIGO, opacity: 0.42 }));
  if (shade) out.push(shade);
  out.push(brush(L, { w: 3, taper: [0.05, 0.05], r, wobble: 0.3 }));
  out.push(brush(R, { w: 4.4, taper: [0.05, 0.05], r, wobble: 0.3 }));
  const stitch = centre.map((p, i) => [(L[i][0] * 0.3 + R[i][0] * 0.7), (L[i][1] * 0.3 + R[i][1] * 0.7)]);
  out.push(`<path d="M${stitch.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-dasharray="7 7" stroke-opacity="0.55"/>`);
  return out.join('');
}

function harness(r) {
  const out = [];
  // tether from the chest D-ring down to the latch post (clipped on), sagging under its weight
  out.push(strap(r, [[750, 1104], [726, 1180], [650, 1238], [520, 1264], [352, 1254]], 26));
  // shoulder straps over the chest, bowed by the body and following the turn
  out.push(strap(r, [[704, 690], [690, 780], [690, 880], [700, 990], [708, 1120], [712, 1300], [710, 1500]]));
  out.push(strap(r, [[892, 690], [870, 780], [856, 880], [850, 990], [852, 1120], [858, 1300], [864, 1500]], 30));
  // chest strap: sags in the middle and wraps into the shade plane
  out.push(strap(r, [[630, 1000], [700, 1022], [760, 1028], [830, 1018], [884, 1000], [930, 980]], 36,
    mass([[884, 978], [936, 958], [940, 996], [886, 1020]], { fill: INK, opacity: 0.5 })));
  const [bx, by] = [752, 1026];
  out.push(mass(box(bx - 30, by - 20, bx + 30, by + 20), { sharp: true }));
  out.push(brush([[bx - 24, by - 12], [bx + 18, by - 12]], { w: 3, taper: [0.1, 0.1], fill: PAPER, opacity: 0.7, straight: true }));
  out.push(brush([[bx - 20, by + 12], [bx + 22, by + 12]], { w: 2.4, taper: [0.1, 0.1], fill: PAPER, opacity: 0.5, straight: true }));
  out.push(`<path d="M${bx - 24} ${by + 18} L${bx + 24} ${by + 18} Q${bx + 26} ${by + 78} ${bx} ${by + 82} Q${bx - 26} ${by + 78} ${bx - 24} ${by + 18} Z" fill="none" stroke="${INK}" stroke-width="7"/>`);
  out.push(brush([[bx - 16, by + 28], [bx - 12, by + 60]], { w: 2.4, taper: [0.2, 0.2], fill: PAPER, opacity: 0.7 }));
  // carabiner on the latch post
  out.push(`<rect x="326" y="1234" width="40" height="30" rx="14" fill="none" stroke="${INK}" stroke-width="6"/>`);
  return out.join('');
}

function neck(r) {
  const out = [];
  const pts = [[-66, 128], [20, 150], [58, 96], [62, 300], [-54, 300]];
  out.push(mass(pts, { fill: PAPER }));
  out.push(wash([[-64, 162], [10, 158], [58, 108], [60, 210], [24, 232], [-46, 200]], { opacity: 0.3, edge: 0.7 }));
  out.push(brush([[-60, 160], [-56, 236], [-52, 300]], { w: [1.5, 2.5, 3], taper: [0.2, 0], r, wobble: 0.3 }));
  out.push(brush([[58, 100], [60, 200], [62, 290]], { w: [4, 7, 8], taper: [0.2, 0], r, wobble: 0.3 }));
  out.push(brush([[34, 196], [4, 232], [-18, 250]], { w: 2.2, taper: [0.4, 0.4], r, opacity: 0.45 }));
  return out.join('');
}

function face(r) {
  const out = [];
  const F = [[-98, -160], [-118, -104], [-128, -52], [-123, -22], [-131, 14], [-140, 44], [-145, 55], [-139, 63], [-129, 66], [-127, 78], [-129, 88], [-126, 97], [-126, 108], [-120, 121], [-117, 136], [-104, 150], [-78, 159], [-38, 156], [6, 138], [46, 104], [72, 52], [84, -10], [86, -40], [68, -160]];
  out.push(mass(F, { fill: PAPER }));
  // shadow plane: the cheek toward the ear, under the nose, under the lower lip
  out.push(wash([[30, -70], [70, -76], [86, -20], [78, 40], [58, 96], [24, 128], [4, 122], [20, 78], [28, 20], [22, -30]], { opacity: 0.27, edge: 0.5 }));
  out.push(wash([[-136, 64], [-114, 66], [-118, 76], [-134, 76]], { opacity: 0.2, edge: 0 }));
  // profile (lit side, thin and broken) — brow, nose, lips, chin
  out.push(brush(F.slice(1, 11), { w: [2, 3, 2, 2.4, 3, 3.6, 3, 2.6, 2, 2.4], taper: [0.05, 0.1], r, wobble: 0.22, step: 4 }));
  out.push(brush(F.slice(11, 17), { w: [2, 2.4, 2, 2.4, 2.6, 2], taper: [0.2, 0.2], r, wobble: 0.22, step: 4 }));
  // jaw: soft and rounded, a light line lifting off before the ear
  out.push(brush([[-96, 154], [-70, 161], [-36, 158], [6, 140], [44, 108]], { w: [2, 3, 4, 3.5, 1.2], taper: [0.1, 0.45], r, wobble: 0.3 }));
  // the full cheek, a whisper where it rounds into the shade
  out.push(brush([[14, 30], [8, 60], [-2, 86]], { w: [0.5, 2, 0.5], taper: [0.4, 0.4], r, opacity: 0.3 }));
  // brows: a gentle arch, thinning out toward the temple
  out.push(brush([[-90, -34], [-66, -45], [-40, -47], [-16, -40]], { w: [2.4, 4, 3, 0.8], taper: [0.1, 0.5], r, wobble: 0.2 }));
  out.push(brush([[-131, -38], [-118, -37], [-106, -32]], { w: [0.8, 2.4, 3.2], taper: [0.4, 0.1], r }));
  // near eye: a large almond, lid pressed low, iris turned to the gate, lashes flicked out
  out.push(mass([[-84, 1], [-66, -12], [-40, -13], [-18, -4], [-40, 8], [-66, 8]], { fill: PAPER }));
  out.push(mass([[-80, -10], [-60, -11], [-57, 1], [-64, 8], [-75, 7], [-81, 0]], { fill: INK }));
  out.push(dot(-72, -5, 2.6, PAPER, 0.95));
  out.push(brush([[-92, 2], [-80, -6], [-62, -14], [-38, -15], [-18, -7], [-8, -10]], { w: [2, 5, 6.5, 6, 4, 2], taper: [0.1, 0.1], r }));
  out.push(strokes([
    [[-12, -10], [-2, -16], [4, -24]],
    [[-20, -12], [-14, -20], [-12, -28]],
    [[-8, -8], [2, -9], [8, -14]],
  ], { w: [2.6, 1.4, 0.4], taper: [0.1, 0.7], r }));
  out.push(brush([[-76, 11], [-52, 13], [-30, 8]], { w: 1.6, taper: [0.3, 0.3], r, opacity: 0.45 }));
  out.push(brush([[-72, -23], [-44, -26], [-24, -19]], { w: 1.6, taper: [0.3, 0.4], r, opacity: 0.35 }));
  // far eye tucked behind the bridge
  out.push(mass([[-127, -2], [-117, -8], [-109, -3], [-117, 3]], { fill: INK }));
  out.push(brush([[-135, -8], [-123, -10], [-109, -6]], { w: [2, 4, 3], taper: [0.2, 0.3], r }));
  out.push(brush([[-132, -8], [-138, -14], [-144, -17]], { w: [2.6, 1.6, 0.4], taper: [0, 0.6], r }));
  // nose: small, the wing and nostril on the near side, a faint bridge shadow
  out.push(brush([[-110, 40], [-103, 51], [-111, 61], [-124, 64]], { w: [2, 3.4, 3.4, 2], taper: [0.3, 0.3], r }));
  out.push(mass([[-133, 59], [-124, 61], [-125, 66], [-133, 65]], { fill: INK }));
  out.push(brush([[-116, 2], [-112, 30]], { w: 2, taper: [0.4, 0.4], r, opacity: 0.35 }));
  // mouth in ink only: the parting line with a slight bow, a hint of the upper lip, the shadow under the lower
  out.push(brush([[-131, 96], [-120, 98], [-108, 95], [-96, 96], [-84, 99]], { w: [2.4, 3.6, 3, 2, 0.8], taper: [0.1, 0.5], r }));
  out.push(brush([[-130, 87], [-122, 84], [-114, 87], [-104, 89]], { w: [0.6, 1.6, 1.2, 0.4], taper: [0.3, 0.5], r, opacity: 0.45 }));
  out.push(brush([[-120, 113], [-108, 115], [-96, 111]], { w: [1, 2.4, 0.8], taper: [0.3, 0.4], r, opacity: 0.6 }));
  out.push(wash([[-122, 115], [-100, 114], [-104, 124], [-118, 125]], { opacity: 0.2, edge: 0 }));
  return out.join('');
}

function hair(r) {
  const out = [];
  // pixie crop: a dark cap of hair, a heavy fringe swept across the brow, tapered nape
  const crop = [[-128, -40], [-142, -76], [-130, -134], [-84, -180], [-10, -198], [60, -192], [114, -158], [140, -100], [144, -30], [134, 36], [116, 92], [96, 116], [88, 60], [84, 10], [74, -8], [62, 24], [54, -20], [44, -60], [16, -70], [-20, -60], [-52, -58], [-72, -48], [-96, -52], [-112, -40]];
  out.push(sumi(crop, { angle: 30 }));
  // fringe tips and nape wisps: the brush lifting off; a loose strand at the temple
  out.push(strokes([
    [[-90, -80], [-116, -56], [-130, -30]],
    [[-50, -80], [-72, -60], [-80, -42]],
    [[-10, -84], [-30, -68], [-38, -54]],
    [[112, 84], [104, 112], [94, 132]],
    [[60, 0], [62, 24], [56, 40]],
    [[124, 90], [128, 120], [118, 146]],
  ], { w: [6, 3, 1], taper: [0.1, 0.8], r, wobble: 0.35 }));
  out.push(brush([[2, -70], [-4, -52], [-14, -36], [-8, -22]], { w: [4.4, 3, 1.6, 0.3], taper: [0.05, 0.6], r }));
  // paper sheen swept the way the hair lies
  out.push(dry(strokes([
    [[80, -182], [10, -186], [-60, -158], [-116, -96]],
    [[120, -140], [70, -160], [10, -166]],
    [[40, -110], [-20, -104], [-80, -80], [-110, -60]],
  ], { w: 10, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.55 }), -30));
  out.push(strokes([[[112, 20], [118, 70]], [[128, -30], [132, 30]], [[-30, -120], [-70, -96], [-96, -70]]], { w: 2.4, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.45 }));
  return out.join('');
}

function ear(r) {
  const out = [];
  const shape = [[72, -4], [92, -16], [114, -10], [122, 18], [116, 50], [100, 70], [82, 68], [74, 50]];
  out.push(mass(shape, { fill: PAPER }));
  out.push(wash([[78, 20], [98, 30], [102, 60], [82, 64]], { opacity: 0.26, edge: 0 }));
  out.push(brush(shape.slice(0, 7), { w: [2, 4, 5, 5, 5, 4, 3], taper: [0.2, 0.3], r }));
  out.push(brush([[98, 2], [108, 18], [102, 44]], { w: 2.6, taper: [0.3, 0.3], r }));
  out.push(brush([[86, 22], [92, 36]], { w: 2.4, taper: [0.3, 0.3], r, opacity: 0.7 }));
  out.push(ring(90, 78, 8, 2.8));
  return out.join('');
}

function head(r) {
  return place([neck(r), face(r), hair(r), ear(r)].join(''), { origin: HEAD });
}

function collar(r) {
  const out = [];
  // storm collar zipped to the chin, dark, its lining showing at the open V
  const band = [[676, 652], [726, 676], [800, 674], [874, 648], [904, 636], [924, 694], [912, 764], [820, 792], [716, 792], [660, 760], [646, 700]];
  out.push(sumi(band, { fill: INK, base: 0.92, angle: 12 }));
  out.push(mass([[716, 678], [748, 682], [730, 760]], { fill: INDIGO, opacity: 0.9 }));
  out.push(brush([[676, 652], [726, 676], [800, 674], [874, 648], [904, 636]], { w: [3, 4, 5, 5, 4], taper: [0.1, 0.1], r }));
  out.push(brush([[664, 716], [700, 770], [760, 790]], { w: 6, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.45 }));
  out.push(brush([[880, 660], [900, 700], [898, 740]], { w: 5, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.35 }));
  return out.join('');
}

/* Far arm: shoulder → elbow (pointing down, bent sharp) → forearm rising to the fist on the lever. */
const ARM = [[652, 736], [610, 764], [584, 830], [556, 910], [526, 976], [486, 962], [446, 944], [420, 934], [378, 1016], [424, 1036], [474, 1066], [522, 1100], [566, 1124], [602, 1118], [626, 1076], [654, 990], [688, 890], [708, 810], [700, 760]];
const ARM_SHADE = [[708, 810], [688, 890], [654, 990], [626, 1076], [602, 1118], [566, 1124], [522, 1100], [474, 1066], [424, 1036], [378, 1016], [390, 994], [444, 1010], [500, 1040], [556, 1062], [592, 1040], [620, 960], [650, 870], [676, 800]];
const CUFF = [[452, 938], [422, 922], [368, 1022], [398, 1040]];

function farArm(r) {
  const out = [];
  // paper gap so the arm lifts off the torso behind it
  out.push(brush([[700, 836], [688, 890], [654, 990], [626, 1076], [604, 1120]], { w: 22, taper: [0.1, 0.1], fill: PAPER }));
  out.push(mass(ARM, { fill: PAPER }), mass(ARM, { fill: INDIGO, opacity: 0.72 }));
  out.push(mass(ARM_SHADE, { fill: INK, opacity: 0.55 }));
  // oilskin shine: hard paper highlights down the lit top of the arm
  out.push(strokes([
    [[618, 776], [598, 830], [578, 900]],
    [[512, 968], [478, 954], [458, 946]],
  ], { w: [4, 13, 3], taper: [0.3, 0.5], r, wobble: 0.3, fill: PAPER, opacity: 0.88 }));
  // elbow: the crook folds and the point of the elbow
  out.push(strokes([
    [[528, 980], [556, 998], [580, 1000]],
    [[520, 996], [540, 1020], [562, 1030]],
  ], { w: [6, 4, 1], taper: [0.05, 0.6], r }));
  out.push(brush([[586, 1020], [596, 1060], [590, 1096]], { w: [1, 4, 1], taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.55 }));
  // folds bunched at the wrist above the cuff
  out.push(strokes([[[470, 952], [462, 984], [450, 1020]], [[494, 962], [490, 990], [480, 1030]]], { w: [4, 3, 1], taper: [0.1, 0.6], r, opacity: 0.85 }));
  // contours: thin on the lit top, heavy under the upper arm, round the elbow and under the forearm
  out.push(brush([[650, 738], [612, 764], [586, 828], [558, 906], [528, 972]], { w: [2.5, 3.5, 3, 3.5, 2], taper: [0.1, 0.3], r, wobble: 0.3 }));
  out.push(brush([[500, 958], [460, 946], [430, 936]], { w: [1, 3, 2.5], taper: [0.3, 0.2], r }));
  out.push(brush([[708, 806], [688, 890], [654, 990], [626, 1076], [600, 1120], [566, 1126], [520, 1102], [470, 1068], [424, 1040]], { w: [5, 8, 10, 12, 12, 10, 9, 7, 5], taper: [0.1, 0.1], r, wobble: 0.3 }));
  // oilskin cuff: a stiff dark band, flared over the wrist, velcro tab and a lit seam
  out.push(mass(CUFF, { fill: PAPER, sharp: true }), mass(CUFF, { fill: INK, opacity: 0.9, sharp: true }));
  out.push(brush([[450, 942], [422, 996], [400, 1036]], { w: 3, taper: [0.2, 0.2], r, fill: PAPER, opacity: 0.7 }));
  out.push(brush([[430, 930], [410, 968]], { w: 5, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.45 }));
  out.push(mass([[396, 1030], [422, 1040], [414, 1062], [388, 1052]], { fill: INK, sharp: true }));
  out.push(brush([[452, 936], [424, 920], [412, 944], [368, 1024], [398, 1044]], { w: [3, 4, 5, 7, 6], taper: [0.1, 0.1], r, straight: true }));
  return out.join('');
}

/** gripHand from hands.mjs, but with the thumb wrapped round the front of the lever. */
function gripWrapped(r) {
  const out = [];
  const fingers = [-36, -12, 12, 36];
  const front = [];
  fingers.forEach((y, i) => {
    const bulge = i === 0 || i === 3 ? 8 : 12;
    front.push([-bulge + 4, y - 11], [-bulge, y], [-bulge + 4, y + 11]);
  });
  const outline = [[172, -40], [110, -48], [56, -52], [20, -50], ...front, [20, 50], [56, 50], [110, 46], [172, 38]];
  out.push(mass(outline, { fill: PAPER }));
  out.push(wash([[-6, 20], [20, 48], [80, 48], [150, 40], [90, 34], [30, 26]], { opacity: 0.27 }));
  out.push(brush([[174, -40], [110, -48], [56, -52], [20, -50], [0, -47]], { w: [3, 3.5, 3, 2.5, 2], taper: [0.05, 0.1], r }));
  out.push(brush([[2, -47], ...front, [4, 46]], { w: [3, 5, 6, 6, 5], taper: [0.05, 0.05], r, step: 4 }));
  out.push(brush([[2, 46], [20, 51], [56, 51], [110, 47], [174, 38]], { w: [5, 8, 9, 8, 6], taper: [0.05, 0.1], r }));
  out.push(strokes([-24, 0, 24].map((y) => [[-4, y], [22, y + 1], [50, y]]), { w: [3, 2, 0.6], taper: [0.1, 0.5], r }));
  out.push(strokes(fingers.map((y) => [[58, y - 8], [62, y], [58, y + 8]]), { w: 2.2, taper: [0.3, 0.3], r, opacity: 0.55 }));
  // thumb: over the top of the fist, round the lever, its tip pressed on the index finger
  const thumb = [[112, -46], [64, -60], [22, -68], [-10, -64], [-26, -52], [-24, -34], [-10, -30], [-6, -44], [20, -50], [60, -48]];
  out.push(mass(thumb, { fill: PAPER }));
  out.push(brush([[112, -46], [64, -60], [22, -68], [-10, -65], [-27, -52], [-25, -34], [-12, -29]], { w: [2.5, 3.5, 3.5, 4, 5, 4, 2], taper: [0.1, 0.2], r }));
  out.push(brush([[-20, -46], [-14, -38]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.7 }));
  out.push(brush([[8, -52], [2, -44]], { w: 2.2, taper: [0.3, 0.4], r, opacity: 0.6 }));
  return out.join('');
}

function fist(r) {
  return place(gripWrapped(r), { origin: GRIP.bar, angle: GRIP.angle, scale: GRIP.scale });
}

export default crewPlate({
  n: 8,
  title: 'Risk Kapısı',
  seed: 0x0b08,
  detail: { x: 0.446, y: 0.45, zoom: 1.5 },
  railY: RAIL_Y,
  boat: [470, 0.7],
  storm: 'left',
  draw: (r) => ({
    back: [weather(r), rail(r, { y: RAIL_Y, posts: [700, 1010] }), gate(r), lever(r)].join('\n'),
    figure: [oilskin(r), nearArm(r), harness(r), head(r), collar(r), fist(r), farArm(r)].join('\n'),
    front: latchTags(r),
    noRail: true,
  }),
});
