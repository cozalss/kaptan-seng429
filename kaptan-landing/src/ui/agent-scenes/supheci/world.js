// Şüpheci — where things stand in the diorama (world units, y up, the camera looks down −z).
// The lookout's board leans back on its legs in the middle of the deck, the drafts crate stands on
// the left, the ship's rail runs behind (the portrait's rail), and passed-on slips leave to the
// right. Pure geometry: the renderer projects it.

import { STAGES } from './model.js';

export const SLIP = Object.freeze({ halfW: 1.0, halfH: 0.68 });

export const CAMERA = Object.freeze({
  target: Object.freeze([-0.4, 1.3, 0.4]),
  yaw: -0.2,
  pitch: 0.09,
  distance: 11,
  spanX: 6.5, // the drafts crate stays inside the 3:2 frame
  spanY: 2.95,
  centerX: 0.5,
  centerY: 0.53,
});

/** The board: centre of its front face, its turn and lean, half sizes, thickness. */
export const BOARD = Object.freeze({
  centre: Object.freeze([0.1, 1.62, 0.7]),
  yaw: -0.14,
  tilt: 0.2, // leans back
  halfW: 1.26,
  halfH: 0.88,
  thick: 0.1,
  seat: 0.03, // the slip is pinned a touch above the board's middle
});

/** The board's own axes in the world: right, up (along its face), normal (out of its face). */
export const BOARD_AXES = (() => {
  const cy = Math.cos(BOARD.yaw);
  const sy = Math.sin(BOARD.yaw);
  const ct = Math.cos(BOARD.tilt);
  const st = Math.sin(BOARD.tilt);
  return Object.freeze({
    right: Object.freeze([cy, 0, -sy]),
    up: Object.freeze([-sy * st, ct, -cy * st]),
    normal: Object.freeze([sy * ct, st, cy * ct]),
  });
})();

/** A point on the board (s across, v up from its centre, w out of its face) into `out`. */
export function boardPoint(s, v, w, out = [0, 0, 0]) {
  const { right: r, up: u, normal: n } = BOARD_AXES;
  const c = BOARD.centre;
  for (let i = 0; i < 3; i += 1) out[i] = c[i] + r[i] * s + u[i] * v + n[i] * w;
  return out;
}

/** A point of the pinned slip given in its own [-1, 1]² space (y down), into `out`. */
export function slipPoint(fx, fy, out = [0, 0, 0], lift = 0.015) {
  return boardPoint(fx * SLIP.halfW, BOARD.seat - fy * SLIP.halfH, lift, out);
}

/** The drafts crate (left): a box on the deck; slips lie in it lengthwise. */
export const CRATE = Object.freeze({ x: -2.3, z: -0.9, yaw: 0.32, width: 1.45, height: 0.46, depth: 2.15 });

export const CRATE_AXES = Object.freeze({
  right: Object.freeze([Math.cos(CRATE.yaw), 0, -Math.sin(CRATE.yaw)]),
  normal: Object.freeze([Math.sin(CRATE.yaw), 0, Math.cos(CRATE.yaw)]),
});

/** A point in crate coordinates (u across from its centre, v up from the deck, w out of its front from its centre). */
export function cratePoint(u, v, w, out = [0, 0, 0]) {
  const { right: r, normal: n } = CRATE_AXES;
  out[0] = CRATE.x + r[0] * u + n[0] * w;
  out[1] = v;
  out[2] = CRATE.z + r[2] * u + n[2] * w;
  return out;
}

/** The top sheet of the drafts stack, where the next slip is lifted from. */
export const IN_TOP = Object.freeze(cratePoint(0, CRATE.height + 0.05, 0));
/** Where a passed-on slip goes: off the plate to the right, rising a little. */
export const EXIT = Object.freeze([5.4, 2.5, 0.2]);

/** The ship's rail behind the board: posts, top rail and a slack rope. */
export const RAIL = Object.freeze({ z: -4.6, from: -10, to: 10, step: 2.0, height: 1.05, rope: 0.55, sag: 0.1 });

const PINNED = Object.freeze(slipPoint(0, 0));

function bezier2(a, c, b, t, out, o) {
  const s = 1 - t;
  for (let i = 0; i < 3; i += 1) out[o + i] = s * s * a[i] + 2 * s * t * c[i] + t * t * b[i];
}

