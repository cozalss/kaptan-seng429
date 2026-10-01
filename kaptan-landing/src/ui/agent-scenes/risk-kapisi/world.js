// Risk Kapısı — where things stand in the diorama (world units, y up, the camera looks down −z).
// The canal runs left to right across the plate between two quays; the sixteen rule bollards stand
// on the far quay, the queue's moorings and the gate's lever are on the near one, the harbour lies
// in the far lane beyond the gate. Pure geometry: the renderer projects it.

import { CANAL, HARBOUR, RULE_COUNT, ruleX } from './model.js';

export const CAMERA = Object.freeze({
  target: Object.freeze([0.05, 0.3, 0.4]),
  yaw: 0.2, // seen from downstream: the gate and its lever come nearest, the queue lies off
  pitch: 0.6,
  distance: 12,
  spanX: 8.9,
  spanY: 4.4,
  centerX: 0.5,
  centerY: 0.6,
});

export const QUAY = Object.freeze({
  top: 0.36, // both quays stand this high above the water
  back: -1.0, // the far quay's face
  front: 1.0, // the near quay's edge
  from: -11, // the quays run past both sides of the plate
  to: 11,
  frontDepth: 3.2, // how far the near quay reaches toward the viewer
});

export const BARGE = Object.freeze({
  halfLength: CANAL.halfLength,
  halfWidth: 0.25,
  keelLength: 0.44, // the hull narrows to its waterline: a punt's raked ends
  keelWidth: 0.2,
  hull: 0.2, // deck height above the water
  lift: 0.05, // a light barge rides this much higher than a full one
  cargoLength: 0.31,
  cargoWidth: 0.165,
  cargoAft: 0.04,
  cargoHeight: 0.72, // a full-size stack; a proposal's size scales it
  page: 0.07, // the stack is ruled like the edge of a ream
});

export const BOLLARD = Object.freeze({ z: -1.2, radius: 0.085, height: 0.3 });

/** The rule's paper tag on the far quay's face, under its bollard. */
export const TAG = Object.freeze({ halfW: 0.145, halfH: 0.09, y: 0.18, z: QUAY.back + 0.004 });

/** A gauge arm: a mast on the bollard and a bar swung across the canal at the rule's limit. */
export const ARM = Object.freeze({ reach: CANAL.main - BOLLARD.z, bar: 0.42 });
/** The boom that stops a barge: hinged on the bollard top, swung down across the canal. */
export const BOOM = Object.freeze({ y: BOLLARD.height + QUAY.top - 0.02, reach: CANAL.main + 0.62 - BOLLARD.z });

export const GATE = Object.freeze({
  x: CANAL.gate,
  backZ: -1.14,
  frontZ: 1.14,
  height: 1.95,
  transom: 0.4, // a railing band under the beam: the portrait's gangway gate, spanning the canal
  bars: 7,
  leafLength: 0.86, // the far gate leaf stands open along the far quay's face
  leafHeight: 0.78,
});

/** The kill switch: a latch box on the near gate post, its lever in the plane facing the viewer. */
export const LEVER = Object.freeze({
  pivot: Object.freeze([GATE.x + 0.05, 0.98, GATE.frontZ + 0.08]),
  length: 0.6,
  knob: 0.068,
  rest: 1.2, // radians from +x in the x–y plane: up, leaning right (the portrait's grip)
  thrown: -0.8, // over to the right and down
});

/** The sign on the near quay at the gate's foot: the switch's rule, printed. Centre (world) and half extents. */
export const PLAQUE = Object.freeze({ centre: Object.freeze([GATE.x - 0.85, 0.8, 2.1]), halfW: 0.64, halfH: 0.27 });

/** The "R01–R16" tag hung from the gate's railing band (the portrait's tag on the gangway gate). */
export const BEAM_TAG = Object.freeze({ x: GATE.x, y: GATE.height - GATE.transom - 0.3, z: -0.4, halfW: 0.4, halfH: 0.16 });

/** Mooring posts: the queue's on the near quay, the harbour's on the far one. */
export const QUEUE_POSTS = Object.freeze(CANAL.queue.map((x) => Object.freeze([x + 0.32, QUAY.top, QUAY.front + 0.16])));
export const HARBOUR_POSTS = Object.freeze(
  HARBOUR.flatMap((b) => [Object.freeze([b.x - 0.38, QUAY.top, QUAY.back - 0.16]), Object.freeze([b.x + 0.38, QUAY.top, QUAY.back - 0.16])]),
);
export const POST = Object.freeze({ radius: 0.055, height: 0.2 });

/** The bollards' world x (R01 → R16). */
export const BOLLARD_X = Object.freeze(Array.from({ length: RULE_COUNT }, (_, i) => ruleX(i)));

/** A barge's local axes: forward (bow) and starboard-to-viewer side, from its heading. */
export function bargeAxes(yaw, out) {
  out[0] = Math.cos(yaw);
  out[1] = 0;
  out[2] = -Math.sin(yaw);
  out[3] = Math.sin(yaw);
  out[4] = 0;
  out[5] = Math.cos(yaw);
  return out;
}

/** Deck height of a barge carrying a stack of `size` (a lighter barge rides higher). */
export const deckY = (size, bob = 0) => BARGE.hull + BARGE.lift * (1 - size) + bob;

/**
 * Writes a box's eight world corners into out[o…o+23], index l + 2·v + 4·w (l: stern 0 / bow 1,
 * v: bottom 0 / top 1, w: far side 0 / near side 1). Bottom and top may differ in size (a hull's
 * rake). `ax` are the axes from bargeAxes.
 */
export function writeBox(out, o, ax, cx, cz, y0, y1, hl0, hw0, hl1, hw1, shift = 0) {
  for (let w = 0; w < 2; w += 1) {
    for (let v = 0; v < 2; v += 1) {
      for (let l = 0; l < 2; l += 1) {
        const hl = v ? hl1 : hl0;
        const hw = v ? hw1 : hw0;
        const fl = (l ? hl : -hl) + shift;
        const sw = w ? hw : -hw;
        const i = o + (l + 2 * v + 4 * w) * 3;
        out[i] = cx + ax[0] * fl + ax[3] * sw;
        out[i + 1] = v ? y1 : y0;
        out[i + 2] = cz + ax[2] * fl + ax[5] * sw;
      }
    }
  }
  return out;
}

/** The faces of a writeBox box as corner loops: bottom edge first (l0 → l1), then the top edge back. */
export const BOX_FACES = Object.freeze([
  Object.freeze([2, 3, 7, 6]), // top
  Object.freeze([4, 5, 7, 6]), // near side
  Object.freeze([0, 1, 3, 2]), // far side
  Object.freeze([5, 1, 3, 7]), // bow
  Object.freeze([0, 4, 6, 2]), // stern
]);
export const FACE = Object.freeze({ top: 0, near: 1, far: 2, bow: 3, stern: 4 });
