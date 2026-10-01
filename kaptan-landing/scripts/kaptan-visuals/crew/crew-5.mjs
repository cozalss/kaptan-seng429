// Crew No. 05 · Şüpheci — the lookout: a lean man in his thirties with a close-cropped dark
// beard, oilskin hood up, a brass spyglass raised to the far eye, the near eye narrowed, lips
// pressed. He hunts the horizon for what the draft missed (a leak priced in before the
// disclosure, words bigger than the facts); he can shrink or veto a call, never enlarge it.
// One tiny red: the whipped tag at the end of the spyglass lanyard. Style: ./style.mjs, STYLE.md.

import { gripHand } from './hands.mjs';
import { INDIGO, INK, PAPER, RED, brush, crewPlate, dry, mass, place, strokes, sumi, wash } from './style.mjs';

/* ── The spyglass: drawn along +x in a local frame (eyecup at 0), placed at the far eye ─────── */

const SCOPE = { origin: [600, 446], angle: -6 };
const rad = (deg) => (deg * Math.PI) / 180;

/** Local spyglass coordinates → plate. */
function onScope(lx, ly) {
  const a = rad(SCOPE.angle);
  const [ox, oy] = SCOPE.origin;
  return [ox + lx * Math.cos(a) - ly * Math.sin(a), oy + lx * Math.sin(a) + ly * Math.cos(a)];
}

// Sections from the eye outward: [x0, x1, radius, kind]
const SECTIONS = [
  [0, 26, 19, 'cup'],
  [26, 118, 21, 'brass'],
  [118, 128, 25, 'ring'],
  [128, 248, 27, 'brass'],
  [248, 260, 32, 'ring'],
  [260, 364, 33, 'brass'],
  [364, 378, 38, 'ring'],
  [378, 520, 39, 'leather'],
  [520, 556, 43, 'ring'],
];

const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

function section(r, [x0, x1, h, kind]) {
  const out = [];
  const body = rect(x0, x1, -h, h);
  if (kind === 'leather') {
    out.push(sumi(body, { angle: 0, sharp: true, base: 0.94 }));
    // stitched seam and a soft worn sheen along the top (leather: no hard glint)
    const dashes = [];
    for (let x = x0 + 8; x < x1 - 10; x += 16) dashes.push([[x, -h * 0.62], [x + 8, -h * 0.62]]);
    out.push(strokes(dashes, { w: 2.2, taper: [0.2, 0.2], fill: PAPER, opacity: 0.7 }));
    out.push(dry(brush([[x0 + 10, -h * 0.35], [x1 - 14, -h * 0.4]], { w: 9, taper: [0.2, 0.4], r, fill: PAPER, opacity: 0.45 })));
    return out.join('');
  }
  out.push(mass(body, { sharp: true, fill: PAPER }));
  if (kind === 'cup') {
    out.push(mass(body, { sharp: true, fill: INK }));
    out.push(mass(rect(x0 + 4, x1 - 4, -h * 0.62, -h * 0.4), { sharp: true, fill: PAPER, opacity: 0.8 }));
    return out.join('');
  }
  if (kind === 'ring') {
    // a solid ink ring with one hard paper glint on its shoulder
    out.push(mass(body, { sharp: true, fill: INK }));
    out.push(mass(rect(x0 + 2.5, x1 - 2.5, -h * 0.74, -h * 0.5), { sharp: true, fill: PAPER }));
    return out.join('');
  }
  // brass as sumi: a mid ink tone, a dark underside, a hard paper glint up top and a thin
  // reflected light near the bottom edge — metal without leaving the palette
  out.push(mass(body, { sharp: true, fill: INK, opacity: 0.5 }));
  out.push(mass(rect(x0, x1, h * 0.18, h), { sharp: true, fill: INK, opacity: 0.72 }));
  out.push(mass(rect(x0 + 3, x1 - 3, -h * 0.7, -h * 0.34), { sharp: true, fill: PAPER }));
  out.push(mass(rect(x0 + 3, x1 - 3, -h * 0.2, -h * 0.08), { sharp: true, fill: PAPER, opacity: 0.45 }));
  out.push(mass(rect(x0 + 6, x1 - 6, h * 0.64, h * 0.74), { sharp: true, fill: PAPER, opacity: 0.4 }));
  return out.join('');
}

