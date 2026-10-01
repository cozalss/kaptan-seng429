// "Fırtınada kanıt" — the hero stage. Drives the ink sea (WebGL, one page-wide slot), the inked
// boat riding it, the headline and caption panels swaying with the swell (SBS "The Boat"), the
// compass needle on a damped spring, and the scroll story: black storm → pale calm, camera moving
// in, three captions, the boat sailing to centre stage, needle locking north; then the exit, where
// the ink dries back into the paper from the bottom while the boat sails out. Paused off screen;
// one still frame under reduced motion; a printed paper fallback when WebGL is missing, fails, is
// still compiling or is lent to another scene.
// Browser-only glue (the maths lives in sea-swell.js / sea-spring.js and is unit-tested).

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { claimGLSlot } from '../../../lib/gl-slot.js';
import { damp } from '../../../lib/math.js';
import { createNeedleSpring, bearing } from './sea-spring.js';
import { EXIT, boatPose, exitAt, frontAt, fullyDryBelow, storyAt } from './sea-swell.js';
import { createSeaRenderer } from './sea-renderer.js';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

const REDUCE = '(prefers-reduced-motion: reduce)';
const FINE = '(pointer: fine)';
const NARROW = '(max-width: 767px)';
// Canvas resolution: real DPR up to a cap, within a pixel budget per frame (sea-renderer.js).
const QUALITY = {
  wide: { maxDpr: 1.5, budget: 3.4e6, minDpr: 0.75, octaves: 4 },
  narrow: { maxDpr: 1.5, budget: 0.75e6, minDpr: 0.75, octaves: 3 },
};
const STILL = { time: 7.4, progress: 0.12 };
const REVEAL_S = 2.2;
const REVEAL_FALLBACK_MS = 4000; // the loader normally opens the stage well before this
const BOAT_X = { wide: 0.74, narrow: 0.64, outro: 0.5, drift: 0.62 }; // right of the headline, centre stage, drifting on
const SWAY = { title: 0.12, caption: 0.3 }; // share of the boat's tilt each layer of text takes (a storm rolls the boat ±12°)
const NORTH_LOCK = 0.58; // story progress from which the needle holds north (before the compass bows out)
const POINTER_SMOOTHING = 4;
const STORY_SMOOTHING = 5;
// The scroll gutter shows the page background: while the sea fills the stage it is washed to match
// (hero.css, a storm and a calm variant), so the sea reads edge to edge. Off once the ink dries.
const GUTTER_ATTR = 'data-hero-sea';
// W1 hand-off: the next chapter is pulled up under the stage's exit (hero.css, --hero-overlap) and
// shown only where the ink has fully dried, so its opener inks in as the water dries (no blank page).
const EXIT_ATTR = 'data-sea-exit';
const DRYING_ATTR = 'data-hero-drying';
const DRY_EDGE = '--hero-dry-edge';
const REVEAL_FEATHER = 48; // px: the soft edge of the reveal, trailing the ragged front

function query(section) {
  return {
    section,
    host: section.querySelector('[data-sea]'),
    boat: section.querySelector('[data-sea-boat]'),
    sway: section.querySelector('[data-sea-sway]'),
    captions: [...section.querySelectorAll('[data-sea-caption]')],
    compass: section.querySelector('[data-sea-compass]'),
    needle: section.querySelector('[data-sea-needle]'),
    ink: [...section.querySelectorAll('[data-sea-ink]')],
    next: section.nextElementSibling,
  };
}

function createState() {
  return {
    time: STILL.time,
    progress: 0,
    exit: -Infinity, // viewports past the stage's release (negative while held)
    story: storyAt(0),
    reveal: 0,
    revealStart: null,
    pointer: { x: 0, y: 0, targetX: 0, targetY: 0 },
    cursor: null,
    visible: true,
    caption: -1,
    heroBottom: Infinity, // the hero's bottom edge in viewport px
    overlap: 0, // how far the next chapter is pulled up under the stage (px)
  };
}

/** Eases the told story toward the scroll position, so fast flicks still read as weather. */
function stepStory(state, dt) {
  const target = storyAt(state.progress);
  state.story = {
    storm: damp(state.story.storm, target.storm, STORY_SMOOTHING, dt),
    travel: damp(state.story.travel, target.travel, STORY_SMOOTHING, dt),
    caption: target.caption,
    outro: damp(state.story.outro, target.outro, STORY_SMOOTHING, dt),
  };
}

