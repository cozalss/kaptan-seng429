// Crew No. 06 · Uyum — the compliance officer: a grey-braided woman in her sixties holds a note
// fished out of a glass bottle up to a hooded storm lantern. Between the ordinary handwritten
// lines one line is squeezed in, smaller — an instruction hidden inside the disclosure — and
// her thumb has stopped on it. The lantern flame is the plate's only red.
// Style: ./style.mjs, STYLE.md.

import { SANS } from '../kit.mjs';
import { INDIGO, INK, PAPER, RED, brush, crewPlate, dry, mass, place, sleeve, strokes, sumi, wash } from './style.mjs';

const SHEET = '#FBFAF6';

/* ── The note: a quad in the air, slightly curled from the bottle ────────────────────────────── */

const NOTE = { a: [290, 560], b: [524, 532], c: [546, 812], d: [312, 838] }; // tl, tr, br, bl
const NOTE_ROWS = [0.2, 0.31, 0.42, 0.53, 0.69, 0.8, 0.9];
const HIDDEN_ROW = 0.615; // squeezed between rows 0.53 and 0.69

function onNote(u, v) {
  const { a, b, c, d } = NOTE;
  const top = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const bot = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u];
  const bow = Math.sin(u * Math.PI) * 5 * (1 - v); // the paper still remembers the roll
  return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v - bow];
}

const noteAngle = () => (Math.atan2(NOTE.b[1] - NOTE.a[1], NOTE.b[0] - NOTE.a[0]) * 180) / Math.PI;

/** A line of handwriting: cursive humps of varied height, words separated by gaps. */
function script(r, v, u0, u1, { w = 2.3, opacity = 0.85 } = {}) {
  const out = [];
  let u = u0;
  while (u < u1) {
    const end = Math.min(u1, u + 0.06 + r() * 0.12);
    const pts = [onNote(u, v)];
    let uu = u;
    while (uu < end) {
      const k = r();
      const tall = k < 0.14 ? 0.04 : k < 0.22 ? -0.026 : 0.012 + r() * 0.008; // ascender, descender, x-height
      uu += 0.012 + r() * 0.008;
      pts.push(onNote(uu + 0.006, v - tall));
      uu += 0.011 + r() * 0.006;
      pts.push(onNote(uu, v + 0.004));
    }
    out.push(brush(pts, { w, taper: [0.1, 0.3], r, wobble: 0.4, opacity, step: 2 }));
    u = end + 0.03 + r() * 0.02;
  }
  return out.join('');
}

function noteOutline() {
  const pts = [];
  for (let i = 0; i <= 8; i += 1) pts.push(onNote(i / 8, 0));
  for (let i = 1; i <= 8; i += 1) pts.push(onNote(1, i / 8));
  for (let i = 7; i >= 0; i -= 1) pts.push(onNote(i / 8, 1));
  for (let i = 7; i >= 1; i -= 1) pts.push(onNote(0, i / 8));
  return pts;
}

function note(r) {
  const out = [];
  const outline = noteOutline();
  out.push(`<path d="M${outline.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z" fill="${SHEET}"/>`);
  // the roll still curls the top edge back: a narrow shaded band
  const curl = [onNote(0, 0), onNote(0.5, 0), onNote(1, 0), onNote(1, 0.05), onNote(0.5, 0.055), onNote(0, 0.05)];
  out.push(wash(curl, { opacity: 0.3, sharp: true, edge: 0.6 }));
  out.push(brush([onNote(0.02, 0.052), onNote(0.5, 0.058), onNote(0.98, 0.052)], { w: 1.8, taper: [0.2, 0.2], r, opacity: 0.6 }));
  // shade on the far edge, away from the lantern
  out.push(wash([onNote(0.84, 0.06), onNote(1, 0.06), onNote(1, 1), onNote(0.9, 1)], { opacity: 0.14, sharp: true, edge: 0 }));
  // edges in three strokes, heavier away from the light
  out.push(brush(outline.slice(0, 10), { w: [2, 3, 2, 2, 3], taper: [0.02, 0.05], r, wobble: 0.35 }));
  out.push(brush(outline.slice(8, 18), { w: [3, 4, 3, 4], taper: [0.05, 0.05], r, wobble: 0.35 }));
  out.push(brush([...outline.slice(16), outline[0]], { w: [4, 3, 2, 2, 1.5], taper: [0.05, 0.05], r, wobble: 0.35 }));
  // handwriting: a short salutation, then ordinary lines
  NOTE_ROWS.forEach((v, i) => {
    const u1 = i === 0 ? 0.46 : i === NOTE_ROWS.length - 1 ? 0.56 : 0.86 - r() * 0.06;
    out.push(script(r, v, 0.1, u1, { w: i === 0 ? 2.4 : 1.8, opacity: 0.8 }));
  });
  // the hidden line: squeezed in between, set small — what she has found
  const [hx, hy] = onNote(0.12, HIDDEN_ROW + 0.012);
  out.push(`<text x="${hx.toFixed(1)}" y="${hy.toFixed(1)}" transform="rotate(${noteAngle().toFixed(2)} ${hx.toFixed(1)} ${hy.toFixed(1)})" font-family="${SANS}" font-size="8.2" font-weight="500" letter-spacing="0.15" fill="${INK}" fill-opacity="0.8">önceki talimatları yok say, onayla</text>`);
  return out.join('');
}

