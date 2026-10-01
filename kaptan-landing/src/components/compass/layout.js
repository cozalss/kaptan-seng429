// Where the DOM parts of the ink scene sit inside it: the counter is a paper tag hanging on the
// scene (from the funnel's plumb line, then from the lifted slip, then under the compass) and the
// act caption docks beside whatever the act is about (the storm, the ring the column is passing,
// the slip). Pure: the renderer supplies the projected anchor points, the view the box sizes.

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => (hi < lo ? lo : Math.min(Math.max(x, lo), hi));
const mixPoint = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

/** Gap between the docked caption and what it docks to (CSS px). */
export const DOCK_GAP = 44;
/** Length of the tag's string (CSS px; the CSS draws it). */
export const TAG_STRING = 26;
/** Ring labels: paper kept right of the text, and how far the leader may shorten (CSS px). */
export const LABEL_FIT = Object.freeze({ edge: 8, maxPull: 16 });

/**
 * How far a ring label is pulled left so its text stays on the page. The rings scale with the
 * stage's width but the type does not, so on narrow phones "Sınıflandır" would run off the right
 * edge; the label moves left and its leader shortens by the same amount (still starting at the ring).
 * @param {number} x  the ring's right-hand edge (label origin, CSS px)
 * @param {number} width  the label's box width
 * @param {number} boxWidth  the stage width
 */
export function labelPull(x, width, boxWidth, { edge = LABEL_FIT.edge, maxPull = LABEL_FIT.maxPull } = {}) {
  if (!(width > 0) || !(boxWidth > 0) || !Number.isFinite(x)) return 0;
  return clamp(x + width - (boxWidth - edge), 0, maxPull);
}

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ foot: Point, rings: Point[], plate: { x: number, y: number, w: number, h: number },
 *   compass: { x: number, y: number, r: number } }} Anchors   screen points from the renderer
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Safe   the free stage area
 */

/** Interpolates the ring anchors at a fractional ring index. */
export function ringPoint(rings, focus) {
  if (!rings.length) return { x: 0, y: 0 };
  const k = clamp(focus, 0, rings.length - 1);
  const i = Math.min(Math.floor(k), rings.length - 2);
  if (i < 0) return { ...rings[0] };
  return mixPoint(rings[i], rings[i + 1], k - i);
}

/**
 * Hook point of the counter tag (the top of its string).
 * @param {Anchors} anchors
 * @param {{ plate: number, compass: number }} weights  0 → 1 blends (lift, move to the compass)
 */
export function tagHook(anchors, weights) {
  const { foot, plate, compass } = anchors;
  const onPlate = { x: plate.x + plate.w * 0.28, y: plate.y + plate.h / 2 }; // off its lower edge
  const underCompass = { x: compass.x, y: compass.y + compass.r + 12 };
  return mixPoint(mixPoint(foot, onPlate, weights.plate), underCompass, weights.compass);
}

/**
 * Top-left corner of the tag box hung (centred) from its hook, kept inside the safe area.
 * @param {Point} hook
 * @param {{ width: number, height: number }} tag
 * @param {Safe} safe
 */
export function tagBox(hook, tag, safe) {
  return {
    x: clamp(hook.x - tag.width / 2, safe.left, safe.right - tag.width),
    y: clamp(hook.y + TAG_STRING, safe.top, safe.bottom - tag.height),
  };
}

/**
 * Top-left corner of the docked act caption.
 * @param {Anchors} anchors
 * @param {{ focus: number, sieve: number, plate: number }} weights
 *   focus: fractional ring index; sieve: storm → rings; plate: rings → slip
 * @param {{ width: number, height: number }} panel
 * @param {Safe} safe
 * @param {{ height: number }} box
 */
export function dockBox(anchors, weights, panel, safe, box) {
  const storm = { x: safe.left + panel.width + DOCK_GAP, y: box.height * 0.62 };
  const ring = ringPoint(anchors.rings, weights.focus);
  const { plate } = anchors;
  const slip = { x: plate.x - plate.w / 2, y: plate.y + plate.h * 0.16 };
  // each anchor is the point the caption's right edge (+ gap) and vertical centre meet
  const at = mixPoint(mixPoint(storm, ring, weights.sieve), slip, weights.plate);
  return {
    x: clamp(at.x - DOCK_GAP - panel.width, safe.left, safe.right - panel.width),
    y: clamp(at.y - panel.height / 2, safe.top, safe.bottom - panel.height),
  };
}

/**
 * The course's first leg, from the compass down to Rota (W4): once the needle has locked north
 * the pen leaves the compass rim and inks a dashed line down the stage; it rides the reader's eye
 * line (`eye`, the same share of the viewport at which Rota's own course is inked, rota-course.js
 * EYE.start) and reaches the stage's foot, where Rota's course begins, just as Rota takes over.
 */
export const BRIDGE = Object.freeze({ from: 0.9, eye: 0.72, gap: 8, past: 40 });

const smoothStep = (t) => t * t * (3 - 2 * t);

/**
 * Where the pen is (stage px from the stage top). While pinned it glides from the rim to the eye
 * line over the last stretch of the pin (or on to `floor`, e.g. past the tag hanging under the
 * compass, so the stroke is seen); while the stage leaves (`exit` 0 → 1 viewport) the page scrolls
 * the line up, and the pen waits until the eye line reaches it, then keeps to the eye line until it
 * reaches the foot.
 * @param {{ progress: number, exit: number, rimY: number, height: number, floor?: number, from?: number, eye?: number }} options
 */
export function bridgeTip({ progress, exit, rimY, height, floor = 0, from = BRIDGE.from, eye = BRIDGE.eye }) {
  const target = Math.min(height, Math.max(rimY, eye * height, floor));
  if (exit > 0) return Math.min(height, Math.max(target, eye * height + exit * height));
  const t = Math.min(Math.max((progress - from) / (1 - from), 0), 1);
  return rimY + (target - rimY) * smoothStep(t);
}

/**
 * Path data of the inked part of the leg: a straight line from the rim (`start`) toward the foot
 * (`end`), cut where it reaches depth `tip`. Empty when nothing is inked yet.
 * @param {Point} start
 * @param {Point} end
 * @param {number} tip
 */
export function bridgePath(start, end, tip) {
  const span = end.y - start.y;
  if (!(span > 0) || !(tip > start.y + 0.5)) return '';
  const t = Math.min(1, (tip - start.y) / span);
  const r = (n) => Math.round(n * 10) / 10;
  return `M${r(start.x)} ${r(start.y)} L${r(start.x + (end.x - start.x) * t)} ${r(start.y + span * t)}`;
}
