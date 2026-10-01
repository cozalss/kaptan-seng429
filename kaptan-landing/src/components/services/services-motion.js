import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { pinScrollForOffset } from '../../lib/geometry.js';
import { createDragGesture } from './services-drag.js';
import { createPageTurn } from './page-turn.js';
import { addInk, clearInk, inkParts } from './chart-spread.js';
import { PHASE, buildStripTimeline } from './strip-timeline.js';
import { initServicesLife, measurePanelCentres } from './services-life.js';
import { createSettleFlag } from './settle-flag.js';

// Page scroll per px of strip travel, for the whole timeline (shared out over its phases in
// proportion, strip-timeline.js). Below 1 the strip runs a little ahead of the wheel: the chapter
// stays ≤ 6.5 viewports at 1440 × 900 while the turn and the inking keep their share.
const SCROLL_PER_TRAVEL_PX = 1.08;
const DRAG_THRESHOLD_PX = 6;
// Scrub lag (s): short, so the strip follows the wheel closely and settles fast.
const SCRUB = 0.4;
// After the strip stops moving, hovers and clicks come back this much later.
const SETTLE_MS = 150;
const MOBILE_INK_S = 2.8;

function parts(section) {
  const pin = section.querySelector('[data-services-pin]');
  const track = section.querySelector('[data-services-track]');
  // The strip (chapter opener + panels + the closed spread) is what slides; the running head stays put.
  const strip = section.querySelector('[data-services-strip]') ?? track;
  const spread = section.querySelector('[data-spread]');
  return {
    pin,
    track,
    strip,
    book: spread.querySelector('[data-spread-book]'),
    leaf: spread.querySelector('[data-spread-leaf]'),
    ink: inkParts(spread.querySelector('[data-spread-ink]')),
  };
}

function buildPinnedTimeline({ pin, strip, track, ink }, turn, travel, moving) {
  let spread = false;
  let shownX = NaN;
  return buildStripTimeline({ strip, track, ink }, turn, travel, {
    // Every drawn frame (the scrub's lag tail included) marks the strip as moving, and the pin is
    // handed to the spread from what is drawn (the leaf past upright), not from the scroll position.
    onFrame: (frame) => {
      moving.poke();
      // the in-frame parallax follows the strip as drawn (services.css --sx)
      const x = Math.round(Number(gsap.getProperty(strip, 'x')) || 0);
      if (x !== shownX) {
        shownX = x;
        pin.style.setProperty('--sx', `${x}px`);
      }
      if (frame.spread !== spread) {
        spread = frame.spread;
        pin.classList.toggle('is-spread', spread);
      }
    },
    scrollTrigger: {
      trigger: pin,
      start: 'top top',
      end: () => `+=${Math.max(travel(), window.innerHeight) * SCROLL_PER_TRAVEL_PX}`,
      pin: true,
      // Transform pinning (Lenis drives scroll on the GSAP ticker, so it stays in sync): no
      // fixed ↔ static flip at the pin edges, which Chrome otherwise scores as a layout shift.
      pinType: 'transform',
      scrub: SCRUB,
      invalidateOnRefresh: true,
      // Rebuilt by matchMedia after the triggers below it: measure the pin first.
      refreshPriority: 1,
    },
  });
}

/**
 * The panels sit far off to the side inside the pin, where native lazy loading may not look.
 * Once the chapter is a screen away, every portrait is asked for, so none arrives mid-slide.
 */
function warmPortraits(section, track) {
  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom+=100%',
    once: true,
    onEnter: () => track.querySelectorAll('img[loading="lazy"]').forEach((img) => img.setAttribute('loading', 'eager')),
  });
  return () => st.kill();
}

/** Scroll position at which the pinned track shows a horizontal offset of `offset` px. */
function scrollForOffset(tl, travel, offset) {
  const st = tl.scrollTrigger;
  return pinScrollForOffset(offset, { start: st.start, end: st.end, travel: travel(), travelShare: PHASE.TRAVEL / PHASE.TOTAL });
}

/**
 * Keyboard a11y: a focused card may sit off-screen inside the pin. Scroll the page to the pin
 * progress that centres it (the browser cannot, the track moves with vertical scroll).
 */
function followFocus({ pin, track, strip }, tl, travel, scroller) {
  const onFocus = (event) => {
    const item = event.target.closest?.('.services__item');
    if (!item || !track.contains(item) || !event.target.matches(':focus-visible')) return;
    const box = item.getBoundingClientRect();
    const covered = pin.classList.contains('is-spread');
    if (!covered && box.left >= 0 && box.right <= pin.clientWidth && box.top >= 0 && box.bottom <= window.innerHeight) return;
    // offsetLeft is measured in the strip (position: relative), the element that slides.
    const centred = centredOffset({ pin, track, strip }, item);
    // After the browser's own scroll-into-view settles.
    requestAnimationFrame(() => {
      pin.scrollLeft = 0;
      scroller.scrollToY(scrollForOffset(tl, travel, centred), { immediate: true });
    });
  };
  track.addEventListener('focusin', onFocus);
  return () => track.removeEventListener('focusin', onFocus);
}

