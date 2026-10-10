// Ink drawings for the six storyboard panels of the "Altı adımda" drawer (src/data/demo-flow.js
// `art`), in the crew plates' language (scripts/kaptan-visuals/crew/STYLE.md): brush contours that
// swell and thin, flat indigo washes in two or three values, sumi masses, paper left bare, the
// storm's rain and horizon behind. No red: the page's three red marks are the needle, the boat
// flag and the one ONAYLANDI stamp in the Pusula scene, so the last panel's stamp stays ink.
// Every drawing is data (tag + attributes) built from numbers, rendered through h(): no markup
// strings are parsed. Deterministic: the brush "pressure" is a fixed function of the stroke.

import { h } from './dom.js';

export const ART_VIEWBOX = '0 0 160 100';

// Presentation attributes cannot read CSS variables: ink is currentColor (the panel's ink); paper
// and wash fills carry a class the stylesheet colours (demo-drawer.css).
const INK = 'currentColor';
const PAPER = { class: 'storyboard__paper' };
const WASH = (opacity) => ({ class: 'storyboard__wash', 'fill-opacity': opacity });

const round = (n) => Math.round(n * 10) / 10;

/** Catmull-Rom samples through the control points (as crew `curve()` does). */
/** Straight segments through the points (ruled edges: paper, ledgers, the stamp block). */
function polyline(points, steps = 4) {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, b] = [points[i], points[i + 1]];
    for (let s = 0; s < steps; s += 1) out.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function sample(points, steps = 10) {
  if (points.length < 3) return polyline(points, steps);
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * A brush stroke as a filled shape: width `w` swells and thins along the stroke (seeded by
 * `seed`), tapers at both ends; `straight` keeps ruled edges (no swell).
 */
export function brush(points, { w = 2, taper = [0.25, 0.35], seed = 1, straight = false } = {}) {
  const pts = straight ? polyline(points) : sample(points, 10);
  const n = pts.length - 1;
  const left = [];
  const right = [];
  pts.forEach((p, i) => {
    const t = i / n;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const swell = straight ? 1 : 1 + 0.28 * Math.sin(t * 9.1 + seed * 1.7) * Math.sin(t * 3.3 + seed);
    const ends = Math.min(1, taper[0] ? t / taper[0] : 1, taper[1] ? (1 - t) / taper[1] : 1);
    const half = (w / 2) * swell * (0.18 + 0.82 * Math.sqrt(Math.max(0, ends)));
    left.push([p[0] + nx * half, p[1] + ny * half]);
    right.push([p[0] - nx * half, p[1] - ny * half]);
  });
  const ring = [...left, ...right.reverse()];
  const d = `M${ring.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;
  return ['path', { d, fill: INK }];
}

/** A flat shape through the points (smooth unless `sharp`). */
function shape(points, attrs, sharp = false) {
  const pts = sharp ? points : sample([...points, points[0]], 6);
  return ['path', { d: `M${pts.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`, ...attrs }];
}

const wash = (points, opacity = 0.3, sharp = false) => shape(points, WASH(opacity), sharp);
const paper = (points, sharp = true) => shape(points, PAPER, sharp);
const sumi = (points, sharp = false) => shape(points, { fill: INK }, sharp);

/** Rain: thin tapered strokes slanting down-left, as in every crew plate's sky. */
const rain = (drops) => drops.map(([x, y, l], i) => brush([[x, y], [x - l * 0.35, y + l]], { w: 0.9, taper: [0.5, 0.5], seed: i + 3 }));

/** The horizon and one storm sweep, behind everything (the plates' sky and sea). */
const horizon = (y, seed = 1) => [
  wash([[0, y], [160, y - 1], [160, 100], [0, 100]], 0.16, true),
  brush([[0, y], [70, y - 0.6], [160, y - 1]], { w: 1.1, taper: [0, 0], seed, straight: true }),
];

/** A slip of paper (a disclosure): paper sheet, brush contour heavier on the shadow side, text lines. */
function slip([x, y], width, height, { lines = 4, seed = 1 } = {}) {
  const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  const textLines = Array.from({ length: lines }, (_, i) => {
    const ly = y + 8 + i * Math.min(8, (height - 12) / lines);
    const lw = (width - 12) * (i % 3 === 2 ? 0.6 : 0.9 - (i % 2) * 0.12);
    return brush([[x + 6, ly], [x + 6 + lw, ly]], { w: 1.1, taper: [0.1, 0.3], seed: seed + i, straight: true });
  });
  return [
    wash([[x + 3, y + height], [x + width + 3, y + height], [x + width + 3, y + 3], [x + width, y + 3], [x + width, y + height - 0.1]], 0.55, true),
    paper(corners),
    brush([corners[0], corners[1]], { w: 1.2, taper: [0.05, 0.2], seed, straight: true }),
    brush([corners[1], corners[2]], { w: 2.6, taper: [0.1, 0.1], seed: seed + 1, straight: true }),
    brush([corners[2], corners[3]], { w: 2.2, taper: [0.1, 0.05], seed: seed + 2, straight: true }),
    brush([corners[3], corners[0]], { w: 1, taper: [0.2, 0.2], seed: seed + 3, straight: true }),
    ...textLines,
  ];
}

const code = (x, y, text, size = 12) => ['text', { x, y, class: 'storyboard__code', 'font-size': size, fill: INK }, text];

/** @type {Readonly<Record<string, ReadonlyArray<[string, object, ...unknown[]]>>>} */
export const STORYBOARD_ART = Object.freeze({
  // 1. A disclosure slip falls out of the storm onto a heavy sea.
  arrive: [
    wash([[0, 22], [50, 12], [110, 18], [160, 8], [160, 20], [104, 28], [46, 22], [0, 32]], 0.14),
    ...horizon(58, 2),
    wash([[0, 70], [30, 62], [62, 70], [96, 60], [128, 68], [160, 60], [160, 100], [0, 100]], 0.45),
    sumi([[0, 84], [24, 76], [52, 84], [80, 74], [110, 84], [140, 76], [160, 82], [160, 100], [0, 100]]),
    brush([[0, 70], [30, 62], [62, 70], [96, 60], [128, 68], [160, 60]], { w: 3.2, seed: 4 }),
    brush([[20, 90], [44, 86], [70, 91]], { w: 1.6, seed: 5 }),
    ['g', { transform: 'rotate(-16 84 34)' }, ...slip([66, 12], 36, 44, { lines: 4, seed: 7 })],
    ...rain([[14, 6, 18], [34, 18, 14], [124, 4, 20], [142, 22, 16], [112, 30, 12], [150, 2, 12], [24, 40, 10]]),
  ],
  // 2. The slip is read on the table and tagged with its event type.
  read: [
    wash([[0, 66], [160, 60], [160, 100], [0, 100]], 0.5, true),
    brush([[0, 66], [160, 60]], { w: 2.4, taper: [0, 0], seed: 3, straight: true }),
    ['g', { transform: 'rotate(-4 50 50)' }, ...slip([22, 14], 50, 70, { lines: 6, seed: 2 })],
    brush([[29, 46], [60, 45]], { w: 4.2, taper: [0.08, 0.15], seed: 6 }),
    // the tag, tied on with a brush line
    brush([[72, 40], [80, 37], [88, 39]], { w: 1.2, seed: 9 }),
    paper([[88, 28], [136, 28], [146, 40], [136, 52], [88, 52]]),
    brush([[88, 28], [136, 28], [146, 40]], { w: 1.4, taper: [0.05, 0.1], seed: 10, straight: true }),
    brush([[146, 40], [136, 52], [88, 52], [88, 28]], { w: 2.6, taper: [0.05, 0.1], seed: 11, straight: true }),
    sumi([[93, 37], [97, 37], [97, 43], [93, 43]], true),
    code(101, 45, 'E1–E4'),
  ],
  // 3. Size and precedent are weighed on a balance.
  weigh: [
    ...horizon(64, 3),
    wash([[30, 92], [130, 92], [124, 100], [36, 100]], 0.55, true),
    sumi([[70, 92], [90, 92], [86, 84], [74, 84]], true),
    brush([[80, 86], [80, 24]], { w: 4.4, taper: [0, 0.15], seed: 2, straight: true }),
    sumi([[76.5, 18], [83.5, 18], [83.5, 24], [76.5, 24]]),
    brush([[34, 34], [80, 26], [126, 20]], { w: 3, taper: [0.15, 0.15], seed: 4 }),
    brush([[34, 34], [25, 60]], { w: 1, taper: [0.1, 0.1], seed: 5, straight: true }),
    brush([[34, 34], [45, 60]], { w: 1, taper: [0.1, 0.1], seed: 6, straight: true }),
    brush([[126, 20], [115, 46]], { w: 1, taper: [0.1, 0.1], seed: 7, straight: true }),
    brush([[126, 20], [137, 46]], { w: 1, taper: [0.1, 0.1], seed: 8, straight: true }),
    // heavier pan (the company's size): a stack of slips
    wash([[21, 60], [49, 60], [44, 68], [26, 68]], 0.7, true),
    brush([[20, 60], [35, 69], [50, 60]], { w: 2.6, taper: [0.1, 0.1], seed: 9 }),
    ...slip([26, 49], 18, 10, { lines: 1, seed: 12 }),
    ...slip([28, 41], 16, 8, { lines: 0, seed: 14 }),
    // lighter pan (precedent)
    wash([[111, 46], [141, 46], [136, 54], [116, 54]], 0.4, true),
    brush([[110, 46], [126, 55], [142, 46]], { w: 2.6, taper: [0.1, 0.1], seed: 10 }),
    ...slip([119, 37], 14, 9, { lines: 0, seed: 16 }),
    ...rain([[10, 8, 14], [148, 6, 12], [58, 4, 10]]),
  ],
  // 4. A lens goes over the slip; the overstated line is struck through.
  doubt: [
    wash([[0, 70], [160, 64], [160, 100], [0, 100]], 0.4, true),
    ...slip([18, 10], 58, 80, { lines: 8, seed: 3 }),
    // the lens: paper glass, heavy ring, sumi handle
    ['circle', { cx: 94, cy: 46, r: 23, ...PAPER }],
    wash([[76, 56], [90, 66], [110, 62], [116, 48], [106, 62], [90, 64]], 0.35),
    brush([[82, 48], [104, 47]], { w: 1.4, seed: 4, straight: true }),
    brush([[82, 55], [100, 54]], { w: 1.4, seed: 5, straight: true }),
    brush([[82, 40], [106, 39]], { w: 1.4, seed: 6, straight: true }),
    brush([[78, 49], [110, 44]], { w: 3.4, taper: [0.05, 0.25], seed: 7 }),
    brush([[94, 23], [114, 30], [117, 48], [108, 64], [94, 69]], { w: 4.4, taper: [0.1, 0.1], seed: 8 }),
    brush([[94, 69], [76, 63], [71, 46], [78, 30], [94, 23]], { w: 2, taper: [0.1, 0.1], seed: 9 }),
    sumi([[108, 62], [114, 58], [140, 86], [133, 92]], true),
  ],
  // 5. The rules decide, line by line, in the ledger (a ruled plate, double rule at the head).
  rules: [
    wash([[30, 92], [134, 92], [134, 96], [30, 96]], 0.55, true),
    paper([[26, 6], [130, 6], [130, 90], [26, 90]]),
    brush([[26, 6], [130, 6]], { w: 1.2, taper: [0, 0], seed: 1, straight: true }),
    brush([[130, 6], [130, 90], [26, 90]], { w: 2.8, taper: [0, 0.05], seed: 2, straight: true }),
    brush([[26, 90], [26, 6]], { w: 1.2, taper: [0.1, 0], seed: 3, straight: true }),
    brush([[26, 13], [130, 13]], { w: 1, taper: [0, 0], seed: 4, straight: true }),
    brush([[58, 13], [58, 90]], { w: 0.9, taper: [0, 0], seed: 5, straight: true }),
    ...[33, 51, 69].map((y, i) => brush([[26, y], [130, y]], { w: 0.6, taper: [0, 0], seed: 6 + i, straight: true })),
    code(30, 28, 'R01'),
    code(30, 46, 'R02'),
    code(30, 64, 'R03'),
    code(30, 82, 'R04'),
    ...[24, 42, 60, 78].map((y, i) => brush([[63, y], [63 + [30, 36, 26, 32][i], y]], { w: 1.2, taper: [0.1, 0.3], seed: 10 + i, straight: true })),
    // ticks where the rule passes; one line struck through (the gate only reduces or refuses)
    brush([[104, 22], [108, 27], [118, 16]], { w: 2.4, taper: [0.1, 0.3], seed: 14 }),
    brush([[104, 40], [108, 45], [118, 34]], { w: 2.4, taper: [0.1, 0.3], seed: 15 }),
    brush([[104, 76], [108, 81], [118, 70]], { w: 2.4, taper: [0.1, 0.3], seed: 16 }),
    brush([[61, 61], [124, 57]], { w: 3, taper: [0.05, 0.3], seed: 17 }),
  ],
  // 6. A person brings the stamp down on the proposal: nothing moves without them.
  approve: [
    wash([[0, 74], [160, 68], [160, 100], [0, 100]], 0.5, true),
    ['g', { transform: 'rotate(-4 80 76)' }, ...slip([26, 60], 108, 32, { lines: 3, seed: 5 })],
    // the impression, already printed, in ink
    ['g', { transform: 'rotate(-6 102 74)' },
      brush([[86, 66], [118, 66], [118, 82], [86, 82], [86, 66]], { w: 2.2, taper: [0, 0], seed: 8, straight: true }),
      brush([[91, 74], [113, 74]], { w: 2.6, taper: [0.1, 0.2], seed: 9 }),
    ],
    // the stamp: sumi handle, paper block, coming down
    wash([[84, 56], [120, 56], [116, 60], [88, 60]], 0.6, true),
    sumi([[95, 4], [105, 4], [108, 10], [106, 28], [94, 28], [92, 10]]),
    paper([[84, 30], [116, 30], [116, 44], [84, 44]]),
    brush([[84, 30], [116, 30]], { w: 1.2, taper: [0, 0], seed: 10, straight: true }),
    brush([[116, 30], [116, 44], [84, 44]], { w: 2.8, taper: [0, 0.05], seed: 11, straight: true }),
    sumi([[84, 44], [116, 44], [116, 48], [84, 48]], true),
    brush([[80, 50], [72, 54]], { w: 1.2, taper: [0.2, 0.4], seed: 12 }),
    brush([[120, 50], [128, 54]], { w: 1.2, taper: [0.2, 0.4], seed: 13 }),
  ],
});

function render([tag, attrs, ...children]) {
  const kids = children.map((child) => (Array.isArray(child) ? render(child) : child));
  return h(tag, attrs, ...kids);
}

/** The drawing for `art` as a decorative <svg> (empty frame for an unknown name). */
export function renderStoryboardArt(art) {
  const parts = STORYBOARD_ART[art] ?? [];
  return h(
    'svg',
    { class: 'storyboard__art', viewBox: ART_VIEWBOX, 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid slice' },
    ...parts.map(render),
  );
}
