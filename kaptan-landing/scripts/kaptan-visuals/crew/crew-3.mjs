// Crew No. 03 · Önemlilik — the weigher: a heavy-set sailor, shaved head under a dark knit band,
// an open black oilskin waistcoat over a work shirt, steadying a cargo sack that hangs from a
// spring scale (kantar) on the boom. He reads the dial calmly; he weighs, he does not set the
// mark. The needle's tip is the plate's only red. Light from the right (the side he faces).
// Style: ./style.mjs, STYLE.md.

import { SANS } from '../kit.mjs';
import { INDIGO, INK, PAPER, RED, brush, crewPlate, curve, dry, mass, place, poly, rough, sleeve, stipple, strokes, sumi } from './style.mjs';

const SHEET = '#FBFAF6';

/* ── Local helpers ──────────────────────────────────────────────────────────────────────────── */

/** A contour with more pressure change than the default, plus an optional pooled ink drop at the start. */
function ink(r, pts, { w = 5, pool = 0, ...o } = {}) {
  const out = [brush(pts, { w, r, wobble: 0.3, taper: [0.12, 0.3], ...o })];
  if (pool) {
    const [x, y] = pts[0];
    out.push(mass([[x - pool, y - pool * 0.6], [x + pool * 0.8, y - pool * 0.8], [x + pool, y + pool * 0.5], [x - pool * 0.4, y + pool]], { fill: o.fill ?? INK, opacity: o.opacity }));
  }
  return out.join('');
}

/**
 * A flat wash laid exactly on its shape (no bleed displacement, so it registers with the ink
 * contours drawn over it — the rough filter on the figure moves both together). A faint pooled
 * rim keeps it watercolour rather than vector.
 */
function tint(pts, { opacity = 0.27, edge = 0.45, sharp = false, color = INDIGO } = {}) {
  const d = sharp ? poly(pts) : curve(pts);
  const rim = edge ? ` stroke="${color}" stroke-opacity="${(opacity * edge).toFixed(3)}" stroke-width="2.2" stroke-linejoin="round"` : '';
  return `<path d="${d}" fill="${color}" fill-opacity="${opacity}"${rim}/>`;
}

const circle = (cx, cy, rad, n = 28) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rad, cy + Math.sin((i / n) * Math.PI * 2) * rad]);
const arc = (cx, cy, rad, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
});

/* ── The kantar: spring scale, local frame with the hanging ring at (0, 0) ──────────────────── */

const SCALE_AT = { origin: [912, 222], angle: 3 }; // swings a little with the roll
const DIAL = { cy: 196, R: 140, face: 120 };
const READING = 34; // where the needle sits (0–100 round the dial); no threshold is marked

function dial(r) {
  const out = [];
  const { cy, R, face } = DIAL;
  // top: ring, shackle neck (ink, one glint each)
  out.push(`<circle cx="0" cy="0" r="19" fill="none" stroke="${INK}" stroke-width="7.5"/>`);
  out.push(brush(arc(0, 0, 19, -70, -10, 5), { w: 2.4, taper: [0.3, 0.3], fill: PAPER, opacity: 0.9 }));
  out.push(mass([[-15, cy - R + 4], [15, cy - R + 4], [10, 22], [-10, 22]], { sharp: true, fill: INK }));
  out.push(brush([[6, 28], [8, cy - R + 2]], { w: 2.6, taper: [0.2, 0.3], fill: PAPER, opacity: 0.85, straight: true }));
  // housing: solid ink ring with crisp paper glints on the lit (right, upper) side
  out.push(mass(circle(0, cy, R, 40), { fill: INK }));
  out.push(brush(arc(0, cy, R, -60, 300, 36), { w: [4, 3, 3, 4, 6, 8, 10, 11, 10, 8, 6, 5, 4], taper: [0.02, 0.02], r, wobble: 0.2, step: 5 }));
  out.push(brush(arc(0, cy, R - 8, -78, -18, 10), { w: 6, taper: [0.25, 0.45], r, wobble: 0.1, fill: PAPER }));
  out.push(brush(arc(0, cy, R - 8, -6, 14, 4), { w: 3.4, taper: [0.3, 0.3], fill: PAPER }));
  out.push(brush(arc(0, cy, R - 9, 128, 158, 5), { w: 2.6, taper: [0.3, 0.3], fill: PAPER, opacity: 0.8 }));
  out.push(brush(arc(0, cy, face + 5, -40, 40, 10), { w: 1.8, taper: [0.3, 0.3], fill: PAPER, opacity: 0.75 }));
  // face: bright sheet, the bezel's crisp shadow crescent top-left
  out.push(mass(circle(0, cy, face, 40), { fill: SHEET }));
  out.push(tint(arc(0, cy, face, 150, 300, 16).concat(arc(-7, cy + 8, face - 8, 290, 160, 16)), { opacity: 0.2, edge: 0 }));
  // ticks: 50 minor, 10 major, 0 at the top, clockwise
  const minor = [];
  const major = [];
  for (let i = 0; i < 50; i += 1) {
    const a = ((i / 50) * 360 - 90) * (Math.PI / 180);
    const big = i % 5 === 0;
    const r0 = face - 7;
    const r1 = big ? face - 30 : face - 18;
    (big ? major : minor).push([[Math.cos(a) * r0, cy + Math.sin(a) * r0], [Math.cos(a) * r1, cy + Math.sin(a) * r1]]);
  }
  out.push(strokes(minor, { w: 2.2, taper: [0, 0], straight: true }));
  out.push(strokes(major, { w: 4.6, taper: [0, 0.1], straight: true }));
  [0, 20, 40, 60, 80].forEach((v) => {
    const a = ((v / 100) * 360 - 90) * (Math.PI / 180);
    const rad = face - 56;
    out.push(`<text x="${(Math.cos(a) * rad).toFixed(1)}" y="${(cy + Math.sin(a) * rad + 10).toFixed(1)}" font-family="${SANS}" font-size="29" font-weight="600" text-anchor="middle" fill="${INK}">${v}</text>`);
  });
  out.push(`<text x="0" y="${cy + 50}" font-family="${SANS}" font-size="17" font-weight="600" letter-spacing="1" text-anchor="middle" fill="${INK}" fill-opacity="0.7">%</text>`);
  // needle: ink blade, the last stretch of the tip in red (the one accent)
  const a = ((READING / 100) * 360 - 90) * (Math.PI / 180);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const at = (d, s) => [ux * d - uy * s, cy + uy * d + ux * s];
  out.push(mass([at(-30, -7), at(84, -3.2), at(84, 3.2), at(-30, 7)], { sharp: true, fill: INK }));
  out.push(mass([at(84, -3.2), at(108, 0), at(84, 3.2)], { sharp: true, fill: RED }));
  out.push(mass(circle(0, cy, 13, 14), { fill: INK }));
  out.push(mass(circle(3, cy - 3, 3.4, 8), { fill: PAPER }));
  // under the housing: stem, hook eye, the hook (each with a sharp glint on the lit side)
  out.push(mass([[-12, cy + R - 4], [12, cy + R - 4], [8, cy + R + 40], [-8, cy + R + 40]], { sharp: true, fill: INK }));
  out.push(brush([[6, cy + R + 2], [4, cy + R + 36]], { w: 2.4, taper: [0.2, 0.3], fill: PAPER, opacity: 0.85, straight: true }));
  const eye = cy + R + 50;
  out.push(`<circle cx="0" cy="${eye}" r="11" fill="none" stroke="${INK}" stroke-width="6"/>`);
  out.push(brush([[0, eye + 10], [3, eye + 50], [-4, eye + 82], [-28, eye + 90], [-42, eye + 72], [-38, eye + 54]], { w: [9, 10, 10, 9, 7, 5], taper: [0, 0.35], r, wobble: 0.1 }));
  out.push(brush([[4, eye + 20], [5, eye + 52], [0, eye + 74]], { w: 2.2, taper: [0.3, 0.4], fill: PAPER, opacity: 0.85 }));
  return out.join('');
}

