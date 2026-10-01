// How a pennant travels on its halyard, and where each state puts it. Pure, no DOM.
// Hoisting is hand over hand: a small tug down first, then pulls with short pauses between them; the
// pennant follows the hand on an under-damped spring, so it lags each pull and overshoots the top.
// Lowering pays the line out smoothly. The motion state is mutated in place (allocated once).

export const STATES = Object.freeze(['down', 'hoisted', 'half', 'folded']);

const TUG = { time: 0.14, dist: 5 };
const PULL = { len: 34, time: 0.28, rest: 0.07, max: 5 }; // a long hoist takes longer pulls, not more
const LOWER_SPEED = 260; // px / s
const SPRING = { k: 210, c: 12 }; // ζ ≈ 0.41: a visible overshoot that dies in ~0.6 s

const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

export function createHalyard(y) {
  return { y, v: 0, hand: y, from: y, goal: y, t: 0, raising: false, moving: false };
}

/** Sends the pennant toward `goal` (y grows downward: a smaller goal is a hoist). */
export function setGoal(h, goal) {
  if (goal === h.goal && h.moving) return;
  h.from = h.hand;
  h.goal = goal;
  h.t = 0;
  h.raising = goal < h.hand;
  h.moving = goal !== h.hand || Math.abs(h.v) > 0;
}

/**
 * Scrubbed mode: the hand jumps straight to `y` (the scroll moves it) and the pennant follows on
 * the same spring, so a scrubbed hoist still lags and overshoots a little.
 */
export function followTo(h, y) {
  if (y === h.goal && h.hand === y) return;
  h.from = y;
  h.goal = y;
  h.hand = y;
  h.t = 0;
  h.raising = false;
  h.moving = true;
}

/** Where the hand holds the line `t` seconds after the goal was set. */
export function handAt(h, t) {
  const dist = Math.abs(h.goal - h.from);
  if (dist === 0) return h.goal;
  if (!h.raising) {
    const total = Math.max(0.3, dist / LOWER_SPEED);
    return h.from + (h.goal - h.from) * easeInOut(Math.min(1, t / total));
  }
  if (t < TUG.time) return h.from + Math.min(TUG.dist, dist * 0.2) * Math.sin((Math.PI * t) / TUG.time);
  const pulls = Math.max(1, Math.min(PULL.max, Math.round(dist / PULL.len)));
  const period = PULL.time + PULL.rest;
  const t2 = t - TUG.time;
  const k = Math.floor(t2 / period);
  if (k >= pulls) return h.goal;
  const within = Math.min(1, (t2 - k * period) / PULL.time);
  return h.from - (dist / pulls) * (k + easeOut(within));
}

/** Advances the motion by dt seconds; returns the pennant's y. */
export function stepHalyard(h, dt) {
  if (!h.moving) return h.y;
  h.t += dt;
  h.hand = handAt(h, h.t);
  // semi-implicit Euler, split into ≤ 1/120 s so a slow frame cannot blow the spring up
  let left = dt;
  while (left > 0) {
    const s = Math.min(left, 1 / 120);
    h.v += (SPRING.k * (h.hand - h.y) - SPRING.c * h.v) * s;
    h.y += h.v * s;
    left -= s;
  }
  if (h.hand === h.goal && Math.abs(h.y - h.goal) < 0.05 && Math.abs(h.v) < 0.5) {
    h.y = h.goal;
    h.v = 0;
    h.moving = false;
  }
  return h.y;
}

/** Validates a state name at the boundary. */
export function assertState(state) {
  if (!STATES.includes(state)) throw new TypeError(`Unknown pennant state: ${String(state)}`);
  return state;
}

/**
 * What a state asks of a pennant: where its hoist sits, how furled it is, how much of it the hoist
 * keeps (a lowered pennant is gathered into a bundle) and how much wind it takes.
 * @param {{ slot: number, foot: number, halfDrop: number }} spot
 */
