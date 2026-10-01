// "Bölüm 4 · Rota": a dashed course is inked from the top of the chapter (where the Pusula
// compass hands it over: [data-rota-start]) across the horizon and down through the waypoints
// (I–IV) to the harbour, and the hero's boat sails it. The course is built from the marks the CSS
// has laid out, so it always passes through them at any width.
//   animate: true  → the scroll carries the boat by depth, so it rides the reader's eye line while
//                    DrawSVG inks the course behind it; at each mark the leg is marked reached (CSS
//                    sets the panel down, brings the plate forward, inks the signature at IV); the
//                    harbour ring inks closed and the boat moors.
//   animate: false → reduced motion / narrow screens: the whole course drawn, every leg reached,
//                    the ring closed and the boat moored in port.
// The course crosses an inked sea with a landmark per waypoint (rota-sea-render.js). The boat
// grows as it comes toward the reader, pitches on the swell, keeps out of the panels (the bow of
// each leg shrinks until it clears them) and leaves a wake while it moves.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { clamp, mapRange } from '../../lib/math.js';
import { EYE, boatPose, boatScale, coursePath, depthLookup, panelHits, reachedIndex, swellRide, wakeLevel } from './rota-geometry.js';
import { landmarkSlot } from './rota-landmarks.js';
import { swellAt } from './rota-sea.js';
import { renderSea } from './rota-sea-render.js';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin, MotionPathPlugin);

const SVG_NS = 'http://www.w3.org/2000/svg';
const SCRUB = 0.8;
const RESIZE_DEBOUNCE_MS = 160;
const SAMPLES = 240;
// EYE (rota-geometry.js): % of the viewport where the boat rides at the start / in port
const REACHED = 'is-reached';
const READY = 'has-course';
const MOORED = 'is-moored';
const LIVE = 'is-live';
const LAUNCHED = 'is-launched'; // the pen has reached the boat: it is on the water and sails

const relBox = (el, origin) => {
  const r = el.getBoundingClientRect();
  return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top };
};
const centreOf = (box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

/**
 * Where the course begins, in the chart's space. On wide layouts: the top of the chapter, in the
 * channel between the title's first line and the lead (published as --rota-start-x for the Pusula
 * hand-off); on stacked layouts: the horizon above waypoint I.
 */
function startPoint(section, chart, box, marks) {
  const anchor = section.querySelector('[data-rota-start]');
  const title = section.querySelector('.rota__title');
  const lead = section.querySelector('.rota__lead');
  if (anchor && title && lead) {
    const range = document.createRange();
    range.selectNodeContents(title);
    const titleRight = range.getBoundingClientRect().right;
    const leadBox = lead.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    if (leadBox.left > titleRight + 24 && leadBox.top < titleBox.bottom) {
      const sectionLeft = section.getBoundingClientRect().left;
      const x = (titleRight + leadBox.left) / 2;
      section.style.setProperty('--rota-start-x', `${Math.round(x - sectionLeft)}px`);
      const top = anchor.getBoundingClientRect().top;
      return { x: x - box.left, y: top - box.top };
    }
  }
  section.style.removeProperty('--rota-start-x');
  return { x: marks[0].x, y: 18 };
}

/** Marks, panels, harbour and the course's first point, in the chart's own pixel space. */
function measure(section, chart) {
  const box = chart.getBoundingClientRect();
  const marks = [...chart.querySelectorAll('[data-rota-mark]')].map((el) => centreOf(relBox(el, box)));
  const panels = [...chart.querySelectorAll('.rota-leg__panel')].map((el) => relBox(el, box));
  const port = chart.querySelector('[data-rota-port]');
  const sides = [...chart.querySelectorAll('[data-rota-leg]')].map((leg) => (leg.classList.contains('rota-leg--left') ? 1 : -1));
  if (marks.length === 0) return null;
  return {
    box,
    width: box.width,
    height: box.height,
    marks,
    panels,
    sides, // +1: open water to the right of the mark (its panel is on the left)
    port: port ? centreOf(relBox(port, box)) : { x: marks[marks.length - 1].x, y: box.height - 60 },
    start: startPoint(section, chart, box, marks),
  };
}

function swayFor(width) {
  return width >= 900 ? Math.min(90, width * 0.06) : 0;
}

/** Samples along `d` as { at, x, y } (at = share of the length), measured on a hidden probe path. */
function sampleCourse(probe, d) {
  probe.setAttribute('d', d);
  const total = probe.getTotalLength() || 1;
  return Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const point = probe.getPointAtLength((total * i) / SAMPLES);
    return { at: i / SAMPLES, x: point.x, y: point.y };
  });
}