const HOOK_Y = DIAL.cy + DIAL.R + 50 + 88; // bottom of the hook's bend

function sack(r) {
  const out = [];
  const y0 = HOOK_Y + 14;
  // a lumpy grain sack: narrow at the tie, slumped and two-lobed where the weight sits
  const body = [[-30, y0], [-72, y0 + 40], [-120, y0 + 120], [-150, y0 + 220], [-174, y0 + 306], [-172, y0 + 356], [-132, y0 + 390], [-64, y0 + 402], [4, y0 + 394], [74, y0 + 404], [134, y0 + 386], [164, y0 + 342], [160, y0 + 252], [132, y0 + 142], [80, y0 + 50], [20, y0]];
  out.push(mass(body, { fill: PAPER }));
  out.push(mass(body, { fill: INDIGO, opacity: 0.2 }));
  // burlap: dry streaks down the cloth, the shade side (left) in a flat wash inset from the contour
  out.push(dry(mass(body, { fill: INDIGO, opacity: 0.24 }), 86));
  out.push(tint([[-36, y0 + 34], [-104, y0 + 116], [-150, y0 + 226], [-164, y0 + 310], [-160, y0 + 352], [-126, y0 + 382], [-64, y0 + 392], [-40, y0 + 384], [-70, y0 + 300], [-78, y0 + 170]], { opacity: 0.3 }));
  // hard paper light down the lit (right) belly
  out.push(dry(brush([[90, y0 + 90], [132, y0 + 190], [146, y0 + 300]], { w: 18, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.55 }), 86));
  // two grain-sack stripes round the belly (they follow the bulge)
  for (const [dy, w] of [[222, 12], [248, 6]]) {
    out.push(brush([[-170, y0 + dy - 14], [-90, y0 + dy + 6], [0, y0 + dy + 12], [90, y0 + dy + 6], [160, y0 + dy - 12]], { w, taper: [0.03, 0.03], r, wobble: 0.3, opacity: 0.85 }));
  }
  // pull folds from the tied neck, a crease where the lobes meet
  out.push(strokes([
    [[-26, y0 + 12], [-66, y0 + 76], [-104, y0 + 150]],
    [[-8, y0 + 16], [-18, y0 + 84], [-30, y0 + 160]],
    [[14, y0 + 14], [42, y0 + 74], [76, y0 + 130]],
  ], { w: 3.6, taper: [0.2, 0.6], r, wobble: 0.3, opacity: 0.8 }));
  out.push(strokes([[[4, y0 + 394], [0, y0 + 350], [-10, y0 + 300]], [[-140, y0 + 300], [-100, y0 + 330]]], { w: 3.4, taper: [0.1, 0.6], r, opacity: 0.6 }));
  // contour: thin in the light, heavy where the weight sits
  out.push(ink(r, [[-30, y0 + 2], [-72, y0 + 40], [-120, y0 + 120], [-150, y0 + 220], [-174, y0 + 306], [-172, y0 + 356], [-132, y0 + 390], [-64, y0 + 402], [4, y0 + 394], [74, y0 + 404], [134, y0 + 386]], { w: [3, 4, 6, 8, 10, 11, 12, 11, 9, 10, 8], taper: [0.05, 0.1], pool: 5 }));
  out.push(ink(r, [[130, y0 + 388], [164, y0 + 342], [160, y0 + 252], [150, y0 + 200]], { w: [7, 5, 3.4, 2.4], taper: [0.05, 0.4] }));
  out.push(ink(r, [[126, y0 + 130], [80, y0 + 50], [18, y0 + 2]], { w: [2.6, 2.4, 2], taper: [0.4, 0.3] }));
  // gathered burlap ears above the tie, the tie itself over the hook
  const ears = [[-44, y0 - 4], [-74, y0 - 46], [-46, y0 - 34], [-30, y0 - 66], [-12, y0 - 30], [8, y0 - 60], [18, y0 - 22], [44, y0 - 44], [22, y0 + 2]];
  out.push(mass(ears, { fill: PAPER, sharp: true }));
  out.push(mass(ears, { fill: INDIGO, opacity: 0.22, sharp: true }));
  out.push(ink(r, ears, { w: 3, taper: [0.1, 0.1], straight: true }));
  out.push(brush([[-44, y0 - 2], [-6, y0 + 8], [26, y0 - 2]], { w: 12, taper: [0.1, 0.1], r, wobble: 0.2 }));
  out.push(brush([[-20, y0 - 4], [-26, y0 - 26], [-24, HOOK_Y - 6]], { w: 5, taper: [0.1, 0.1], r }));
  out.push(brush([[8, y0 + 2], [22, y0 + 26], [16, y0 + 50]], { w: 4, taper: [0.1, 0.6], r }));
  // rain running off the sack's belly: a few drops falling
  for (const [x, y, k] of [[-40, y0 + 420, 1], [60, y0 + 436, 0.8], [-6, y0 + 470, 0.6]]) {
    out.push(mass([[x, y - 12 * k], [x + 5 * k, y], [x, y + 5 * k], [x - 5 * k, y]], { fill: INDIGO, opacity: 0.7 }));
  }
  return out.join('');
}