/** A short lanyard hanging free from the middle ring, ending in a red whipped tag (the one red). */
function lanyard(r) {
  const [rx0, rx1, rh] = SECTIONS[4];
  const rx = (rx0 + rx1) / 2;
  const out = [];
  out.push(brush([[rx - 4, rh - 2], [rx - 12, rh + 34], [rx - 2, rh + 72], [rx + 14, rh + 100]], { w: [3.4, 3, 3, 2.6], taper: [0.02, 0.02], r, wobble: 0.25 }));
  const tag = [[rx + 8, rh + 96], [rx + 20, rh + 90], [rx + 32, rh + 112], [rx + 20, rh + 118]];
  out.push(mass(tag, { sharp: true, fill: RED }));
  out.push(strokes([[[rx + 10, rh + 99], [rx + 22, rh + 93]], [[rx + 17, rh + 111], [rx + 29, rh + 105]]], { w: 2, taper: [0, 0], straight: true }));
  out.push(strokes([[[rx + 25, rh + 116], [rx + 30, rh + 130]], [[rx + 29, rh + 114], [rx + 38, rh + 126]]], { w: 1.8, taper: [0.1, 0.7], r }));
  return out.join('');
}

function spyglass(r) {
  const out = SECTIONS.map((s) => section(r, s));
  // ruled contours: top thin (lit), underside heavier; a stroke at every step in the tube
  for (const [x0, x1, h] of SECTIONS) {
    out.push(brush([[x0, -h], [x1, -h]], { w: 2.4, taper: [0, 0], r, wobble: 0.1, straight: true }));
    out.push(brush([[x0, h], [x1, h]], { w: 5, taper: [0, 0], r, wobble: 0.1, straight: true }));
    out.push(brush([[x0, -h], [x0, h]], { w: 3, taper: [0, 0], straight: true }));
  }
  const [lx0, lx1, lh] = SECTIONS[SECTIONS.length - 1];
  // the objective: the lens cell end seen a little from the side, a glint on the glass
  const cap = Array.from({ length: 14 }, (_, i) => [lx1 + Math.cos((i / 14) * Math.PI * 2) * 11, Math.sin((i / 14) * Math.PI * 2) * lh]);
  out.push(mass(cap, { fill: INK }));
  out.push(brush([[lx1 + 2, -lh * 0.6], [lx1 + 6, -lh * 0.2]], { w: 3, taper: [0.3, 0.3], fill: PAPER, opacity: 0.85 }));
  out.push(brush([[lx0, -lh], [lx1, -lh], [lx1, lh], [lx0, lh]], { w: 3, taper: [0, 0], straight: true }));
  out.push(lanyard(r));
  return place(out.join(''), { origin: SCOPE.origin, angle: SCOPE.angle });
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */

const BODY = [[450, 688], [364, 718], [304, 790], [272, 900], [260, 1060], [252, 1260], [248, 1500], [756, 1500], [750, 1260], [742, 1060], [734, 920], [714, 800], [668, 724], [580, 690]];

function jacket(r) {
  const out = [];
  out.push(mass(BODY, { fill: PAPER }));
  out.push(mass(BODY, { fill: INDIGO, opacity: 0.56 }));
  // back and shade side: a second wash, pooled at the edge
  out.push(sumi([[364, 718], [304, 790], [272, 900], [260, 1060], [252, 1260], [248, 1500], [392, 1500], [382, 1260], [370, 1060], [366, 940], [372, 840], [396, 760]], { fill: INDIGO, base: 0.8, angle: 86 }));
  // oilskin shine on the lit front edge, wet streaks
  out.push(strokes([
    [[706, 960], [718, 1100], [724, 1240]],
    [[700, 1300], [708, 1440]],
  ], { w: 12, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.85 }));
  out.push(dry(strokes([
    [[470, 1000], [480, 1220], [488, 1480]],
    [[630, 1060], [636, 1260], [642, 1470]],
    [[320, 920], [316, 1200], [312, 1480]],
  ], { w: 16, taper: [0.3, 0.2], r, fill: INDIGO, opacity: 0.4 }), 88));
  // storm placket, toggles (horn), a fold
  out.push(brush([[610, 900], [624, 1100], [634, 1300], [640, 1500]], { w: 6, taper: [0.1, 0], r, wobble: 0.25 }));
  out.push(brush([[590, 910], [602, 1100], [612, 1300], [616, 1500]], { w: 2.6, taper: [0.1, 0], r, opacity: 0.7 }));
  for (const y of [1140, 1320]) out.push(brush([[622, y], [652, y + 6]], { w: 11, taper: [0.25, 0.25], r }));
  out.push(strokes([[[430, 1250], [452, 1330], [456, 1410]], [[520, 1150], [540, 1210]]], { w: 5, taper: [0.3, 0.5], r, opacity: 0.8 }));
  // contour: heavy down the back where the form turns away, broken and lighter on the lit front
  out.push(brush([[450, 688], [364, 718], [304, 790], [272, 900], [260, 1060], [252, 1260], [248, 1500]], { w: [5, 8, 10, 11, 9, 8, 6], taper: [0.05, 0], r, wobble: 0.25 }));
  out.push(brush([[736, 930], [744, 1060], [752, 1260]], { w: [3, 5, 4], taper: [0.2, 0.3], r, wobble: 0.3 }));
  out.push(brush([[754, 1300], [760, 1500]], { w: 4, taper: [0.3, 0], r }));
  return out.join('');
}

const HOOD = [[616, 330], [604, 268], [562, 222], [488, 196], [404, 204], [334, 246], [296, 318], [284, 410], [292, 510], [318, 600], [360, 668], [420, 716], [520, 736], [620, 722], [676, 690], [664, 640], [626, 626]];

function hood(r) {
  const out = [];
  // the hood up: the plate's dark mass — deep indigo sumi knocked down with ink, a paper sheen
  out.push(sumi(HOOD, { fill: INDIGO, base: 0.95, angle: 72 }));
  out.push(mass(HOOD, { fill: INK, opacity: 0.5 }));
  // wet sheen: one crisp highlight riding the crown, a drier echo lower down the back
  out.push(brush([[356, 272], [410, 228], [486, 212], [540, 222]], { w: [3, 9, 10, 4], taper: [0.35, 0.5], r, fill: PAPER, opacity: 0.72 }));
  out.push(dry(strokes([
    [[318, 420], [326, 340], [356, 292]],
    [[330, 560], [322, 480]],
  ], { w: 12, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.4 }), -30));
  out.push(wash([[330, 300], [390, 240], [470, 222], [420, 300], [380, 420], [340, 470], [314, 400]], { color: PAPER, opacity: 0.12, edge: 2 }));
  // seam from crown to nape, a crease at the back of the neck
  out.push(brush([[500, 200], [420, 260], [370, 380], [360, 520], [390, 640]], { w: [2, 3, 3, 3, 2], taper: [0.2, 0.3], r, fill: PAPER, opacity: 0.3, wobble: 0.3 }));
  out.push(brush([[380, 560], [420, 640], [470, 690]], { w: 6, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.3 }));
  out.push(brush([[616, 330], [604, 268], [562, 222], [488, 196], [404, 204], [334, 246], [296, 318], [284, 410], [292, 510], [318, 600], [360, 668], [420, 716]], { w: [3, 3, 4, 4, 6, 8, 10, 12, 11, 10, 8, 6], taper: [0.05, 0.1], r, wobble: 0.25 }));
  return out.join('');
}

function face(r) {
  const out = [];
  // neck in the hood's shadow
  out.push(mass([[500, 590], [600, 600], [626, 660], [520, 690]], { fill: PAPER }));
  out.push(wash([[500, 594], [600, 604], [620, 650], [520, 672]], { opacity: 0.55 }));
  // face, three-quarter to the right: the profile runs down the right edge (under the scope)
  const outline = [[470, 350], [604, 338], [610, 376], [614, 414], [606, 440], [622, 468], [648, 500], [646, 510], [630, 514], [628, 524], [624, 530], [627, 538], [619, 547], [623, 562], [620, 582], [598, 610], [548, 616], [500, 590], [470, 520], [464, 430]];
  out.push(mass(outline, { fill: PAPER }));
  // light from the right: one shadow wash — under the hood's rim, down the cheek toward the ear
  out.push(wash([[470, 356], [604, 346], [606, 380], [560, 386], [512, 400], [494, 430], [500, 470], [520, 512], [516, 560], [490, 566], [470, 500], [466, 420]], { opacity: 0.28 }));
  out.push(wash([[618, 512], [640, 510], [630, 520]], { opacity: 0.3, edge: 0 }));
  // profile: brow, nose — thin in the light
  out.push(brush([[606, 340], [611, 378], [614, 414], [606, 440], [622, 468], [648, 500], [645, 510], [630, 514]], { w: [2, 3, 4, 4, 3, 4, 4, 3], taper: [0.1, 0.1], r }));
  // near eye narrowed to a slit: heavy upper lid, a glint of iris, the lower lid pushed up
  out.push(brush([[506, 447], [522, 441], [544, 441], [562, 448]], { w: [2, 6, 7, 3], taper: [0.1, 0.35], r, wobble: 0.2 }));
  out.push(mass([[536, 444], [548, 444], [546, 451], [538, 451]], { fill: INK }));
  out.push(brush([[516, 455], [536, 458], [556, 453]], { w: [1.6, 2.6, 1.6], taper: [0.3, 0.3], r, opacity: 0.85 }));
  out.push(strokes([[[522, 466], [540, 470], [556, 466]], [[500, 440], [488, 432]], [[500, 448], [486, 450]], [[502, 456], [490, 464]]], { w: 2.2, taper: [0.2, 0.6], r, opacity: 0.75 }));
  // brow knotted down toward the scope, a crease between the brows
  out.push(brush([[498, 420], [524, 414], [552, 418], [586, 428]], { w: [4, 8, 8, 5], taper: [0.25, 0.45], r, wobble: 0.3 }));
  out.push(brush([[578, 400], [584, 416]], { w: 2.4, taper: [0.3, 0.3], r, opacity: 0.8 }));
  out.push(strokes([[[514, 386], [546, 382]], [[520, 372], [556, 370]]], { w: 2, taper: [0.3, 0.5], r, opacity: 0.45 }));
  // nose wing, cheekbone, nasolabial fold
  out.push(brush([[628, 490], [616, 498], [624, 508]], { w: [2, 4, 3], taper: [0.3, 0.3], r }));
  out.push(brush([[492, 488], [520, 494], [548, 506]], { w: [1.6, 3, 1.6], taper: [0.3, 0.5], r, opacity: 0.7 }));
  out.push(brush([[606, 500], [590, 520], [584, 544]], { w: [2, 3.4, 2], taper: [0.3, 0.4], r, opacity: 0.85 }));
  return out.join('');
}

function beard(r) {
  const out = [];
  // close-cropped beard: a dark band hugging the jaw and chin, the cheek left bare
  const jaw = [[470, 520], [486, 566], [510, 594], [548, 614], [598, 610], [620, 584], [623, 562], [616, 550], [604, 556], [594, 568], [574, 578], [546, 576], [520, 562], [500, 540], [484, 508]];
  out.push(sumi(jaw, { angle: 70, base: 0.8 }));
  // ragged upper edge: short clipped hairs, stubble dots fading up the cheek
  const hairs = [];
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    const x = 488 + t * 104 + (r() - 0.5) * 5;
    const y = 520 + t * 44 + Math.sin(t * Math.PI) * 22;
    hairs.push([[x + 1, y + 7], [x - 2 + r() * 4, y - 3 - r() * 5]]);
  }
  out.push(strokes(hairs, { w: 1.8, taper: [0.2, 0.7], r, opacity: 0.75 }));
  // moustache over the upper lip, the corners drooping past the mouth
  const tache = [[590, 530], [600, 522], [614, 518], [628, 520], [629, 526], [616, 528], [604, 532], [594, 540]];
  out.push(mass(tache, { fill: INK, opacity: 0.88 }));
  // lips pressed: a closed parting line turned down at the corner, a shadow under the lower lip
  out.push(brush([[626, 531], [612, 533], [600, 538], [592, 544]], { w: [2.4, 3.6, 3, 1.6], taper: [0.2, 0.4], r }));
  out.push(brush([[627, 536], [627, 541], [620, 547]], { w: [2, 3, 2], taper: [0.2, 0.2], r }));
  out.push(brush([[604, 546], [614, 548], [620, 547]], { w: 4, taper: [0.4, 0.3], r, opacity: 0.55 }));
  return out.join('');
}

