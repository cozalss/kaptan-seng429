import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { splitLines } from '../../lib/split-text.js';
import { damp, easeInCubic, easeInQuart, mapRange, staggerProgress } from '../../lib/math.js';

const SMOOTHING = 8; // per second, ≈ the reference's 0.08 lerp at 60fps
const POINTER_SMOOTHING = 6;
// Tuned for a 260vh track (160vh of scroll): the push-in spans the whole track, the letters
// dissolve in its middle and are gone before the ink starts drying (sea-swell.js exitAt).
const PUSH_IN = 0.06; // feed scale gained over the whole track (small: the lens growth carries the move)
const PARALLAX_PX = 6;
const DISSOLVE = [0.46, 0.66]; // after the second caption, as the storm blows out and the boat sails to centre
const STAGGER_SPREAD = 0.55;
const MAX_BLUR_PX = 10;
const MAX_LIFT_PX = 40;
const CTA_FADE = [0.06, 0.24]; // the rail and running head leave first; the captions tell the rest
const CTA_DISABLE_AT = 0.18;
const EPSILON = 1e-4;
const INTRO = { duration: 1.2, stagger: 0.02 };
const INTRO_FAST = { duration: 0.55, stagger: 0.008 }; // inside the ring aperture (≈0.85 s total)
// Blur is a full-line filter (one paint per line, not per glyph) and only on wide screens.
const BLUR_QUERY = '(min-width: 1024px)';

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Blur of a whole line: its glyphs' mean dissolve progress, scaled to `maxPx`. */
export function lineBlurPx(progresses, maxPx = MAX_BLUR_PX) {
  if (!progresses.length) return 0;
  const mean = progresses.reduce((sum, t) => sum + t, 0) / progresses.length;
  return mean * maxPx;
}

/** Glyph index ranges per line, so the dissolve can blur lines instead of glyphs. */
function groupByLine(lines) {
  let start = 0;
  return lines.map((line) => {
    const count = line.querySelectorAll('.split-char').length;
    const group = { line, start, end: start + count };
    start += count;
    return group;
  });
}

/** Writes the letter dissolve; skipped while its local progress has not changed. */
function applyDissolve({ chars, lineGroups, blurs }, progress, cache) {
  const local = mapRange(progress, DISSOLVE[0], DISSOLVE[1]);
  if (local === cache.dissolve) return;
  cache.dissolve = local;
  const ts = chars.map((char, index) => {
    const t = easeInCubic(staggerProgress(local, index, chars.length, STAGGER_SPREAD));
    char.style.opacity = t > 0 ? String(1 - t) : '';
    char.style.translate = t > 0 ? `0 ${(-t * MAX_LIFT_PX).toFixed(2)}px` : '';
    return t;
  });
  const canBlur = blurs();
  lineGroups.forEach(({ line, start, end }) => {
    const px = canBlur ? lineBlurPx(ts.slice(start, end)) : 0;
    line.style.filter = px > 0.01 ? `blur(${px.toFixed(2)}px)` : '';
  });
}

function applyCta(cta, progress) {
  const fade = easeInQuart(mapRange(progress, CTA_FADE[0], CTA_FADE[1]));
  cta.style.setProperty('--cta-scroll', String(1 - fade));
  cta.dataset.hidden = String(progress > CTA_DISABLE_AT);
  // The top line and the rail ([data-hero-fade]) read this from the stage and fade with the CTA.
  cta.parentElement?.parentElement?.style.setProperty('--hero-cta-scroll', String(1 - fade));
}