/** Boom overhead and the lashing the scale hangs from (crisp, touches the canvas edge: never filtered). */
function rigging(r) {
  const out = [];
  out.push(dry(brush([[1240, 96], [1000, 118], [780, 138]], { w: [30, 28, 24], taper: [0, 0.08], r, wobble: 0.12 }), 3, true));
  out.push(brush([[1240, 96], [1000, 118], [780, 138]], { w: [30, 28, 24], taper: [0, 0.08], r, wobble: 0.12, opacity: 0.8 }));
  out.push(brush([[1230, 88], [1000, 108], [800, 128]], { w: 4, taper: [0.05, 0.3], fill: PAPER, opacity: 0.5 }));
  const [ox, oy] = SCALE_AT.origin;
  // lashing wraps and the short strop down to the ring
  out.push(strokes([[[ox - 22, 108], [ox - 12, 146]], [[ox - 8, 106], [ox + 2, 144]], [[ox + 6, 104], [ox + 16, 142]]], { w: 5, taper: [0.1, 0.1], r, fill: PAPER, opacity: 0.85 }));
  out.push(brush([[ox - 4, 140], [ox - 2, 180], [ox, oy - 18]], { w: 7, taper: [0, 0], r, wobble: 0.2 }));
  return out.join('');
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */

const BODY = [[410, 660], [300, 708], [222, 766], [184, 840], [170, 960], [164, 1100], [160, 1300], [162, 1500], [812, 1500], [806, 1300], [798, 1100], [790, 940], [772, 830], [740, 762], [700, 716], [560, 724]];
const SHIRT = 0.3; // the work shirt: a light flat indigo wash
const FAR_HEM = [762, 936];
const FAR_ELBOW = [740, 1196];
const FAR_WRIST = [842, 1090];

/** The rolled shirt-sleeve: a band wrapped round the arm at `c`, `hw` half-width, axis angle `deg`. */
function roll(r, [cx, cy], hw, deg, { t = 34, sag = 10 } = {}) {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a); // across the arm
  const vx = -uy;
  const vy = ux; // down the arm
  const P = (s, v, bow = 0) => [cx + ux * s * hw + vx * (v + bow), cy + uy * s * hw + vy * (v + bow)];
  const bow = (s) => sag * (1 - s * s);
  const top = [-1, -0.5, 0, 0.5, 1].map((s) => P(s, -t / 2, bow(s)));
  const bot = [1, 0.5, 0, -0.5, -1].map((s) => P(s * 1.03, t / 2, bow(s) * 1.3));
  const out = [];
  out.push(mass([...top, ...bot], { fill: PAPER }));
  out.push(mass([...top, ...bot], { fill: INDIGO, opacity: SHIRT + 0.12 }));
  out.push(ink(r, bot.slice().reverse(), { w: [5, 8, 9, 7, 4], taper: [0.1, 0.1] }));
  out.push(ink(r, top.slice(0, 3), { w: [5, 4, 2.4], taper: [0.1, 0.4] }));
  out.push(brush([-0.85, -0.3, 0.3, 0.85].map((s) => P(s, 2, bow(s) * 1.1)), { w: 3.2, taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.8 }));
  return out.join('');
}

/**
 * A bare forearm, elbow → wrist: fuller over the muscle near the elbow, narrowing to the wrist
 * bones; a flat shade wash down the side turned from the light (`shade` ±1), a heavy contour on
 * that side and a broken hairline on the lit one.
 */