export function stateTarget(state, spot) {
  assertState(state);
  if (state === 'down') return { y: spot.foot, furl: 1, hoistScale: 0.5, wind: 0 };
  if (state === 'folded') return { y: spot.slot, furl: 1, hoistScale: 1, wind: 0 };
  if (state === 'half') return { y: spot.slot + spot.halfDrop, furl: 0, hoistScale: 1, wind: 0.5 };
  return { y: spot.slot, furl: 0, hoistScale: 1, wind: 1 };
}

const MAX_LENGTH = 132;
const HERO_LENGTH = 300; // the chapter's hero mast lets the pennants grow this long

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Scrubbed pose: `hoist` 0 (bundled at the foot) … 1 (at its slot), `dip` 0 … 1 (half-mast).
 * The pennant climbs furled and opens into the wind over the last stretch of the climb.
 * @param {{ slot: number, foot: number, halfDrop: number }} spot
 */
export function poseTarget(spot, hoist, dip = 0) {
  const h = Math.min(1, Math.max(0, hoist));
  const d = Math.min(1, Math.max(0, dip)) * smooth(0.6, 1, h);
  const open = smooth(0.55, 0.95, h);
  return {
    y: spot.foot + (spot.slot - spot.foot) * smooth(0, 1, h) + d * spot.halfDrop,
    furl: 1 - open,
    hoistScale: 0.5 + 0.5 * smooth(0, 0.35, h),
    wind: open * (1 - 0.5 * d),
  };
}
const MAST = { pitch: 1.45, bundle: 0.52, halfDrop: 0.38, top: 18, bottom: 22 };
const HERO = { ...MAST, pitch: 1.16, bundle: 0.4 };
const spanOf = (m) => 4 * m.pitch + 4 * m.bundle + m.halfDrop; // in hoists

/**
 * Desktop mast in a host of width × height CSS px: four slots stacked under the truck and, at the
 * foot, the four lowered bundles. Pennants shrink until all of it fits; `hero` lets them grow larger
 * (the chapter's pinned showpiece), draws a heavier pole and keeps the flying pennants above the
 * bottom `clear` px (where the instrument plate overlaps the foot of the mast).
 */
export function mastLayout(width, height, { hero = false, clear = 0 } = {}) {
  const m = hero ? HERO : MAST;
  const pole = hero ? 12 : 9;
  const halyard = pole + 6;
  const { top, bottom } = m;
  // The hero's pennants fly over at most ~half the column, leaving the rest to the sea and the plate.
  const fitLength = Math.max(24, (width - halyard - 10) * (hero ? 0.45 : 1));
  const room = height - top - 8 - bottom - 8;
  const fitHoist = Math.min(room / spanOf(m), (height - Math.max(0, clear) - top - 16) / (3 * m.pitch + 1 + m.halfDrop));
  const hoist = Math.max(10, Math.min((hero ? HERO_LENGTH : MAX_LENGTH) / 1.8, fitLength / 1.8, fitHoist));
  const length = hoist * 1.8;
  const base = height - bottom;
  return {
    pole, halyard, top, base, length, hoist,
    spots: [0, 1, 2, 3].map((k) => ({
      slot: top + 8 + k * m.pitch * hoist,
      foot: base - 8 - (4 - k) * m.bundle * hoist,
      halfDrop: m.halfDrop * hoist,
    })),
  };
}

/** Mobile: one small pennant on a short staff beside the article title. */
export function staffLayout(width, height) {
  const pole = 3;
  const halyard = pole + 3;
  const length = Math.max(20, Math.min(width - halyard - 3, (height - 6) * 1.8 * 0.7));
  const hoist = length / 1.8;
  const top = 4;
  const base = height - 2;
  return {
    pole, halyard, top, base, length, hoist,
    spots: [{ slot: top, foot: base - hoist * 0.5, halfDrop: (base - hoist - top) * 0.35 }],
  };
}
