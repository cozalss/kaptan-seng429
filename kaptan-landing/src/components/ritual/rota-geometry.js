// Pure geometry for "Bölüm 4 · Rota" (no DOM, no GSAP): the dotted course through the waypoints
// and the boat's pose on it.

import { clamp } from '../../lib/math.js';

const round = (value) => Math.round(value * 10) / 10;

function isPoint(point) {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * SVG path data through `points` (top to bottom): one cubic per leg with vertical tangents at every
 * waypoint, so the boat passes each ⊙ upright; legs bow out alternately left and right by `sway` px.
 * The curve of leg k depends only on its two ends and k, so a prefix of the points gives a prefix
 * of the same course (used to measure where each waypoint sits along it).
 * @param {{x: number, y: number}[]} points
 * @param {{ sway?: number, tension?: number }} [options]
 * @returns {string}
 */
export function coursePath(points, { sway = 0, tension = 0.5, bows = null } = {}) {
  if (!Array.isArray(points) || points.length < 2 || !points.every(isPoint)) {
    throw new RangeError('coursePath: expected at least two {x, y} points');
  }
  const [first, ...rest] = points;
  const legs = rest.map((to, index) => {
    const from = points[index];
    const reach = (to.y - from.y) * tension;
    // `bows` (one ±1 per leg) picks each leg's side; by default legs alternate right, left, …
    const bow = (Array.isArray(bows) && Number.isFinite(bows[index]) ? Math.sign(bows[index]) : index % 2 === 0 ? 1 : -1) * sway;
    const c1 = `${round(from.x + bow)} ${round(from.y + reach)}`;
    const c2 = `${round(to.x + bow)} ${round(to.y - reach)}`;
    return `C ${c1} ${c2} ${round(to.x)} ${round(to.y)}`;
  });
  return [`M ${round(first.x)} ${round(first.y)}`, ...legs].join(' ');
}

/** Below this share of horizontal travel the boat keeps the way it was facing (no flicker). */
export const FACING_DEADBAND = 0.12;
export const MAX_TILT = 10;

/**
 * The boat is drawn in profile, bow to the right. On the course it faces the way it drifts sideways
 * and dips its bow as the line runs down the page.
 * @param {number} angle        heading in degrees (0 = right, 90 = down), as MotionPath reports it
 * @param {1 | -1} [previous]   facing before this frame
 * @returns {{ tilt: number, facing: 1 | -1 }} tilt in degrees (CSS rotate), facing as scaleX
 */
export function boatPose(angle, previous = 1) {
  if (!Number.isFinite(angle)) return { tilt: 0, facing: previous };
  const radians = (angle * Math.PI) / 180;
  const across = Math.cos(radians);
  const facing = Math.abs(across) < FACING_DEADBAND ? previous : across > 0 ? 1 : -1;
  const tilt = round(facing * MAX_TILT * clamp(Math.sin(radians), -1, 1));
  return { tilt, facing };
}

/**
 * Index of the last waypoint the boat has reached at `progress` (0..1) along the course, given
 * each waypoint's share of the course length; -1 before the first.
 * @param {number} progress
 * @param {number[]} shares  ascending, 0..1
 */
export function reachedIndex(progress, shares) {
  const p = Number.isFinite(progress) ? progress : 0;
  let reached = -1;
  shares.forEach((share, index) => {
    if (p >= share - 0.002) reached = index;
  });
  return reached;
}

/** The boat riding the swell: one bob-and-roll cycle per `SWELL.wavelength` px of course sailed. */
export const SWELL = Object.freeze({ wavelength: 260, bob: 6, roll: 7 });

/**
 * @param {number} distance   px sailed along the course
 * @param {number} [strength] 0 (flat calm) … 1 (full swell)
 * @returns {{ bob: number, roll: number }} bob in px (negative = up), roll in degrees
 */
export function swellRide(distance, strength = 1) {
  const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
  const phase = (2 * Math.PI * (Number.isFinite(distance) ? distance : 0)) / SWELL.wavelength;
  // The roll leads the bob by a quarter wave: the bow lifts on the way up the face of a swell.
  return { bob: round(-Math.sin(phase) * SWELL.bob * s) + 0, roll: round(-Math.cos(phase) * SWELL.roll * s) + 0 };
}

/** Wake strength (0..1) for the boat's speed in px per update; eased so it fades rather than blinks. */
export function wakeLevel(previous, speed) {
  const target = clamp((Number.isFinite(speed) ? Math.abs(speed) : 0) / 7, 0, 1);
  const prev = Number.isFinite(previous) ? previous : 0;
  return Math.round((prev * 0.7 + target * 0.3) * 1000) / 1000;
}

/** Perspective scale of the boat at depth `t` (0 = leaving the compass, 1 = in port). */
export const BOAT_SCALE = Object.freeze({ far: 0.82, near: 1.16 });

export function boatScale(t) {
  const k = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  return Math.round((BOAT_SCALE.far + (BOAT_SCALE.near - BOAT_SCALE.far) * k) * 1000) / 1000;
}

/**
 * Turns samples along the course ({ at: share of its length, y }) into a lookup from depth y to the
 * share of the course where the boat first reaches that depth (the course runs down the page, so
 * the scroll can carry the boat by depth and keep it on the reader's eye line).
 * @param {{ at: number, y: number }[]} samples  ordered by `at`
 * @returns {(y: number) => number}
 */
export function depthLookup(samples) {
  const rows = [];
  let deepest = -Infinity;
  (Array.isArray(samples) ? samples : []).forEach(({ at, y }) => {
    if (!Number.isFinite(at) || !Number.isFinite(y) || y <= deepest) return;
    deepest = y;
    rows.push([y, at]);
  });
  if (rows.length === 0) return () => 0;
  return (y) => {
    if (!Number.isFinite(y) || y <= rows[0][0]) return rows[0][1];
    const last = rows[rows.length - 1];
    if (y >= last[0]) return last[1];
    let lo = 0;
    let hi = rows.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (rows[mid][0] <= y) lo = mid;
      else hi = mid;
    }
    const [y0, a0] = rows[lo];
    const [y1, a1] = rows[hi];
    return a0 + ((a1 - a0) * (y - y0)) / (y1 - y0);
  };
}

