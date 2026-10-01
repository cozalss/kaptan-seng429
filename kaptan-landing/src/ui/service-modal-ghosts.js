// Shared-element "ghosts" for the agent card ↔ detail transition (service-modal-motion.js).
//
// A ghost is a fixed copy of one element of the detail page — the inked plate or the Bodoni
// name — laid out once at its place on the detail page ("home") and flown there from
// the card (and back) with transforms only: FLIP. Laying it out at the detail's size means the
// plate is rasterised at its largest and only ever scaled down, so it stays sharp; the 3:4 card
// frame and the 3:4 plate share one crop, so a uniform scale never re-crops the art.
//
// The ink frame (border + hard shadow) must read at the same weight whatever the scale, and the
// shadow's offset is how the book shows height: a panel lifted off the strip casts a longer hard
// shadow. So each frame the border and shadow are repainted divided by the current scale
// (paintInk) — a repaint of one small layer, never a layout of the page.

import { gsap } from 'gsap';

const GHOST_CLASS = 'service-modal-ghost';

/**
 * A (possibly rotated) element's untransformed box: its layout size around the centre of the
 * rect it paints, plus its own rotation — or null when it is empty or entirely off screen.
 */
export function layoutBox(el, win = window) {
  if (!el?.getBoundingClientRect || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) return null;
  const width = el.offsetWidth || rect.width;
  const height = el.offsetHeight || rect.height;
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width,
    height,
    rotation: rotationOf(el, win),
  };
}

/** The element's own 2D rotation in degrees (0 when it has none). */
export function rotationOf(el, win = window) {
  const transform = win.getComputedStyle(el).transform;
  const match = /^matrix\(([^,]+),\s*([^,]+)/.exec(transform ?? '');
  if (!match) return 0;
  const deg = (Math.atan2(Number(match[2]), Number(match[1])) * 180) / Math.PI;
  return Math.round(deg * 1000) / 1000;
}

/**
 * The GSAP vars that put a ghost laid out at `home` exactly over `target` (centre origin).
 * `uniform` keeps the aspect: 'width' (a plate) or 'height' (a line of type: its font size) sets
 * the one scale; false fits both sides (an empty box).
 */
export function flipVars(home, target, { uniform = false } = {}) {
  const byWidth = target.width / home.width;
  const byHeight = target.height / home.height;
  const scaleX = uniform === 'height' ? byHeight : byWidth;
  const scaleY = uniform === 'width' ? byWidth : byHeight;
  return {
    x: target.cx - home.cx,
    y: target.cy - home.cy,
    scaleX,
    scaleY,
    rotation: target.rotation ?? 0,
  };
}

/** The resting pose: the ghost exactly over its home on the detail page. */
export function homeVars(home) {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: home.rotation ?? 0 };
}

/** First px length in a computed length/shadow value ("rgb(0,0,0) 6px 6px 0px" → 6), else 0. */
export function firstPx(value) {
  const match = /(-?\d*\.?\d+)px/.exec(String(value ?? ''));
  return match ? Number(match[1]) : 0;
}

/** The element's ink: border width and hard-shadow offset, in px. */
export function inkOf(el, win = window) {
  const style = win.getComputedStyle(el);
  const shadow = style.boxShadow && style.boxShadow !== 'none' ? style.boxShadow.replace(/rgba?\([^)]*\)/g, '') : '';
  return { border: firstPx(style.borderTopWidth), shadow: firstPx(shadow) };
}

function fixedBox(el, home) {
  gsap.set(el, {
    left: home.cx - home.width / 2,
    top: home.cy - home.height / 2,
    width: home.width,
    height: home.height,
    transformOrigin: '50% 50%',
    rotation: home.rotation ?? 0,
  });
}

function inkLayer() {
  const ink = document.createElement('span');
  ink.className = `${GHOST_CLASS}__ink`;
  return ink;
}

/**
 * A ghost record: `el` (in <body>), its `home` box on the detail page, and `ink` — the border and
 * shadow in screen px, tweened by the timeline and painted by paintInk().
 */
function record(el, home, ink) {
  document.body.append(el);
  return { el, home, ink: ink ? { ...ink } : null };
}

/** The inked plate: the portrait on panel paper, an ink frame and a hard shadow. */
export function createPlateGhost({ src, objectPosition, home, ink }) {
  const el = document.createElement('div');
  el.className = `${GHOST_CLASS} ${GHOST_CLASS}--plate`;
  el.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'sync';
  img.src = src;
  if (objectPosition) img.style.objectPosition = objectPosition;
  el.append(img, inkLayer());
  fixedBox(el, home);
  return { ...record(el, home, ink), img };
}

/** The agent's name set exactly like the detail's Bodoni title, for the flight between the two. */
export function createNameGhost({ text, home, style }) {
  const el = document.createElement('span');
  el.className = `${GHOST_CLASS} ${GHOST_CLASS}--name`;
  el.setAttribute('aria-hidden', 'true');
  el.textContent = text;
  Object.assign(el.style, style);
  fixedBox(el, home);
  return record(el, home, null);
}

/** Repaints a ghost's ink frame so it reads at `ink` screen px whatever the ghost's scale. */
export function paintInk(ghost) {
  if (!ghost?.el) return;
  const sx = Math.abs(Number(gsap.getProperty(ghost.el, 'scaleX'))) || 1;
  const sy = Math.abs(Number(gsap.getProperty(ghost.el, 'scaleY'))) || 1;
  const { border, shadow } = ghost.ink;
  const inkEl = ghost.el.querySelector(`.${GHOST_CLASS}__ink`);
  if (inkEl) inkEl.style.borderWidth = `${border / sy}px ${border / sx}px`;
  ghost.el.style.boxShadow = shadow > 0.01 ? `${shadow / sx}px ${shadow / sy}px 0 var(--color-sumi)` : 'none';
}

export function removeGhost(ghost) {
  ghost?.el?.remove();
}
