import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createScrollLock } from './scroll-lock.js';

const LENIS_OPTIONS = {
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
  smoothWheel: true,
  wheelMultiplier: 0.9,
  touchMultiplier: 1.6,
};
const SCROLL_TO_DURATION = 1.6;
// A jump whose target moved while it flew (a lazy pin grew the page) is finished with this short leg.
const REAIM_DURATION = 0.6;
// GSAP's own defaults, restored when Lenis is torn down (Lenis needs lag smoothing off).
const GSAP_LAG_SMOOTHING = { threshold: 500, adjustedLag: 33 };

function resolveTarget(target) {
  if (typeof target !== 'string') return target;
  return document.querySelector(target);
}

function createNativeScroller() {
  const root = document.documentElement;
  return {
    stop: () => root.style.setProperty('overflow', 'hidden'),
    start: () => root.style.removeProperty('overflow'),
    scrollTo: (target, { immediate = false } = {}) =>
      resolveTarget(target)?.scrollIntoView({ block: 'start', ...(immediate ? { behavior: 'instant' } : {}) }),
    scrollToY: (y) => window.scrollTo({ top: y, behavior: 'instant' }),
    shift: (dy) => window.scrollBy({ top: dy, behavior: 'instant' }),
    destroy: () => root.style.removeProperty('overflow'),
  };
}

/** Lenis driven by the GSAP ticker so ScrollTrigger and smooth scroll share one clock. */
function createLenisScroller() {
  const lenis = new Lenis(LENIS_OPTIONS);
  const tick = (time) => lenis.raf(time * 1000);
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  // The element a chapter jump is flying to (null once it lands or the reader takes over). Lenis
  // fixes a jump's target in px when it starts; a lazy pin (Sancak Tezgâhı) may grow the page under
  // it, so a jump re-aims when it lands and survives shift().
  let flight = null;
  lenis.on('virtual-scroll', () => {
    flight = null;
  });

  function fly(element, duration) {
    flight = element;
    lenis.scrollTo(element, {
      duration,
      onComplete: () => {
        if (flight !== element) return;
        flight = null;
        lenis.scrollTo(element, { duration: REAIM_DURATION });
      },
    });
  }

  return {
    stop: () => lenis.stop(),
    start: () => lenis.start(),
    scrollTo: (target, { immediate = false } = {}) => {
      const element = resolveTarget(target);
      if (!element) return;
      if (immediate) {
        flight = null;
        // Lenis measures from its own scroll and limit, which a refresh in this same frame (pins
        // re-measured, page grown) may have left stale.
        lenis.resize();
        lenis.scrollTo(element, { immediate: true, force: true });
      } else fly(element, SCROLL_TO_DURATION);
    },
    scrollToY: (y, { immediate = false } = {}) => {
      flight = null;
      lenis.scrollTo(y, { immediate, force: true, duration: SCROLL_TO_DURATION });
    },
    /** Content grew by `dy` above the viewport: move the scroll with it (a jump under way flies on). */
    shift: (dy) => {
      const aim = flight;
      lenis.resize(); // the page has just grown: Lenis' limit would clamp the move
      lenis.scrollTo(window.scrollY + dy, { immediate: true, force: true });
      if (aim) fly(aim, SCROLL_TO_DURATION);
    },
    destroy: () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(GSAP_LAG_SMOOTHING.threshold, GSAP_LAG_SMOOTHING.adjustedLag);
      lenis.destroy();
    },
  };
}

/**
 * One stable scroller API whose engine can be swapped between Lenis and native scrolling at
 * runtime (e.g. when prefers-reduced-motion changes). Scroll locking is reason-counted:
 * `lock('intro')` + `lock('overlay')` keeps the page still until both are unlocked.
 */
export function createSmoothScroll({ enabled }) {
  let smooth = enabled;
  let engine = smooth ? createLenisScroller() : createNativeScroller();
  const locks = createScrollLock({ onLock: () => engine.stop(), onUnlock: () => engine.start() });

  return {
    lock: (reason) => locks.lock(reason),
    unlock: (reason) => locks.unlock(reason),
    /** Fatal fallback: drop every lock reason so the page can always scroll. */
    releaseAll: () => locks.release(),
    isLocked: () => locks.isLocked(),
    /** Scrolls to an element (or selector); `immediate` jumps without easing (deep links). */
    scrollTo: (target, options) => engine.scrollTo(target, options),
    /** Scrolls to an absolute page offset; `immediate` jumps without easing (keyboard focus). */
    scrollToY: (y, options) => engine.scrollToY(y, options),
    /** Keeps what is on screen still when content of `dy` px appears above the viewport. */
    shift: (dy) => engine.shift(dy),
    isSmooth: () => smooth,
    setSmooth: (next) => {
      if (next === smooth) return;
      const y = window.scrollY;
      engine.destroy();
      smooth = next;
      engine = smooth ? createLenisScroller() : createNativeScroller();
      if (locks.isLocked()) engine.stop();
      engine.scrollToY(y, { immediate: true });
    },
    destroy: () => engine.destroy(),
  };
}
