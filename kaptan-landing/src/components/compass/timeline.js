// Scroll choreography of the ink scene: one progress value (0 → 1 over the pinned stretch) maps to
// the whole frame across four acts — Gürültü (a cloud of slips gathers into one column), Kanıt
// (the column sinks through three ink rings on one axis, struck-out slips fall away), Onay (the
// sieve drops away, the one survivor is lifted to the front, set down and stamped), Yön (a compass
// is inked beside it and its red needle locks north). Progress below 0 is the pre-roll (the
// section is still arriving: the storm drifts in from above), above 1 the exit (the scene leaves
// with the page). Pure and deterministic: the renderer only draws what this returns.

import { FULL_DESCENT, FUNNEL, counterAt, crossingWindow } from './funnel.js';

export const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
export const mix = (a, b, t) => a + (b - a) * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t * t * t;
export const smooth = (t) => t * t * (3 - 2 * t);

/** 0 → 1 as `p` crosses [from, to]. */
export const span = (p, from, to) => clamp01((p - from) / (to - from));

/** The four acts (the act strip, the captions and the counter's unit follow these). */
export const PHASES = Object.freeze([
  Object.freeze({ id: 'gurultu', from: 0, label: 'Gürültü' }),
  Object.freeze({ id: 'kanit', from: 0.18, label: 'Kanıt' }),
  Object.freeze({ id: 'onay', from: 0.52, label: 'Onay' }),
  Object.freeze({ id: 'yon', from: 0.78, label: 'Yön' }),
]);

/**
 * Every beat as a [from, to] stretch of the pinned scroll. Each act rests on its key frame for at
 * least 0.4 viewport (≥ 0.133 of a 300vh pin): the storm (pre-roll + 0–0.08), the column in the
 * sieve, the stamped slip (0.645–0.78), the locked needle (0.9 → exit).
 */
export const TIMING = Object.freeze({
  gather: [0.08, 0.27],
  ringInk: [0.13, 0.27], // the three rings ink in one after another, top first
  descent: [0.27, 0.5],
  ringsOut: [0.505, 0.6], // act III: the sieve drops away and the last struck slips fall
  lift: [0.52, 0.61], // the survivor rises to the front …
  stamp: [0.615, 0.645], // … is set down and stamped
  toSide: [0.78, 0.855],
  compassInk: [0.785, 0.87],
  needleIn: [0.835, 0.85],
  needleSettle: [0.85, 0.9],
});

/** Pre-roll: how far above the page the storm hangs when the section's top edge appears. */
export const PREROLL_FALL = 9;
/** Default scroll lead (one viewport over a 300vh pin) for the pre-roll and the exit. */
export const LEAD = 1 / 3;

/**
 * Idle life (W7): while the reader rests on the storm or the sieve, the slips keep tumbling and the
 * column keeps turning slowly. `idle` is seconds at rest (index.js); it only runs before `until`.
 * tumble: beat seconds per idle second; swirl: radians of column turn per idle second.
 */
export const IDLE = Object.freeze({ until: 0.5, tumble: 0.6, swirl: 0.12 });

/** Where the approved slip sits on the page (fractions of the scene box; h = its height). */
export const PLATES = Object.freeze({
  // fractions of the full-bleed stage (the canvas covers the whole sticky viewport)
  wide: Object.freeze({
    fit: 0.6, // plates scale with min(box height, box width × fit)
    center: Object.freeze({ x: 0.6, y: 0.47, h: 0.6, angle: 0 }),
    side: Object.freeze({ x: 0.515, y: 0.54, h: 0.54, angle: -0.045 }),
    compass: Object.freeze({ x: 0.76, y: 0.45, r: 0.25 }),
  }),
  compact: Object.freeze({
    fit: 1.1,
    center: Object.freeze({ x: 0.5, y: 0.5, h: 0.5, angle: 0 }),
    side: Object.freeze({ x: 0.3, y: 0.58, h: 0.38, angle: -0.05 }),
    compass: Object.freeze({ x: 0.7, y: 0.4, r: 0.2 }),
  }),
});

/** Where the compass may sit on wide screens (fractions of the stage width) and the slip's gap to it. */
export const COMPASS_X = Object.freeze({ min: 0.68, max: 0.8, slipGap: 0.25 });