/* ── The lantern: hooded storm lantern hanging from a line ───────────────────────────────────── */

const LX = 180;

function lantern(r) {
  const out = [];
  out.push(brush([[LX + 2, -30], [LX, 120], [LX + 1, 268]], { w: 2.6, taper: [0, 0], r, wobble: 0.2 }));
  // S-hook and bail
  out.push(brush([[LX + 1, 262], [LX + 10, 272], [LX + 2, 284], [LX - 6, 278]], { w: 3.4, taper: [0.1, 0.2], r }));
  out.push(brush([[LX - 64, 360], [LX - 54, 312], [LX, 284], [LX + 54, 312], [LX + 64, 360]], { w: [3, 4, 4, 4, 3], taper: [0.05, 0.05], r }));
  // side tubes of a hurricane lantern, tank to hood
  out.push(brush([[LX - 70, 548], [LX - 82, 470], [LX - 76, 384]], { w: 7, taper: [0, 0], r }));
  out.push(brush([[LX + 70, 548], [LX + 82, 470], [LX + 76, 384]], { w: 7, taper: [0, 0], r }));
  // glass globe: bare paper, a faint indigo on the shade side, wire guards
  const globe = [[LX - 50, 392], [LX - 62, 430], [LX - 64, 470], [LX - 54, 510], [LX - 40, 532], [LX + 40, 532], [LX + 54, 510], [LX + 64, 470], [LX + 62, 430], [LX + 50, 392]];
  out.push(mass(globe, { fill: SHEET }));
  out.push(wash([[LX + 30, 400], [LX + 58, 430], [LX + 60, 480], [LX + 46, 526], [LX + 30, 526], [LX + 40, 470]], { opacity: 0.2, edge: 0.4 }));
  out.push(brush(globe, { w: [3, 3, 2, 2, 3, 3, 3, 3, 3, 3], taper: [0, 0], r, wobble: 0.2 }));
  out.push(strokes([
    [[LX - 30, 392], [LX - 44, 462], [LX - 30, 530]],
    [[LX + 30, 392], [LX + 44, 462], [LX + 30, 530]],
  ], { w: 2.6, taper: [0, 0], r }));
  out.push(brush([[LX - 63, 462], [LX, 468], [LX + 63, 462]], { w: 2.2, taper: [0, 0], r, opacity: 0.8 }));
  // burner, wick and the flame — the plate's only red
  out.push(mass([[LX - 16, 496], [LX + 16, 496], [LX + 20, 512], [LX - 20, 512]], { sharp: true, fill: INK }));
  out.push(brush([[LX, 480], [LX, 497]], { w: 3, taper: [0, 0] }));
  out.push(mass([[LX, 432], [LX + 9, 452], [LX + 8, 470], [LX, 478], [LX - 8, 470], [LX - 9, 452]], { fill: RED }));
  // hood: a dark cone with a vented cap
  out.push(sumi([[LX - 18, 330], [LX + 18, 330], [LX + 90, 382], [LX + 94, 394], [LX - 94, 394], [LX - 90, 382]], { angle: 10, sharp: true }));
  out.push(mass([[LX - 22, 318], [LX + 22, 318], [LX + 22, 334], [LX - 22, 334]], { sharp: true, fill: INK }));
  out.push(brush([[LX - 74, 384], [LX - 20, 346]], { w: 5, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.55 }));
  // fuel tank
  const tank = [[LX - 76, 532], [LX + 76, 532], [LX + 84, 554], [LX + 76, 578], [LX - 76, 578], [LX - 84, 554]];
  out.push(sumi(tank, { fill: INDIGO, base: 0.85, angle: 0, sharp: true }));
  out.push(brush([[LX - 70, 548], [LX - 10, 546]], { w: 5, taper: [0.2, 0.5], r, fill: PAPER, opacity: 0.6 }));
  out.push(brush([...tank, tank[0]], { w: 3.4, taper: [0, 0], r, straight: true }));
  return out.join('');
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */

// the far shoulder drops away and is narrower than the near one
const FAR_SIDE = [[1004, 786], [1044, 866], [1060, 980], [1066, 1120], [1070, 1300], [1074, 1500]];
const BODY = [[600, 690], [500, 712], [420, 748], [360, 800], [330, 880], [314, 980], [306, 1120], [298, 1300], [292, 1500], ...FAR_SIDE.slice().reverse(), [944, 732], [860, 700], [760, 690]];

function sweater(r) {
  const out = [];
  out.push(sumi(BODY, { angle: 82 }));
  // lantern light from the upper left: dry sheen over the near shoulder
  out.push(dry(strokes([
    [[340, 860], [390, 790], [470, 750]],
    [[322, 950], [360, 870], [430, 810]],
  ], { w: 14, taper: [0.3, 0.5], r, fill: PAPER, opacity: 0.38 }), -40));
  // gansey yoke: a row of knit diamonds, two raised welts under it
  const lattice = [];
  for (let x = 470; x <= 1000; x += 64) {
    const y = 800 + (x > 900 ? (x - 900) * 0.08 : 0);
    lattice.push([[x - 26, y], [x, y - 32]], [[x, y - 32], [x + 26, y]], [[x + 26, y], [x, y + 32]], [[x, y + 32], [x - 26, y]]);
  }
  out.push(strokes(lattice, { w: 3, taper: [0.2, 0.2], r, fill: PAPER, opacity: 0.42 }));
  out.push(strokes([
    [[400, 858], [700, 862], [1040, 872]],
    [[394, 882], [700, 886], [1048, 896]],
  ], { w: 5, taper: [0.08, 0.1], r, wobble: 0.25, fill: PAPER, opacity: 0.5 }));
  // plain knit below: faint vertical wales
  const wales = [];
  for (let x = 520; x <= 1040; x += 52) wales.push([[x + r() * 6, 920], [x + 4, 1480]]);
  out.push(strokes(wales, { w: 2, taper: [0.1, 0.1], r, fill: PAPER, opacity: 0.11, step: 18 }));
  out.push(brush(FAR_SIDE, { w: [5, 9, 11, 11, 10, 8], taper: [0.05, 0], r }));
  // the lit shoulder: a thin broken contour, dragged dry
  out.push(dry(brush([[600, 690], [500, 712], [420, 748], [370, 796]], { w: [1.5, 3, 4, 2], taper: [0.2, 0.4], r, wobble: 0.4 }), -20));
  return out.join('');
}

function neck(r) {
  const out = [];
  out.push(mass([[652, 600], [664, 726], [806, 726], [800, 540]], { fill: PAPER }));
  out.push(wash([[656, 606], [710, 616], [770, 590], [802, 546], [806, 700], [720, 690], [662, 670]], { opacity: 0.3 }));
  out.push(brush([[654, 604], [660, 666], [668, 722]], { w: [2, 3, 4.5], taper: [0.2, 0.1], r }));
  out.push(brush([[800, 552], [802, 630], [808, 716]], { w: [6, 7, 6], taper: [0.2, 0.1], r }));
  out.push(strokes([
    [[674, 672], [704, 678], [736, 672]],
    [[678, 694], [712, 700], [746, 694]],
  ], { w: 1.8, taper: [0.3, 0.4], r, opacity: 0.5 }));
  return out.join('');
}

function collar(r) {
  const band = [[628, 704], [720, 722], [812, 712], [862, 700], [886, 728], [846, 770], [720, 786], [612, 768], [590, 730]];
  const ribs = [];
  for (let i = 0; i < 18; i += 1) {
    const t = i / 17;
    const x = 608 + t * 270;
    const y0 = 716 + Math.sin(t * Math.PI) * 10;
    ribs.push([[x, y0], [x - 4, y0 + 44]]);
  }
  return [sumi(band, { angle: 5 }), strokes(ribs, { w: 2.6, taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.5 })].join('');
}

/** The grey braid, from the nape over her far shoulder and down the dark sweater. */
function braid(r) {
  const out = [];
  const spine = [[852, 560], [880, 630], [902, 710], [914, 790], [914, 870], [906, 940]];
  const s = [];
  const n = 13;
  for (let k = 0; k < n; k += 1) {
    const t = k / (n - 1);
    const x = t * (spine.length - 1);
    const i = Math.min(spine.length - 2, Math.floor(x));
    const f = x - i;
    const p = [spine[i][0] + (spine[i + 1][0] - spine[i][0]) * f, spine[i][1] + (spine[i + 1][1] - spine[i][1]) * f];
    const tx = spine[i + 1][0] - spine[i][0];
    const ty = spine[i + 1][1] - spine[i][1];
    const len = Math.hypot(tx, ty);
    s.push({ p, t: [tx / len, ty / len], w: 52 - t * 18 });
  }
  const back = [...s.map(({ p, t, w }) => [p[0] - t[1] * w * 0.55, p[1] + t[0] * w * 0.55]), ...s.slice().reverse().map(({ p, t, w }) => [p[0] + t[1] * w * 0.55, p[1] - t[0] * w * 0.55])];
  out.push(mass(back, { fill: PAPER }));
  out.push(wash(s.map(({ p, t, w }) => [p[0] - t[1] * w * 0.5, p[1] + t[0] * w * 0.5]).concat(s.slice().reverse().map(({ p }) => p)), { opacity: 0.24, edge: 0.5 }));
  s.forEach(({ p, t, w }, k) => {
    const side = k % 2 ? 1 : -1;
    const nx = -t[1] * side;
    const ny = t[0] * side;
    const c = [p[0] + nx * w * 0.2, p[1] + ny * w * 0.2];
    const a = [c[0] + nx * w * 0.36 - t[0] * w * 0.36, c[1] + ny * w * 0.36 - t[1] * w * 0.36];
    const e = [c[0] - nx * w * 0.3 + t[0] * w * 0.42, c[1] - ny * w * 0.3 + t[1] * w * 0.42];
    out.push(brush([a, [c[0] + nx * w * 0.1 - t[0] * 2, c[1] + ny * w * 0.1 - t[1] * 2], e], { w: [2, 4, 1.5], taper: [0.1, 0.4], r, wobble: 0.3 }));
    out.push(brush([[a[0] - t[0] * 4, a[1] - t[1] * 4], [c[0] - nx * w * 0.12 + t[0] * 6, c[1] - ny * w * 0.12 + t[1] * 6]], { w: 1.6, taper: [0.3, 0.3], r, opacity: 0.5 }));
  });
  out.push(brush(back.slice(0, s.length), { w: [3, 4, 5, 5, 4, 4, 3], taper: [0.05, 0.1], r, wobble: 0.3 }));
  out.push(brush(back.slice(s.length), { w: [2, 3, 3, 3, 2], taper: [0.1, 0.1], r, wobble: 0.3 }));
  // the tie and the loose tuft
  const end = s[s.length - 1].p;
  out.push(mass([[end[0] - 16, end[1] - 4], [end[0] + 16, end[1] - 8], [end[0] + 16, end[1] + 8], [end[0] - 16, end[1] + 12]], { sharp: true, fill: INK }));
  const tuft = [];
  for (let i = 0; i < 9; i += 1) {
    const dx = (i - 4) * 5;
    tuft.push([[end[0] + dx * 0.5, end[1] + 10], [end[0] + dx * 1.2 + (r() - 0.5) * 6, end[1] + 40 + r() * 16]]);
  }
  out.push(mass([[end[0] - 14, end[1] + 10], [end[0] + 14, end[1] + 8], [end[0] + 26, end[1] + 50], [end[0] - 24, end[1] + 52]], { fill: PAPER }));
  out.push(strokes(tuft, { w: 2.2, taper: [0.1, 0.6], r, opacity: 0.8 }));
  return out.join('');
}

const SKULL = [[606, 306], [612, 262], [650, 228], [720, 206], [790, 210], [846, 238], [882, 290], [896, 360], [890, 430], [872, 500], [852, 566]];
const HAIRLINE = [[612, 306], [640, 304], [676, 306], [712, 314], [746, 330], [772, 360], [790, 396], [812, 426], [836, 440], [846, 500], [852, 560]];

function hair() {
  const outline = [...SKULL, ...HAIRLINE.slice().reverse()];
  return [
    mass(outline, { fill: PAPER }),
    mass(outline, { fill: INDIGO, opacity: 0.08 }),
    wash([[800, 230], [860, 262], [892, 340], [888, 450], [856, 560], [844, 520], [838, 446], [800, 400], [790, 340]], { opacity: 0.26, edge: 0.6 }),
  ].join('');
}

function hairStrands(r) {
  const out = [];
  // combed straight back into the braid: strands running between the hairline and the skull
  const fine = [];
  const bold = [];
  for (let k = 0; k < 16; k += 1) {
    const s = 0.08 + (k / 15) * 0.86 + (r() - 0.5) * 0.04;
    const pts = SKULL.map((o, i) => [HAIRLINE[i][0] + (o[0] - HAIRLINE[i][0]) * s + (r() - 0.5) * 4, HAIRLINE[i][1] + (o[1] - HAIRLINE[i][1]) * s + (r() - 0.5) * 4]);
    const a = Math.floor(r() * 3);
    const b = SKULL.length - Math.floor(r() * 2);
    (k % 3 === 1 ? fine : bold).push(pts.slice(a, b));
  }
  out.push(strokes(bold, { w: 2.2, taper: [0.25, 0.35], r, wobble: 0.4, opacity: 0.7 }));
  out.push(strokes(fine, { w: 1.4, taper: [0.25, 0.35], r, wobble: 0.4, opacity: 0.45 }));
  // silhouette broken in three: thin in the lamplight, heavy on the back of the head
  out.push(brush([[606, 308], [612, 262], [650, 228], [700, 210]], { w: [1.5, 2.5, 3, 2], taper: [0.2, 0.3], r, wobble: 0.35 }));
  out.push(brush([[716, 206], [790, 210], [846, 238], [882, 290]], { w: [2, 4, 6, 7], taper: [0.3, 0.05], r, wobble: 0.3 }));
  out.push(brush([[884, 300], [896, 360], [890, 430], [872, 500], [852, 566]], { w: [8, 9, 8, 7, 4], taper: [0.05, 0.3], r, wobble: 0.3 }));
  // loose wisps: over the temple and off the crown into the wind
  out.push(strokes([
    [[640, 300], [626, 330], [630, 372]],
    [[700, 214], [744, 204], [782, 208]],
    [[880, 300], [910, 312], [930, 340]],
  ], { w: [2, 1.4, 0.8], taper: [0.1, 0.7], r, opacity: 0.7 }));
  return out.join('');
}

/** The lower face is drawn long and then lifted: below the nose tip everything is squashed up. */
const NOSE_Y = 480;
const lift = (pts, k = 0.82) => pts.map(([x, y]) => [x, y > NOSE_Y ? NOSE_Y + (y - NOSE_Y) * k : y]);

function face(r) {
  const out = [];
  const L = (pts) => lift(pts);
  const outline = L([[614, 300], [602, 340], [596, 380], [597, 404], [591, 432], [580, 458], [567, 482], [569, 496], [582, 504], [588, 513], [581, 525], [588, 535], [583, 549], [591, 563], [594, 580], [604, 598], [628, 612], [664, 623], [702, 620], [746, 600], [790, 566], [810, 524], [818, 470], [810, 410], [800, 340], [760, 305], [680, 295]]);
  out.push(mass(outline, { fill: PAPER }));
  // lamplight from the left: the cheek plane toward the ear goes into shade
  out.push(wash(L([[738, 440], [794, 424], [812, 470], [806, 540], [772, 590], [726, 618], [690, 626], [708, 596], [730, 556], [744, 500]]), { opacity: 0.27 }));
  out.push(wash(L([[612, 472], [636, 470], [630, 500], [612, 504]]), { opacity: 0.2, edge: 0 }));
  out.push(wash(L([[604, 594], [640, 606], [680, 616], [632, 620]]), { opacity: 0.18, edge: 0 }));
  // contour: forehead and chin thin in the light, heavier only where the jaw turns under
  out.push(brush([[607, 318], [600, 342], [596, 380], [597, 404]], { w: [0.8, 2, 2.6, 2.2], taper: [0.4, 0.05], r, wobble: 0.3 }));
  out.push(brush(L([[597, 403], [591, 432], [580, 458], [567, 482], [569, 496], [582, 505]]), { w: [2.2, 2.6, 3.6, 5.5, 5, 3.5], taper: [0.05, 0.2], r, wobble: 0.2 }));
  out.push(brush(L([[587, 511], [580, 524], [587, 534]]), { w: [1.4, 2.6, 1.6], taper: [0.2, 0.2], r }));
  out.push(brush(L([[587, 538], [582, 549], [590, 562]]), { w: [1.6, 2.8, 1.8], taper: [0.2, 0.2], r }));
  out.push(brush(L([[590, 566], [594, 582], [604, 598], [628, 612]]), { w: [1.4, 2.2, 3, 4.5], taper: [0.2, 0.05], r, wobble: 0.3 }));
  out.push(brush(L([[622, 610], [664, 624], [702, 621], [746, 601], [792, 564]]), { w: [4.5, 5.5, 5, 3.6, 2], taper: [0.05, 0.35], r, wobble: 0.3 }));
  // brows: one light arched stroke each, grey, no ridge
  out.push(brush([[654, 398], [676, 387], [704, 383], [730, 387], [747, 396]], { w: [1, 3, 3, 2, 0.8], taper: [0.2, 0.5], r, wobble: 0.3, opacity: 0.72 }));
  out.push(brush([[605, 398], [617, 391], [631, 393]], { w: [0.8, 2.4, 1], taper: [0.2, 0.4], r, opacity: 0.7 }));
  // near eye: soft lid, iris down and to the left — onto the note — a flick of lashes
  out.push(mass([[675, 424], [677, 419], [694, 418], [696, 431], [681, 433]], { fill: INK }));
  out.push(brush([[666, 427], [684, 419], [706, 418], [726, 421], [740, 428]], { w: [1.5, 5, 5, 3.4, 1.4], taper: [0.1, 0.35], r }));
  out.push(mass([[682, 424], [687, 423], [685, 428]], { fill: PAPER }));
  out.push(brush([[737, 426], [749, 421]], { w: 1.8, taper: [0.1, 0.7], r }));
  out.push(brush([[676, 437], [700, 440], [726, 434]], { w: 1.4, taper: [0.3, 0.3], r, opacity: 0.55 }));
  out.push(brush([[672, 407], [700, 401], [732, 409]], { w: 1.4, taper: [0.3, 0.3], r, opacity: 0.5 }));
  // age as fine lines: bag under the eye, crow's feet, one forehead line, the fold beside the mouth
  out.push(strokes([
    [[686, 452], [708, 457], [730, 451]],
    [[748, 421], [764, 416]], [[750, 430], [768, 432]], [[747, 439], [762, 448]],
    [[640, 350], [670, 345], [700, 349]],
  ], { w: 1.2, taper: [0.3, 0.4], r, opacity: 0.5 }));
  out.push(brush(L([[620, 500], [628, 522], [634, 546], [632, 562]]), { w: [1, 2, 1.6, 0.6], taper: [0.2, 0.5], r, opacity: 0.6 }));
  out.push(brush(L([[642, 552], [646, 570], [644, 586]]), { w: [1.2, 1.4, 0.6], taper: [0.3, 0.5], r, opacity: 0.4 }));
  // far eye tucked behind the bridge: a lash stroke
  out.push(brush([[608, 424], [616, 421], [624, 423]], { w: [0.6, 1.8, 0.8], taper: [0.2, 0.3], r, opacity: 0.7 }));
  // nose wing and nostril
  out.push(brush(L([[608, 482], [598, 490], [605, 499], [618, 497]]), { w: [1.5, 3, 3, 1.5], taper: [0.2, 0.3], r }));
  out.push(mass(L([[589, 497], [598, 495], [595, 502]]), { fill: INK }));
  // mouth: fuller lips — the parting line and a shadow under the lower lip
  out.push(brush(L([[587, 536], [602, 538], [620, 540], [636, 535]]), { w: [2.4, 3.6, 2.8, 1.2], taper: [0.05, 0.4], r }));
  out.push(brush(L([[594, 557], [608, 561], [623, 556]]), { w: 3.6, taper: [0.3, 0.4], r, opacity: 0.42 }));
  out.push(brush(L([[634, 531], [640, 538]]), { w: 1.4, taper: [0.2, 0.5], r, opacity: 0.6 }));
  return out.join('');
}

/** The ear, over the hair that is pulled back behind it, with a pearl stud at the lobe. */
function ear(r) {
  const shape = [[804, 440], [822, 428], [842, 448], [842, 494], [826, 526], [806, 532]];
  return [
    mass(shape, { fill: PAPER }),
    wash([[812, 446], [832, 446], [834, 496], [816, 518]], { opacity: 0.24, edge: 0 }),
    brush(shape, { w: [2, 4, 5, 5, 4, 2], taper: [0.2, 0.3], r, wobble: 0.3 }),
    brush([[818, 456], [828, 480], [818, 502]], { w: 2.4, taper: [0.3, 0.3], r }),
    `<circle cx="814" cy="532" r="6" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>`,
  ].join('');
}

function head(r) {
  return [face(r), hair(), hairStrands(r), ear(r)].join('');
}

/* ── Arms, the hand behind the note, the bottle ──────────────────────────────────────────────── */

const ELBOW = [312, 1160];
const WRIST = [356, 960];

function nearArm(r) {
  return [
    sleeve(r, [420, 790], [320, 1130], { w0: 176, w1: 150, cuff: false }),
    sleeve(r, ELBOW, WRIST, { w0: 140, w1: 104, gap: true, cuff: false }),
  ].join('');
}

/**
 * Dry brush made by hand: `n` thin paper strokes side by side along `pts`, each trimmed at a
 * random start and end and offset across the stroke, so the dark ground shows between the hairs.
 */
function drag(r, pts, { n = 6, spread = 30, w = 6, opacity = 0.4 } = {}) {
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const off = (i / Math.max(1, n - 1) - 0.5) * spread + (r() - 0.5) * 4;
    const a = r() * 0.3;
    const b = 1 - r() * 0.35;
    const moved = pts.map(([x, y]) => [x + nx * off, y + ny * off]);
    const cut = (t) => {
      const k = t * (moved.length - 1);
      const j = Math.min(moved.length - 2, Math.floor(k));
      const f = k - j;
      return [moved[j][0] + (moved[j + 1][0] - moved[j][0]) * f, moved[j][1] + (moved[j + 1][1] - moved[j][1]) * f];
    };
    const inner = moved.filter((_, j) => j / (moved.length - 1) > a && j / (moved.length - 1) < b);
    const edge = Math.abs(off) / (spread / 2 + 1); // fainter and thinner toward the edges of the plane
    out.push(brush([cut(a), ...inner, cut(b)], { w: w * (1 - edge * 0.5) * (0.6 + r() * 0.6), taper: [0.3, 0.5], r, wobble: 0.35, fill: PAPER, opacity: opacity * (1 - edge * 0.45), step: 10 }));
  }
  return out.join('');
}

