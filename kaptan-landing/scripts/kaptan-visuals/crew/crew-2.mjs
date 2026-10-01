// Crew No. 02 · Okuyucu — an old sailor in round spectacles at the chart table, reading a long
// printed disclosure, one finger tracing the line with the amount. Style: ./style.mjs, STYLE.md.

import { flatHand, pointingHand } from './hands.mjs';
import { INDIGO, INK, PAPER, RED, brush, crewPlate, dry, g, mass, place, sample, strokes, sumi, wash } from './style.mjs';

const SHEET = '#FBFAF6';

/* ── Chart table + the printout (a quad in perspective) ─────────────────────────────────────── */

const SHEET_QUAD = { a: [392, 1086], b: [772, 1080], c: [846, 1432], d: [318, 1440] }; // far-left, far-right, near-right, near-left
const TRACE_ROW = 0.716; // the line under the finger
const AMOUNT = [0.33, 0.5]; // where the amount sits on that line (u)

function onSheet(u, v) {
  const { a, b, c, d } = SHEET_QUAD;
  const top = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const bot = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u];
  const vv = v ** 1.35; // perspective: rows bunch up toward the far edge
  return [top[0] + (bot[0] - top[0]) * vv, top[1] + (bot[1] - top[1]) * vv];
}

function table(r) {
  const out = [];
  const top = [[40, 1094], [1160, 1086], [1220, 1432], [-20, 1442]];
  out.push(mass(top, { sharp: true, fill: PAPER }));
  out.push(mass(top, { sharp: true, fill: INDIGO, opacity: 0.62 }));
  const grain = [];
  for (let i = 0; i < 12; i += 1) {
    const t = (i + r() * 0.6) / 12;
    const y = 1100 + t ** 1.2 * 330;
    grain.push([[-10 + r() * 80, y + 4], [600, y + 4 * (r() - 0.5)], [1210 - r() * 80, y - 2]]);
  }
  out.push(dry(strokes(grain, { w: 5, taper: [0.2, 0.3], r, fill: INK, opacity: 0.7 })));
  out.push(brush([[40, 1094], [600, 1089], [1160, 1086]], { w: 6, taper: [0.02, 0.02], r }));
  out.push(mass([[-20, 1438], [1220, 1428], [1220, 1490], [-20, 1490]], { sharp: true, fill: INK }));
  out.push(brush([[-20, 1446], [600, 1440], [1220, 1436]], { w: 3, taper: [0, 0], fill: PAPER, opacity: 0.45 }));
  return out.join('');
}