/**
 * The boat's box when its hull sits on `point` (the SVG is anchored 92 % down, centred).
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
export function boatBox(point, { width, height }) {
  return { left: point.x - width / 2, right: point.x + width / 2, top: point.y - height * 0.92, bottom: point.y + height * 0.08 };
}

/** Whether two boxes overlap by more than `slack` px on both axes. */
export function overlaps(a, b, slack = 0) {
  return a.right > b.left + slack && a.left < b.right - slack && a.bottom > b.top + slack && a.top < b.bottom - slack;
}

/**
 * Number of course samples at which the boat (sized by `sizeAt(y)`) would sit under a panel.
 * @param {{ x: number, y: number }[]} points  samples along the course
 * @param {{ left: number, top: number, right: number, bottom: number }[]} panels
 * @param {(y: number) => { width: number, height: number }} sizeAt
 */
export function panelHits(points, panels, sizeAt) {
  return points.reduce((hits, point) => {
    const box = boatBox(point, sizeAt(point.y));
    return hits + (panels.some((panel) => overlaps(box, panel, 2)) ? 1 : 0);
  }, 0);
}

/**
 * Where the pen and the boat ride, in % of the viewport: at the start of the course and in port.
 * The Pusula compass inks the course's first leg on the same eye line (compass/layout.js BRIDGE),
 * so the line runs on from the compass without a seam. The boat moors low on the page (end), so the
 * moored harbour is a frame of its own before the colophon comes up (W5).
 */
export const EYE = Object.freeze({ start: 72, end: 86 });
