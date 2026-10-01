// International Code of Signals numeral pennants 1–4, as colour regions in the pennant's own
// coordinates, and the heraldic hatching that prints those colours in sumi ink. Pure, no DOM.
//
// Designs verified against the Wikimedia Commons drawings used by the Wikipedia article
// "International Code of Signals" (numeral pennant table), fetched 2026-10-01:
//   https://commons.wikimedia.org/wiki/File:ICS_Pennant_One.svg    white, red disc near the hoist
//   https://commons.wikimedia.org/wiki/File:ICS_Pennant_Two.svg    blue, white disc near the hoist
//   https://commons.wikimedia.org/wiki/File:ICS_Pennant_Three.svg  red | white | blue, red at the hoist
//   https://commons.wikimedia.org/wiki/File:ICS_Pennant_Four.svg   red, white cross
// All four share a 540×300 outline: hoist 300 tall, tapering to a blunt fly 150 tall (75 in from
// each edge); the disc is centred 150 from the hoist, radius 75; the cross bars are 75 wide.
//
// Petra Sancta hatching (monochrome heraldry): red = vertical lines, blue = horizontal lines,
// white = bare paper, black = both (cross-hatch). No north red: the colour lives only in the lines.

export const ASPECT = 1.8; // length : hoist
export const TAPER = 0.25; // how far the top and bottom edges close in by the fly (of the hoist)

const DISC_X = 150 / 540;
const DISC_R = 75 / 300;
const BAR_A = 112.5 / 300;
const BAR_B = 187.5 / 300;

const NUMERALS = Object.freeze({ E1: 1, E2: 2, E3: 3, E4: 4 });
export const PENNANT_IDS = Object.freeze(Object.keys(NUMERALS));

/** 'E1'..'E4' → 1..4; anything else throws (fail fast at the boundary). */
export function numeralOf(id) {
  const n = NUMERALS[id];
  if (!n) throw new TypeError(`Unknown pennant id: ${String(id)}`);
  return n;
}

/** Rest-shape y (0 top … 1 bottom of the hoist) of cloth parameter (u along, v across). */
export function restY(u, v) {
  return TAPER * u + v * (1 - 2 * TAPER * u);
}

/** Inverse of restY: the cloth v of rest point (x, y). */
export function clothV(x, y) {
  return (y - TAPER * x) / (1 - 2 * TAPER * x);
}

function inDisc(x, y) {
  const dx = (x - DISC_X) * ASPECT;
  const dy = y - 0.5;
  return dx * dx + dy * dy < DISC_R * DISC_R;
}

/**
 * Colour of pennant n at rest point (x along 0..1, y across the hoist 0..1):
 * 'w' white, 'r' red, 'b' blue.
 */
export function regionAt(n, x, y) {
  if (n === 1) return inDisc(x, y) ? 'r' : 'w';
  if (n === 2) return inDisc(x, y) ? 'w' : 'b';
  if (n === 3) return x < 1 / 3 ? 'r' : x < 2 / 3 ? 'w' : 'b';
  const bx = x * ASPECT;
  return (bx >= BAR_A && bx <= BAR_B) || (y >= BAR_A && y <= BAR_B) ? 'w' : 'r';
}

/** Petra Sancta: which hatch a colour takes. */
export function hatchOf(colour) {
  return {
    vertical: colour === 'r' || colour === 'k',
    horizontal: colour === 'b' || colour === 'k',
  };
}

const SAMPLES = 48;
const BISECT = 12;

// Runs along one iso-line: fixed `a`, the free parameter 0..1; `hit(t)` says whether it is hatched.
function runsAlong(hit, a, out) {
  let prev = hit(0);
  let start = 0;
  for (let i = 1; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const now = hit(t);
    if (now === prev) continue;
    let lo = (i - 1) / SAMPLES;
    let hi = t;
    for (let k = 0; k < BISECT; k += 1) {
      const mid = (lo + hi) / 2;
      if (hit(mid) === prev) lo = mid;
      else hi = mid;
    }
    const edge = (lo + hi) / 2;
    if (prev) out.push(a, start, edge);
    start = edge;
    prev = now;
  }
  if (prev) out.push(a, start, 1);
}

/** Whether rest point (x, y) lies on the pennant (inside its taper). */
export function onCloth(x, y) {
  return x >= 0 && x <= 1 && y >= TAPER * x && y <= 1 - TAPER * x;
}

/**
 * The hatch of pennant n as runs of lines sewn into the cloth, so the hatching bends with it:
 * `lines` vertical lines (the cloth's iso-u lines) and `rows` horizontal lines (level on the rest
 * shape, so they keep an even spacing into the taper), borders excluded.
 * @returns {{ vertical: Float32Array, horizontal: Float32Array }} flat triples
 *   vertical: (u, v from, v to); horizontal: (rest y, u from, u to)
 */
export function hatchRuns(n, lines, rows) {
  const vertical = [];
  const horizontal = [];
  for (let i = 1; i < lines; i += 1) {
    const u = i / lines;
    runsAlong((v) => hatchOf(regionAt(n, u, restY(u, v))).vertical, u, vertical);
  }
  for (let j = 1; j < rows; j += 1) {
    const y = j / rows;
    runsAlong((u) => onCloth(u, y) && hatchOf(regionAt(n, u, y)).horizontal, y, horizontal);
  }
  return { vertical: Float32Array.from(vertical), horizontal: Float32Array.from(horizontal) };
}

// A rest-space polyline (x, y pairs) → cloth (u, v) pairs, each edge split into short steps.
function toCloth(points, step = 0.04) {
  const out = [];
  for (let k = 0; k < points.length - 2; k += 2) {
    const [ax, ay, bx, by] = [points[k], points[k + 1], points[k + 2], points[k + 3]];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, (by - ay) / ASPECT) / step));
    for (let i = k === 0 ? 0 : 1; i <= n; i += 1) {
      const x = ax + ((bx - ax) * i) / n;
      out.push(x, clothV(x, ay + ((by - ay) * i) / n));
    }
  }
  return Float32Array.from(out);
}

function discLine() {
  const pts = [];
  for (let i = 0; i <= 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    pts.push(DISC_X + (Math.cos(a) * DISC_R) / ASPECT, 0.5 + Math.sin(a) * DISC_R);
  }
  return toCloth(pts, 1);
}

/**
 * Where two colours meet, drawn as ink lines (as a heraldic engraver would): cloth (u, v) polylines.
 * @returns {Float32Array[]}
 */
export function boundaryLines(n) {
  if (n === 1 || n === 2) return [discLine()];
  const top = (x) => TAPER * x;
  const bottom = (x) => 1 - TAPER * x;
  if (n === 3) return [1 / 3, 2 / 3].map((x) => toCloth([x, top(x), x, bottom(x)]));
  const xa = BAR_A / ASPECT;
  const xb = BAR_B / ASPECT;
  return [
    [xa, top(xa), xa, BAR_A, 0, BAR_A],
    [0, BAR_B, xa, BAR_B, xa, bottom(xa)],
    [xb, top(xb), xb, BAR_A, 1, BAR_A],
    [xb, bottom(xb), xb, BAR_B, 1, BAR_B],
  ].map((p) => toCloth(p));
}