function hoodFront(r) {
  const out = [];
  // the hood's opening: a dark lining rim wrapping the face, rolled soft over the brow
  const rim = [[468, 350], [520, 324], [578, 312], [612, 316], [622, 330], [614, 346], [566, 348], [506, 364], [476, 420], [468, 500], [480, 572], [516, 624], [566, 646], [620, 640], [652, 680], [576, 716], [496, 690], [446, 610], [432, 500], [440, 400], [452, 366]];
  out.push(sumi(rim, { fill: INK, base: 0.92, angle: 80 }));
  // the roll catches the light along its crest
  out.push(brush([[478, 350], [530, 332], [586, 324], [612, 328]], { w: [2, 4, 4, 2], taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.6 }));
  out.push(brush([[454, 430], [452, 520], [470, 600], [512, 648]], { w: 3, taper: [0.2, 0.4], r, fill: PAPER, opacity: 0.35 }));
  // drawcord under the chin, its toggle
  out.push(brush([[626, 644], [640, 690], [644, 732]], { w: 3, taper: [0.05, 0.2], r, wobble: 0.3 }));
  out.push(mass([[638, 728], [650, 728], [652, 750], [636, 750]], { sharp: true, fill: INK }));
  return out.join('');
}

/* ── Arms and hands ─────────────────────────────────────────────────────────────────────────── */