function applyMedia(zoom, progress, pointer) {
  const scale = 1 + PUSH_IN * easeInOutSine(progress);
  zoom.style.transform = `translate3d(${pointer.x.toFixed(2)}px, ${pointer.y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
}

function playIntro({ chars, cta, title }, { fast = false } = {}) {
  const timing = fast ? INTRO_FAST : INTRO;
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.to(chars, {
    yPercent: 0,
    ...timing,
    onComplete: () => title.classList.add('is-split-revealed'),
  });
  tl.to(cta, { '--cta-intro': 1, y: 0, duration: 0.6, ease: 'expo.out', clearProps: 'transform' }, fast ? '-=0.45' : '-=0.7');
  return tl;
}

/** Damps the pointer toward its target; returns true when it moved this frame. */
function stepPointer(pointer, dt) {
  const { x, y } = pointer;
  pointer.x = damp(x, pointer.targetX, POINTER_SMOOTHING, dt);
  pointer.y = damp(y, pointer.targetY, POINTER_SMOOTHING, dt);
  return Math.abs(x - pointer.x) > EPSILON || Math.abs(y - pointer.y) > EPSILON;
}

/**
 * Per-frame damped render of scroll progress + pointer parallax. Does no work while the hero is
 * off screen and settled, and only touches the letters when scroll progress changed.
 */
function createRenderLoop({ zoom, text, cta, state, pointer, isVisible }) {
  const cache = { dissolve: -1 };
  return (_time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const previous = state.current;
    state.current = damp(previous < 0 ? state.target : previous, state.target, SMOOTHING, dt);
    const scrolled = Math.abs(previous - state.current) > EPSILON;
    if (!scrolled && !isVisible()) return;
    const panned = stepPointer(pointer, dt);
    if (!scrolled && !panned) return;

    if (zoom) applyMedia(zoom, state.current, pointer);
    if (!scrolled) return;
    applyDissolve(text, state.current, cache);
    applyCta(cta, state.current);
  };
}

function resetStyles({ title, cta, zoom, media }) {
  title.classList.remove('is-split-revealed');
  cta.style.removeProperty('--cta-scroll');
  cta.parentElement?.parentElement?.style.removeProperty('--hero-cta-scroll');
  cta.style.removeProperty('--cta-intro');
  delete cta.dataset.hidden;
  zoom?.style.removeProperty('transform');
  zoom?.style.removeProperty('will-change');
  gsap.set(media, { clearProps: 'transform' });
}

function createTriggers({ section, zoom, state }) {
  const progress = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      state.target = self.progress;
    },
  });
  // Visible range: promotes the photo to its own layer only while it can be seen.
  const visible = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => zoom?.style.setProperty('will-change', self.isActive ? 'transform' : 'auto'),
  });
  // No parallax exit: the sea leaves by drying into the paper (sea-stage.js), and the boat must
  // stay on its water while the stage scrolls away.
  return {
    isVisible: () => visible.isActive,
    kill() {
      progress.kill();
      visible.kill();
    },
  };
}

/**
 * Scroll-scrubbed hero: push-in, letter dissolve and CTA fade.
 * `revealed` skips the hidden start state (used when motion is re-enabled after the intro ran).
 */
export function initHeroMotion({ section, revealed = false }) {
  const title = section.querySelector('[data-hero-title]');
  const cta = section.querySelector('[data-hero-cta]');
  const media = section.querySelector('[data-hero-media]');
  // The push-in scales the wrapper (photo + lens + flow layers), or the photo in older markup.
  const zoom = media.querySelector('[data-hero-zoom]') ?? media.querySelector('img');
  const { lines, chars, revert } = splitLines(title);
  const wide = window.matchMedia(BLUR_QUERY);
  const text = { chars, lineGroups: groupByLine(lines), blurs: () => wide.matches };
  const state = { target: 0, current: -1 };
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const triggers = createTriggers({ section, zoom, state });

  const onPointerMove = (event) => {
    if (!triggers.isVisible()) return;
    pointer.targetX = (event.clientX / window.innerWidth - 0.5) * -PARALLAX_PX;
    pointer.targetY = (event.clientY / window.innerHeight - 0.5) * -PARALLAX_PX;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  const render = createRenderLoop({ zoom, text, cta, state, pointer, isVisible: triggers.isVisible });
  gsap.ticker.add(render);

  // Hidden until the loader hands over.
  if (revealed) title.classList.add('is-split-revealed');
  else {
    gsap.set(chars, { yPercent: 110 });
    gsap.set(cta, { '--cta-intro': 0, y: 16 });
  }

  return {
    intro: (options) => playIntro({ chars, cta, title }, options),
    destroy() {
      gsap.ticker.remove(render);
      window.removeEventListener('pointermove', onPointerMove);
      triggers.kill();
      gsap.killTweensOf([...chars, cta]);
      revert();
      resetStyles({ title, cta, zoom, media });
    },
  };
}