function printout(r) {
  const out = [];
  const { a, b, c, d } = SHEET_QUAD;
  out.push(wash([[d[0] + 10, d[1] + 14], [c[0] + 22, c[1] + 8], [b[0] + 16, b[1] + 8], [b[0] - 20, b[1] + 60]], { opacity: 0.3, sharp: true }));
  out.push(mass([a, b, c, [c[0] + 4, 1470], [d[0] - 6, 1470], d], { sharp: true, fill: SHEET }));
  // fan-fold: tractor holes and tear lines along both margins, one perforated fold
  for (const u of [0.065, 0.935]) {
    for (let v = 0.05; v < 1; v += 0.07) {
      const [x, y] = onSheet(u, v);
      const s = 3 + v * 3.4;
      out.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${s.toFixed(1)}" ry="${(s * 0.7).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-opacity="0.6"/>`);
    }
  }
  for (const u of [0.12, 0.88]) out.push(brush([onSheet(u, 0), onSheet(u, 1)], { w: 1.2, taper: [0, 0], opacity: 0.25 }));
  const fold = 0.34;
  out.push(brush([onSheet(0, fold), onSheet(1, fold)], { w: 1.6, taper: [0.05, 0.05], opacity: 0.4 }));
  const head = [onSheet(0.18, 0.05), onSheet(0.6, 0.05), onSheet(0.6, 0.09), onSheet(0.18, 0.09)];
  out.push(mass(head, { sharp: true, fill: INK, opacity: 0.85 }));
  for (let v = 0.14; v < 0.99; v += 0.048) {
    if (Math.abs(v - fold) < 0.02) continue;
    const isTrace = Math.abs(v - TRACE_ROW) < 0.024;
    let u = 0.17;
    const end = isTrace ? 0.82 : 0.8 + r() * 0.03 - (r() < 0.2 ? 0.25 : 0);
    const th = 0.0075 + v * 0.004;
    while (u < end) {
      let u1 = Math.min(end, u + 0.03 + r() * 0.1);
      if (isTrace && u < AMOUNT[0] && u1 > AMOUNT[0] - 0.02) u1 = AMOUNT[0] - 0.02;
      if (isTrace && u >= AMOUNT[0] - 0.02 && u < AMOUNT[1]) {
        u = AMOUNT[0];
        u1 = AMOUNT[1];
      }
      const bold = isTrace && u >= AMOUNT[0] && u1 <= AMOUNT[1] + 0.001;
      const t2 = bold ? th * 1.6 : th;
      out.push(mass([onSheet(u, v - (t2 - th)), onSheet(u1, v - (t2 - th)), onSheet(u1, v + th), onSheet(u, v + th)], { sharp: true, fill: INK, opacity: bold ? 0.95 : isTrace ? 0.8 : 0.5 }));
      u = u1 + 0.018;
    }
  }
  // the amount, underlined once in red pencil — the plate's only red
  out.push(brush([onSheet(AMOUNT[0] - 0.01, TRACE_ROW + 0.03), onSheet(AMOUNT[1] + 0.01, TRACE_ROW + 0.027)], { w: 3.4, taper: [0.1, 0.3], fill: RED, r, wobble: 0.3 }));
  // the tail spills over the table edge toward us
  out.push(brush([[d[0] - 4, d[1] + 2], [(d[0] + c[0]) / 2, (d[1] + c[1]) / 2 + 4], [c[0] + 3, c[1]]], { w: 3, taper: [0.05, 0.05] }));
  out.push(wash([[d[0] - 6, d[1] + 8], [c[0] + 4, c[1] + 6], [c[0] + 4, 1470], [d[0] - 6, 1470]], { opacity: 0.16, sharp: true, edge: 0 }));
  return out.join('');
}

/* ── Figure ─────────────────────────────────────────────────────────────────────────────────── */
// Light from the upper left. He leans toward his pointing (left) hand: that shoulder drops, the
// head turns ~17° toward it and rolls a few degrees down, the right half of the sweater is shade.

const HEAD = { cx: 596, r: 160, turn: (19 * Math.PI) / 180, roll: 4, pivot: [600, 700] };

/** Frontal head coords → turned: points sit on a cylinder of radius r + z around cx (z: depth). */
function turn(p, z = 0, { cx, r, turn: a } = HEAD) {
  const R = r + z;
  const s = Math.max(-1, Math.min(1, (p[0] - cx) / R));
  return [cx + R * Math.sin(Math.asin(s) + a), p[1]];
}
const T = (pts, z = 0) => pts.map((p, i) => turn(p, Array.isArray(z) ? z[i] : z));

/** Soft stubble: fine low dots scattered inside a band along `edge` (toward `inward`). */
function stubble(r, edge, { depth = 26, count = 240, opacity = 0.38 } = {}) {
  const s = sample(edge, 5, false);
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const k = Math.floor(r() * (s.length - 2)) + 1;
    const [a, b] = [s[k - 1], s[k + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / len; // inward normal for an edge drawn left → right along the jaw
    const ny = -(b[0] - a[0]) / len;
    const d = 3 + r() ** 1.6 * depth;
    const rad = 0.6 + r() * 0.7;
    const x = s[k][0] + nx * d + (r() - 0.5) * 4;
    const y = s[k][1] + ny * d + (r() - 0.5) * 4;
    dots.push(`M${x.toFixed(1)} ${y.toFixed(1)}m-${rad.toFixed(1)} 0a${rad.toFixed(1)} ${rad.toFixed(1)} 0 1 0 ${(rad * 2).toFixed(1)} 0a${rad.toFixed(1)} ${rad.toFixed(1)} 0 1 0 -${(rad * 2).toFixed(1)} 0`);
  }
  return `<path d="${dots.join('')}" fill="${INK}" fill-opacity="${opacity}"/>`;
}

/** A cable (rope) plait along a curved centreline: stacked slanted twists, narrowing (`squeeze`)
 * toward the end where the knit turns away from us. */
function cable(r, line, { amp = 15, pitch = 30, opacity = 0.7, squeeze = 0 } = {}) {
  const s = sample(line, 4, false);
  const lens = [0];
  for (let i = 1; i < s.length; i += 1) lens.push(lens[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  const total = lens[lens.length - 1];
  const frame = (d) => {
    let i = 1;
    while (i < s.length - 1 && lens[i] < d) i += 1;
    const [a, b] = [s[i - 1], s[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const k = (d - lens[i - 1]) / len;
    return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], u, n: [-u[1], u[0]] };
  };
  const twists = [];
  for (let d = 8; d < total - pitch; d += pitch) {
    const { p, u, n } = frame(d);
    const w = amp * (1 - squeeze * (d / total)) * (0.9 + r() * 0.2);
    twists.push([at2(p, u, n, -4, -w), at2(p, u, n, pitch * 0.45, -w * 0.1), at2(p, u, n, pitch * 0.95, w)]);
  }
  return strokes(twists, { w: [2, 7, 2.5], taper: [0.3, 0.35], r, wobble: 0.3, fill: PAPER, opacity });
}

function sweater(r) {
  const out = [];
  const body = [[440, 700], [330, 736], [238, 780], [194, 846], [172, 940], [158, 1040], [168, 1110], [1046, 1104], [1052, 1010], [1040, 924], [1004, 862], [936, 806], [826, 740], [630, 760]];
  out.push(sumi(body, { angle: 62, base: 0.9 }));
  // the shade plane: everything right of the fall line under the collar is flat, full ink
  out.push(mass([[760, 752], [826, 740], [936, 806], [1004, 862], [1040, 924], [1052, 1010], [1046, 1104], [850, 1106], [838, 1000], [812, 890], [780, 800]], { fill: INK, opacity: 0.94 }));
  // the lit shoulder and chest: dry-brush sheen where the light falls
  out.push(dry(strokes([
    [[206, 850], [270, 792], [372, 752], [440, 738]],
    [[180, 934], [246, 850], [342, 796], [430, 780]],
    [[168, 1004], [214, 930], [296, 866]],
  ], { w: [22, 16, 12], taper: [0.25, 0.5], r, fill: PAPER, opacity: 0.32 }), -38));
  // decisive folds: armpit to elbow on the lit side, a pull toward the reaching left arm
  out.push(strokes([
    [[292, 890], [284, 972], [300, 1052]],
    [[236, 1000], [268, 1040]],
  ], { w: [3, 7, 2], taper: [0.35, 0.4], r, wobble: 0.35, fill: PAPER, opacity: 0.5 }));
  out.push(strokes([
    [[640, 900], [720, 960], [800, 1030]],
    [[610, 980], [700, 1030], [770, 1080]],
  ], { w: [2, 6, 3], taper: [0.4, 0.5], r, wobble: 0.35, fill: PAPER, opacity: 0.3 }));
  // cable knit: one plait over the lit chest, its twin mostly lost in the shade, a broken purl rib
  out.push(cable(r, [[418, 792], [384, 870], [366, 960], [370, 1040], [384, 1100]], { amp: 16, pitch: 30, opacity: 0.66 }));
  out.push(brush([[462, 800], [436, 900], [428, 990], [436, 1080]], { w: [2, 3.5, 1.5, 3], taper: [0.3, 0.4], r, wobble: 0.35, fill: PAPER, opacity: 0.38 }));
  out.push(brush([[340, 812], [322, 880]], { w: 2.6, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.32 }));
  out.push(brush([[318, 930], [312, 1010], [318, 1070]], { w: 2.6, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.3 }));
  out.push(cable(r, [[790, 790], [820, 870], [838, 960], [842, 1050]], { amp: 12, pitch: 28, opacity: 0.3, squeeze: 0.35 }));
  // silhouette: thick where the shoulder turns away into shade, broken hairline in the light
  out.push(brush([[826, 742], [936, 806], [1004, 862], [1040, 924], [1052, 1010], [1048, 1100]], { w: [4, 9, 12, 11, 9, 6], taper: [0.2, 0.05], r, wobble: 0.3 }));
  return out.join('');
}

function collar(r) {
  const outline = [[420, 692], [500, 718], [606, 728], [712, 708], [800, 664], [820, 712], [796, 752], [694, 792], [584, 804], [470, 786], [410, 745]];
  const ribs = [];
  for (let i = 0; i < 17; i += 1) {
    const t = i / 16;
    const x0 = 432 + t * 376 + (r() - 0.5) * 12;
    const [x] = turn([x0, 0], -10, { cx: 610, r: 200, turn: 0.18 });
    const top = 712 + Math.sin(t * Math.PI) * 18;
    const len = 44 + r() * 30 - Math.abs(t - 0.4) * 16;
    ribs.push([[x, top + r() * 6], [x - 6 + t * 6, top + len]]);
  }
  return [
    mass(outline),
    strokes(ribs.slice(0, 11), { w: [2.2, 3.6, 2], taper: [0.3, 0.35], r, wobble: 0.35, fill: PAPER, opacity: 0.52 }),
    strokes(ribs.slice(11), { w: [1.8, 2.8, 1.6], taper: [0.3, 0.35], r, wobble: 0.35, fill: PAPER, opacity: 0.22 }),
    brush([[430, 700], [520, 724], [612, 732], [712, 712]], { w: 2.4, taper: [0.2, 0.3], r, fill: PAPER, opacity: 0.35 }),
  ].join('');
}

function brows(r) {
  const brow = (x0, y0, x1, y1, lift, z, n) => {
    const list = [];
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * lift;
      list.push(T([[x, y + 6], [x + 12, y - 3 + r() * 4], [x + 18, y - 4]], z));
    }
    return strokes(list, { w: [3.6, 3, 1.2], taper: [0.2, 0.6], r, wobble: 0.3 });
  };
  return brow(462, 452, 526, 444, 10, 8, 7) + brow(588, 446, 668, 452, 12, 8, 6);
}

function eyes(r) {
  const out = [];
  out.push(brush(T([[468, 476], [494, 488], [526, 479]], 6), { w: [2.5, 6.5, 3], taper: [0.2, 0.3], r }));
  out.push(brush(T([[592, 480], [620, 492], [652, 482]], 6), { w: [3, 6, 4.5], taper: [0.2, 0.25], r }));
  out.push(strokes([T([[478, 462], [498, 466], [520, 463]], 6), T([[600, 466], [622, 470], [646, 468]], 6)], { w: [1, 2.2, 1], taper: [0.3, 0.3], r, opacity: 0.7 }));
  out.push(mass(T([[491, 488], [502, 488], [500, 494], [493, 494]], 6)));
  out.push(mass(T([[617, 492], [628, 492], [626, 498], [619, 498]], 6)));
  out.push(strokes([
    T([[478, 508], [500, 514], [522, 508]], 4),
    T([[604, 512], [626, 517], [648, 511]], 4),
    T([[662, 480], [676, 476]], 0), T([[662, 492], [678, 496]], 0),
    T([[452, 482], [440, 478]], 0), T([[454, 496], [440, 500]], 0),
  ], { w: [1, 2.2, 0.8], taper: [0.3, 0.4], r, opacity: 0.7 }));
  return out.join('');
}

function spectacles(r) {
  const out = [];
  const rim = (cx, cy, rad, gapAt) => {
    const pts = [];
    const ws = [];
    for (let i = 0; i <= 26; i += 1) {
      const a = gapAt + 0.32 + (i / 26) * (Math.PI * 2 - 0.5);
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      ws.push(2.2 + 3.4 * (0.5 + 0.5 * Math.cos(a - Math.PI / 4)));
    }
    return brush(T(pts, 22), { w: ws, taper: [0.06, 0.06], r, wobble: 0.25 });
  };
  out.push(rim(496, 492, 42, -2.3));
  out.push(rim(622, 494, 43, -2.1));
  out.push(brush(T([[538, 488], [558, 477], [580, 487]], 26), { w: [3, 3.8, 3], taper: [0.05, 0.05], r }));
  const [nearEdge] = T([[454, 488]], 22);
  out.push(brush([nearEdge, [438, 478], [424, 476]], { w: [3.6, 3, 2.4], taper: [0.05, 0.4], r }));
  const [farEdge] = T([[665, 490]], 22);
  out.push(brush([farEdge, [730, 476], [750, 472]], { w: [3.4, 3, 2], taper: [0.05, 0.5], r }));
  // one glint on the far lens
  out.push(brush(T([[634, 468], [650, 476]], 22), { w: 3, taper: [0.3, 0.3], fill: PAPER, opacity: 0.9 }));
  return out.join('');
}

function nose(r) {
  const out = [];
  const ridge = [[566, 494], [572, 530], [580, 568], [584, 590], [572, 605], [552, 607]];
  out.push(brush(T(ridge, [6, 16, 28, 34, 30, 20]), { w: [2, 4.5, 6.5, 8, 6, 3], taper: [0.3, 0.2], r }));
  out.push(brush(T([[530, 584], [520, 596], [534, 605]], 14), { w: [1.6, 3.6, 2.4], taper: [0.3, 0.3], r }));
  out.push(mass(T([[540, 601], [552, 599], [548, 607]], 20)));
  out.push(strokes([T([[522, 564], [506, 600], [498, 632]], 4), T([[600, 568], [620, 602], [630, 628]], 4)], { w: [1.2, 3.4, 1], taper: [0.3, 0.5], r, opacity: 0.75 }));
  return out.join('');
}

function mouth(r) {
  const tache = [];
  for (let i = 0; i < 17; i += 1) {
    const t = i / 16;
    const x = 502 + t * 118;
    const y = 612 - Math.sin(t * Math.PI) * 6;
    const drop = 16 + Math.sin(t * Math.PI) * 8 + r() * 6;
    tache.push(T([[x + (t - 0.5) * 10, y], [x + (t - 0.5) * 24, y + drop * 0.55], [x + (t - 0.5) * 32, y + drop]], 14));
  }
  return [
    wash(T([[500, 614], [560, 604], [622, 612], [640, 640], [560, 634], [490, 640]], 14), { opacity: 0.14, edge: 0 }),
    strokes(tache, { w: [5, 4, 1.2], taper: [0.15, 0.6], r, wobble: 0.3, opacity: 0.8 }),
    brush(T([[536, 656], [558, 660], [584, 655]], 10), { w: [1.4, 3.6, 1.4], taper: [0.3, 0.3], r }),
    brush(T([[546, 672], [564, 676], [580, 672]], 8), { w: [1, 2.4, 1], taper: [0.3, 0.3], r, opacity: 0.55 }),
  ].join('');
}

function head(r) {
  const out = [];
  // face silhouette in the turned frame: near side (left, lit) keeps the skull's edge and shows the
  // ear; the chin swings right; the far cheek (right, shade) is the silhouette
  const face = [[446, 392], [440, 450], [444, 520], [456, 566], [480, 614], [522, 664], [576, 702], [628, 716], [676, 700], [716, 656], [744, 596], [756, 530], [758, 470], [754, 400], [600, 382]];
  out.push(mass(face, { fill: PAPER }));
  // near ear
  const ear = [[450, 462], [428, 448], [410, 456], [402, 490], [408, 530], [424, 558], [448, 568], [458, 540]];
  out.push(mass(ear, { fill: PAPER }));
  // one shade wash: the far plane from the brow down the cheek, round the chin
  out.push(wash([[686, 404], [754, 406], [758, 480], [752, 552], [730, 626], [690, 686], [634, 716], [652, 676], [686, 640], [690, 600], [684, 540], [690, 470]], { opacity: 0.28 }));
  out.push(wash(T([[546, 612], [596, 610], [592, 638], [552, 638]], 16), { opacity: 0.16, edge: 0 }));
  // soft grey stubble on the jaw, a dry breath of grey under it
  out.push(wash([[470, 600], [520, 656], [580, 698], [630, 708], [690, 680], [728, 628], [700, 668], [630, 716], [572, 704], [512, 664]], { opacity: 0.1, edge: 0 }));
  out.push(stubble(r, [[462, 580], [484, 618], [524, 664], [576, 700], [628, 714], [676, 698], [716, 654], [742, 598]], { count: 340, opacity: 0.3 }));
  out.push(stubble(r, T([[520, 646], [560, 660], [600, 646]], 10), { depth: 18, count: 60, opacity: 0.22 }));
  // contour — near side: thin, broken where the light hits
  out.push(brush([[447, 396], [442, 440]], { w: [2.5, 3.2], taper: [0.1, 0.4], r }));
  out.push(brush([[456, 560], [470, 594], [490, 626]], { w: [2.6, 3.4, 3.4], taper: [0.3, 0.2], r }));
  out.push(brush([[496, 634], [524, 664], [576, 702], [628, 716]], { w: [3, 4, 7, 9], taper: [0.25, 0], r, wobble: 0.3 }));
  // far side: heavy where the jaw and cheek turn away from the light
  out.push(brush([[628, 716], [676, 701], [716, 657], [744, 597], [757, 530], [758, 470], [754, 404]], { w: [9, 12, 11, 9, 7, 6, 4], taper: [0, 0.3], r, wobble: 0.3 }));
  // ear: outer rim thin in the light, the inner fold heavier
  out.push(brush([[452, 464], [428, 448], [410, 456], [402, 490], [408, 530], [424, 558], [450, 570]], { w: [2, 3, 3.5, 4.5, 5.5, 5, 3], taper: [0.2, 0.3], r }));
  out.push(brush([[424, 468], [420, 496], [428, 528], [440, 540]], { w: [1.5, 4, 3, 1.5], taper: [0.3, 0.3], r }));
  out.push(brush([[450, 500], [454, 522]], { w: [1.5, 3.5], taper: [0.3, 0.3], r, opacity: 0.8 }));
  out.push(brows(r), eyes(r), nose(r), mouth(r), spectacles(r));
  // watch cap: the skull's silhouette, the turn-up band swings with the face
  out.push(sumi([[436, 394], [430, 300], [480, 236], [590, 206], [704, 226], [768, 292], [778, 394], [704, 414], [616, 420], [520, 410]], { angle: -15 }));
  out.push(dry(strokes([
    [[462, 306], [534, 252], [616, 234]],
    [[454, 350], [470, 318]],
  ], { w: [6, 11, 5], taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.55 }), -20));
  out.push(brush(T([[436, 338], [520, 352], [600, 358], [680, 350], [770, 332]], 8), { w: [2, 4.5, 3.5, 2.5, 1.5], taper: [0.05, 0.3], r, fill: PAPER, opacity: 0.8 }));
  const ribs = [];
  for (let i = 0; i < 17; i += 1) {
    const t = i / 16;
    const x = 444 + t * 322;
    const y0 = 348 + Math.sin(t * Math.PI) * 18;
    ribs.push(T([[x, y0 + r() * 5], [x + (t - 0.5) * 8, y0 + 44 + r() * 8]], 8));
  }
  out.push(strokes(ribs.slice(0, 11), { w: [1.6, 3, 1.4], taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.5 }));
  out.push(strokes(ribs.slice(11), { w: [1.4, 2.4, 1.2], taper: [0.3, 0.3], r, fill: PAPER, opacity: 0.25 }));
  return g(out, { transform: `rotate(${HEAD.roll} ${HEAD.pivot[0]} ${HEAD.pivot[1]})` });
}

/** Neck shadow inside the turtleneck (under the head, not rolled with it). */
const neck = () => mass([[520, 660], [716, 636], [736, 720], [576, 744]], { fill: INK });

/* ── Arms: elbows planted back on the table, forearms coming forward, ribbed cuffs ─────────── */

const axis = (e, w) => {
  const len = Math.hypot(w[0] - e[0], w[1] - e[1]);
  const u = [(w[0] - e[0]) / len, (w[1] - e[1]) / len];
  return { len, u, n: [-u[1], u[0]] };
};
const at2 = (p, u, n, a, b) => [p[0] + u[0] * a + n[0] * b, p[1] + u[1] * a + n[1] * b];

/** Forearm from a planted elbow to the wrist; `lit` (±1) is the normal side facing the light. */
function forearm(r, e, w, { w0 = 124, w1 = 100, lit = 1 } = {}) {
  const { len, u, n } = axis(e, w);
  const P = (a, b) => at2(e, u, n, a, b);
  const outline = [P(-w0 * 0.42, 0), P(-w0 * 0.3, w0 * 0.4), P(0, w0 * 0.5), P(len * 0.5, (w0 + w1) * 0.27), P(len - 10, w1 * 0.5), P(len, w1 * 0.48), P(len, -w1 * 0.48), P(len - 10, -w1 * 0.5), P(len * 0.5, -(w0 + w1) * 0.27), P(0, -w0 * 0.5), P(-w0 * 0.3, -w0 * 0.4)];
  const ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  const out = [sumi(outline, { angle: ang, base: 0.9 })];
  // paper gap where the forearm crosses the dark body; sheen on the lit side
  out.push(brush([P(-w0 * 0.1, lit * w0 * 0.52), P(len * 0.45, lit * (w0 + w1) * 0.28), P(len - 34, lit * w1 * 0.53)], { w: [1.5, 4, 2.5], taper: [0.4, 0.3], r, wobble: 0.3, fill: PAPER, opacity: 0.8 }));
  out.push(dry(strokes([[P(len * 0.08, lit * w0 * 0.26), P(len * 0.75, lit * w1 * 0.3)], [P(len * 0.3, lit * w0 * 0.08), P(len * 0.7, lit * w1 * 0.1)]], { w: 12, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.35 })));
  // elbow crease (the sleeve bunches where it bends)
  out.push(strokes([[P(len * 0.12, -lit * w0 * 0.3), P(len * 0.2, -lit * w0 * 0.05), P(len * 0.16, lit * w0 * 0.2)]], { w: [1.5, 4, 1.5], taper: [0.4, 0.4], r, fill: PAPER, opacity: 0.35 }));
  // shade-side contour on the table: heavy
  out.push(brush([P(-w0 * 0.2, -lit * w0 * 0.47), P(len * 0.5, -lit * (w0 + w1) * 0.28), P(len - 30, -lit * w1 * 0.52)], { w: [6, 11, 8], taper: [0.3, 0.1], r, wobble: 0.3 }));
  return out.join('');
}

/** A squared ribbed cuff over the wrist (drawn after the hand); the end is cut a little on the bias. */
function cuff(r, e, w, { w1 = 100, lit = 1, back = 40, over = 16, bias = 7 } = {}) {
  const { u, n } = axis(e, w);
  const P = (a, b) => at2(w, u, n, a, b);
  const half = w1 * 0.54;
  const box = [P(-back, half), P(over + bias, half * 0.98), P(over - bias, -half * 0.98), P(-back, -half)];
  const out = [mass(box, { sharp: true, fill: PAPER }), mass(box, { sharp: true, fill: INK, opacity: 0.95 })];
  const ribs = [];
  for (let i = 0; i < 8; i += 1) {
    const t = -0.78 + (i / 7) * 1.56;
    const tip = over + bias * t - 4;
    ribs.push([P(-back + 6 + r() * 4, half * t), P(tip, half * t * 0.98)]);
  }
  out.push(strokes(ribs, { w: [1.2, 3, 1.6], taper: [0.25, 0.2], r, wobble: 0.3, fill: PAPER, opacity: 0.5 }));
  // the seam where the rib meets the sleeve, broken; the cut edge, heavy on the shade side
  out.push(brush([P(-back, lit * half * 0.9), P(-back - 2, -lit * half * 0.2)], { w: [3, 1.5], taper: [0.2, 0.5], r, fill: PAPER, opacity: 0.6 }));
  out.push(brush([P(over + bias * lit, lit * half), P(over - bias * lit, -lit * half)], { w: [3, 9], taper: [0.2, 0.05], r }));
  return out.join('');
}

const LEFT_ARM = { e: [214, 1104], w: [404, 1212], w0: 120, w1: 98, lit: -1 };
const RIGHT_ARM = { e: [1000, 1104], w: [838, 1228], w0: 124, w1: 94, lit: -1 };

function arms(r) {
  return [
    forearm(r, LEFT_ARM.e, LEFT_ARM.w, LEFT_ARM),
    forearm(r, RIGHT_ARM.e, RIGHT_ARM.w, { ...RIGHT_ARM, lit: 1 }),
  ].join('');
}

function hands(r) {
  const [tx, ty] = onSheet(AMOUNT[1] + 0.035, TRACE_ROW + 0.006);
  const wrist = RIGHT_ARM.w;
  const angle = (Math.atan2(wrist[1] - ty, wrist[0] - tx) * 180) / Math.PI;
  const scale = Math.hypot(wrist[0] - tx, wrist[1] - ty) / 214;
  return [
    // their shadows on the sheet
    wash([[410, 1250], [560, 1262], [610, 1240], [470, 1276]], { opacity: 0.2, edge: 0 }),
    wash([[610, 1318], [700, 1300], [820, 1272], [760, 1300], [640, 1326]], { opacity: 0.2, edge: 0 }),
    place(flatHand(r), { origin: LEFT_ARM.w, angle: 12, scale: [0.95, 1.12] }),
    place(pointingHand(r), { origin: [tx, ty], angle, scale }),
    cuff(r, LEFT_ARM.e, LEFT_ARM.w, { w1: LEFT_ARM.w1, lit: -1 }),
    cuff(r, RIGHT_ARM.e, RIGHT_ARM.w, { w1: RIGHT_ARM.w1, lit: 1 }),
  ].join('');
}

export default crewPlate({
  n: 2,
  title: 'Okuyucu',
  seed: 0x0b02,
  detail: { x: 0.53, y: 0.55, zoom: 1.45 },
  railY: 1085,
  boat: [180, 0.9],
  storm: 'right',
  draw: (r) => ({
    figure: [sweater(r), collar(r), neck(), head(r), table(r), printout(r), arms(r), hands(r)].join('\n'),
  }),
});