function forearm(r, elbow, wrist, { w0 = 120, w1 = 78, shade = -1, hairs = 5, bulge = 1.14 } = {}) {
  const out = [];
  const [ex, ey] = elbow;
  const [wx, wy] = wrist;
  const len = Math.hypot(wx - ex, wy - ey);
  const nx = -(wy - ey) / len;
  const ny = (wx - ex) / len;
  const width = (k) => w0 + (w1 - w0) * k;
  const P = (k, s) => [ex + (wx - ex) * k + nx * s * (width(k) / 2), ey + (wy - ey) * k + ny * s * (width(k) / 2)];
  const sh = shade;
  const lit = -shade;
  // muscle swells on the shade side near the elbow, the lit side is flatter; the elbow rounds off
  const skin = [P(-0.06, sh * 0.6), P(0.02, sh * 1.0), P(0.28, sh * bulge), P(0.62, sh * 1.02), P(0.9, sh * 0.96), P(1.01, sh * 1.0), P(1.04, 0), P(1.01, lit * 1.0), P(0.7, lit * 1.0), P(0.35, lit * 1.06), P(0.04, lit * 1.0), P(-0.07, lit * 0.5), P(-0.1, 0)];
  out.push(mass(skin, { fill: PAPER }));
  out.push(tint([P(0.02, sh * 0.94), P(0.28, sh * (bulge - 0.06)), P(0.62, sh * 0.96), P(0.98, sh * 0.9), P(0.96, sh * 0.35), P(0.6, sh * 0.3), P(0.3, sh * 0.42), P(0.06, sh * 0.5)], { opacity: 0.27 }));
  out.push(ink(r, [P(-0.04, sh * 0.92), P(0.28, sh * bulge), P(0.62, sh * 1.02), P(0.9, sh * 0.96), P(1.01, sh * 1.0)], { w: [7, 11, 9, 7, 5], taper: [0.12, 0.12] }));
  out.push(ink(r, [P(0.05, lit * 1.0), P(0.35, lit * 1.06), P(0.52, lit * 1.04)], { w: [3.6, 3, 2.2], taper: [0.2, 0.5] }));
  out.push(ink(r, [P(0.7, lit * 1.0), P(0.86, lit * 1.0), P(1.0, lit * 1.0)], { w: [2, 3, 3.4], taper: [0.5, 0.1] }));
  // the elbow end: the contour wraps round it, heavy where it turns under
  out.push(ink(r, [P(0.06, lit * 1.0), P(-0.06, lit * 0.55), P(-0.1, 0), P(-0.06, sh * 0.6), P(0.04, sh * 0.98)], { w: [2.4, 4, 7, 9, 8], taper: [0.3, 0.1] }));
  // the wrist bone on the little-finger side
  out.push(ink(r, [P(0.9, sh * 0.72), P(0.95, sh * 0.5), P(0.99, sh * 0.62)], { w: [1.6, 3, 1.6], taper: [0.3, 0.3], opacity: 0.6 }));
  const hs = [];
  for (let i = 0; i < hairs; i += 1) {
    const k = 0.3 + (i / hairs) * 0.55;
    const s = -0.15 + ((i * 37) % 7) / 10;
    const [x, y] = P(k, s);
    hs.push([[x, y], [x + ((wx - ex) / len) * 11 + nx * 3, y + ((wy - ey) / len) * 11 + ny * 3]]);
  }
  out.push(strokes(hs, { w: 1.6, taper: [0.2, 0.6], r, opacity: 0.4 }));
  return out.join('');
}

function torso(r) {
  const out = [];
  // far arm behind the body: the shirt-sleeved upper arm hangs down the right flank to the elbow
  // the shirt: a light flat wash
  out.push(mass(BODY, { fill: PAPER }));
  out.push(mass(BODY, { fill: INDIGO, opacity: SHIRT }));
  // shirt placket, buttons, strain folds round them (ink: the shirt is light now)
  out.push(brush([[562, 760], [566, 1000], [572, 1240], [574, 1500]], { w: 3, taper: [0.1, 0], r, opacity: 0.75 }));
  for (const y of [870, 1010, 1150, 1290, 1420]) out.push(mass(circle(570 + (y - 870) * 0.02, y, 6, 8), { fill: INK, opacity: 0.85 }));
  out.push(strokes([
    [[576, 1148], [600, 1128], [616, 1100]],
    [[578, 1290], [604, 1274], [620, 1244]],
    [[578, 1010], [600, 990], [612, 960]],
  ], { w: [2, 3.4, 1.6], taper: [0.2, 0.6], r, opacity: 0.7 }));
  // the vest's cast shadow on the shirt, along the near front edge
  out.push(tint([[520, 850], [548, 860], [540, 1000], [548, 1200], [552, 1500], [516, 1500], [520, 1300], [506, 1100]], { opacity: 0.26, edge: 0 }));

  // the waistcoat: black oilskin, open, worn over the shoulders (the one dark mass of the plate)
  const near = [[436, 722], [380, 700], [300, 712], [262, 760], [244, 860], [236, 1000], [232, 1200], [230, 1500], [516, 1500], [520, 1380], [512, 1220], [504, 1080], [512, 972], [544, 846], [530, 800], [480, 756]];
  const far = [[628, 764], [664, 744], [704, 740], [744, 770], [772, 832], [790, 940], [798, 1100], [806, 1300], [812, 1500], [628, 1500], [636, 1380], [630, 1220], [620, 1060], [614, 944], [618, 840]];
  out.push(sumi(near, { angle: 84, base: 0.93 }));
  out.push(sumi(far, { angle: 84, base: 0.9 }));
  // near lapel: the facing folds back, a dark indigo strip with its roll line
  const lapel = [[532, 804], [548, 834], [516, 972], [498, 944], [506, 880]];
  out.push(mass(lapel, { fill: PAPER }));
  out.push(mass(lapel, { fill: INDIGO, opacity: 0.8 }));
  out.push(ink(r, [[530, 806], [506, 880], [496, 944]], { w: [5, 6, 4], taper: [0.1, 0.3] }));
  out.push(brush([[546, 836], [530, 900], [516, 968]], { w: 2.6, taper: [0.2, 0.3], r, fill: PAPER, opacity: 0.7 }));
  // far front edge catches the light: a hard paper line, then the lit side of the panel
  out.push(brush([[626, 770], [616, 860], [614, 960], [624, 1080], [632, 1240], [636, 1400]], { w: [3.6, 3.2, 2.6, 2.4, 2, 1.6], taper: [0.1, 0.4], r, fill: PAPER, opacity: 0.85 }));
  out.push(dry(strokes([[[738, 800], [764, 900], [776, 1060], [784, 1220]], [[700, 880], [714, 1020], [720, 1180]]], { w: [16, 10], taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.5 }), 84));
  // decisive folds and a pocket welt on the near panel
  out.push(strokes([[[300, 850], [352, 896], [404, 980]], [[292, 950], [330, 1010], [352, 1080]]], { w: [4, 2], taper: [0.2, 0.6], r, fill: PAPER, opacity: 0.4 }));
  out.push(brush([[318, 1112], [380, 1106], [446, 1112]], { w: 4, taper: [0.05, 0.05], r, fill: PAPER, opacity: 0.6, straight: true }));
  // far contour: lit, thin, broken
  out.push(ink(r, [[708, 740], [744, 768], [772, 830], [786, 900]], { w: [3, 3.4, 2.6, 2], taper: [0.1, 0.4] }));
  out.push(ink(r, [[792, 980], [798, 1100], [804, 1200]], { w: [2, 2.8, 2.4], taper: [0.4, 0.3] }));
  return out.join('');
}

