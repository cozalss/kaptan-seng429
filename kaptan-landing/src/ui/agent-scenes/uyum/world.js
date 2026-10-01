// Uyum — where things stand in the diorama (world units, y up, the camera looks down −z). The
// slanted reading desk stands in the foreground on the left with the lantern hung beside it, the
// sealed box sits back on the right, a ship's rail runs behind, and the slips drift in from the far
// left. Clean slips go on toward the far right; stopped ones are carried over the box and dropped
// through the slot in its lid. Pure geometry: the renderer projects it.

import { STAGES, TIMING } from './model.js';

export const SLIP = Object.freeze({ halfW: 0.33, halfH: 0.46 });

export const CAMERA = Object.freeze({
  target: Object.freeze([0.12, 1.62, 1.2]),
  yaw: -0.2,
  pitch: 0.1,
  distance: 10,
  spanX: 7.2,
  spanY: 3.55,
  centerX: 0.5,
  centerY: 0.5,
});

/** The reading desk: a board leaning back on one post, turned a touch toward the box. */
export const DESK = (() => {
  const yaw = 0.16;
  const tilt = 0.44; // the board leans back from upright
  const centre = Object.freeze([-1.3, 1.36, 3.3]);
  const right = Object.freeze([Math.cos(yaw), 0, -Math.sin(yaw)]);
  const up = Object.freeze([-Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), -Math.cos(yaw) * Math.sin(tilt)]);
  const normal = Object.freeze([Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt)]);
  return Object.freeze({ yaw, tilt, centre, right, up, normal, halfW: 0.47, halfH: 0.6, thick: 0.05 });
})();

/** Where a slip lies on the desk (just proud of the board). */
export const STATION = Object.freeze([
  DESK.centre[0] + DESK.normal[0] * 0.02 + DESK.up[0] * 0.03,
  DESK.centre[1] + DESK.normal[1] * 0.02 + DESK.up[1] * 0.03,
  DESK.centre[2] + DESK.normal[2] * 0.02 + DESK.up[2] * 0.03,
]);

/** The lantern: hung from high above, beside and in front of the desk (its light falls from the left). */
export const LANTERN = Object.freeze({
  pivot: Object.freeze([-2.25, 8, 3.5]),
  ring: Object.freeze([-2.25, 2.95, 3.5]), // where it hangs at rest
  scale: 1.32, // the drawing's size against one world unit (ring to base ≈ 0.78)
});

/** The sealed box: a crate with a slotted lid, a seal and the counter plaque. */
export const BOX = (() => {
  const width = 1.8;
  const height = 1.12;
  const depth = 1.15;
  const x = 2.25;
  const z = 0.9;
  const yaw = 0.3; // turned a touch: its left side shows
  const slot = Object.freeze({ half: 0.48, width: 0.13 });
  return Object.freeze({ width, height, depth, x, z, yaw, slot });
})();

export const BOX_AXES = Object.freeze({
  right: Object.freeze([Math.cos(BOX.yaw), 0, -Math.sin(BOX.yaw)]),
  up: Object.freeze([0, 1, 0]),
  normal: Object.freeze([Math.sin(BOX.yaw), 0, Math.cos(BOX.yaw)]),
});

/** A point in box coordinates (u across from its left edge, v up, w out of its front) as world xyz. */
export function boxPoint(u, v, w, out = [0, 0, 0]) {
  const { right: r, normal: n } = BOX_AXES;
  const lu = u - BOX.width / 2;
  const lw = w + BOX.depth / 2;
  out[0] = BOX.x + r[0] * lu + n[0] * lw;
  out[1] = v;
  out[2] = BOX.z + r[2] * lu + n[2] * lw;
  return out;
}

/** The slot's centre on the lid, and the point a stopped slip hangs over before it drops. */
export const SLOT_CENTRE = Object.freeze(boxPoint(BOX.width / 2, BOX.height, -BOX.depth / 2));
export const ABOVE_SLOT = Object.freeze([SLOT_CENTRE[0], BOX.height + SLIP.halfH + 0.18, SLOT_CENTRE[2]]);
/** How far a dropping slip sinks: all of it below the lid. */
export const DROP_DEPTH = SLIP.halfH * 2 + 0.22;

