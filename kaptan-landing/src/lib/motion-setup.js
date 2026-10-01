import { gsap } from 'gsap';
import { initHeroMotion } from '../components/hero/hero-motion.js';
import { initServicesMotion, initMobileServicesMotion } from '../components/services/services-motion.js';
import { initAboutMotion } from '../components/about/about-motion.js';
import { guarded } from './motion-guard.js';
import { addSignatureEffects } from './motion-effects.js';

const MOTION = '(prefers-reduced-motion: no-preference)';
const REDUCE = '(prefers-reduced-motion: reduce)';
// The pinned strip needs height as well as width: a phone held sideways (844 × 390) is wide, but its
// panels would shrink to slivers in the pin, so it gets the unpinned page (as the bench pin does).
const DESKTOP = '(min-width: 768px) and (min-height: 600px)';
const MOBILE = '(max-width: 767px)';
const SHORT = '(max-height: 599px)';
const FINE_POINTER = '(pointer: fine)';

const $ = (selector) => document.querySelector(selector);

function addHero(mm, isIntroDone, state) {
  mm.add(
    MOTION,
    guarded('hero', () => {
      const hero = initHeroMotion({ section: $('#hero'), revealed: isIntroDone() });
      state.hero = hero;
      return () => {
        state.hero = null;
        hero.destroy();
      };
    }),
  );
}

function addAbout(mm) {
  mm.add(
    MOTION,
    guarded('about', () => {
      const about = [$('#yolculuk')].map((section) => initAboutMotion({ section }));
      return () => about.forEach((part) => part.destroy());
    }),
  );
}

/** The crew strip (Bölüm 2 · Tayfa): pinned and slid sideways on desktop, then the chart spread. */
function addServices(mm, scroller) {
  mm.add(`${MOTION} and ${DESKTOP}`, guarded('services pin', () => initServicesMotion({ section: $('#ajanlar'), scroller }).destroy));
  mm.add(`${MOTION} and ${MOBILE}, ${MOTION} and ${SHORT}`, guarded('services reveal', () => initMobileServicesMotion({ section: $('#ajanlar') }).destroy));
}

/**
 * All media-dependent motion lives in one gsap.matchMedia(), so toggling reduced motion, crossing
 * the 768px breakpoint or switching pointer type tears effects down and rebuilds them live.
 * `isIntroDone` tells a rebuilt hero whether the letters should start visible.
 * `afterIntro` resolves once the page is handed over (lazy desktop effects wait for it).
 * Only the hero is built up front; `addBelowFold()` adds the rest once the page has painted.
 * `revert()` tears everything down for good (fatal boot fallback → static layout).
 */
export function initMotion({ scroller, isIntroDone, afterIntro = () => Promise.resolve() }) {
  const mm = gsap.matchMedia();
  const state = { hero: null };

  mm.add(REDUCE, () => {
    document.documentElement.classList.add('reduced-motion');
    scroller.setSmooth(false);
    return () => {
      document.documentElement.classList.remove('reduced-motion');
      scroller.setSmooth(true);
    };
  });
  addHero(mm, isIntroDone, state);
  let belowFoldAdded = false;

  return {
    /** Below-the-fold motion (about, pinned services, signature effects), once, after first paint. */
    addBelowFold() {
      if (belowFoldAdded) return;
      belowFoldAdded = true;
      addAbout(mm);
      addServices(mm, scroller);
      addSignatureEffects(mm, { afterIntro, scroller });
    },
    get hero() {
      return state.hero;
    },
    get reduced() {
      return window.matchMedia(REDUCE).matches;
    },
    revert() {
      state.hero = null;
      mm.revert();
    },
  };
}