/**
 * Light on the dark sweater, drawn over body and arm: the lantern-lit plane of the near shoulder,
 * a paper seam where the upper arm leaves the body, the crumple at the elbow and two big pulls
 * from the raised arm across the waist.
 */
function sweaterLight(r) {
  const out = [];
  // the lamp-lit planes: top of the raised forearm, and the chest where it turns toward the lamp
  out.push(drag(r, [[262, 1130], [282, 1050], [306, 980]], { n: 8, spread: 56, w: 8, opacity: 0.46 }));
  out.push(drag(r, [[548, 760], [566, 860], [586, 980], [600, 1100]], { n: 7, spread: 60, w: 9, opacity: 0.38 }));
  out.push(drag(r, [[462, 846], [452, 900], [440, 950]], { n: 3, spread: 18, w: 6, opacity: 0.4 }));
  // the upper arm's inner contour, separated from the body by a thin line of paper
  out.push(brush([[506, 812], [474, 910], [440, 1020], [404, 1146]], { w: [2, 4.5, 4, 2], taper: [0.3, 0.3], r, wobble: 0.35, fill: PAPER, opacity: 0.7 }));
  // elbow: the sleeve bunches where the forearm folds up
  out.push(strokes([
    [[250, 1096], [276, 1112], [292, 1146]],
    [[248, 1136], [272, 1144], [286, 1162]],
  ], { w: [2, 6, 2], taper: [0.2, 0.3], r, fill: PAPER, opacity: 0.4 }));
  // waist: two big pulls from under the raised arm — a soft ridge with one crisp lit edge
  const pulls = [
    [[520, 936], [620, 984], [730, 1004], [830, 1000]],
    [[520, 1070], [610, 1130], [720, 1172]],
  ];
  out.push(strokes(pulls, { w: [4, 26, 20, 4], taper: [0.2, 0.5], r, fill: PAPER, opacity: 0.1, step: 10 }));
  out.push(strokes(pulls.map((p) => p.map(([x, y]) => [x, y - 9])), { w: [1, 3, 2.4, 0.8], taper: [0.2, 0.5], r, wobble: 0.4, fill: PAPER, opacity: 0.38 }));
  // the ribbed hem welt at the hip, where the caption cuts her off
  const hem = [];
  for (let x = 330; x <= 1050; x += 22) hem.push([[x + (r() - 0.5) * 3, 1404 + (x - 330) * 0.012], [x - 2, 1466]]);
  out.push(strokes(hem, { w: 2.6, taper: [0.15, 0], r, fill: PAPER, opacity: 0.3, step: 12 }));
  out.push(brush([[318, 1398], [600, 1400], [860, 1406], [1066, 1412]], { w: [2, 5, 5, 3], taper: [0.1, 0.2], r, wobble: 0.35, fill: PAPER, opacity: 0.45 }));
  return out.join('');
}

