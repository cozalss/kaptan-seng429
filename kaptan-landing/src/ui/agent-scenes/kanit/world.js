// Kanıt — where things stand in the diorama (world units, y up, the camera looks down −z). The
// event card's easel in the foreground on the left, the row of chosen cards on a long ledge beside
// it, the code's counter at the row's end, and the event memory — a card-catalogue chest of twelve
// drawers — standing back on the right. Pure geometry: the renderer projects it.

import { DRAWER_COLS, DRAWER_ROWS, PICKS, ROUNDS, STAGES } from './model.js';

/** A past event's index card, and the event card on the easel (a touch larger). */
export const CARD = Object.freeze({ halfW: 0.33, halfH: 0.46 });
export const QUERY_CARD = Object.freeze({ halfW: 0.35, halfH: 0.49 });
/** Where the covered half begins, in the card's [-1, 1] space (y down): the lower half is the return. */
export const FOLD_Y = 0.06;

export const CAMERA = Object.freeze({
  target: Object.freeze([0.25, 1.3, 1.2]),
  yaw: -0.3,
  pitch: 0.07,
  distance: 10,
  spanX: 7.9,
  spanY: 3.3,
  centerX: 0.5,
  centerY: 0.5,
});

/** A box standing on the ground, turned by `yaw`: its own axes and a point mapper. */
function body({ x, z, yaw, width, depth }) {
  const right = Object.freeze([Math.cos(yaw), 0, -Math.sin(yaw)]);
  const normal = Object.freeze([Math.sin(yaw), 0, Math.cos(yaw)]);
  /** (u across from its left edge, v up, w out of its front face — negative is inside) → world. */
  const point = (u, v, w, out = [0, 0, 0]) => {
    const lu = u - width / 2;
    const lw = w + depth / 2;
    out[0] = x + right[0] * lu + normal[0] * lw;
    out[1] = v;
    out[2] = z + right[2] * lu + normal[2] * lw;
    return out;
  };
  return { right, normal, point };
}

/** The event memory: a card-catalogue chest on a plinth, 3 × 4 drawers, a cap with its plaque. */
export const CHEST = (() => {
  const width = 2.05;
  const depth = 1.25;
  const plinth = 0.3;
  const rowH = 0.45;
  const cap = 0.4;
  const side = 0.09;
  const gap = 0.05;
  const cellW = (width - side * 2 - gap * (DRAWER_COLS - 1)) / DRAWER_COLS;
  const height = plinth + rowH * DRAWER_ROWS + cap;
  const x = 3.6;
  const z = -0.15;
  const yaw = 0.26;
  const travel = 0.8; // how far a drawer comes out
  const drawerDepth = 1.05;
  return Object.freeze({ width, depth, plinth, rowH, cap, side, gap, cellW, height, x, z, yaw, travel, drawerDepth });
})();

const CHEST_BODY = body(CHEST);
export const CHEST_AXES = Object.freeze({ right: CHEST_BODY.right, up: Object.freeze([0, 1, 0]), normal: CHEST_BODY.normal });
export const chestPoint = CHEST_BODY.point;

/** A drawer's front in chest coordinates: left, right, bottom, top (front face, w = 0). */
export function drawerRect(d) {
  const col = d % DRAWER_COLS;
  const row = Math.floor(d / DRAWER_COLS);
  const left = CHEST.side + col * (CHEST.cellW + CHEST.gap);
  const bottom = CHEST.plinth + CHEST.rowH * (DRAWER_ROWS - 1 - row) + CHEST.gap / 2;
  return { left, right: left + CHEST.cellW, bottom, top: bottom + CHEST.rowH - CHEST.gap };
}

/** The code's counter: a small cabinet at the row's end with a window, a plaque and a wheel. */
export const COUNTER = Object.freeze({ x: 1.1, z: 2.45, yaw: -0.05, width: 0.74, depth: 0.55, height: 1.3 });
const COUNTER_BODY = body(COUNTER);
export const COUNTER_AXES = Object.freeze({ right: COUNTER_BODY.right, up: Object.freeze([0, 1, 0]), normal: COUNTER_BODY.normal });
export const counterPoint = COUNTER_BODY.point;

/** The row: slot centres on the long ledge. */
export const SLOTS = Object.freeze([
  Object.freeze([-1.72, 1.36, 2.85]),
  Object.freeze([-0.8, 1.36, 2.85]),
  Object.freeze([0.12, 1.36, 2.85]),
]);
export const LEDGE_Y = SLOTS[0][1] - CARD.halfH - 0.03;

/** The event card's easel (foreground left) and where the card slides in from. */
export const QUERY_AT = Object.freeze([-2.65, 1.45, 3.3]);
export const QUERY_FROM = Object.freeze([-3.9, 1.85, 1.6]);

/** Where a picked card is held up to have its heading read: in the open air left of the chest. */
export const READ_AT = Object.freeze([1.3, 2.0, 2.05]);

/** The mouth of a drawer standing out: where its card starts to rise from. */
export function drawerMouth(d, out = [0, 0, 0]) {
  const r = drawerRect(d);
  return chestPoint((r.left + r.right) / 2, r.top - 0.05, CHEST.travel - 0.42, out);
}

const MOUTHS = Array.from({ length: DRAWER_COLS * DRAWER_ROWS }, (_, d) => Object.freeze(drawerMouth(d)));

/**
 * Writes a picked card's world centre into `out` and returns its scale (a card in the drawer is
 * small and grows as it is lifted toward the eye). `card` is one entry of frameAt's cards.
 */
export function cardPlacement(card, round, i, out) {
  const pick = ROUNDS[round].picks[i];
  if (card.stage === STAGES.rise || card.stage === STAGES.hidden) {
    const from = MOUTHS[pick.drawer];
    const t = card.rise;
    // up out of the drawer first, then forward to the reading place
    out[0] = from[0] + (READ_AT[0] - from[0]) * t;
    out[1] = from[1] + (READ_AT[1] - from[1]) * t + 0.35 * Math.sin(Math.PI * t) * (1 - t);
    out[2] = from[2] + (READ_AT[2] - from[2]) * t * t;
    return 0.55 + 0.45 * t;
  }
  if (card.stage === STAGES.read) {
    out[0] = READ_AT[0];
    out[1] = READ_AT[1] + 0.02 * Math.sin(card.read * Math.PI);
    out[2] = READ_AT[2];
    return 1;
  }
  const slot = SLOTS[i];
  const t = card.stage === STAGES.flight ? card.fly : 1;
  // a quadratic arc: up and over, then down onto the ledge
  const cx = (READ_AT[0] + slot[0]) / 2;
  const cy = Math.max(READ_AT[1], slot[1]) + 0.65;
  const cz = (READ_AT[2] + slot[2]) / 2 + 0.3;
  const s = 1 - t;
  out[0] = s * s * READ_AT[0] + 2 * s * t * cx + t * t * slot[0];
  out[1] = s * s * READ_AT[1] + 2 * s * t * cy + t * t * slot[1];
  out[2] = s * s * READ_AT[2] + 2 * s * t * cz + t * t * slot[2];
  return 1;
}

/** The event card's centre on its way onto the easel. */
export function queryPlacement(arrive, out) {
  for (let i = 0; i < 3; i += 1) out[i] = QUERY_FROM[i] + (QUERY_AT[i] - QUERY_FROM[i]) * arrive;
  return out;
}

export const SLOT_COUNT = PICKS;
