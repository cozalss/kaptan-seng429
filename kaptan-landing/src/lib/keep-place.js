// Keeps the reader's place when the viewport changes shape. Turning a phone to landscape crosses the
// 768px breakpoint: the page's height changes several-fold, gsap.matchMedia() rebuilds the pins, and
// the new triggers' own refreshes wipe ScrollTrigger's remembered scroll, so the page was left at the
// very top. The place is kept as a chapter and the progress through it, read half a viewport down
// as the folio reads it (folio.js), from the last scroll at a settled viewport; after a refresh at a
// new size it is set again, until the new size has settled.

import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { folioState } from './folio.js';

/** Where the place is read: the folio's reading line, half a viewport down. */
const READING_LINE = 0.5;
/** A height change below this share of the viewport is the mobile URL bar, not a new shape. */
const HEIGHT_TOLERANCE = 0.25;
/** Quiet time after the last resize / refresh before the new size counts as settled (ms). */
export const SETTLE_MS = 600;

/**
 * Pure: whether the viewport changed shape (width, or height by more than the URL bar's share).
 * @param {{width: number, height: number}|null} before
 * @param {{width: number, height: number}} now
 */
export function shapeChanged(before, now) {
  if (!before) return true;
  return before.width !== now.width || Math.abs(before.height - now.height) > now.height * HEIGHT_TOLERANCE;
}

/**
 * Pure: the scroll offset that puts a remembered place back on the reading line.
 * @param {{chapter: number, progress: number}|null} place
 * @param {Array<{top: number, height: number}>} chapters
 * @param {number} viewport
 * @returns {number|null}
 */
export function placeY(place, chapters, viewport) {
  const chapter = place ? chapters[place.chapter] : null;
  if (!chapter) return null;
  return Math.max(0, Math.round(chapter.top + chapter.height * place.progress - viewport * READING_LINE));
}

/**
 * @param {{scroller: {shift: (dy: number) => void}, root?: Document, win?: Window, trigger?: typeof ScrollTrigger}} options
 * @returns {{destroy: () => void}}
 */
export function initKeepPlace({ scroller, root = document, win = window, trigger = ScrollTrigger }) {
  // the folio's chapters: the hero plus every section/footer that opens with a running head
  const sections = [root.getElementById('hero'), ...[...root.querySelectorAll('[data-folio]')].map((slot) => slot.closest('section, footer'))].filter(Boolean);
  if (!sections.length || !scroller) return { destroy() {} };

  const view = () => ({ width: win.innerWidth, height: win.innerHeight });
  const chapters = () =>
    sections.map((section) => {
      // a pinned chapter's length is its pin-spacer's
      const box = section.parentElement?.classList.contains('pin-spacer') ? section.parentElement : section;
      const rect = box.getBoundingClientRect();
      return { top: rect.top + win.scrollY, height: rect.height };
    });
  const read = () => {
    const { chapter, progress } = folioState({ scrollY: win.scrollY, viewport: win.innerHeight, docHeight: root.documentElement.scrollHeight, chapters: chapters() });
    return { chapter, progress };
  };

  let size = view();
  let place = read();
  let frame = 0;
  let timer = 0;

  const onScroll = () => {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      const now = view();
      if (shapeChanged(size, now)) return; // the browser's own clamp after a resize is not the reader's
      size = now;
      place = read();
    });
  };
  const settle = () => {
    timer = 0;
    size = view();
    place = read();
  };
  const waitToSettle = () => {
    win.clearTimeout(timer);
    timer = win.setTimeout(settle, SETTLE_MS);
  };
  const onRefresh = () => {
    if (!shapeChanged(size, view())) return;
    const y = placeY(place, chapters(), win.innerHeight);
    if (y !== null && Math.abs(y - win.scrollY) > 1) scroller.shift(y - win.scrollY);
    waitToSettle();
  };

  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', waitToSettle);
  trigger.addEventListener('refresh', onRefresh);
  return {
    destroy() {
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', waitToSettle);
      trigger.removeEventListener('refresh', onRefresh);
      win.clearTimeout(timer);
      if (frame) win.cancelAnimationFrame(frame);
    },
  };
}