/**
 * The scroll position of what is on screen: the scrubbed timeline's own progress mapped back onto
 * the pin. A drag grabs the strip where it is drawn, never where Lenis or window.scrollY (ahead
 * of the scrub lag, mid smooth-scroll) say it will be.
 */
function shownScroll(tl) {
  const { start, end } = tl.scrollTrigger;
  return start + (end - start) * tl.progress();
}

// Sent by the agent detail (src/ui/service-modal.js REVEAL_AGENT_EVENT) as it closes on another
// agent than the one it was opened from.
const REVEAL_AGENT_EVENT = 'kaptan:reveal-agent';

/** Centre offset (px of strip travel) that puts `item` in the middle of the pin. */
function centredOffset({ pin, track, strip }, item) {
  const left = item.offsetLeft + (track === strip ? 0 : track.offsetLeft);
  return left + item.offsetWidth / 2 - pin.clientWidth / 2;
}

/**
 * The detail closed on another agent: jump the pin (no smooth scroll, the page is under the wash)
 * so that agent's card stands centred, and draw the strip there at once (no scrub lag), so the
 * plate flies back onto the card where it really is.
 */
function revealOnClose(el, tl, travel, scroller) {
  const onReveal = (event) => {
    const item = event.detail?.card?.closest?.('.services__item');
    if (!item || !el.track.contains(item)) return;
    event.preventDefault();
    const st = tl.scrollTrigger;
    const y = scrollForOffset(tl, travel, centredOffset(el, item));
    el.pin.scrollLeft = 0;
    scroller.scrollToY(y, { immediate: true });
    if (st && st.end > st.start) tl.progress(Math.min(Math.max((y - st.start) / (st.end - st.start), 0), 1));
  };
  document.addEventListener(REVEAL_AGENT_EVENT, onReveal);
  return () => document.removeEventListener(REVEAL_AGENT_EVENT, onReveal);
}

/** Mouse drag on the pinned track scrubs it sideways (the cursor, if any, labels it "Sürükle"). */
function dragToScrub({ pin }, tl, travel, scroller) {
  const ratio = () => (scrollForOffset(tl, travel, travel()) - tl.scrollTrigger.start) / Math.max(travel(), 1);
  return createDragGesture({
    pin,
    canStart: () => !pin.classList.contains('is-spread'),
    onStart: () => shownScroll(tl),
    onDrag: (dx, startScroll) => scroller.scrollToY(startScroll - dx * ratio(), { immediate: true }),
    threshold: DRAG_THRESHOLD_PX,
  });
}

/**
 * ≥768px: pins the crew strip and slides the panels sideways until the closed chart spread stands
 * centred; its leaf turns, the course is inked, and the pin lets go into Bölüm 3.
 */
export function initServicesMotion({ section, scroller }) {
  const el = parts(section);
  const travel = () => Math.max(0, el.strip.scrollWidth - el.pin.clientWidth);
  // The pinned layout (services.css) must be in place before ScrollTrigger measures it.
  el.pin.classList.add('is-pinned');
  const turn = createPageTurn({ leaf: el.leaf, book: el.book });
  const moving = createSettleFlag({ el: el.pin, className: 'is-scrolling', delay: SETTLE_MS });
  const tl = buildPinnedTimeline(el, turn, travel, moving);
  const panels = () => [...el.track.querySelectorAll('.services__item')];
  const measure = () => measurePanelCentres(panels());
  measure();
  ScrollTrigger.addEventListener('refresh', measure);
  const cleanups = [
    () => ScrollTrigger.removeEventListener('refresh', measure),
    () => {
      el.pin.style.removeProperty('--sx');
      panels().forEach((item) => item.style.removeProperty('--cx'));
    },
    initServicesLife({ section }),
    followFocus(el, tl, travel, scroller),
    dragToScrub(el, tl, travel, scroller),
    revealOnClose(el, tl, travel, scroller),
    warmPortraits(section, el.track),
    moving.destroy,
  ];

  return {
    destroy() {
      cleanups.forEach((undo) => undo());
      tl.scrollTrigger?.kill();
      tl.kill();
      el.pin.classList.remove('is-pinned', 'is-spread', 'is-dragging');
      turn.destroy();
      clearInk(el.ink);
      gsap.set([el.strip, el.track], { clearProps: 'transform,opacity' });
    },
  };
}

/** <768px: the panels stack (CSS) and the spread lies open; the course is inked once, on arrival. */
export function initMobileServicesMotion({ section }) {
  const { book, ink } = parts(section);
  const tl = gsap.timeline({
    scrollTrigger: { trigger: book, start: 'top 72%', once: true },
  });
  addInk(tl, ink, { at: 0.15, duration: MOBILE_INK_S });
  const stopLife = initServicesLife({ section });

  return {
    destroy() {
      stopLife();
      tl.scrollTrigger?.kill();
      tl.kill();
      clearInk(ink);
    },
  };
}