function setCaption(state, captions, index) {
  if (state.caption === index) return;
  state.caption = index;
  captions.forEach((caption, i) => caption.toggleAttribute('data-active', i === index));
}

const KEEL = 0.9; // the keel's share of the boat drawing's height (y 108 of 120)
const boatHeights = new WeakMap();

/** The boat's drawn height in px, measured once per viewport width (its size is a CSS clamp). */
function boatHeight(boat, width) {
  const cached = boatHeights.get(boat);
  if (cached?.width === width) return cached.height;
  const height = parseFloat(boat.ownerDocument.defaultView.getComputedStyle(boat).height) || 0;
  boatHeights.set(boat, { width, height });
  return height;
}

/**
 * The boat dries with its water: a mask whose edge is the drying front at the boat's x (the same
 * silhouette the shader draws), feathered like the ink, so the hull goes first and the mast last.
 */
function dryBoat(boat, { dry, xShare, pose, width, height }) {
  if (dry <= 0) {
    boat.style.removeProperty('mask-image');
    boat.style.removeProperty('-webkit-mask-image');
    boat.style.removeProperty('opacity');
    return;
  }
  const front = frontAt((xShare * width) / height, dry) - EXIT.feather;
  const keel = 1 - pose.top / height;
  // The whole drawing is gone by the time the front passes the keel: no mast left floating on paper.
  const gone = Math.min(1, Math.max(0, (front - keel + 0.06) / 0.08));
  boat.style.opacity = (1 - gone * gone * (3 - 2 * gone)).toFixed(3);
  const edge = KEEL * boatHeight(boat, width) - (front - keel) * height;
  const feather = EXIT.feather * height * 0.5;
  const mask = `linear-gradient(to bottom, #000 ${(edge - feather).toFixed(1)}px, transparent ${(edge + feather).toFixed(1)}px)`;
  boat.style.setProperty('mask-image', mask);
  boat.style.setProperty('-webkit-mask-image', mask);
}

/** Sets the gutter wash ('storm' | 'calm' | null), touching the root only when it changes. */
function washGutter(root, mode) {
  if ((root.getAttribute(GUTTER_ATTR) ?? null) === mode) return;
  if (mode) root.setAttribute(GUTTER_ATTR, mode);
  else root.removeAttribute(GUTTER_ATTR);
}

/**
 * The next chapter under the stage's exit: masked to the part of the stage where the ink has fully
 * dried (the shader's fullyDryBelow line, which trails the ragged front), so it is only ever seen
 * on bare paper. Cleared once the front has passed its top, or when there is no overlap.
 */
function revealNext(next, { dry, heroBottom, overlap }, height) {
  if (!next) return;
  const clear = () => {
    if (!next.hasAttribute(DRYING_ATTR)) return;
    next.removeAttribute(DRYING_ATTR);
    next.style.removeProperty(DRY_EDGE);
  };
  if (!(overlap > 0) || !Number.isFinite(heroBottom)) return clear();
  const stageTop = Math.min(0, heroBottom - height);
  const nextTop = heroBottom - overlap;
  const edge = dry > 0 ? stageTop + (1 - fullyDryBelow(dry)) * height : nextTop + height * 4;
  const rel = edge - nextTop;
  if (rel < -REVEAL_FEATHER) return clear();
  next.setAttribute(DRYING_ATTR, '');
  next.style.setProperty(DRY_EDGE, `${Math.round(Math.min(rel, height * 4))}px`);
}

/** Everything in the DOM that rides the water: boat, headline, captions, needle. */
function writeDom(state, parts, spring, win) {
  const width = win.innerWidth;
  const height = win.innerHeight;
  const narrow = win.matchMedia(NARROW).matches;
  const start = narrow ? BOAT_X.narrow : BOAT_X.wide;
  const { dry, leave } = exitAt(state.exit);
  // The outro sails the boat to centre stage on a calm sea; on the exit it drifts on and dries with the ink.
  const xShare = start + (BOAT_X.outro - start) * state.story.outro + (BOAT_X.drift - BOAT_X.outro) * leave;
  const pose = boatPose({ xShare, t: state.time, width, height, storm: state.story.storm, travel: state.story.travel, pointerX: state.pointer.x });
  if (parts.boat) {
    parts.boat.style.transform = `translate3d(${pose.left.toFixed(1)}px, ${pose.top.toFixed(1)}px, 0) rotate(${pose.angle.toFixed(2)}deg)`;
    dryBoat(parts.boat, { dry, xShare, pose, width, height });
  }
  if (parts.sway) parts.sway.style.transform = `rotate(${(pose.angle * SWAY.title).toFixed(3)}deg)`;
  parts.captions.forEach((caption, i) => {
    caption.style.setProperty('--sway', `${(pose.angle * SWAY.caption * (i % 2 ? -1 : 1)).toFixed(3)}deg`);
  });
  setCaption(state, parts.captions, state.story.caption);
  parts.section.style.setProperty('--outro', state.story.outro.toFixed(3));
  // The grain flattens out as the drying starts, like the shader's paper, so the stage leaves as bare page paper.
  parts.section.style.setProperty('--hero-dry', Math.min(1, dry * 5).toFixed(3));
  washGutter(parts.section.ownerDocument.documentElement, state.visible && dry <= 0 ? (state.story.storm > 0.45 ? 'storm' : 'calm') : null);
  revealNext(parts.next, { dry, heroBottom: state.heroBottom, overlap: state.overlap }, height);
  if (parts.needle) parts.needle.style.transform = `rotate(${spring.angle.toFixed(2)}deg)`;
}