function collar(r) {
  const out = [];
  // open shirt collar round the thick neck (same light wash as the shirt, a darker underside)
  const near = [[396, 610], [446, 646], [516, 694], [598, 746], [548, 818], [490, 772], [420, 726], [364, 684], [372, 634]];
  const far = [[690, 632], [718, 690], [716, 790], [664, 762], [606, 750], [656, 700]];
  for (const c of [near, far]) {
    out.push(mass(c, { fill: PAPER, sharp: true }));
    out.push(mass(c, { fill: INDIGO, opacity: SHIRT + 0.04, sharp: true }));
  }
  out.push(ink(r, [[372, 634], [364, 684], [420, 726], [490, 772], [548, 818], [598, 748]], { w: [5, 9, 8, 6, 4, 3], taper: [0.1, 0.2], straight: true }));
  out.push(ink(r, [[396, 612], [446, 648], [516, 694], [596, 746]], { w: [3.4, 3, 3, 2], taper: [0.1, 0.2] }));
  out.push(ink(r, [[690, 632], [718, 690], [716, 790], [664, 762], [606, 752]], { w: [2, 3.4, 3, 3, 2.4], taper: [0.1, 0.2], straight: true }));
  out.push(ink(r, [[690, 634], [656, 700], [606, 750]], { w: 2.4, taper: [0.1, 0.2], opacity: 0.8 }));
  // the V of skin between, in the shadow of the chin, a few chest hairs
  out.push(mass([[596, 748], [656, 700], [640, 740], [606, 760]], { fill: PAPER }));
  out.push(tint([[598, 748], [652, 704], [636, 728], [604, 752]], { opacity: 0.27, edge: 0 }));
  out.push(strokes([[[620, 734], [626, 744]], [[632, 722], [638, 732]]], { w: 2, taper: [0.3, 0.3], r, opacity: 0.6 }));
  return out.join('');
}

function neck(r) {
  const out = [];
  const shape = [[400, 480], [470, 560], [560, 622], [640, 624], [670, 660], [700, 724], [610, 750], [500, 752], [330, 722], [376, 660], [398, 590]];
  out.push(mass(shape, { fill: PAPER }));
  // one shadow: under the jaw (cast by the chin) running round the shade side of the neck
  out.push(tint([[462, 560], [520, 612], [580, 634], [636, 630], [676, 612], [690, 640], [668, 666], [620, 676], [566, 670], [512, 668], [470, 690], [420, 716], [344, 716], [382, 652], [402, 586]], { opacity: 0.3 }));
  // the collar's cast shadow on the neck, a band just above its edge
  out.push(tint([[400, 596], [452, 630], [522, 676], [602, 726], [606, 746], [516, 694], [446, 646], [396, 612]], { opacity: 0.32, edge: 0 }));
  out.push(tint([[682, 646], [650, 704], [612, 742], [604, 750], [656, 700], [690, 634]], { opacity: 0.3, edge: 0 }));
  // the roll of flesh at the nape
  out.push(ink(r, [[392, 536], [414, 546], [436, 544]], { w: [2, 4, 2], taper: [0.3, 0.3], opacity: 0.7 }));
  out.push(ink(r, [[388, 562], [408, 572], [426, 570]], { w: [1.6, 3, 1.6], taper: [0.3, 0.3], opacity: 0.45 }));
  // contours: shade side heavy, the lit throat thin
  out.push(ink(r, [[414, 520], [402, 590], [380, 656], [336, 704], [300, 720]], { w: [5, 9, 11, 9, 6], taper: [0.2, 0.1] }));
  out.push(ink(r, [[644, 630], [668, 668], [690, 722]], { w: [2.6, 3.4, 2], taper: [0.3, 0.4] }));
  // tendon from behind the ear to the collarbone notch, the Adam's apple
  out.push(ink(r, [[486, 596], [532, 652], [584, 722]], { w: [1.6, 4, 2], taper: [0.3, 0.4], opacity: 0.9 }));
  out.push(ink(r, [[598, 668], [614, 682], [612, 702]], { w: [1.6, 4.4, 1.6], taper: [0.3, 0.3] }));
  out.push(ink(r, [[616, 704], [622, 720]], { w: 2, taper: [0.3, 0.4], opacity: 0.5 }));
  return out.join('');
}