const NEAR_AT = 404; // the near hand cradles the leather barrel from below, thumb along it
const BARREL = 39;
const FAR_GRIP = { at: 176, angle: 92, scale: [0.7, 0.84] }; // fist round the draw tube by the face
const FAR_LIFT = 10;

/** Point on a sleeve: `k` along elbow→wrist (0…1), `s` across (−1…1, +1 on the normal side). */
function arm(elbow, wrist, w0, w1) {
  const [ex, ey] = elbow;
  const [wx, wy] = wrist;
  const len = Math.hypot(wx - ex, wy - ey);
  const nx = -(wy - ey) / len;
  const ny = (wx - ex) / len;
  return (k, s) => {
    const half = (w0 + (w1 - w0) * k) / 2;
    return [ex + (wx - ex) * k + nx * s * half, ey + (wy - ey) * k + ny * s * half];
  };
}

/**
 * An oilskin sleeve: flat indigo, a shade plane down the `under` side (±1), crisp hard paper
 * shine on the other, and a plain turned cuff (a fold line and a darker band — no ribs).
 */
function oilSleeve(r, side, { base, under = 1, cuff = true, strap = false }) {
  const out = [];
  const outline = [side(0, 1), side(0.5, 1.07), side(1, 1), side(1.02, 0), side(1, -1), side(0.5, -1.07), side(0, -1), side(-0.12, 0)];
  out.push(mass(outline, { fill: PAPER }));
  out.push(mass(outline, { fill: INDIGO, opacity: base }));
  const u = under;
  out.push(mass([side(0.02, 0.3 * u), side(0.5, 0.22 * u), side(0.98, 0.36 * u), side(1, u), side(0.5, 1.07 * u), side(0.02, u)], { fill: INK, opacity: 0.32 }));
  out.push(strokes([
    [side(0.14, -0.5 * u), side(0.46, -0.62 * u), side(0.74, -0.56 * u)],
    [side(0.34, -0.22 * u), side(0.56, -0.28 * u)],
  ], { w: [3, 9, 3], taper: [0.35, 0.45], r, fill: PAPER, opacity: 0.85 }));
  if (cuff) {
    out.push(mass([side(0.86, -1), side(1, -1), side(1.02, 0), side(1, 1), side(0.86, 1)], { fill: INK, opacity: 0.28 }));
    out.push(brush([side(0.855, -0.95), side(0.84, 0), side(0.855, 0.95)], { w: [2, 4.5, 3], taper: [0.2, 0.2], r }));
    out.push(brush([side(0.83, -0.8), side(0.82, 0)], { w: 3, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.7 }));
  }
  if (strap) {
    out.push(brush([side(0.925, 0.1), side(0.93, 0.5), side(0.925, 0.92)], { w: 9, taper: [0.1, 0], r, fill: INK, opacity: 0.6 }));
    out.push(brush([side(0.925, 0.62), side(0.927, 0.7)], { w: 5, taper: [0, 0], r, fill: PAPER, opacity: 0.7 }));
  }
  return out.join('');
}

