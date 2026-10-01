// Pure geometry for the inked sea under "Bölüm 4 · Rota" (no DOM): the hero's water after the
// storm, seen from the deck. A horizon under the title, then bands of brush-stroke crests whose
// spacing, weight and swell grow toward the reader (perspective rhythm), each crest broken by
// dry-brush gaps of paper; indigo washes deepen with the bands and two or three wash pools lie on
// the open water. Seeded, so a given size always draws the same sea (no shimmer on resize) and
// tests are deterministic.

const TAU = Math.PI * 2;
const STEP = 14; // px between sampled points along a crest

/** Small seeded PRNG (mulberry32): same seed → same sea. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value) => Math.round(value * 10) / 10;
const clamp01 = (t) => Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * How rough the water is at depth `t` (0 = the horizon under the title, 1 = the harbour): a calm
 * after the storm far out, a moderate swell mid-course, calm again as the boat comes into port.
 */
export function swellAt(t) {
  return 0.35 + 0.65 * Math.sin(Math.PI * clamp01(t)) ** 1.4;
}

/** Perspective: how near the water at depth `t` is to the reader (0 far … 1 at our feet). */
export const nearness = (t) => clamp01(t) ** 0.85;

/**
 * Rows of the sea from the horizon down: the gap to the next row grows from `first` to `last` px
 * as the water comes toward the reader.
 * @returns {{ y: number, t: number, gap: number }[]}
 */
export function seaRows({ height, horizon = 0, first = 14, last = 168 }) {
  if (!(height > horizon)) return [];
  const span = height - horizon;
  const rows = [];
  let y = horizon;
  while (y < height - first * 0.5) {
    const t = (y - horizon) / span;
    const gap = lerp(first, last, nearness(t) ** 1.25);
    rows.push({ y: round(y), t: Math.round(t * 1000) / 1000, gap: round(gap) });
    y += gap;
  }
  return rows;
}

/** A band's wave: two summed sines (wavelengths stretch toward the reader), so no crest repeats. */
function waveFn(baseline, amplitude, near, random) {
  const l1 = (300 + random() * 260) * (0.7 + near);
  const l2 = (120 + random() * 90) * (0.7 + near);
  const p1 = random() * TAU;
  const p2 = random() * TAU;
  return (x) => baseline + amplitude * Math.sin((TAU * x) / l1 + p1) + amplitude * 0.32 * Math.sin((TAU * x) / l2 + p2);
}

/**
 * One tapered ink stroke along `points` ([[x, y], …]): `weight` px at its belly, narrowing to a
 * hair at both ends; the pressure rises fast and lifts slowly, like a brush dragged left to right.
 * @returns {string} closed path data
 */