function head(r) {
  const out = [];
  // skull + face in 3/4 toward the scale (right); the nose breaks the far cheek line
  const face = [[505, 208], [572, 222], [622, 254], [652, 300], [668, 352], [684, 372], [686, 396], [700, 436], [716, 470], [712, 483], [696, 490], [692, 508], [698, 520], [690, 532], [694, 542], [684, 554], [690, 580], [674, 604], [632, 622], [580, 628], [526, 614], [488, 580], [466, 528], [414, 522], [384, 490], [356, 430], [352, 350], [372, 280], [425, 230]];
  out.push(mass(face, { fill: PAPER }));
  // the one face wash: back of the skull, the ear, the cheek plane down to the jaw
  out.push(tint([[378, 282], [418, 240], [462, 228], [448, 290], [452, 372], [486, 420], [534, 440], [556, 486], [566, 548], [552, 596], [522, 604], [490, 574], [466, 526], [414, 520], [384, 488], [360, 432], [356, 350]], { opacity: 0.29 }));
  out.push(tint([[664, 494], [690, 492], [688, 506], [668, 506]], { opacity: 0.29, edge: 0 }));
  // stubble on the scalp and jaw (a few dots, not a texture)
  out.push(stipple(520, 250, 100, 26, 16, r, { size: [0.8, 1.3], opacity: 0.2 }));
  out.push(stipple(610, 590, 62, 18, 22, r, { size: [0.8, 1.4], opacity: 0.3, angle: -0.25 }));
  // contour: back of the skull heavy, the crown and forehead broken open in the light
  out.push(ink(r, [[436, 226], [372, 280], [352, 350], [356, 430], [384, 490], [414, 522]], { w: [3, 7, 11, 11, 9, 6], taper: [0.2, 0.2] }));
  out.push(ink(r, [[440, 224], [480, 211], [522, 207]], { w: [3.4, 2.6, 1.4], taper: [0.1, 0.6], opacity: 0.9 }));
  out.push(ink(r, [[560, 214], [580, 220]], { w: 2, taper: [0.4, 0.4], opacity: 0.7 }));
  out.push(ink(r, [[612, 246], [634, 266], [650, 298]], { w: [1.4, 2.8, 3.4], taper: [0.5, 0.1] }));
  out.push(ink(r, [[664, 346], [684, 372], [686, 396], [700, 436], [716, 470], [712, 483], [698, 490]], { w: [3, 4.4, 3, 4, 5, 5, 3], taper: [0.1, 0.1] }));
  out.push(ink(r, [[692, 508], [698, 520], [690, 532], [694, 542], [684, 554]], { w: [2, 3, 3, 3, 2], taper: [0.2, 0.2] }));
  // jaw: heavy where it turns away under the ear, thinning to the chin in the light
  out.push(ink(r, [[684, 558], [690, 580], [674, 604], [632, 622], [580, 628], [526, 614], [488, 580], [466, 528]], { w: [2.4, 4, 7, 9, 11, 12, 10, 5], taper: [0.2, 0.2] }));
  // jowl and cheek: the weight of the face
  out.push(ink(r, [[560, 556], [548, 588], [532, 606]], { w: [1.6, 4, 2], taper: [0.4, 0.4], opacity: 0.7 }));
  // second chin
  out.push(ink(r, [[586, 640], [636, 638], [676, 624], [694, 604]], { w: [2, 4, 4, 2], taper: [0.3, 0.3], opacity: 0.75 }));
  // ear (sits in the face wash; a deeper hollow inside)
  const ear = [[474, 424], [450, 414], [434, 440], [438, 486], [458, 518], [480, 520]];
  out.push(tint([[452, 432], [466, 434], [468, 488], [456, 504], [446, 478]], { opacity: 0.3, edge: 0 }));
  out.push(ink(r, ear, { w: [3, 7, 8, 7, 5, 3], taper: [0.1, 0.3] }));
  out.push(ink(r, [[462, 438], [452, 462], [458, 488], [470, 496]], { w: 3, taper: [0.3, 0.4] }));
  // brows: heavy, the inner end of the near one lifted (he is reading closely)
  out.push(ink(r, [[560, 390], [588, 376], [616, 370], [644, 378]], { w: [5, 10, 8, 3], taper: [0.2, 0.5] }));
  out.push(ink(r, [[664, 374], [676, 368], [690, 372]], { w: [5, 4, 2], taper: [0.2, 0.5] }));
  out.push(ink(r, [[652, 384], [650, 396]], { w: 2.2, taper: [0.3, 0.3], opacity: 0.55 }));
  // near eye: heavy lid, iris turned toward the dial, a pouch below
  out.push(mass([[574, 418], [592, 408], [614, 406], [630, 414], [614, 424], [590, 424]], { fill: PAPER }));
  out.push(mass([[608, 407], [624, 409], [626, 421], [614, 425], [606, 416]], { fill: INK }));
  out.push(ink(r, [[564, 420], [576, 413], [594, 403], [616, 402], [636, 414]], { w: [2, 5, 7, 6, 3], taper: [0.1, 0.3] }));
  out.push(ink(r, [[578, 397], [604, 390], [628, 395]], { w: 2.4, taper: [0.3, 0.4], opacity: 0.75 }));
  out.push(ink(r, [[584, 428], [604, 431], [624, 426]], { w: 1.8, taper: [0.3, 0.3], opacity: 0.6 }));
  out.push(ink(r, [[580, 442], [602, 449], [626, 443]], { w: [1.4, 3, 1.4], taper: [0.3, 0.4], opacity: 0.7 }));
  out.push(strokes([[[556, 412], [540, 404]], [[558, 424], [542, 430]], [[560, 434], [548, 444]]], { w: 2, taper: [0.2, 0.6], r, opacity: 0.65 }));
  // far eye: a lid and a dot tucked against the bridge
  out.push(ink(r, [[670, 414], [680, 408], [690, 411]], { w: [2, 4.4, 2], taper: [0.2, 0.3] }));
  out.push(mass([[678, 411], [687, 412], [685, 420], [678, 419]], { fill: INK }));
  // nose wing, nasolabial fold, mouth set firm, the shadow under the lower lip
  out.push(ink(r, [[670, 472], [658, 488], [676, 499]], { w: [2, 6, 3], taper: [0.3, 0.3] }));
  out.push(ink(r, [[652, 494], [636, 520], [632, 556]], { w: [2, 4.4, 1.4], taper: [0.3, 0.5], opacity: 0.8 }));
  out.push(ink(r, [[630, 533], [648, 527], [668, 528], [690, 523]], { w: [2.4, 4.4, 4, 2], taper: [0.2, 0.2] }));
  out.push(ink(r, [[628, 530], [622, 540]], { w: 2.6, taper: [0.2, 0.6], opacity: 0.7 }));
  out.push(tint([[646, 544], [680, 542], [674, 553], [652, 553]], { opacity: 0.4, edge: 0 }));
  return out.join('');
}