/**
 * The near hand cradling a tube of radius h from below, seen from the thumb side. Local frame =
 * the scope's (tube along +x, centred on y = 0); the wrist drops toward (−24, h + 146).
 */
function cradleHand(r, h) {
  const out = [];
  const palm = [[-50, h - 4], [-57, h + 30], [-52, h + 70], [-40, h + 106], [22, h + 110], [34, h + 72], [50, h + 34], [58, h + 8], [40, h - 6]];
  const thumb = [[18, h + 12], [42, h * 0.56], [72, h * 0.2], [86, h * 0.02], [100, h * 0.12], [99, h * 0.4], [80, h * 0.64], [62, h * 0.92], [46, h + 28]];
  // fingertips curled over the top of the barrel from the far side
  const tips = [-36, -13, 10].map((x, i) => [[x - 11, -h + 12], [x - 10, -h - 2], [x, -h - 9 + i], [x + 10, -h - 2], [x + 11, -h + 12]]);
  for (const t of tips) out.push(mass(t, { fill: PAPER }));
  out.push(strokes(tips, { w: 3.2, taper: [0.15, 0.15], r }));
  out.push(mass(palm, { fill: PAPER }));
  out.push(wash([[-54, h + 16], [-22, h + 24], [-10, h + 70], [-14, h + 106], [-42, h + 106], [-56, h + 60]], { opacity: 0.26 }));
  out.push(mass(thumb, { fill: PAPER }));
  // contours: heel of the hand heavy (turning away), knuckle of the index against the barrel
  out.push(brush([[-44, h - 2], [-57, h + 30], [-52, h + 70], [-40, h + 106]], { w: [4, 7, 7, 5], taper: [0.1, 0.05], r, wobble: 0.25 }));
  out.push(brush([[-48, h - 3], [-14, h + 2], [16, h + 8]], { w: [3, 4, 2], taper: [0.2, 0.4], r }));
  out.push(brush([[22, h + 110], [34, h + 72], [46, h + 42]], { w: [4, 5, 3], taper: [0.05, 0.3], r }));
  // thumb: lit top edge thin, underside heavier, the nail at the tip
  out.push(brush([[20, h + 10], [42, h * 0.54], [70, h * 0.18], [86, h * 0.0], [100, h * 0.12]], { w: [2, 2.6, 3, 3, 3], taper: [0.1, 0.1], r }));
  out.push(brush([[100, h * 0.12], [99, h * 0.4], [80, h * 0.65], [62, h * 0.93], [46, h + 28], [44, h + 46]], { w: [3, 5, 6, 6, 5, 3], taper: [0.05, 0.3], r }));
  out.push(brush([[80, h * 0.14], [89, h * 0.08], [95, h * 0.22]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.7 }));
  out.push(brush([[64, h * 0.5], [70, h * 0.68]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.6 }));
  // palm creases
  out.push(strokes([[[18, h + 36], [2, h + 66], [-8, h + 96]], [[-30, h + 46], [-12, h + 60]]], { w: 2.2, taper: [0.3, 0.4], r, opacity: 0.6 }));
  return out.join('');
}

