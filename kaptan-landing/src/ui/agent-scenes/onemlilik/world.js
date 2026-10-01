// Önemlilik — where things stand in the diorama (world units, y up, the camera looks down −z).
// The balance hangs from the ship's spar in the middle of the plate: dial at the pivot, two pans on
// cords. The purser's chest with the company's ledgers stands on the deck to the right; the amount's
// weight comes in from the left, off the plate (from Okuyucu). Pure geometry: the renderer projects it.

import { CAST } from './model.js';

export const CAMERA = Object.freeze({
  target: Object.freeze([0.95, 2.05, 0]),
  yaw: -0.2,
  pitch: 0.06,
  distance: 11,
  spanX: 7.5,
  spanY: 4.55,
  centerX: 0.5,
  centerY: 0.5,
});

/** The balance: pivot (at the dial's centre), half-beam, cords, pans, dial and needle radii. */
export const BALANCE = Object.freeze({
  pivot: Object.freeze([0, 2.58, 0]),
  half: 1.78,
  cord: 1.2,
  panR: 0.62,
  panDepth: 0.13,
  dialR: 0.74,
  dialZ: 0.07, // the dial face stands proud of the beam
  needle: 0.47, // the needle's reach, short of the threshold band (dialR · 0.7 and out)
  spar: 4.12,
});

/** The threshold band on the dial (fractions of dialR): the rules' mark lives only out here. */
export const THRESHOLD_BAND = Object.freeze({ from: 0.74, to: 0.9 });

/** The purser's chest: a box on the deck, lid open toward the back. */
export const CHEST = Object.freeze({ x: 3.55, z: 0.25, width: 1.45, height: 0.74, depth: 0.8, lid: 1.92 });

export const BOOK = Object.freeze({ width: 1.02, depth: 0.66 });
export const WEIGHT = Object.freeze({ height: 0.5, base: 0.24 });

/** Where the amount's weight enters (off the plate, left and high). */
export const WEIGHT_FROM = Object.freeze([-5.6, 3.7, 0.8]);
/**
 * Where loads are carried on to after a weighing: the ledgers on to the right (their figures go on),
 * the amount's weight back up the way it came — neither crosses the dial.
 */
export const LEAVE = Object.freeze([2.6, 1.1, -0.2]);
export const LEAVE_WEIGHT = Object.freeze([-2.4, 1.0, 0.2]);

/** The end of the beam on `side` (−1 left, +1 right) at tilt theta, into `out`. */
export function beamEnd(side, theta, out) {
  const [px, py, pz] = BALANCE.pivot;
  out[0] = px + side * BALANCE.half * Math.cos(theta);
  out[1] = py - side * BALANCE.half * Math.sin(theta);
  out[2] = pz;
  return out;
}

/** The centre of a pan's rim (its load sits here) on `side` at tilt theta. Pans hang plumb. */
export function panCentre(side, theta, out) {
  beamEnd(side, theta, out);
  out[1] -= BALANCE.cord;
  return out;
}

/** The dial needle's tip at tilt theta (it turns with the beam), into `out`. */
export function needleTip(theta, out) {
  const [px, py, pz] = BALANCE.pivot;
  out[0] = px + Math.sin(theta) * BALANCE.needle;
  out[1] = py + Math.cos(theta) * BALANCE.needle;
  out[2] = pz + BALANCE.dialZ + 0.02;
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Quadratic arc a → b lifted by `lift` at its middle. */
function arc(a, b, lift, t, out) {
  const s = 1 - t;
  for (let i = 0; i < 3; i += 1) {
    const c = (a[i] + b[i]) / 2 + (i === 1 ? lift : 0);
    out[i] = s * s * a[i] + 2 * s * t * c + t * t * b[i];
  }
  return out;
}

const restAt = [0, 0, 0];
const chestMouth = Object.freeze([CHEST.x, CHEST.height + 0.02, CHEST.z - 0.08]); // just over the rim: never seen through the front

/** Weight base centre on the left pan (slightly off-centre, toward the viewer). */
export function weightRest(theta, out) {
  panCentre(-1, theta, out);
  out[0] += 0.04;
  out[2] += 0.08;
  return out;
}

/** Where a ledger lies on the right pan: book 0 on the pan, book 1 on top of it. */
export function bookRest(k, weighing, theta, out) {
  panCentre(1, theta, out);
  const books = CAST[weighing].books;
  out[1] += k === 0 ? 0 : books[0];
  out[0] += k === 0 ? 0 : 0.05;
  out[2] += k === 0 ? 0 : -0.03;
  return out;
}

/** After a weighing every load rises and is carried off along `to`. */
function addLeave(leave, out, to = LEAVE) {
  out[0] += to[0] * leave;
  out[1] += to[1] * Math.sin(leave * Math.PI * 0.5);
  out[2] += to[2] * leave;
  return out;
}

/** The weight's base centre at this frame (`load` is state.weight), into `out`. */
export function weightPlacement(load, theta, out) {
  weightRest(theta, restAt);
  if (load.fly < 1) return arc(WEIGHT_FROM, restAt, 1.0, load.fly, out);
  out[0] = restAt[0];
  out[1] = restAt[1];
  out[2] = restAt[2];
  return addLeave(load.leave, out, LEAVE_WEIGHT);
}

/** A ledger's bottom-face centre at this frame (`load` is state.books[k]), into `out`. */
export function bookPlacement(k, load, weighing, theta, out) {
  bookRest(k, weighing, theta, restAt);
  if (load.fly < 1) return arc(chestMouth, restAt, 1.15 + 0.2 * k, load.fly, out);
  out[0] = restAt[0];
  out[1] = restAt[1];
  out[2] = restAt[2];
  return addLeave(load.leave, out);
}

/** How a flying ledger is turned (radians about y): squared up to the pan as it lands. */
export const bookYaw = (load) => lerp(0.5, 0, load.fly) + 0.18 * load.leave;