/** Where the needle wants to point: the cursor, else a nervous wander; north once the story ends. */
function aimNeedle(state, spring, compass) {
  if (state.progress >= NORTH_LOCK || !compass) {
    spring.aim(0);
    return;
  }
  if (state.cursor) {
    const rect = compass.getBoundingClientRect();
    spring.aim(bearing({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, state.cursor));
    return;
  }
  spring.aim(Math.sin(state.time * 0.7) * 38 * state.story.storm + Math.sin(state.time * 1.9) * 9 * state.story.storm);
}

function drawIn(ink) {
  if (!ink.length) return;
  gsap.fromTo(ink, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.6, ease: 'power2.inOut', stagger: 0.12, delay: 0.5 });
}

function watch(section, state, win, onVisible) {
  // One trigger from the pin's start until the stage has scrolled away: the held part is the story
  // (progress 0 → 1), the rest is the exit (in viewports, 0 → 1).
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom top',
    onUpdate: (self) => {
      const span = self.end - self.start;
      const viewport = win.innerHeight;
      const held = Math.max(1, span - viewport);
      const scrolled = self.progress * span;
      state.progress = Math.min(1, scrolled / held);
      state.exit = (scrolled - held) / viewport;
      state.heroBottom = span - scrolled;
    },
    onRefresh: () => {
      const next = section.nextElementSibling;
      state.overlap = next && section.hasAttribute(EXIT_ATTR) ? Math.max(0, section.getBoundingClientRect().bottom - next.getBoundingClientRect().top) : 0;
    },
  });
  const observer = new win.IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    onVisible(state.visible);
  });
  observer.observe(section.querySelector('.hero__stage') ?? section);
  const fine = win.matchMedia(FINE);
  const onMove = (event) => {
    state.pointer.targetX = (event.clientX / win.innerWidth) * 2 - 1;
    state.pointer.targetY = (event.clientY / win.innerHeight) * 2 - 1;
    state.cursor = fine.matches && event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
  };
  const onLeave = () => {
    state.cursor = null;
    state.pointer.targetX = 0;
    state.pointer.targetY = 0;
  };
  section.addEventListener('pointermove', onMove, { passive: true });
  section.addEventListener('pointerleave', onLeave);
  return () => {
    trigger.kill();
    observer.disconnect();
    section.removeEventListener('pointermove', onMove);
    section.removeEventListener('pointerleave', onLeave);
  };
}

/** The WebGL layer: claimed while the hero is on screen, thrown away when another scene takes the slot. */
function createGL(host, win) {
  const gl = { renderer: null, pending: null, release: null, failed: false, attempt: null };
  const drop = () => {
    if (gl.attempt) gl.attempt.cancelled = true;
    gl.release?.();
    gl.release = null;
    gl.renderer?.destroy();
    gl.renderer = null;
    host.classList.remove('is-live');
  };
  gl.ensure = () => {
    if (gl.renderer || gl.pending || gl.failed || !host) return;
    const narrow = win.matchMedia(NARROW).matches;
    // Claim before creating, so the page never holds two live contexts; a claim that is revoked
    // while the renderer is still being built is honoured as soon as it arrives.
    const attempt = { cancelled: false };
    gl.attempt = attempt;
    gl.release = claimGLSlot(() => {
      gl.release = null;
      drop();
    });
    gl.pending = createSeaRenderer(host, narrow ? QUALITY.narrow : QUALITY.wide)
      .then((renderer) => {
        if (attempt.cancelled) renderer.destroy();
        else gl.renderer = renderer;
      })
      .catch((error) => {
        gl.failed = true;
        gl.release?.();
        gl.release = null;
        console.warn('[kaptan] ink sea unavailable, paper fallback kept', error);
      })
      .finally(() => {
        gl.pending = null;
      });
  };
  gl.draw = (frame) => {
    if (!gl.renderer) return;
    gl.renderer.render(frame);
    host.classList.add('is-live');
  };
  gl.drop = drop;
  return gl;
}