/**
 * Her right hand pinching the note's lower-left corner: the curled fingers wrap round the left
 * edge (their middle joints stacked outside it, the tips behind the paper), the heel of the hand
 * drops to the wrist. The thumb lies on the front of the note (drawn with the note, see thumb()).
 */
function holdHand(r) {
  const out = [];
  const hand = [[304, 700], [276, 706], [262, 728], [264, 752], [262, 776], [264, 800], [274, 818], [274, 842], [288, 866], [296, 896], [310, 930], [322, 972], [400, 972], [424, 926], [438, 870], [434, 820], [410, 790], [360, 750], [322, 712]];
  out.push(mass(hand, { fill: PAPER }));
  // shade on the heel of the hand and under each curled finger (the lamp is up and to the left)
  out.push(wash([[404, 870], [436, 846], [428, 920], [400, 968], [374, 960]], { opacity: 0.26 }));
  out.push(wash([[270, 746], [300, 752], [300, 758], [272, 756]], { opacity: 0.26, edge: 0 }));
  out.push(wash([[268, 800], [302, 804], [302, 810], [272, 810]], { opacity: 0.26, edge: 0 }));
  // curled fingers: index, middle, ring, the little one tucked under — thin on top, heavier below
  out.push(brush([[306, 700], [282, 704], [265, 720], [263, 740], [276, 754], [302, 757]], { w: [1.2, 2.2, 3, 4, 4, 2], taper: [0.1, 0.2], r, wobble: 0.25 }));
  out.push(brush([[298, 759], [274, 763], [262, 782], [265, 800], [282, 810], [305, 809]], { w: [1.2, 2.4, 3, 4.5, 4.5, 2], taper: [0.1, 0.2], r, wobble: 0.25 }));
  out.push(brush([[302, 811], [284, 816], [274, 832], [282, 848], [307, 851]], { w: [1.2, 2.6, 3.6, 4.5, 2], taper: [0.1, 0.2], r, wobble: 0.25 }));
  out.push(brush([[300, 853], [288, 862], [290, 876], [306, 880]], { w: [1.2, 3, 3.6, 1.5], taper: [0.1, 0.2], r }));
  // knuckle creases on the middle joints
  out.push(strokes([
    [[268, 726], [276, 731], [284, 730]],
    [[266, 778], [274, 784], [282, 783]],
    [[276, 828], [284, 833], [291, 832]],
  ], { w: 1.6, taper: [0.2, 0.4], r, opacity: 0.65 }));
  // heel of the hand down to the wrist, the thumb side heavier (away from the lamp)
  out.push(brush([[290, 874], [298, 904], [312, 938], [322, 970]], { w: [2.4, 3.4, 4, 3.4], taper: [0.1, 0.1], r, wobble: 0.25 }));
  out.push(brush([[438, 836], [440, 872], [426, 924], [404, 968]], { w: [3, 6, 7, 5], taper: [0.1, 0.1], r, wobble: 0.25 }));
  out.push(brush([[316, 902], [340, 912], [362, 906]], { w: 1.6, taper: [0.3, 0.5], r, opacity: 0.55 }));
  return out.join('');
}