export function inkStroke(points, weight, { lift = 0.8 } = {}) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const lens = [0];
  for (let i = 1; i < points.length; i += 1) {
    lens.push(lens[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lens[lens.length - 1] || 1;
  const left = [];
  const right = [];
  points.forEach(([x, y], i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const half = (weight / 2) * (0.08 + 0.92 * Math.sin(Math.PI * (lens[i] / total) ** lift));
    left.push(`${round(x + nx * half)} ${round(y + ny * half)}`);
    right.push(`${round(x - nx * half)} ${round(y - ny * half)}`);
  });
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
}

function along(wave, x0, x1) {
  const count = Math.max(2, Math.ceil((x1 - x0) / STEP));
  return Array.from({ length: count + 1 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / count;
    return [x, wave(x)];
  });
}

/** Rounds to 0.01 and nudges the value off its neighbour's, so no two adjacent strokes match. */
function distinct(value, neighbour) {
  const v = Math.round(value * 100) / 100;
  return Math.abs(v - neighbour) < 0.05 ? Math.round((v + 0.08) * 100) / 100 : v;
}

/** Splits [0, width] into brush strokes separated by dry-brush gaps of paper. */
function strokeSpans(width, random, { minRun, maxRun, minGap, maxGap }) {
  const spans = [];
  let x = -random() * minRun;
  while (x < width) {
    const run = minRun + random() * (maxRun - minRun);
    spans.push([Math.max(x, -20), Math.min(x + run, width + 20)]);
    x += run + minGap + random() * (maxGap - minGap);
  }
  return spans.filter(([a, b]) => b - a > 24);
}

/**
 * The sea as bands, from the horizon toward the reader.
 * @param {{ width: number, height: number, horizon?: number, seed?: number }} options
 * @returns {{ y: number, t: number, weight: number, amplitude: number, washOpacity: number,
 *   wash: string, crests: string[], ripples: string[] }[]}
 */
export function seaBands({ width, height, horizon = 0, seed = 429 }) {
  if (!(width > 0) || !(height > 0)) return [];
  const random = seededRandom(seed);
  const rows = seaRows({ height, horizon });
  let prev = { weight: -1, amplitude: -1 };
  return rows.map(({ y, t, gap }) => {
    const near = nearness(t);
    const swell = swellAt(t);
    // Weight and swell grow toward the reader; a hand jitter of about ±12 % keeps neighbours unequal.
    const weight = distinct((0.7 + 4.6 * near ** 1.1) * (0.88 + 0.24 * random()), prev.weight);
    const amplitude = distinct((1.2 + 15 * near * (0.55 + 0.45 * swell)) * (0.86 + 0.28 * random()), prev.amplitude);
    prev = { weight, amplitude };
    const wave = waveFn(y, amplitude, near, random);
    // Far off the brush skips more often (short strokes, wide gaps); near, it drags long strokes.
    const crests = strokeSpans(width, random, {
      minRun: lerp(70, 220, near),
      maxRun: lerp(260, 640, near),
      minGap: lerp(30, 18, near),
      maxGap: lerp(200, 120, near),
    }).map(([a, b]) => inkStroke(along(wave, a, b), weight * (0.82 + 0.36 * random())));
    // A fainter under-stroke on the back of the swell, only where the bands are wide enough.
    const under = (x) => wave(x) + gap * 0.42;
    const ripples =
      gap > 40
        ? strokeSpans(width, random, { minRun: 80, maxRun: 240, minGap: 70, maxGap: 260 }).map(([a, b]) =>
            inkStroke(along(under, a, b), Math.max(0.8, weight * 0.4)),
          )
        : [];
    // The wash: from the crest down to the next band, deepening toward the reader.
    const xs = Array.from({ length: Math.ceil(width / STEP) + 3 }, (_, i) => i * STEP - STEP);
    const top = xs.map((x) => `${round(x)} ${round(wave(x))}`).join(' L ');
    const floor = round(Math.min(height, y + gap * 1.6));
    const wash = `M ${top} L ${round(xs[xs.length - 1])} ${floor} L ${round(xs[0])} ${floor} Z`;
    const washOpacity = Math.round((0.05 + 0.16 * near) * 1000) / 1000;
    return { y, t, weight, amplitude, washOpacity, wash, crests, ripples };
  });
}

/** A smooth closed blob (quadratic curves through the midpoints of a noisy ring). */
function blob(cx, cy, rx, ry, random, lobes = 11) {
  const ring = Array.from({ length: lobes }, (_, i) => {
    const a = (i / lobes) * TAU;
    const k = 0.78 + random() * 0.38;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const start = mid(ring[lobes - 1], ring[0]);
  const parts = ring.map((p, i) => {
    const m = mid(p, ring[(i + 1) % lobes]);
    return `Q ${round(p[0])} ${round(p[1])} ${round(m[0])} ${round(m[1])}`;
  });
  return `M ${round(start[0])} ${round(start[1])} ${parts.join(' ')} Z`;
}

/**
 * Two or three indigo wash pools on the open water (where the pigment pooled as the paper dried),
 * wider toward the reader.
 * @returns {{ d: string, opacity: number }[]}
 */
export function washPools({ width, height, horizon = 0, seed = 429 }) {
  if (!(width > 0) || !(height > horizon)) return [];
  const random = seededRandom(seed ^ 0x5eed);
  const spots = [
    [0.13, 0.3],
    [0.87, 0.58],
    [0.2, 0.86],
  ];
  const count = width < 700 ? 2 : 3;
  return spots.slice(0, count).map(([fx, fy]) => {
    const t = fy + (random() - 0.5) * 0.08;
    const near = nearness(t);
    const cy = horizon + (height - horizon) * t;
    const cx = width * (fx + (random() - 0.5) * 0.06);
    const rx = Math.min(width * 0.16, 130 + 120 * near);
    const ry = rx * lerp(0.18, 0.34, near);
    return { d: blob(cx, cy, rx, ry, random), opacity: Math.round((0.08 + 0.05 * near) * 1000) / 1000 };
  });
}