function headband(r) {
  const out = [];
  // tails of the knot, blown back by the wind
  out.push(sumi([[372, 318], [340, 330], [300, 380], [270, 440], [286, 446], [318, 400], [360, 356]], { angle: 60 }));
  out.push(sumi([[368, 340], [342, 380], [322, 440], [314, 492], [330, 490], [350, 440], [376, 370]], { angle: 72 }));
  out.push(ink(r, [[368, 330], [320, 384], [284, 446]], { w: [3, 4, 2], taper: [0.1, 0.5] }));
  // the band round the skull: its near arc sags (we look up at it)
  const band = [[650, 280], [600, 294], [520, 302], [450, 302], [390, 296], [360, 290], [352, 322], [360, 350], [420, 358], [500, 362], [580, 352], [640, 340], [668, 334], [662, 306]];
  out.push(sumi(band, { angle: -8 }));
  const ribs = [];
  for (let i = 0; i < 20; i += 1) {
    const t = i / 19;
    const x = 372 + t * 284;
    const top = 297 + Math.sin(t * Math.PI) * 8 - t * 12;
    const bot = 354 + Math.sin(t * Math.PI) * 8 - t * 18;
    ribs.push([[x, top + 4], [x + 2, bot - 4]]);
  }
  out.push(strokes(ribs, { w: 2.2, taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.4 }));
  out.push(dry(strokes([[[470, 312], [560, 314], [640, 300]]], { w: 9, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.6 }), -6));
  out.push(ink(r, [[362, 354], [420, 360], [500, 364], [580, 354], [668, 336]], { w: [6, 5, 4, 3, 3], taper: [0.05, 0.2] }));
  // the knot
  out.push(sumi([[352, 300], [378, 296], [386, 336], [366, 356], [342, 344], [338, 316]], { angle: 30 }));
  out.push(brush([[354, 318], [370, 326]], { w: 3, taper: [0.3, 0.3], fill: PAPER, opacity: 0.6 }));
  return out.join('');
}

function nearArm(r) {
  const out = [];
  // near arm hangs at his side: shirt sleeve (light), rolled at the elbow, bare thick forearm
  const upper = [[300, 718], [236, 746], [184, 800], [150, 880], [132, 980], [124, 1080], [122, 1150], [264, 1154], [262, 1040], [270, 920], [292, 820], [320, 760]];
  out.push(mass(upper, { fill: PAPER }));
  out.push(mass(upper, { fill: INDIGO, opacity: SHIRT + 0.06 }));
  // shade down the side turned from the light, folds from the armpit and the elbow
  out.push(tint([[236, 752], [190, 800], [156, 884], [138, 980], [130, 1080], [130, 1140], [172, 1140], [168, 1060], [176, 960], [196, 860], [226, 790]], { opacity: 0.26, edge: 0 }));
  out.push(ink(r, [[290, 836], [262, 880], [246, 940]], { w: [1.6, 3.6, 1.6], taper: [0.3, 0.5], opacity: 0.8 }));
  out.push(ink(r, [[276, 960], [252, 1000], [240, 1050]], { w: [1.4, 3, 1.4], taper: [0.3, 0.5], opacity: 0.7 }));
  out.push(ink(r, [[196, 990], [222, 1030], [232, 1080]], { w: [1.4, 3.4, 1.4], taper: [0.3, 0.5], opacity: 0.75 }));
  out.push(ink(r, [[262, 1150], [262, 1040], [270, 920], [292, 820], [320, 764]], { w: [4, 3.6, 3, 2.4, 1.6], taper: [0.1, 0.4] }));
  out.push(forearm(r, [194, 1176], [222, 1478], { w0: 132, w1: 104, shade: 1, hairs: 5 }));
  out.push(roll(r, [193, 1152], 72, 5, { t: 36, sag: 8 }));
  out.push(ink(r, [[300, 716], [236, 746], [184, 800], [150, 880], [132, 980], [124, 1080], [122, 1134]], { w: [4, 7, 9, 11, 11, 10, 8], taper: [0.05, 0.05] }));
  return out.join('');
}

/**
 * Left hand steadying the sack, back of the hand toward us: wrist at (0, 0), fingers toward +x,
 * a little spread and bent where they lie over the sack's curve; the thumb (−y, the lit upper
 * side) lies out along the cloth. The heel of the hand (+y) turns down into shadow.
 */
function steadyHand(r) {
  const out = [];
  const finger = (pts, w, o = 1) => [
    brush(pts, { w: w + 7, taper: [0, 0.2], tip: 0.55, r, wobble: 0.15, opacity: o }),
    brush(pts, { w, taper: [0, 0.18], tip: 0.5, r, wobble: 0.1, fill: PAPER }),
  ].join('');
  // thumb first: it comes off the wrist side of the hand and lies along the sack, two joints
  out.push(finger([[24, -26], [54, -46], [84, -58], [108, -62]], 28));
  out.push(brush([[70, -64], [76, -48]], { w: 2.2, taper: [0.3, 0.3], r, opacity: 0.6 }));
  out.push(brush([[100, -70], [104, -58]], { w: 1.8, taper: [0.3, 0.3], r, opacity: 0.55 }));
  // back of the hand
  const back = [[-4, -34], [40, -38], [104, -42], [116, -20], [116, 12], [106, 36], [56, 42], [-4, 36]];
  out.push(mass(back, { fill: PAPER }));
  out.push(tint([[8, 16], [56, 24], [106, 22], [106, 36], [56, 42], [4, 34]], { opacity: 0.28, edge: 0 }));
  out.push(ink(r, [[-4, -34], [30, -36], [48, -40]], { w: [3, 2.6, 1.6], taper: [0.05, 0.5] }));
  out.push(ink(r, [[0, 36], [56, 44], [102, 40]], { w: [8, 10, 7], taper: [0.05, 0.2] }));
  // fingers, little finger first so each one overlaps the next (their edges are the splits)
  out.push(finger([[100, 28], [134, 36], [158, 46], [168, 62]], 23));
  out.push(finger([[106, 10], [150, 14], [182, 22], [198, 40]], 26));
  out.push(finger([[108, -10], [154, -10], [190, -2], [208, 16]], 27));
  out.push(finger([[102, -30], [146, -32], [180, -26], [196, -8]], 26));
  // knuckles and the bend of each finger over the curve
  out.push(strokes([[[104, -28], [110, -20]], [[110, -10], [114, -2]], [[108, 10], [112, 18]], [[102, 26], [106, 34]]], { w: 2.4, taper: [0.3, 0.3], r, opacity: 0.6 }));
  out.push(strokes([[[164, -40], [168, -24]], [[176, -18], [178, -2]], [[170, 6], [172, 22]], [[146, 30], [148, 44]]], { w: 2.2, taper: [0.3, 0.4], r, opacity: 0.55 }));
  // tendons on the back of the hand
  out.push(strokes([[[30, -14], [70, -18], [100, -24]], [[34, 6], [70, 4], [100, 2]]], { w: 1.8, taper: [0.4, 0.4], r, opacity: 0.35 }));
  return out.join('');
}

