// Sancak Tezgâhı (Bölüm 3 · Seyir Kuralları, #olaylar): the lazy chunk's entry. Loaded by
// lib/motion-effects.js when the section nears the viewport; the article text never depends on it.
// Parts: instruments (engineer B), the mast (engineer C), the rule switch and glue (engineer A).

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createInstrument } from './instruments/index.js';
import { createMast } from './flag/index.js';
import { mountBench } from './bench.js';

const PARTS = Object.freeze({ createInstrument, createMast });
const REFRESH_DELAY_MS = 250;

/**
 * The bench's arrival (instruments drawn into the slot) can change the section's height; the
 * scroll-driven chapters below (Pusula, Rota) are then re-measured once the height settles.
 */
function watchHeight(section) {
  if (typeof ResizeObserver !== 'function') return () => {};
  let height = section.offsetHeight;
  let timer = 0;
  const observer = new ResizeObserver(() => {
    const next = section.offsetHeight;
    if (next === height) return;
    height = next;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(), REFRESH_DELAY_MS);
  });
  observer.observe(section);
  return () => {
    window.clearTimeout(timer);
    observer.disconnect();
  };
}

const warn = (error) => console.warn('[kaptan] rules show', error);

/** Phones: each rule rises in as it scrolls into view (no pin). */
function revealRows(section) {
  const rows = [...section.querySelectorAll('.articles > [data-rule]')].filter((row) => row.getBoundingClientRect().top > window.innerHeight);
  if (!rows.length) return () => {};
  gsap.set(rows, { autoAlpha: 0, y: 18 });
  const triggers = ScrollTrigger.batch(rows, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out', clearProps: 'opacity,visibility,transform' }),
  });
  return () => {
    triggers.forEach((trigger) => trigger.kill());
    gsap.set(rows, { clearProps: 'opacity,visibility,transform' });
  };
}

/**
 * `pin` (wide screens, full motion): the scroll drives the chapter (show.js, its own lazy chunk);
 * a visitor's pick scrolls to that rule's beat. Otherwise the bench tours E1 → E4 once when seen.
 * If the show cannot load, the bench is rebuilt as the touring one.
 * `hero` (≥ 768px): the large mast of the two-column stage.
 * @param {{ section: HTMLElement | null, reduced?: boolean, pin?: boolean, hero?: boolean,
 *   scroller?: { scrollToY(y: number, options?: object): void } }} options
 * @returns {{ destroy(): void }}
 */
export function initRulesBench({ section, reduced = false, pin = false, hero = pin, scroller }) {
  if (!section) return { destroy() {} };
  section.dataset.bench = 'on';
  const state = { destroyed: false, show: null, bench: null, stopReveal: () => {} };
  const tour = () => {
    state.bench = mountBench({ section, reduced, hero, parts: PARTS });
    if (!hero && !reduced) state.stopReveal = revealRows(section);
  };

  if (pin) {
    state.bench = mountBench({ section, reduced, hero, mode: 'pose', parts: PARTS, onPick: (id) => state.show?.goTo(id) });
    import('./show.js')
      .then(({ createShow }) => {
        if (!state.destroyed) state.show = createShow({ section, bench: state.bench, scroller });
      })
      .catch((error) => {
        warn(error);
        if (state.destroyed) return;
        state.bench.destroy();
        tour();
      });
  } else {
    tour();
  }
  const stopWatching = watchHeight(section);
  return {
    destroy() {
      state.destroyed = true;
      stopWatching();
      state.stopReveal();
      state.show?.destroy();
      state.bench?.destroy();
      delete section.dataset.bench;
    },
  };
}
