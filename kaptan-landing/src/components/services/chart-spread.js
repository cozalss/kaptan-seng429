// The ink on the chart spread: once the page has turned, a pen draws the course from the
// departure tick to landfall (DrawSVG), the hero's boat sails on its tip (MotionPath), and each
// waypoint is stamped as the pen reaches it. Markup: the <svg data-spread-ink> in index.html
// (chart-course.js writes it). Without motion nothing here runs and the CSS shows it all inked.

import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin);

const SAMPLES = 240;
// A stamp takes this share of the drawing; the boat fades in over the first few percent.
const STAMP_SHARE = 0.07;
const BOAT_IN_SHARE = 0.04;
const RING_SHARE = 0.14;

/** @param {SVGSVGElement} svg */
export function inkParts(svg) {
  return {
    course: svg.querySelector('[data-spread-course]'),
    marks: [...svg.querySelectorAll('[data-spread-mark]')],
    ring: svg.querySelector('[data-spread-ring]'),
    boat: svg.querySelector('[data-spread-boat]'),
    // the boat's resting place (landfall), restored by clearInk
    boatTransform: svg.querySelector('[data-spread-boat]')?.getAttribute('transform') ?? null,
  };
}

/** Centre of a mark in chart units: its first circle, or the midpoint of its tick. */
function markCentre(mark) {
  const circle = mark.querySelector('circle');
  if (circle) return [Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))];
  return null;
}

/**
 * Share of the course's length (0–1) at which the pen passes each mark: the nearest of `SAMPLES`
 * points along the drawn path. Falls back to the mark's `data-at` (straight-leg estimate) when the
 * path cannot be measured (no layout, jsdom).
 */
export function markShares(course, marks, samples = SAMPLES) {
  const fallback = (mark) => Number(mark.dataset.at) || 0;
  const total = typeof course?.getTotalLength === 'function' ? course.getTotalLength() : 0;
  if (!total) return marks.map(fallback);
  const points = Array.from({ length: samples + 1 }, (_, i) => course.getPointAtLength((total * i) / samples));
  return marks.map((mark) => {
    const centre = markCentre(mark);
    if (!centre) return fallback(mark);
    let best = 0;
    let bestDist = Infinity;
    points.forEach((pt, i) => {
      const dist = Math.hypot(pt.x - centre[0], pt.y - centre[1]);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best / samples;
  });
}

/**
 * Adds the inking to `tl` from time `at`, lasting `duration` (scrubbed or played).
 * Every tween is a fromTo, so the timeline renders the un-inked state before it and reverses cleanly.
 */
export function addInk(tl, { course, marks, ring, boat }, { at = 0, duration = 1 } = {}) {
  const shares = markShares(course, marks);
  tl.fromTo(course, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration, ease: 'none' }, at);
  tl.fromTo(boat, { autoAlpha: 0 }, { autoAlpha: 1, duration: duration * BOAT_IN_SHARE, ease: 'none' }, at);
  // the boat's hull (its local origin) rides the course's own coordinates
  tl.to(boat, { motionPath: { path: course }, duration, ease: 'none' }, at);
  marks.forEach((mark, i) => {
    const start = at + duration * Math.min(shares[i], 1 - STAMP_SHARE);
    tl.fromTo(
      mark,
      { autoAlpha: 0, scale: 0.3, svgOrigin: markOrigin(mark) },
      { autoAlpha: 1, scale: 1, svgOrigin: markOrigin(mark), duration: duration * STAMP_SHARE, ease: 'back.out(2.2)' },
      start,
    );
  });
  if (ring) {
    tl.fromTo(ring, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: duration * RING_SHARE, ease: 'none' }, at + duration);
  }
  return tl;
}

function markOrigin(mark) {
  const centre = markCentre(mark);
  if (centre) return `${centre[0]} ${centre[1]}`;
  const tick = mark.querySelector('path')?.getAttribute('d')?.match(/M(-?[\d.]+) (-?[\d.]+) H(-?[\d.]+)/);
  return tick ? `${(Number(tick[1]) + Number(tick[3])) / 2} ${tick[2]}` : '0 0';
}

/** Undo everything `addInk` set (the CSS default is the fully inked chart). */
export function clearInk({ course, marks, ring, boat, boatTransform }) {
  gsap.set([course, ring, boat, ...marks].filter(Boolean), { clearProps: 'all' });
  if (boat && boatTransform) boat.setAttribute('transform', boatTransform);
}