/* ── Plate ──────────────────────────────────────────────────────────────────────────────────── */

/** The bare upper arm from the sleeve hem to the elbow: shade side (left) heavy, lit side broken. */
function upperArm(r, [ax, ay], [bx, by], { w0 = 100, w1 = 86 } = {}) {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len; // +1 = his outer (left on the plate) side, turned from the light
  const P = (k, s) => { const w = (w0 + (w1 - w0) * k) / 2; return [ax + (bx - ax) * k + nx * s * w, ay + (by - ay) * k + ny * s * w]; };
  const out = [];
  out.push(mass([P(-0.05, 1), P(0.4, 1.06), P(1.02, 1), P(1.06, 0), P(1.02, -1), P(0.45, -1.1), P(-0.05, -1)], { fill: PAPER }));
  out.push(tint([P(0, 0.96), P(0.4, 1.02), P(1, 0.96), P(1, 0.3), P(0.5, 0.26), P(0, 0.34)], { opacity: 0.27 }));
  out.push(ink(r, [P(0, 1), P(0.4, 1.06), P(0.8, 1.02), P(1.02, 0.96)], { w: [8, 11, 10, 8], taper: [0.05, 0.1] }));
  out.push(ink(r, [P(0.02, -1), P(0.3, -1.08), P(0.5, -1.08)], { w: [3.4, 3, 2], taper: [0.1, 0.5] }));
  out.push(ink(r, [P(0.72, -1.04), P(0.9, -1)], { w: [1.8, 3], taper: [0.5, 0.1] }));
  return out.join('');
}

/** His left shirt sleeve, short and rolled, hanging from the shoulder in front of the waistcoat edge. */
function farSleeve(r) {
  const out = [];
  const shape = [[704, 752], [744, 758], [788, 786], [810, 846], [820, 930], [706, 948], [696, 870], [696, 790]];
  out.push(mass(shape, { fill: PAPER }));
  out.push(mass(shape, { fill: INDIGO, opacity: SHIRT + 0.06 }));
  out.push(tint([[700, 780], [720, 800], [724, 880], [716, 942], [704, 944], [698, 870]], { opacity: 0.26, edge: 0 }));
  out.push(ink(r, [[744, 850], [736, 890], [740, 920]], { w: [1.4, 3.2, 1.4], taper: [0.3, 0.5], opacity: 0.75 }));
  out.push(ink(r, [[700, 764], [694, 850], [704, 940]], { w: [5, 9, 8], taper: [0.1, 0.1] }));
  out.push(ink(r, [[760, 766], [796, 792], [812, 850], [818, 910]], { w: [2, 3, 2.6, 2], taper: [0.3, 0.3] }));
  out.push(roll(r, [762, 934], 60, -5, { t: 30, sag: 7 }));
  // the waistcoat's shoulder lies over the top of the sleeve (the armhole edge)
  out.push(sumi([[690, 740], [722, 738], [758, 754], [792, 786], [784, 794], [750, 770], [714, 758], [692, 758]], { angle: 20, base: 0.93 }));
  out.push(brush([[700, 741], [730, 741], [760, 756], [786, 782]], { w: 2.4, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.8 }));
  return out.join('');
}

function steadyingArm(r) {
  // his left arm, whole: shoulder, rolled short sleeve, bare upper arm down in front of the
  // waistcoat, a bent elbow, the forearm coming forward, the hand pressed flat round the sack
  const out = [];
  // cast shadow of the arm on the waistcoat and on the sack
  out.push(tint([[692, 800], [690, 950], [680, 1080], [688, 1190], [664, 1186], [660, 1070], [668, 950], [676, 820]], { color: INK, opacity: 0.45, edge: 0 }));
  out.push(tint([[880, 1112], [960, 1086], [1010, 1052], [1012, 1076], [960, 1108], [890, 1128]], { opacity: 0.3, edge: 0 }));
  out.push(upperArm(r, FAR_HEM, FAR_ELBOW, { w0: 102, w1: 88 }));
  out.push(farSleeve(r));
  out.push(forearm(r, FAR_ELBOW, FAR_WRIST, { w0: 104, w1: 72, shade: 1, hairs: 4, bulge: 1.1 }));
  out.push(place(steadyHand(r), { origin: FAR_WRIST, angle: -24, scale: [0.92, 0.96] }));
  return out.join('');
}

export default crewPlate({
  n: 3,
  title: 'Önemlilik',
  seed: 0x0b03,
  detail: { x: 0.57, y: 0.415, zoom: 1.45 },
  railY: 1300,
  boat: [120, 0.8],
  draw: (r) => {
    const figure = [torso(r), neck(r), collar(r), head(r), headband(r), nearArm(r)].join('\n');
    const kantar = place(dial(r), SCALE_AT);
    const load = rough(place(sack(r), SCALE_AT));
    return { figure, front: [rigging(r), kantar, load, rough(steadyingArm(r))].join('\n') };
  },
});
