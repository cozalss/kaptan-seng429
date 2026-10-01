// Acts I–II of the ink scene: fictional disclosure slips blow about as noise, gather into one
// swirling column, then the column sinks through three filter rings stacked on a single axis
// (Sınıflandır · Kanıtla · Kural). Each slip's fate (the ring that strikes it out) is fixed by a
// seeded generator, so the whole flight is a pure function of the scroll clock: the same scroll
// position always draws the same frame, forwards or backwards.

import { seededRandom } from '../../lib/ink3d/random.js';

export const TAU = Math.PI * 2;

/** World layout (scene units, y up; one slip is SLIP.width × SLIP.height). */
export const FUNNEL = Object.freeze({
  columnBottom: 3.3,
  columnTop: 7.4,
  rings: Object.freeze([
    Object.freeze({ y: 2.3, radius: 2.85, label: 'Sınıflandır' }),
    Object.freeze({ y: 0, radius: 2.3, label: 'Kanıtla' }),
    Object.freeze({ y: -2.3, radius: 1.75, label: 'Kural' }),
  ]),
  wall: 0.78, // slips keep inside this fraction of the ring radius at their height
  maxRadius: 2.6, // the column's widest wall, above the first ring
  strikeDepth: 2, // how far past its ring a struck-out slip falls while it fades
});

export const SLIP = Object.freeze({ width: 0.62, height: 0.86 });

/**
 * How the funnel's slips split between the rings. Only the ends are facts (≈350 disclosures a
 * day in, one reasoned proposal out); 42 and 7 are an illustrative split for the scene and are
 * never shown as numbers (see counterAt).
 */
export const COUNTS = Object.freeze([350, 42, 7, 1]);

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const span = (p, from, to) => clamp01((p - from) / (to - from));
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

/** Funnel wall radius at a height: linear through the three rings, capped above the first. */
export function radiusAt(y) {
  const [top, mid, low] = FUNNEL.rings;
  const slope = (top.radius - low.radius) / (top.y - low.y);
  const ring = mid.radius + slope * (y - mid.y);
  return Math.min(Math.max(ring * FUNNEL.wall, 0.35), FUNNEL.maxRadius);
}

// mulberry32 lives in the shared ink-scene library; re-exported for the compass modules.
export { seededRandom };

/**
 * How many funnel slips each ring strikes out. `total` counts the approved slip too (drawn apart),
 * so the funnel holds total − 1 slips; survivors scale with the real 350 → 42 → 7 → 1 ratio.
 * @returns {number[]} struck out per ring, summing to total − 1
 */
export function rejectionPlan(total) {
  const cards = Math.max(Math.round(total), 1) - 1;
  const afterFirst = Math.min(cards, Math.max(Math.round((total * COUNTS[1]) / COUNTS[0]) - 1, 0));
  const afterSecond = Math.min(afterFirst, COUNTS[2] - 1);
  return [cards - afterFirst, afterFirst - afterSecond, afterSecond];
}

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Share of the storm that blows past close to the lens (big, fast: the depth of the storm). */
export const NEAR_SHARE = 0.07;

/** Where a slip blows about before the column forms: a storm wider than the page, a few close by. */
function stormPoint(random) {
  if (random() < NEAR_SHARE) {
    return Object.freeze([(random() * 2 - 1) * 5.5, -2.5 + random() * 10, 8 + random() * 7]);
  }
  return Object.freeze([-9.5 + random() * 21, -3.6 + random() * 12.8, (random() * 2 - 1) * 3]);
}

/** Number of slip designs the sprite sheet holds. */
export const VARIANTS = 6;

/**
 * The funnel's slips with everything their flight depends on.
 * @param {number} total  slips including the approved one
 * @param {number} [seed]
 */
export function buildCards(total, seed = 20261012) {
  const random = seededRandom(seed);
  const plan = rejectionPlan(total);
  const fates = shuffled(
    plan.flatMap((count, ring) => Array.from({ length: count }, () => ring)),
    random,
  );
  return fates.map((fate, i) =>
    Object.freeze({
      id: i,
      fate, // index of the ring that strikes it out
      level: (i + random()) / fates.length, // slot height in the column (stratified: even crossings)
      angle: random() * TAU,
      spin: 0.7 + random() * 0.6, // orbit speed factor
      depth: 0.3 + 0.7 * Math.sqrt(random()), // fraction of the wall radius (most ride the wall)
      arrival: random() * 0.62, // when (in gather time) it starts for its slot
      // Noise: where it blows about before the column forms.
      noise: stormPoint(random),
      drift: 0.6 + random() * 1.4,
      phase: random() * TAU,
      tilt: (random() - 0.5) * 0.5,
      roll: (random() - 0.5) * 0.7,
      tumble: 1.5 + random() * 3,
      scatter: 0.7 + random() * 0.8,
      variant: Math.floor(random() * VARIANTS),
    }),
  );
}

/** Height of a slip in the sinking column before any ring touches it. */
const columnY = (card, descent) => FUNNEL.columnBottom + card.level * (FUNNEL.columnTop - FUNNEL.columnBottom) - descent;