/** Next in line: where a slip waits, behind and above the desk, while the one before is read. */
export const WAIT = Object.freeze([STATION[0] + 0.95, STATION[1] + 1.05, STATION[2] - 3.2]);

/** The drift path from far out at sea to WAIT (cubic Bézier, world points). */
export const STREAM = Object.freeze([
  Object.freeze([0.5, 1.9, -36]),
  Object.freeze([-1.4, 4.7, -17]),
  Object.freeze([-0.4, 3.7, -5]),
  WAIT,
]);

/** A clean slip's way on: up off the desk, over the rail and away into the far right. */
export const ONWARD = Object.freeze([
  STATION,
  Object.freeze([0.8, 3.1, 1.8]),
  Object.freeze([6, 3.7, -8]),
  Object.freeze([12.5, 2.2, -30]),
]);

/** The ship's rail behind everything: its posts (x), its line (z) and height. */
export const RAIL = Object.freeze({ z: -4.5, height: 0.9, from: -12, to: 14, step: 2.6 });

/** The bottle the note came in, standing on the deck by the desk. */
export const BOTTLE = Object.freeze([-3.0, 0, 0.3]);

export function bezier3(p, t, out) {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  for (let i = 0; i < 3; i += 1) out[i] = a * p[0][i] + b * p[1][i] + c * p[2][i] + d * p[3][i];
  return out;
}

/**
 * Writes a slip's pose into `out`: [x, y, z, desk, slot] — its world centre, then how far it is
 * turned onto the desk's board (0 facing the eye → 1 lying on the board) and onto the slot's plane
 * (0 → 1 upright in the slot). `slip` is one entry of frameAt's state.
 */
export function slipPose(slip, out) {
  out[3] = 0;
  out[4] = 0;
  if (slip.stage === STAGES.stream) {
    if (slip.u >= -TIMING.approach) {
      const a = (slip.u + TIMING.approach) / TIMING.approach;
      const e = a * a * (3 - 2 * a);
      for (let i = 0; i < 3; i += 1) out[i] = WAIT[i] + (STATION[i] - WAIT[i]) * e;
      out[3] = e;
      return out;
    }
    bezier3(STREAM, slip.stream, out);
    out[1] += 0.22 * Math.sin(slip.u * 1.3 + slip.flutter) * (1 - slip.stream);
    return out;
  }
  if (slip.stage === STAGES.desk || slip.stage === STAGES.hidden) {
    // the tick, ring or strike nudges the slip on the board a hair
    const m = slip.mark > 0 && slip.mark < 1 ? Math.sin(slip.mark * Math.PI) * 0.012 : 0;
    for (let i = 0; i < 3; i += 1) out[i] = STATION[i] - DESK.up[i] * m;
    out[3] = 1;
    return out;
  }
  if (slip.stage === STAGES.exit) {
    bezier3(ONWARD, slip.exit, out);
    const off = slip.exit * slip.exit * (3 - 2 * slip.exit);
    out[3] = 1 - Math.min(1, off * 3);
    return out;
  }
  if (slip.stage === STAGES.flight) {
    const t = slip.fly;
    const cx = (STATION[0] + ABOVE_SLOT[0]) / 2;
    const cy = Math.max(STATION[1], ABOVE_SLOT[1]) + 1.2;
    const cz = (STATION[2] + ABOVE_SLOT[2]) / 2 + 0.3;
    const s = 1 - t;
    out[0] = s * s * STATION[0] + 2 * s * t * cx + t * t * ABOVE_SLOT[0];
    out[1] = s * s * STATION[1] + 2 * s * t * cy + t * t * ABOVE_SLOT[1];
    out[2] = s * s * STATION[2] + 2 * s * t * cz + t * t * ABOVE_SLOT[2];
    out[3] = 1 - t;
    out[4] = t;
    return out;
  }
  // STAGES.drop
  out[0] = ABOVE_SLOT[0];
  out[1] = ABOVE_SLOT[1] - DROP_DEPTH * slip.drop;
  out[2] = ABOVE_SLOT[2];
  out[4] = 1;
  return out;
}
