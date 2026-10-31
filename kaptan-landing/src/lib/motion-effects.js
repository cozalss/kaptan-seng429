// Signature effects ("O, the lens" family). Every one registers inside the shared gsap.matchMedia,
// so reduced motion (or leaving the breakpoint) tears it down. Desktop-only and far-below-the-fold
// effects arrive as lazy chunks after the intro, so they cost nothing on first load.

import { lazyEffect } from './lazy-effect.js';
import { guarded } from './motion-guard.js';

export const MQ = Object.freeze({
  MOTION: '(prefers-reduced-motion: no-preference)',
  REDUCE: '(prefers-reduced-motion: reduce)',
  FINE_POINTER: '(pointer: fine)',
  WIDE: '(min-width: 1024px)',
});

const $ = (selector) => document.querySelector(selector);

/** Lazy effect that waits for the intro first (extras never compete with the LCP). */
function later(afterIntro, load, start, label) {
  return lazyEffect(() => afterIntro().then(load), start, label);
}

const stopAll = (stops) => () => stops.forEach((stop) => stop());

/** Every width, full motion: the one-off typographic moves further down the page. */
function addTypeEffects(mm, afterIntro) {
  mm.add(
    MQ.MOTION,
    guarded('type effects', () =>
      stopAll([
      ]),
    ),
  );
}

/**
 * "Bölüm 4 · Rota": the course and the boat. Wide + full motion scrubs them with scroll; every other
 * case (reduced motion, narrow screens) prints the whole course with the boat at rest in port.
 */
function addRota(mm) {
  mm.add(
    { sail: `${MQ.MOTION} and ${MQ.WIDE}`, always: 'all' },
    guarded('rota course', ({ conditions }) =>
      lazyEffect(
        () => import('../components/ritual/rota-course.js'),
        ({ initRotaCourse }) => initRotaCourse({ section: $('#yolculuk'), animate: conditions.sail }),
        'rota course',
      ),
    ),
  );
}

/** Resolves once `target` comes within `margin` of the viewport (at once without IntersectionObserver). */
function whenNear(target, margin) {
  if (!target || !('IntersectionObserver' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      resolve();
    }, { rootMargin: margin });
    observer.observe(target);
  });
}

// After the intro, a still moment is waited for this long before a heavy chapter is built early.
const IDLE_START_MS = 1200;
const IDLE_TIMEOUT_MS = 4000;

/** Resolves at the first idle moment a little after it is asked (a timer where idle callbacks are missing). */
function whenIdle() {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
      else resolve();
    }, IDLE_START_MS);
  });
}

/**
 * Near the viewport, or earlier while the page is idle: a chapter whose set-up re-measures every
 * pin (the Sancak Tezgâhı) is best built while the reader is still, not in the middle of a scroll,
 * where it cost a visible hitch.
 */
const whenNearOrIdle = (target, margin) => Promise.race([whenNear(target, margin), whenIdle()]);

/**
 * "Bölüm 3 · Seyir Kuralları" · Sancak Tezgâhı: hands-on instruments and the inked mast.
 * Every width and both motion preferences (the instruments are for everyone; reduced motion only
 * changes how they move), rebuilt when the preference flips. Wide screens with full motion pin the
 * chapter and let the scroll walk the rules. The chunk loads as the section nears.
 */
function addRulesBench(mm, afterIntro, scroller) {
  mm.add(
    { pin: `${MQ.MOTION} and ${MQ.WIDE} and (min-height: 600px)`, hero: '(min-width: 768px)', reduced: MQ.REDUCE, always: 'all' },
    guarded('rules bench', ({ conditions }) => {
      const section = $('#olaylar');
      return later(
        afterIntro,
        () =>
          whenNearOrIdle(section, '120% 0px')
            .then(() => import('../components/rules-bench/index.js'))
            .catch((error) => {
              // Without the bench every rule is printed in full again (menu.css, [data-bench='off']).
              if (section) section.dataset.bench = 'off';
              throw error;
            }),
        ({ initRulesBench }) => initRulesBench({ section, reduced: conditions.reduced, pin: conditions.pin, hero: conditions.hero, scroller }),
        'rules bench',
      );
    }),
  );
}

/**
 * @param {ReturnType<import('gsap').gsap.matchMedia>} mm
 * @param {{ afterIntro: () => Promise<void>, scroller?: object }} options
 */
export function addSignatureEffects(mm, { afterIntro, scroller }) {
  addRota(mm);
  addRulesBench(mm, afterIntro, scroller);
  addTypeEffects(mm, afterIntro);
}