/**
 * Pose of one funnel slip. `turn` is the orbit angle (radians, world), `yaw`/`tilt`/`roll` the
 * slip's own turn away from the camera (kept well short of edge-on), `fade` 0 → 1 as it leaves,
 * `struck` 1 once its ring has crossed it out.
 * @param {ReturnType<typeof buildCards>[number]} card
 * `release` (act III) lets every slip still hanging under a ring fall away; `fall` (the pre-roll)
 * lifts the noise cloud above the page, so it drifts down into view as the section arrives.
 * @param {{ gather: number, swirl: number, descent: number, time: number, release?: number, fall?: number, idle?: number }} clock  from the timeline
 */
export function cardPose(card, { gather, swirl, descent, time = 0, release = 0, fall = 0, idle = 0 }, out = createPose()) {
  const free = columnY(card, descent);
  const ring = FUNNEL.rings[card.fate];
  // how far below its striking ring it would be (the release drops the last ones too)
  const past = Math.max(ring.y - free, 0) + release * FUNNEL.strikeDepth * 1.2;
  const leave = clamp01(past / FUNNEL.strikeDepth);
  const y = past > 0 ? ring.y - past * 0.9 - past * past * 0.35 : free; // struck out, it drops ever faster
  const turn = card.angle + swirl * card.spin + (FUNNEL.columnTop - y) * 0.28;
  const radius = radiusAt(Math.max(y, ring.y)) * card.depth + past * (1.8 + past * 1.2) * card.scatter;
  const sx = Math.cos(turn) * radius;
  const sz = Math.sin(turn) * radius;

  // Noise: the cloud drifts down and sideways with the clock; each slip tumbles on its own beat
  // (`idle`: the reader has stopped, the slips keep tumbling in place, timeline.js IDLE).
  const beat = card.phase + (time + idle) * card.drift;
  const nx = card.noise[0] + Math.sin(beat) * 0.35;
  const ny = card.noise[1] - time * 0.9 * card.drift + fall * (0.75 + 0.5 * card.scatter);
  const nz = card.noise[2] + Math.cos(beat * 0.7) * 0.3;
  const land = smooth(span(gather, card.arrival, card.arrival + 0.36));

  const settle = 1 - land;
  out.position[0] = mix(nx, sx, land);
  out.position[1] = mix(ny, y, land);
  out.position[2] = mix(nz, sz, land);
  out.turn = turn;
  out.yaw = settle * 0.95 * Math.sin(beat * card.tumble * 0.4) + land * card.tilt * 0.6;
  out.tilt = settle * 0.7 * Math.cos(beat * card.tumble * 0.3) + land * card.tilt;
  out.roll = settle * Math.sin(beat * 0.9) * 1.2 + card.roll + past * 0.9 * card.scatter;
  out.fade = smooth(leave);
  out.struck = past > 0 ? 1 : 0;
  return out;
}

/** A reusable pose record for cardPose. */
export function createPose() {
  return { position: [0, 0, 0], turn: 0, yaw: 0, tilt: 0, roll: 0, fade: 0, struck: 0 };
}

/** Per-slip GPU-free buffers, reused every frame. */
export function createPoseBuffers(count) {
  return {
    count,
    position: new Float32Array(count * 3),
    angles: new Float32Array(count * 4), // turn, yaw, tilt, roll
    state: new Float32Array(count * 3), // fade, struck, variant
  };
}

const scratch = createPose();

/** Writes every slip's pose into the buffers (one scratch record, no garbage per frame). */
export function writeCardPoses(cards, clock, out) {
  for (let i = 0; i < cards.length; i += 1) {
    const pose = cardPose(cards[i], clock, scratch);
    out.position[i * 3] = pose.position[0];
    out.position[i * 3 + 1] = pose.position[1];
    out.position[i * 3 + 2] = pose.position[2];
    out.angles[i * 4] = pose.turn;
    out.angles[i * 4 + 1] = pose.yaw;
    out.angles[i * 4 + 2] = pose.tilt;
    out.angles[i * 4 + 3] = pose.roll;
    out.state[i * 3] = pose.fade;
    out.state[i * 3 + 1] = pose.struck;
    out.state[i * 3 + 2] = cards[i].variant;
  }
  return out;
}

/** Descent at which the first / last slip of the column crosses ring `k`. */
export function crossingWindow(k) {
  const { y } = FUNNEL.rings[k];
  return [FUNNEL.columnBottom - y, FUNNEL.columnTop - y];
}

/** Descent at which the column has fully cleared the last ring. */
export const FULL_DESCENT = crossingWindow(FUNNEL.rings.length - 1)[1];

/**
 * The counter: 350 until the column reaches the first ring, then one continuous (log-scale) fall
 * to 1 by the time it clears the last ring. It never rests on the illustrative in-between counts
 * of COUNTS, which are not facts; it only thins the way the funnel thins.
 * @param {number} descent
 */
export function counterAt(descent) {
  const d = Number.isFinite(descent) ? descent : 0;
  const from = crossingWindow(0)[0];
  const t = clamp01((d - from) / (FULL_DESCENT - from));
  const first = COUNTS[0];
  const last = COUNTS[COUNTS.length - 1];
  return Math.round(first * (last / first) ** t);
}
