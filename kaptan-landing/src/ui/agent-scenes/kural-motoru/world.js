// Kural Motoru — where things stand in the diorama (world units, y up, the camera looks down −z).
// A long sorting bench: a low cabinet with five open trays on it, a backboard carrying the gates'
// plaques and the slate, a rail running in front of the backboard with the reading bridge over its
// left end and the hopper of waiting cards at its very end, and the engine-order telegraph of the
// portrait mounted on top above the bridge. Pure geometry: the renderer projects it.

import { CAST, GATES, RAIL, STAGES } from './model.js';

export const CARD = Object.freeze({ halfW: 0.34, halfH: 0.19 });

export const CAMERA = Object.freeze({
  target: Object.freeze([0.08, 1.5, 0]),
  yaw: -0.36,
  pitch: 0.13,
  distance: 11,
  spanX: 7.8,
  spanY: 3.5,
  centerX: 0.5,
  centerY: 0.5,
});

/** The bench (all boxes as [x0, x1, y0, y1, z0, z1]). */
export const BENCH = (() => {
  const x0 = -3.45;
  const x1 = 3.95;
  const cabinetTop = 0.3;
  const backZ = -0.3; // the backboard's front face
  const railTop = 0.92;
  return Object.freeze({
    x0,
    x1,
    cabinet: Object.freeze([x0, x1, 0, cabinetTop, -0.62, 0.36]),
    backboard: Object.freeze([x0, x1, cabinetTop, 2.04, -0.62, backZ]),
    rail: Object.freeze([x0 - 0.05, x1 - 0.12, railTop - 0.07, railTop, backZ, 0.16]),
    railTop,
    backZ,
    cabinetTop,
  });
})();

/** Trays, one under each gate: open boxes on the cabinet; slot 0 sits on a raised step at the back. */
export const TRAY = Object.freeze({ halfW: 0.43, floor: BENCH.cabinetTop + 0.02, lip: BENCH.cabinetTop + 0.26, back: -0.24, front: 0.3, step: 0.11 });

/** Card centre at rest in a tray slot, written into out. */
export function slotRest(gate, slot, out = [0, 0, 0]) {
  const x = RAIL.gates[gate];
  if (slot === 0) {
    out[0] = x - 0.05;
    out[1] = TRAY.floor + TRAY.step + CARD.halfH;
    out[2] = -0.06;
  } else {
    out[0] = x + 0.07;
    out[1] = TRAY.floor + CARD.halfH;
    out[2] = 0.13;
  }
  return out;
}

/** The hopper of waiting cards at the rail's left end: deck position 0 is the front card. */
export const HOPPER = Object.freeze({ x: -2.92, halfW: 0.45, front: 0.22, wall: 0.24 });

/** Where a waiting card stands at a (continuous) deck position. */
export function deckPoint(deck, out) {
  out[0] = HOPPER.x - 0.03 * deck;
  out[1] = BENCH.railTop + CARD.halfH + 0.06 * deck;
  out[2] = -0.14 * deck;
  return out;
}

/** The reading bridge over the rail: two posts and a crossbar; pins hang from the crossbar. */
export const BRIDGE = Object.freeze({
  x: RAIL.reader,
  halfW: 0.5,
  z: 0.05,
  bar: 1.5,
  barH: 0.09,
  pinRest: 1.41, // pin tips, raised
});

/** The punch row on every card: column centres (fraction of halfW) and the row (fraction, y down). */
export const PUNCH = Object.freeze({ cols: Object.freeze([-0.7, -0.42, -0.14, 0.14, 0.42, 0.7]), row: -0.6 });

/** The slate on the backboard, above the bridge: [x0, x1, y0, y1]. */
export const SLATE = Object.freeze([RAIL.reader - 0.68, RAIL.reader + 0.68, 1.62, 2.0]);

/** Gate plaques on the backboard: [x0, x1, y0, y1] around each gate. */
export function plaqueRect(gate) {
  const x = RAIL.gates[gate];
  return [x - 0.41, x + 0.41, 1.06, 1.78];
}

/** The telegraph dial, mounted on the backboard's top over the bridge. */
export const DIAL = Object.freeze({ x: RAIL.reader, y: 2.53, z: -0.44, r: 0.45 });

/** Half-gap the rail leaves at each gate for a card to drop through. */
export const GATE_GAP = CARD.halfW + 0.05;

/**
 * Writes a moving card's world centre into `out`; returns false when it is not drawn as moving.
 * `card` is one entry of frameAt's state; `k` its index in CAST.
 */
export function cardPlacement(card, k, out) {
  const railY = BENCH.railTop + CARD.halfH;
  switch (card.stage) {
    case STAGES.hopper:
      deckPoint(card.deck, out);
      return true;
    case STAGES.feed:
      out[0] = HOPPER.x + (RAIL.reader - HOPPER.x) * card.feed;
      out[1] = railY;
      out[2] = 0;
      return true;
    case STAGES.read:
      out[0] = RAIL.reader;
      out[1] = railY;
      out[2] = 0;
      return true;
    case STAGES.travel: {
      const gx = RAIL.gates[CAST[k].gateIndex];
      out[0] = RAIL.reader + (gx - RAIL.reader) * card.travel;
      out[1] = railY;
      out[2] = 0;
      return true;
    }
    case STAGES.drop: {
      const { gateIndex, slot } = CAST[k];
      slotRest(gateIndex, slot, out);
      const d = card.drop;
      const gx = RAIL.gates[gateIndex];
      out[0] = gx + (out[0] - gx) * d;
      out[1] = railY + (out[1] - railY) * d;
      out[2] = out[2] * d;
      return true;
    }
    default:
      return false;
  }
}

/** Every gate sits on the rail, past the bridge, with room for a card between neighbours. */
export function gatesClear() {
  for (let g = 0; g < GATES.length; g += 1) {
    if (RAIL.gates[g] - GATE_GAP <= BRIDGE.x + BRIDGE.halfW) return false;
    if (g > 0 && RAIL.gates[g] - RAIL.gates[g - 1] < TRAY.halfW * 2 + 0.05) return false;
  }
  return RAIL.gates[GATES.length - 1] + TRAY.halfW <= BENCH.x1;
}
