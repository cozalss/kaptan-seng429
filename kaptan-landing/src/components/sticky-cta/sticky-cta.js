// Mobile sticky bar (< 768px; CSS hides it on wider screens): one small ink tab, "İçindekiler · Demo akışı".
// It only appears when the reader is navigating, never over what they are reading:
//   - the hero is off screen and no overlay is open;
//   - no quiet zone is on screen: [data-sticky-quiet] (the hands-on rules bench), the whole of
//     #ajanlar (the crew strip — offering "agents" there is pointless) and every in-section ink
//     button (main .pill), so a chapter's own call to action is never doubled or covered;
//   - the reader last scrolled *up* (scrolling down to read hides it; at rest after reading down it
//     stays hidden, so caption panels are never covered).
// Both actions carry data-action, so the UI's document-level click delegation handles them.

import { isOverlayOpen } from '../../lib/dom.js';

/** Default quiet zones (see the header comment). */
export const QUIET_SELECTOR = '[data-sticky-quiet], #ajanlar, main .pill';
/** Pixels of travel before a change of scroll direction counts (filters touch jitter). */
export const DIRECTION_SLOP_PX = 12;

/**
 * Pure: the reader's scroll intent after a scroll event.
 * @param {{anchorY: number, up: boolean}} state  anchorY = where the current direction began
 * @param {number} y  current scroll position
 * @param {number} [slop]
 * @returns {{anchorY: number, up: boolean}}
 */
export function nextScrollIntent({ anchorY, up }, y, slop = DIRECTION_SLOP_PX) {
  if (up) {
    // still going up: follow the extreme; going down: flip once past the slop
    if (y <= anchorY) return { anchorY: y, up: true };
    return y - anchorY > slop ? { anchorY: y, up: false } : { anchorY, up };
  }
  if (y >= anchorY) return { anchorY: y, up: false };
  return anchorY - y > slop ? { anchorY: y, up: true } : { anchorY, up };
}

function watchHero(hero, onChange, IntersectionObserverImpl) {
  if (!hero) {
    onChange(false);
    return () => {};
  }
  if (typeof IntersectionObserverImpl === 'function') {
    const observer = new IntersectionObserverImpl((entries) => {
      onChange(entries[entries.length - 1].isIntersecting);
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }
  const check = () => onChange(hero.getBoundingClientRect().bottom > 0);
  window.addEventListener('scroll', check, { passive: true });
  check();
  return () => window.removeEventListener('scroll', check);
}

/** Reports whether any quiet zone is on screen (never quiet without IntersectionObserver). */
function watchQuietZones(zones, onChange, IntersectionObserverImpl) {
  if (!zones.length || typeof IntersectionObserverImpl !== 'function') return () => {};
  const visible = new Set();
  const observer = new IntersectionObserverImpl((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
    onChange(visible.size > 0);
  });
  zones.forEach((zone) => observer.observe(zone));
  return () => observer.disconnect();
}

function watchOverlays(mount, onChange) {
  const check = () => onChange(isOverlayOpen());
  const observer = new MutationObserver(check);
  observer.observe(mount, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  check();
  return () => observer.disconnect();
}

/** Scroll intent (up = navigating). Starts as "up" so the bar can show before any scroll. */
function watchDirection(scrollTarget, onChange) {
  if (!scrollTarget) return () => {};
  const readY = () => scrollTarget.scrollY ?? scrollTarget.scrollTop ?? 0;
  let intent = { anchorY: readY(), up: true };
  const onScroll = () => {
    const next = nextScrollIntent(intent, readY());
    if (next.up !== intent.up) onChange(next.up);
    intent = next;
  };
  scrollTarget.addEventListener('scroll', onScroll, { passive: true });
  return () => scrollTarget.removeEventListener('scroll', onScroll);
}

/**
 * @param {{root?: HTMLElement|null, hero?: HTMLElement|null, overlays?: HTMLElement|null,
 *   quiet?: Iterable<Element>, scrollTarget?: Window|HTMLElement|null, IntersectionObserverImpl?: Function}} [options]
 * @returns {{destroy: () => void, isVisible: () => boolean}}
 */
export function initStickyCta({
  root = document.querySelector('[data-sticky-cta]'),
  hero = document.getElementById('hero'),
  overlays = document.getElementById('overlays'),
  quiet = document.querySelectorAll(QUIET_SELECTOR),
  scrollTarget = null,
  IntersectionObserverImpl = window.IntersectionObserver,
} = {}) {
  if (!root) return { destroy() {}, isVisible: () => false };

  const state = { heroVisible: true, overlayOpen: false, quiet: false, readingDown: false };
  const isVisible = () => !state.heroVisible && !state.overlayOpen && !state.quiet && !state.readingDown;
  const render = () => {
    const visible = isVisible();
    root.dataset.visible = String(visible);
    root.inert = !visible;
  };
  const watch = (key, invert = false) => (value) => {
    state[key] = invert ? !value : value;
    render();
  };

  const stops = [
    watchHero(hero, watch('heroVisible'), IntersectionObserverImpl),
    watchOverlays(overlays ?? document.body, watch('overlayOpen')),
    watchQuietZones([...quiet], watch('quiet'), IntersectionObserverImpl),
    watchDirection(scrollTarget, watch('readingDown', true)),
  ];
  render();

  return {
    isVisible,
    destroy() {
      stops.forEach((stop) => stop());
    },
  };
}