/**
 * The wide plates with the compass moved over a given x (Rota's course starts under it, so the
 * line can run on from the compass pivot); the slip keeps its distance. Pure.
 * @param {number | null | undefined} compassX  fraction of the stage width
 */
export function platesFor(compact, compassX) {
  if (compact || !Number.isFinite(compassX)) return compact ? PLATES.compact : PLATES.wide;
  const { wide } = PLATES;
  const x = Math.min(Math.max(compassX, COMPASS_X.min), COMPASS_X.max);
  return {
    ...wide,
    compass: { ...wide.compass, x },
    side: { ...wide.side, x: Math.min(wide.side.x, x - COMPASS_X.slipGap) },
  };
}

/** Index into PHASES for a progress value. */
export function phaseAt(p) {
  let index = 0;
  PHASES.forEach((phase, i) => {
    if (p >= phase.from) index = i;
  });
  return index;
}

/** Progress within the current act, 0 → 1. */
export function actProgress(p) {
  const i = phaseAt(p);
  const to = PHASES[i + 1]?.from ?? 1;
  return clamp01((p - PHASES[i].from) / (to - PHASES[i].from));
}

/** Deterministic tremor: dense sines of the progress (it moves only while the page scrolls). */
const tremor = (p) => 0.6 * Math.sin(p * 173 + 0.5) + 0.3 * Math.sin(p * 397 + 1.7) + 0.2 * Math.sin(p * 811 + 2.3);

/**
 * Needle angle (radians clockwise from north): it trembles as it is inked in, then a damped
 * swing (driven by scroll, not by time) comes to rest exactly on north.
 */
export function needleAt(p) {
  const settle = span(p, ...TIMING.needleSettle);
  if (settle >= 1) return 0;
  const shaking = 1 - smooth(span(p, TIMING.needleSettle[0] - 0.02, TIMING.needleSettle[0] + 0.01));
  const noisy = 0.9 * tremor(p) + 1.3; // wanders, far from the answer
  const swing = noisy * Math.exp(-4.2 * settle) * Math.cos(Math.PI * 2 * 1.75 * settle) * (1 - smooth(span(settle, 0.78, 1)));
  return mix(swing, noisy, shaking);
}

/** The approved slip: rides the column's axis, waits under the last ring, is lifted to the page. */
function slipPose(p, descent, gather, plates) {
  const level = FUNNEL.columnBottom + 0.5 * (FUNNEL.columnTop - FUNNEL.columnBottom) - descent;
  const floor = FUNNEL.rings[FUNNEL.rings.length - 1].y - 1.15;
  const inColumn = Math.max(level, floor);
  const arrive = smooth(span(gather, 0.2, 0.7));
  const world = [mix(2.4, 0.25 * Math.cos(p * 11), arrive), mix(7.6, inColumn, arrive), mix(1.2, 0.25 * Math.sin(p * 11), arrive)];
  const lift = easeInOutCubic(span(p, ...TIMING.lift));
  const side = easeInOutCubic(span(p, ...TIMING.toSide));
  const plate = {
    x: mix(plates.center.x, plates.side.x, side),
    y: mix(plates.center.y, plates.side.y, side),
    h: mix(plates.center.h, plates.side.h, side),
    angle: mix(plates.center.angle, plates.side.angle, side),
  };
  // lifted toward the reader (bigger, a longer hard shadow), then set down for the stamp
  const raise = Math.sin(Math.PI * span(p, TIMING.lift[0], TIMING.stamp[0]));
  return {
    world,
    lift,
    raise,
    plate,
    roll: (1 - lift) * 0.35 * Math.sin(p * 17),
    yaw: (1 - lift) * 0.5 * Math.sin(p * 9),
  };
}

/** The ONAYLANDI stamp: comes down hard (overshoot scale), leaves its ink on the slip. */
function stampPose(p) {
  const t = span(p, ...TIMING.stamp);
  return {
    visible: t > 0,
    press: t,
    scale: mix(1.9, 1, easeInCubic(Math.min(t / 0.7, 1))),
    ink: smooth(span(t, 0.65, 1)), // the impression spreads once the die has hit
  };
}