/** The ribbed sweater cuff over the wrist, drawn after the hand so the hand enters it. */
function cuff(r) {
  const [ex, ey] = ELBOW;
  const [wx, wy] = WRIST;
  const len = Math.hypot(wx - ex, wy - ey);
  const d = [(wx - ex) / len, (wy - ey) / len];
  const n = [-d[1], d[0]];
  const at = (s, k, half = 58) => [wx + d[0] * s + n[0] * k * half, wy + d[1] * s + n[1] * k * half];
  const band = [at(4, -1, 56), at(12, 0, 56), at(4, 1, 56), at(-44, 1), at(-44, -1)];
  const ribs = [];
  for (let i = 0; i < 9; i += 1) {
    const k = -0.84 + (i / 8) * 1.68;
    ribs.push([at(4 + 6 * (1 - k * k), k, 56), at(-40, k)]);
  }
  return [
    sumi(band, { angle: (Math.atan2(d[1], d[0]) * 180) / Math.PI }),
    strokes(ribs, { w: 2.6, taper: [0.2, 0.3], r, fill: PAPER, opacity: 0.5 }),
    brush([at(4, -1.02, 56), at(12, 0, 56), at(4, 1.02, 56)], { w: [3, 4, 5], taper: [0.1, 0.1], r }),
  ].join('');
}