/** The far fist on the draw tube, and where its wrist lands. */
function farGrip() {
  const { at, angle, scale } = FAR_GRIP;
  const origin = onScope(at, -FAR_LIFT);
  const a = rad(angle);
  return { origin, wrist: [origin[0] + Math.cos(a) * 172 * scale[0], origin[1] + Math.sin(a) * 172 * scale[0]] };
}

const nearWrist = () => onScope(NEAR_AT - 10, BARREL + 104);

function arms(r) {
  const out = [];
  const far = farGrip();
  const nw = nearWrist();
  // far arm: the forearm rising behind the near arm to the draw tube, darker (turned away)
  const farSide = arm([668, 860], [far.wrist[0] - 4, far.wrist[1] + 10], 130, 104);
  out.push(oilSleeve(r, farSide, { base: 0.88, under: 1 }));
  // near arm: upper arm across the chest (underside = +1), forearm up to the barrel
  const upper = arm([456, 800], [770, 918], 168, 146);
  const fore = arm([752, 918], [nw[0] - 6, nw[1] + 6], 146, 112);
  // the forearm first: the upper arm laps over its root, its rounded end is the point of the elbow
  out.push(oilSleeve(r, fore, { base: 0.62, under: 1, strap: true }));
  out.push(oilSleeve(r, upper, { base: 0.66, under: 1, cuff: false }));
  // elbow: the sleeve bunches in the crook where the forearm folds up out of the upper arm
  out.push(strokes([
    [upper(0.8, -1.02), upper(0.84, -0.6), upper(0.8, -0.2)],
    [upper(0.9, -0.98), upper(0.95, -0.55), upper(0.93, -0.1)],
  ], { w: [2, 5, 2], taper: [0.25, 0.4], r }));
  out.push(brush([upper(0.88, -0.2), upper(0.96, 0.3), upper(0.99, 0.75)], { w: [2, 4, 2], taper: [0.3, 0.4], r, opacity: 0.7 }));
  // armpit: drag folds pulling from under the arm toward the elbow
  out.push(strokes([
    [upper(0.04, 0.95), upper(0.18, 0.55), upper(0.4, 0.4)],
    [upper(0.1, 1.02), upper(0.3, 0.8), upper(0.5, 0.72)],
  ], { w: [2, 5, 1.6], taper: [0.2, 0.5], r, opacity: 0.85 }));
  // contours: thick underside of the arm (turned from the light), broken at the elbow; thin top
  out.push(brush([upper(0, 1.02), upper(0.4, 1.07), upper(0.8, 1.03), upper(1.02, 0.95), fore(0.1, 1.02)], { w: [6, 10, 12, 12, 10], taper: [0.1, 0.1], r, wobble: 0.25 }));
  out.push(brush([fore(0.18, 1.04), fore(0.5, 1.07), fore(0.9, 1.01)], { w: [10, 7, 3.5], taper: [0.05, 0.4], r, wobble: 0.3 }));
  out.push(brush([upper(0.08, -1), upper(0.5, -1.06), upper(0.85, -1.02)], { w: [2, 4, 3], taper: [0.2, 0.4], r, wobble: 0.3 }));
  out.push(brush([fore(0.2, -1.03), fore(0.6, -1.06), fore(0.9, -1.0)], { w: [3, 3.5, 2.5], taper: [0.3, 0.3], r, wobble: 0.3 }));
  out.push(brush([farSide(0.35, 1.05), farSide(0.7, 1.06), farSide(0.95, 1)], { w: [8, 7, 4], taper: [0.2, 0.3], r, wobble: 0.3 }));
  return out.join('');
}

function hands(r) {
  const far = farGrip();
  const shade = wash([[-8, 20], [40, 50], [120, 50], [168, 40], [168, 10], [100, 20], [30, 10]], { opacity: 0.22 });
  return [
    place(gripHand(r) + shade, { origin: far.origin, angle: FAR_GRIP.angle, scale: FAR_GRIP.scale }),
    place(cradleHand(r, BARREL), { origin: onScope(NEAR_AT, 0), angle: SCOPE.angle }),
  ].join('');
}

export default crewPlate({
  n: 5,
  title: 'Şüpheci',
  seed: 0x0b05,
  detail: { x: 0.62, y: 0.34, zoom: 1.4 },
  railY: 1250,
  boat: [1010, 0.7],
  storm: 'right',
  draw: (r) => ({
    figure: [jacket(r), hood(r), face(r), beard(r), hoodFront(r), arms(r)].join('\n'),
    front: [spyglass(r), hands(r)].join('\n'),
  }),
});
