// Sınıflandırıcı — where things stand in the diorama (world units, y up, the camera looks down −z).
// The reader's station is in the foreground on the left, the six-hole locker stands back on the
// right, and the day's slips drift in from the far left. Pure geometry: the renderer projects it.

import { BINS, STAGES, TIMING } from './model.js';

export const SLIP = Object.freeze({ halfW: 0.33, halfH: 0.46 });

export const CAMERA = Object.freeze({
  target: Object.freeze([1.0, 1.55, 0.4]),
  yaw: -0.4,
  pitch: 0.07,
  distance: 10,
  spanX: 7.6,
  spanY: 3.9,
  centerX: 0.5,
  centerY: 0.5,
});

/** The locker: a plinth with a drawer, three rows of two cubbies, a cap. */
export const LOCKER = (() => {
  const width = 2.2;
  const depth = 1.2;
  const plinth = 0.66;
  const rowH = 0.84;
  const rail = 0.3; // the rail above each hole carries its plaque
  const sill = 0.06;
  const side = 0.1;
  const mullion = 0.09;
  const cap = 0.13;
  const cellW = (width - side * 2 - mullion) / 2;
  const height = plinth + rowH * 3 + cap;
  const x = 3.15;
  const z = -0.6;
  const yaw = 0.22; // turned a touch away from the reader: its left side shows, slips enter at an angle
  return Object.freeze({ width, depth, plinth, rowH, rail, sill, side, mullion, cap, cellW, height, x, z, yaw });
})();

/** The locker's own axes in the world: right (width), up, normal (out of its front). */
export const LOCKER_AXES = Object.freeze({
  right: Object.freeze([Math.cos(LOCKER.yaw), 0, -Math.sin(LOCKER.yaw)]),
  up: Object.freeze([0, 1, 0]),
  normal: Object.freeze([Math.sin(LOCKER.yaw), 0, Math.cos(LOCKER.yaw)]),
});

/**
 * A point given in locker coordinates (u across from its left edge, v up from the floor, w out of
 * its front face — negative is inside) written into `out` as world xyz.
 */
export function lockerPoint(u, v, w, out = [0, 0, 0]) {
  const { right: r, normal: n } = LOCKER_AXES;
  const lu = u - LOCKER.width / 2;
  const lw = w + LOCKER.depth / 2;
  out[0] = LOCKER.x + r[0] * lu + n[0] * lw;
  out[1] = v;
  out[2] = LOCKER.z + r[2] * lu + n[2] * lw;
  return out;
}

/** The hole of one cubby in locker coordinates: left, right, bottom, top (front face, w = 0). */
export function holeRect(bin) {
  const { col, row } = BINS[bin];
  const left = LOCKER.side + col * (LOCKER.cellW + LOCKER.mullion);
  const top = LOCKER.plinth + LOCKER.rowH * (3 - row) - LOCKER.rail;
  const bottom = LOCKER.plinth + LOCKER.rowH * (2 - row) + LOCKER.sill;
  return { left, right: left + LOCKER.cellW, bottom, top };
}

/** Where the reader holds a slip up to read it. */
export const STATION = Object.freeze([-1.85, 1.5, 4.0]);

/** Next in line: where a slip waits, behind and above the reader, while the one before is read. */
export const WAIT = Object.freeze([STATION[0] + 0.55, STATION[1] + 0.5, STATION[2] - 1.6]);
/** Seconds before it is set down that the next slip leaves WAIT (the reader is free by then). */
export const APPROACH = TIMING.approach;

/** The drift path from the distance to WAIT: a cubic Bézier (world points). */
export const STREAM = Object.freeze([
  Object.freeze([15, 1.3, -34]),
  Object.freeze([6, 4.4, -16]),
  Object.freeze([-0.6, 3.4, 0.2]),
  WAIT,
]);

function bezier3(p, t, out) {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  for (let i = 0; i < 3; i += 1) out[i] = a * p[0][i] + b * p[1][i] + c * p[2][i] + d * p[3][i];
  return out;
}

/** The cubby mouth a slip aims for (just proud of the front face) and where it comes to rest. */
export function binTargets(bin) {
  const hole = holeRect(bin);
  const u = (hole.left + hole.right) / 2;
  const floor = hole.bottom + 0.03;
  return {
    mouth: lockerPoint(u, floor + 0.05, SLIP.halfH * 0.95),
    rest: lockerPoint(u, floor, -(LOCKER.depth - SLIP.halfH - 0.12)),
  };
}

const TARGETS = BINS.map((_, bin) => binTargets(bin));

/**
 * Writes a slip's world centre into `out` and returns how flat it lies (0 facing the reader, 1
 * lying in its cubby). `slip` is one entry of frameAt's state.
 */
export function slipPlacement(slip, bin, out) {
  if (slip.stage === STAGES.stream) {
    if (slip.u >= -APPROACH) {
      // from its place in line onto the reader's easel
      const a = (slip.u + APPROACH) / APPROACH;
      const e = a * a * (3 - 2 * a);
      for (let i = 0; i < 3; i += 1) out[i] = WAIT[i] + (STATION[i] - WAIT[i]) * e;
      return 0;
    }
    bezier3(STREAM, slip.stream, out);
    const drift = 1 - slip.stream;
    out[1] += 0.22 * Math.sin(slip.u * 1.3 + slip.flutter) * drift;
    return 0;
  }
  if (slip.stage === STAGES.read || slip.stage === STAGES.hidden) {
    out[0] = STATION[0];
    out[1] = STATION[1] + 0.02 * Math.sin(slip.u * 2.2);
    // the stamp's blow pushes the slip back a hair
    const blow = slip.stamp > 0 && slip.stamp < 1 ? Math.sin(slip.stamp * Math.PI) : 0;
    out[2] = STATION[2] - 0.08 * blow;
    return 0;
  }
  const { mouth, rest } = TARGETS[bin];
  if (slip.stage === STAGES.flight) {
    const t = slip.fly;
    // a quadratic arc: up and over, then down into the mouth
    const cx = (STATION[0] + mouth[0]) / 2;
    const cy = Math.max(STATION[1], mouth[1]) + 1.25;
    const cz = (STATION[2] + mouth[2]) / 2 + 0.4;
    const s = 1 - t;
    out[0] = s * s * STATION[0] + 2 * s * t * cx + t * t * mouth[0];
    out[1] = s * s * STATION[1] + 2 * s * t * cy + t * t * mouth[1];
    out[2] = s * s * STATION[2] + 2 * s * t * cz + t * t * mouth[2];
    return Math.min(1, t * 1.25);
  }
  const t = slip.slide;
  for (let i = 0; i < 3; i += 1) out[i] = mouth[i] + (rest[i] - mouth[i]) * t;
  return 1;
}

/** How far into its cubby a sliding slip's centre is (world units behind the front face). */
export function insideDepth(slip) {
  if (slip.stage !== STAGES.slide) return -1;
  return -SLIP.halfH * 0.95 + (LOCKER.depth - 0.12) * slip.slide;
}