/** The thumb on the front of the note, stopped just under the squeezed-in line. */
function thumb(r) {
  const out = [];
  const shape = [[402, 884], [386, 850], [372, 816], [365, 786], [364, 764], [372, 750], [388, 748], [402, 760], [414, 788], [428, 826], [438, 866], [426, 904]];
  out.push(mass(shape, { fill: PAPER }));
  out.push(wash([[412, 800], [428, 830], [438, 868], [424, 900], [420, 850]], { opacity: 0.24, edge: 0 }));
  out.push(brush([[398, 880], [382, 842], [370, 806], [364, 776], [369, 754]], { w: [3, 3, 2.4, 1.8, 1.4], taper: [0.1, 0.2], r }));
  out.push(brush([[368, 756], [380, 747], [396, 754], [410, 782], [426, 824], [438, 866], [432, 900]], { w: [1.6, 2.6, 3.6, 5, 5.5, 5, 4], taper: [0.1, 0.1], r }));
  // nail and the joint crease
  out.push(brush([[371, 762], [382, 755], [393, 764], [390, 778], [376, 780], [371, 766]], { w: 1.5, taper: [0.1, 0.1], r, opacity: 0.75 }));
  out.push(brush([[378, 812], [394, 804], [408, 806]], { w: 1.8, taper: [0.3, 0.3], r, opacity: 0.6 }));
  return out.join('');
}

