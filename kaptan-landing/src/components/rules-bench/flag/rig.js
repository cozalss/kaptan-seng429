// One rigged pennant: its cloth, its run on the halyard and the wind it takes, advanced in fixed steps.
// Pure (no DOM), so the whole choreography — tug, pulls, overshoot, unfurl, gust, sleep — is testable.

import { createCloth, placeCloth, stepCloth } from './cloth.js';
import { createHalyard, followTo, poseTarget, setGoal, stateTarget, stepHalyard } from './halyard.js';
import { boundaryLines, hatchRuns, numeralOf } from './pennants.js';

const STEP = 1 / 60;
const MAX_STEPS = 3;
const REST_MOTION = 0.03; // px per step below which the cloth counts as still
const REST_STEPS = 24;
const RATES = { unfurl: 2.6, furl: 2.4, hoistScale: 3, wind: 5 };
export const GUSTS = Object.freeze({
  hoist: { dur: 3.4, amp: 1 },
  idle: { dur: 2.6, amp: 0.55 },
  touch: { dur: 1.6, amp: 0.35 },
  scroll: { dur: 1.4, amp: 0.8 },
});

const approach = (from, to, rate, dt) => {
  const next = from + (to - from) * (1 - Math.exp(-rate * dt));
  return Math.abs(to - next) < 1e-3 ? to : next;
};

/**
 * @param {{ id: string, cols: number, rows: number, length: number, hoist: number,
 *   spot: { slot: number, foot: number, halfDrop: number }, x: number, state?: string, seed?: number,
 *   spacing?: number }} o  spacing: hatch pitch in CSS px
 */
export function createRig({ id, cols, rows, length, hoist, spot, x, state = 'down', seed = 0, spacing = 5 }) {
  const n = numeralOf(id);
  const target = stateTarget(state, spot);
  const cloth = createCloth({ cols, rows, length, hoist, seed });
  placeCloth(cloth, x, target.y, target.furl, target.hoistScale);
  // hatch lines an even `spacing` px apart whatever the pennant's size
  const runs = hatchRuns(n, Math.max(4, Math.round(length / spacing)), Math.max(3, Math.round(hoist / (spacing * 0.9))));
  const rig = {
    id, n, x, spot, state, target, cloth,
    art: { ...runs, bounds: boundaryLines(n) },
    halyard: createHalyard(target.y),
    furl: target.furl, hoistScale: target.hoistScale, wind: target.wind,
    gust: { t: 0, dur: 0, amp: 0 },
    still: REST_STEPS, carry: 0,
    env: { ox: x, oy: target.y, furl: target.furl, hoistScale: target.hoistScale, wind: target.wind, gust: 0, poke: null },
  };
  return rig;
}

/** Current gust strength 0..amp (a smooth bump over its duration). */
export function gustLevel(g) {
  return g.t < g.dur ? g.amp * Math.sin((Math.PI * g.t) / g.dur) : 0;
}

/** Starts a gust unless a stronger one is already blowing; `amp` scales a scroll gust (0..1). */
export function blow(rig, kind, amp = 1) {
  const base = GUSTS[kind];
  const next = { dur: base.dur, amp: base.amp * Math.min(1, Math.max(0, amp)) };
  if (next.amp <= 0.02) return;
  if (gustLevel(rig.gust) >= next.amp * 0.8) return;
  const now = gustLevel(rig.gust);
  rig.gust.dur = next.dur;
  rig.gust.amp = next.amp;
  // start the new bump at the current strength so the wind never jumps
  rig.gust.t = (Math.asin(Math.min(1, now / next.amp)) / Math.PI) * next.dur;
  rig.still = 0;
}

/** Sends the rig to a state; a hoist tugs the line and lets the cloth catch the wind. */
export function setRigState(rig, state, spot = rig.spot) {
  rig.spot = spot;
  rig.target = stateTarget(state, spot);
  const raising = rig.target.y < rig.halyard.y - 0.5;
  rig.state = state;
  setGoal(rig.halyard, rig.target.y);
  if (rig.target.furl < 1 && (raising || rig.target.furl < rig.furl)) blow(rig, 'hoist');
  rig.still = 0;
}

/**
 * Scrubbed pose (the pinned scroll sequence drives it): the hand follows the scroll, the cloth keeps
 * its physics. A pennant reaching its slot catches a fresh gust.
 */
export function setRigPose(rig, hoist, dip = 0) {
  const before = rig.target.wind;
  rig.target = poseTarget(rig.spot, hoist, dip);
  rig.state = hoist >= 1 ? (dip > 0.5 ? 'half' : 'hoisted') : hoist <= 0 ? 'down' : 'moving';
  followTo(rig.halyard, rig.target.y);
  if (rig.target.wind > 0.6 && before <= 0.6) blow(rig, 'hoist');
  rig.still = 0;
}

/** Whether the rig has nothing left to do (the stage may sleep). */
export function isResting(rig) {
  const t = rig.target;
  return !rig.halyard.moving && rig.furl === t.furl && rig.hoistScale === t.hoistScale && rig.wind === t.wind
    && rig.gust.t >= rig.gust.dur && rig.still >= REST_STEPS;
}

function fixedStep(rig, poke) {
  const t = rig.target;
  const unfurling = t.furl < rig.furl;
  rig.furl = approach(rig.furl, t.furl, unfurling ? RATES.unfurl : RATES.furl, STEP);
  rig.hoistScale = approach(rig.hoistScale, t.hoistScale, RATES.hoistScale, STEP);
  rig.wind = approach(rig.wind, t.wind, RATES.wind, STEP);
  if (rig.gust.t < rig.gust.dur) rig.gust.t += STEP;
  const env = rig.env;
  env.ox = rig.x;
  env.oy = stepHalyard(rig.halyard, STEP);
  env.furl = rig.furl;
  env.hoistScale = rig.hoistScale;
  env.wind = rig.wind;
  env.gust = gustLevel(rig.gust);
  env.poke = poke;
  const motion = stepCloth(rig.cloth, STEP, env);
  rig.still = motion < REST_MOTION && !rig.halyard.moving ? rig.still + 1 : 0;
}

/** Advances by a frame's dt in fixed 1/60 s steps (at most 3). Returns whether anything moved. */
export function stepRig(rig, dt, poke = null) {
  rig.carry = Math.min(rig.carry + dt, STEP * MAX_STEPS);
  let stepped = false;
  while (rig.carry >= STEP - 1e-6) {
    rig.carry -= STEP;
    fixedStep(rig, stepped ? null : poke);
    stepped = true;
  }
  return stepped;
}

/** Jumps straight to the target (resize, first paint). */
export function settleRig(rig) {
  const t = rig.target;
  rig.halyard = createHalyard(t.y);
  rig.furl = t.furl;
  rig.hoistScale = t.hoistScale;
  rig.wind = t.wind;
  rig.gust.t = rig.gust.dur;
  placeCloth(rig.cloth, rig.x, t.y, t.furl, t.hoistScale);
  rig.still = 0;
}