/**
 * The course through `points` whose legs bow out as far as they can without the boat ever sitting
 * under a panel (the first leg, down from the compass, runs straight).
 */
function fitCourse(layout, points, probe, boatSize) {
  const bows = points.slice(1).map((_, index) => (index === 0 ? 0 : index % 2 === 0 ? -1 : 1));
  const full = swayFor(layout.width);
  let best = null;
  for (const sway of [full, full * 0.66, full * 0.33, 0]) {
    const d = coursePath(points, { sway, bows });
    const samples = sampleCourse(probe, d);
    const hits = panelHits(samples, layout.panels, boatSize);
    if (!best || hits < best.hits) best = { d, samples, hits };
    if (hits === 0) break;
  }
  return best;
}

/** One landmark per waypoint in the open water beside it (none where there is no room). */
function placeLandmarks(layout, depthOf) {
  const { marks, panels, sides, width, port } = layout;
  const left = panels[sides.indexOf(1)];
  const right = panels[sides.indexOf(-1)];
  const lane = left && right ? Math.max(0, right.left - left.right) : 0;
  if (!(lane > 0) || width < 900) return [];
  return marks
    .map((mark, index) => {
      const side = sides[index];
      const slot = landmarkSlot({ index, mark, side, depth: depthOf(mark.y), panels, width, lane, floor: port.y - 70 });
      if (!slot) return null;
      if (index !== 3) return { index, ...slot };
      // IV · the mole runs out from the page edge toward the lane, its beacon at the harbour mouth.
      const tip = mark.x + side * (lane / 2 + 36);
      const length = Math.max(120, ((side > 0 ? width - tip : tip) - 24) * 0.7);
      return { index, x: tip, y: slot.y, s: Math.min(slot.s, 1.2), options: { length, side } };
    })
    .filter(Boolean);
}

function setPaths(svg, layout, d) {
  const { width, height, start } = layout;
  svg.setAttribute('viewBox', `0 0 ${Math.round(width)} ${Math.round(height)}`);
  svg.querySelectorAll('path[data-rota-path]').forEach((path) => path.setAttribute('d', d));
  const mask = svg.querySelector('mask');
  if (mask) {
    const top = Math.min(0, start.y) - 60;
    mask.setAttribute('x', '-60');
    mask.setAttribute('y', String(Math.round(top)));
    mask.setAttribute('width', String(Math.round(width + 120)));
    mask.setAttribute('height', String(Math.round(height - top + 60)));
  }
}

function markReached(legs, reached) {
  legs.forEach((leg, index) => leg.classList.toggle(REACHED, index <= reached));
}

/** Idle life: the boat breathes only while the chart is on screen (CSS stops it otherwise). */
function watchLive(chart) {
  if (!('IntersectionObserver' in window)) return () => {};
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => chart.classList.toggle(LIVE, entry.isIntersecting));
  });
  observer.observe(chart);
  return () => {
    observer.disconnect();
    chart.classList.remove(LIVE);
  };
}

/**
 * The point where the course begins, in page coordinates (for the Pusula hand-off), or null.
 * @param {HTMLElement | null} section  #yolculuk
 */
export function courseStart(section) {
  const anchor = section?.querySelector('[data-rota-start]');
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
}

/**
 * @param {{ section: HTMLElement | null, animate?: boolean }} options
 * @returns {{ destroy: () => void }}
 */