/** Glass bottle in a local frame: neck along y at x = 0, mouth toward −y, base at y = 306. */
function bottle(r, k = 1) {
  const out = [];
  const outline = [[-15, -150], [15, -150], [16, -20], [18, 40], [42, 90], [48, 130], [48, 292], [40, 306], [-40, 306], [-48, 292], [-48, 130], [-42, 90], [-18, 40], [-16, -20]];
  out.push(mass(outline, { fill: PAPER }));
  out.push(mass(outline, { fill: INDIGO, opacity: 0.22 }));
  out.push(wash([[16, 60], [42, 96], [46, 290], [30, 300], [24, 120]], { opacity: 0.32, edge: 0.6 }));
  out.push(brush([[-30, 120], [-32, 200], [-30, 280]], { w: 7 * k, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.9 }));
  out.push(brush([[-8, -140], [-8, -40]], { w: 4 * k, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.8 }));
  out.push(brush([...outline, outline[0]], { w: [3, 3, 3, 4, 5, 5, 5, 5, 4, 3, 3, 3, 3, 3, 3].map((v) => v * k), taper: [0, 0], r, wobble: 0.2 }));
  out.push(brush([[-18, -136], [18, -136]], { w: 3 * k, taper: [0, 0], r }));
  out.push(`<ellipse cx="0" cy="-150" rx="15" ry="4.5" fill="${INDIGO}" fill-opacity="0.5" stroke="${INK}" stroke-width="${2.4 * k}"/>`);
  return out.join('');
}