/**
 * Starts the hero stage. `open()` starts the intro (ink bleeding in, boat and rose inking
 * themselves); call it when the loader hands over.
 * @param {{ section: HTMLElement | null, win?: Window }} options
 * @returns {{ open: () => void, destroy: () => void }}
 */
export function initSeaStage({ section, win = window }) {
  const parts = section ? query(section) : null;
  if (!parts?.host) return { open() {}, destroy() {} };
  const reduce = win.matchMedia(REDUCE);
  const state = createState();
  const spring = createNeedleSpring();
  const gl = createGL(parts.host, win);
  let ticking = false;
  // Boat and rose ink themselves on open(); until then their strokes are undrawn.
  if (!reduce.matches) gsap.set(parts.ink, { drawSVG: '0%' });

  const frame = () => ({
    time: state.time,
    storm: state.story.storm,
    travel: state.story.travel,
    reveal: state.reveal,
    dry: Math.max(0, exitAt(state.exit).dry),
    pointer: state.pointer,
  });

  const still = () => {
    state.time = STILL.time;
    state.progress = STILL.progress;
    state.story = storyAt(STILL.progress);
    state.reveal = 1;
    state.exit = -Infinity;
    writeDom(state, parts, spring, win);
    gl.draw(frame());
  };

  const tick = (_time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    state.time += dt;
    // The ink only starts bleeding in once the sea can actually be drawn (the shader may still be compiling).
    if (state.revealStart !== null && gl.pending) state.revealStart = state.time;
    if (state.revealStart !== null) state.reveal = Math.min(1, (state.time - state.revealStart) / REVEAL_S);
    state.pointer.x = damp(state.pointer.x, state.pointer.targetX, POINTER_SMOOTHING, dt);
    state.pointer.y = damp(state.pointer.y, state.pointer.targetY, POINTER_SMOOTHING, dt);
    stepStory(state, dt);
    aimNeedle(state, spring, parts.compass);
    spring.step(dt);
    writeDom(state, parts, spring, win);
    gl.draw(frame());
  };

  let booted = false;
  const sync = () => {
    const run = state.visible && !reduce.matches;
    // The exit (drying ink + the next chapter pulled up under it) exists only while the sea moves.
    if (section.hasAttribute(EXIT_ATTR) === reduce.matches) {
      section.toggleAttribute(EXIT_ATTR, !reduce.matches);
      if (booted) ScrollTrigger.refresh();
    }
    if (!state.visible || reduce.matches) revealNext(parts.next, { overlap: 0 }, win.innerHeight);
    // One heavy WebGL moment per screen: the sea gives the slot back once it is scrolled away.
    if (state.visible) gl.ensure();
    else gl.drop();
    if (run && !ticking) gsap.ticker.add(tick);
    if (!run && ticking) gsap.ticker.remove(tick);
    ticking = run;
    if (reduce.matches && state.visible) (gl.pending ?? Promise.resolve()).then(still);
  };

  const open = () => {
    if (state.revealStart !== null) return;
    state.revealStart = state.time;
    if (reduce.matches) {
      still();
      return;
    }
    drawIn(parts.ink);
  };

  const stopWatching = watch(section, state, win, sync);
  const onResize = () => {
    gl.renderer?.resize();
    if (reduce.matches) still();
  };
  win.addEventListener('resize', onResize);
  reduce.addEventListener?.('change', sync);
  const fallbackTimer = win.setTimeout(open, REVEAL_FALLBACK_MS);
  sync();
  booted = true;

  return {
    open,
    destroy() {
      win.clearTimeout(fallbackTimer);
      if (ticking) gsap.ticker.remove(tick);
      ticking = false;
      stopWatching();
      win.removeEventListener('resize', onResize);
      reduce.removeEventListener?.('change', sync);
      gsap.killTweensOf(parts.ink);
      gl.drop();
      washGutter(section.ownerDocument.documentElement, null);
      revealNext(parts.next, { overlap: 0 }, win.innerHeight);
      section.removeAttribute(EXIT_ATTR);
    },
  };
}