export function initRotaCourse({ section, animate = false }) {
  const chart = section?.querySelector('[data-rota-chart]');
  const svg = chart?.querySelector('[data-rota-svg]');
  const reveal = svg?.querySelector('[data-rota-reveal]');
  const boat = chart?.querySelector('[data-rota-boat]');
  if (!chart || !svg || !reveal || !boat) return { destroy() {} };
  const sea = chart.querySelector('[data-rota-sea]');
  const wake = boat.querySelector('[data-rota-wake]');
  const ring = chart.querySelector('[data-rota-ring]');
  const legs = [...chart.querySelectorAll('[data-rota-leg]')];
  const probe = document.createElementNS(SVG_NS, 'path');
  probe.setAttribute('fill', 'none');
  probe.style.visibility = 'hidden';
  svg.append(probe);

  let timeline = null;
  let facing = 1;
  let wakeNow = 0;
  const boatSize = () => ({ width: boat.clientWidth || 114, height: boat.clientHeight || 86 });

  /** Puts the boat on the course at share `at`, sized for its depth and riding the swell there. */
  const placeBoat = (rawPath, at, depth, { calm = false, speed = 0 } = {}) => {
    const point = MotionPathPlugin.getPositionOnPath(rawPath, at, true);
    const pose = calm ? { tilt: 0, facing } : boatPose(point.angle, facing);
    const ride = calm ? { bob: 0, roll: 0 } : swellRide(at * rawPath.totalLength, swellAt(depth));
    const scale = boatScale(depth);
    facing = pose.facing;
    gsap.set(boat, { x: point.x, y: point.y + ride.bob, rotation: pose.tilt * 0.6 + ride.roll * pose.facing, scaleX: scale * pose.facing, scaleY: scale });
    wakeNow = calm ? 0 : wakeLevel(wakeNow, speed);
    if (wake) gsap.set(wake, { opacity: wakeNow });
  };

  const build = () => {
    timeline?.scrollTrigger?.kill();
    timeline?.kill();
    timeline = null;
    const layout = measure(section, chart);
    if (!layout) return;
    const { start, port, marks } = layout;
    const points = [start, ...marks, port];
    const depthOf = (y) => clamp((y - start.y) / (port.y - start.y || 1), 0, 1);
    const base = boatSize();
    const sizeAt = (y) => {
      const k = boatScale(depthOf(y));
      return { width: base.width * k, height: base.height * k };
    };
    const course = fitCourse(layout, points, probe, sizeAt);
    setPaths(svg, layout, course.d);
    renderSea(sea, { landmarks: placeLandmarks(layout, depthOf), offsetX: layout.box.left - (sea?.getBoundingClientRect().left ?? layout.box.left) });
    chart.classList.add(READY);
    gsap.set(boat, { xPercent: -50, yPercent: -92, transformOrigin: '50% 92%' });
    const rawPath = MotionPathPlugin.cacheRawPathMeasurements(MotionPathPlugin.getRawPath(course.d));
    const shareAt = depthLookup(course.samples);
    const shares = marks.map((mark) => shareAt(mark.y));
    const ringFrom = shares[shares.length - 1] + (1 - shares[shares.length - 1]) * 0.5;

    if (!animate) {
      gsap.set(reveal, { clearProps: 'strokeDasharray,strokeDashoffset' });
      facing = -1;
      placeBoat(rawPath, 1, 1, { calm: true });
      markReached(legs, legs.length - 1);
      if (ring) gsap.set(ring, { strokeDashoffset: 0 });
      chart.classList.add(MOORED, LAUNCHED);
      return;
    }

    const state = { y: start.y, last: 0 };
    const render = () => {
      const at = shareAt(state.y);
      const speed = (at - state.last) * rawPath.totalLength;
      state.last = at;
      gsap.set(reveal, { drawSVG: `0% ${(at * 100).toFixed(3)}%` });
      placeBoat(rawPath, at, depthOf(state.y), { speed });
      markReached(legs, reachedIndex(at, shares));
      if (ring) gsap.set(ring, { strokeDashoffset: 1 - mapRange(at, ringFrom, 0.995) });
      chart.classList.toggle(MOORED, at >= 0.995);
      chart.classList.toggle(LAUNCHED, at > 0.004);
    };
    const at = (y) => `top${y < 0 ? '-=' : '+='}${Math.abs(Math.round(y))}`;
    timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: chart, start: `${at(start.y)} ${EYE.start}%`, end: `${at(port.y)} ${EYE.end}%`, scrub: SCRUB },
    });
    timeline.fromTo(state, { y: start.y }, { y: port.y, onUpdate: render, immediateRender: false }, 0);
    render();
  };

  build();
  const stopLive = watchLive(chart);
  const sizes = new Map();
  let timer = 0;
  const ro = new ResizeObserver((entries) => {
    const changed = entries.some(({ target }) => {
      const before = sizes.get(target);
      const now = [target.clientWidth, target.clientHeight];
      sizes.set(target, now);
      return !before || Math.abs(before[0] - now[0]) >= 2 || Math.abs(before[1] - now[1]) >= 2;
    });
    if (!changed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      build();
      if (animate) ScrollTrigger.refresh();
    }, RESIZE_DEBOUNCE_MS);
  });
  [chart, section].forEach((el) => {
    sizes.set(el, [el.clientWidth, el.clientHeight]);
    ro.observe(el);
  });

  return {
    destroy() {
      clearTimeout(timer);
      ro.disconnect();
      stopLive();
      timeline?.scrollTrigger?.kill();
      timeline?.kill();
      probe.remove();
      gsap.set([boat, reveal, wake, ring].filter(Boolean), { clearProps: 'all' });
      sea?.replaceChildren();
      markReached(legs, -1);
      chart.classList.remove(READY, MOORED, LAUNCHED);
      section.style.removeProperty('--rota-start-x');
    },
  };
}