function compassPose(p, plates) {
  const ink = span(p, ...TIMING.compassInk);
  return {
    visible: ink > 0,
    ...plates.compass,
    ink,
    needle: needleAt(p),
    needleIn: smooth(span(p, ...TIMING.needleIn)),
    locked: span(p, ...TIMING.needleSettle) >= 1,
  };
}

/**
 * @param {number} progress  0 → 1 along the pinned scroll; down to −lead while the section arrives
 *   (pre-roll), up to 1 + lead while it leaves (exit)
 * @param {{ compact?: boolean, lead?: number, compassX?: number | null, idle?: number }} [options]
 *   lead: one viewport in pin units; compassX: put the compass over this x (fraction, wide only);
 *   idle: seconds the reader has rested (the slips' idle life, IDLE)
 */
export function poseAt(progress, { compact = false, lead = LEAD, compassX = null, idle = 0 } = {}) {
  const reach = lead > 0 ? lead : LEAD;
  const raw = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, -reach), 1 + reach);
  const p = clamp01(raw);
  const entry = clamp01(1 + Math.min(raw, 0) / reach); // 0 as the section's top edge appears
  const exit = clamp01((raw - 1) / reach);
  const plates = platesFor(compact, compassX);
  const gather = span(p, ...TIMING.gather);
  // eased in, then even: the counter keeps falling right up to the end of the act
  const d = span(p, ...TIMING.descent);
  const descent = FULL_DESCENT * (d < 0.2 ? 2.5 * d * d : d - 0.1) / 0.9;
  const [inkFrom, inkTo] = TIMING.ringInk;
  const inkStep = (inkTo - inkFrom) / 4;
  const ringsOut = smooth(span(p, ...TIMING.ringsOut));
  const clockAt = Math.min(raw, 1); // the storm keeps drifting through the pre-roll
  const before = 1 - entry;
  return {
    progress: p,
    entry,
    exit,
    phase: phaseAt(p),
    fit: plates.fit,
    camera: {
      target: [0, mix(2.3, 1.2, smooth(span(p, 0.12, 0.5))), 0],
      yaw: -0.35 + p * 0.9,
      pitch: mix(0.16, 0.3, smooth(span(p, 0.05, 0.3))),
      distance: 24,
      spanY: compact ? 13.6 : 12.6, // world units the scene box shows (height / width)
      spanX: compact ? 9.8 : 21,
      centerX: compact ? 0.42 : 0.53,
      centerY: compact ? 0.4 : 0.45,
    },
    clock: {
      gather,
      swirl: clockAt * 6.5 + idle * IDLE.swirl,
      descent,
      time: clockAt * 5,
      idle: idle * IDLE.tumble,
      release: smooth(span(p, TIMING.ringsOut[0], TIMING.ringsOut[1] - 0.02)),
      fall: PREROLL_FALL * before * before,
    },
    counter: counterAt(descent),
    rings: {
      ink: FUNNEL.rings.map((_, k) => easeInOutCubic(span(p, inkFrom + k * inkStep, inkFrom + (k + 2) * inkStep))),
      fade: ringsOut,
      drop: easeInCubic(span(p, ...TIMING.ringsOut)), // the sieve falls away (act III)
    },
    // which ring the act caption docks beside: glides top → bottom with the column
    focus:
      clamp01((descent - crossingWindow(0)[0]) / (crossingWindow(2)[0] - crossingWindow(0)[0])) * (FUNNEL.rings.length - 1),
    // weights the layout blends the docks with (continuous across act changes)
    dock: {
      sieve: smooth(span(p, 0.13, 0.22)),
      plate: easeInOutCubic(span(p, ...TIMING.lift)),
      compass: easeInOutCubic(span(p, ...TIMING.toSide)),
    },
    slip: slipPose(p, descent, gather, plates),
    stamp: stampPose(p),
    compass: compassPose(p, plates),
  };
}

/** Frame-rate independent exponential approach (half-life in seconds). */
export function damp(current, target, halfLife, dt) {
  if (halfLife <= 0 || !(dt > 0)) return target;
  return target + (current - target) * 2 ** (-dt / halfLife);
}