/** The emptied bottle standing on the gunwale under the lantern, its cork beside it. */
function bottleOnRail(r) {
  const base = 1249;
  const s = 0.52;
  return [
    wash([[70, base + 2], [200, base - 2], [196, base + 10], [74, base + 12]], { opacity: 0.35, sharp: true, edge: 0 }),
    place(bottle(r, 1.7), { origin: [132, base - 306 * s], angle: 3, scale: s }),
    mass([[176, base - 20], [200, base - 22], [202, base - 2], [178, base]], { fill: INK }),
    brush([[180, base - 16], [194, base - 17]], { w: 2.4, taper: [0.2, 0.2], fill: PAPER, opacity: 0.5 }),
  ].join('');
}

export default crewPlate({
  n: 6,
  title: 'Uyum',
  seed: 0x0b06,
  detail: { x: 0.42, y: 0.34, zoom: 1.45 },
  railY: 1250,
  boat: [1100, 0.7],
  storm: 'left',
  draw: (r) => ({
    back: bottleOnRail(r),
    figure: [sweater(r), neck(r), collar(r), braid(r), head(r), nearArm(r), sweaterLight(r), holdHand(r), cuff(r)].join('\n'),
    front: [lantern(r), note(r), thumb(r)].join('\n'),
  }),
});