/** Writes `v` (3 at o) scaled to length `len`. */
function setLength(out, o, len) {
  const l = Math.hypot(out[o], out[o + 1], out[o + 2]) || 1;
  for (let i = 0; i < 3; i += 1) out[o + i] *= len / l;
}

const ctrl = [0, 0, 0];

/**
 * A slip's pose: centre (0–2), half-axis a along its x (3–5), half-axis b along its up (6–8),
 * written into `out`. `slip` is one entry of frameAt's state.
 */
export function slipPose(slip, out) {
  const { right: R, up: U } = BOARD_AXES;
  const { halfW: hw, halfH: hh } = SLIP;
  if (slip.stage === STAGES.approach) {
    const e = slip.move;
    for (let i = 0; i < 3; i += 1) ctrl[i] = (IN_TOP[i] + PINNED[i]) / 2;
    ctrl[1] += 1.3;
    ctrl[2] += 0.5;
    bezier2(IN_TOP, ctrl, PINNED, e, out, 0);
    // lying in the crate lengthwise (a points back, b to the left) → standing on the board
    const f = e * e * (3 - 2 * e);
    const { right: cr, normal: cn } = CRATE_AXES;
    for (let i = 0; i < 3; i += 1) {
      out[3 + i] = -cn[i] * (1 - f) + R[i] * f;
      out[6 + i] = -cr[i] * (1 - f) + U[i] * f;
    }
    setLength(out, 3, hw);
    setLength(out, 6, hh);
    return out;
  }
  if (slip.stage === STAGES.leave) {
    const e = slip.move;
    for (let i = 0; i < 3; i += 1) ctrl[i] = (PINNED[i] + EXIT[i]) / 2;
    ctrl[1] += 0.9;
    ctrl[2] += 0.7;
    bezier2(PINNED, ctrl, EXIT, e, out, 0);
    // it turns away as it goes, a quarter of a turn about its own up and a little roll
    const turn = 0.9 * e;
    const roll = -0.25 * Math.sin(Math.PI * e);
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    const { normal: N } = BOARD_AXES;
    for (let i = 0; i < 3; i += 1) {
      const ax = R[i] * ct - N[i] * st;
      out[3 + i] = (ax * Math.cos(roll) + U[i] * Math.sin(roll)) * hw;
      out[6 + i] = (-ax * Math.sin(roll) + U[i] * Math.cos(roll)) * hh;
    }
    return out;
  }
  for (let i = 0; i < 3; i += 1) {
    out[i] = PINNED[i];
    out[3 + i] = R[i] * hw;
    out[6 + i] = U[i] * hh;
  }
  return out;
}

/** The spyglass: held by the lookout off the board's upper left, it pivots at its eyepiece. */
export const SPYGLASS = Object.freeze({
  eye: Object.freeze([-1.9, 0.52, 1.5]), // the eyepiece, in board coordinates (s, v, w)
  // sections from the objective back to the eyepiece: length, radius (world units)
  sections: Object.freeze([0.4, 0.1, 0.1, 0.106, 0.36, 0.078, 0.3, 0.058]),
  view: 0.23, // radius of the field it shows on the slip
});

const LENGTH = SPYGLASS.sections.reduce((sum, v, i) => (i % 2 ? sum : sum + v), 0);
const EYEPIECE = Object.freeze(boardPoint(...SPYGLASS.eye));

/**
 * The spyglass's pose for a focus point on the slip: objective centre (0–2), unit axis toward the
 * eyepiece (3–5), the focus point on the slip (6–8). `bob` in [-1, 1] lifts the hand a hair.
 */
export function spyglassPose(fx, fy, bob, out) {
  const U = BOARD_AXES.up;
  slipPoint(fx, fy, ctrl);
  for (let i = 0; i < 3; i += 1) {
    out[6 + i] = ctrl[i];
    out[3 + i] = EYEPIECE[i] + U[i] * 0.03 * bob - ctrl[i];
  }
  setLength(out, 3, 1);
  for (let i = 0; i < 3; i += 1) out[i] = EYEPIECE[i] + U[i] * 0.03 * bob - out[3 + i] * LENGTH;
  return out;
}
