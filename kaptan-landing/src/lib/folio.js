// The running head's left slot: a live folio. The sticky header already carries the KAPtan
// wordmark, so the head does not repeat it; instead it shows where the reader is in the book —
// a tick per chapter (done ones inked, the current one inking with the reader's progress through
// it) and the page, "s. 9 / 23", one page being one viewport of scroll. Decorative (aria-hidden):
// the chapter is already named by the head's right slot and the section's heading.

import { clamp } from './math.js';

/** Where in the chapter the reading line sits: half a viewport down. */
const READING_LINE = 0.5;

/**
 * Pure: the reader's place in the book.
 * @param {{scrollY: number, viewport: number, docHeight: number, chapters: Array<{top: number, height: number}>}} input
 * @returns {{page: number, pages: number, chapter: number, progress: number}}
 */
export function folioState({ scrollY, viewport, docHeight, chapters }) {
  const vh = Math.max(1, viewport);
  const pages = Math.max(1, Math.round(docHeight / vh));
  const line = scrollY + vh * READING_LINE;
  const page = clamp(Math.floor(line / vh) + 1, 1, pages);
  let chapter = 0;
  chapters.forEach((entry, index) => {
    if (entry.top <= line) chapter = index;
  });
  const current = chapters[chapter];
  const progress = current ? clamp((line - current.top) / Math.max(1, current.height), 0, 1) : 0;
  return { page, pages, chapter, progress };
}

/** Pure: the folio's text. */
export const folioLabel = ({ page, pages }) => `s. ${page} / ${pages}`;

function buildFolio(slot, count) {
  const ticks = document.createElement('span');
  ticks.className = 'folio-ticks';
  for (let i = 0; i < count; i += 1) ticks.appendChild(document.createElement('i'));
  const page = document.createElement('span');
  page.className = 'folio-page';
  slot.replaceChildren(ticks, page);
  slot.setAttribute('aria-hidden', 'true');
  return { ticks: [...ticks.children], page };
}

/**
 * Fills every `[data-folio]` slot and keeps it live while the page scrolls.
 * Chapters are the hero plus every section/footer that opens with a running head.
 * @param {{root?: Document, win?: Window}} [options]
 * @returns {{refresh: () => void, destroy: () => void, state: () => ReturnType<typeof folioState>|null}}
 */
export function initFolios({ root = document, win = window } = {}) {
  const slots = [...root.querySelectorAll('[data-folio]')];
  if (!slots.length) return { refresh() {}, destroy() {}, state: () => null };

  const sections = [root.getElementById('hero'), ...slots.map((slot) => slot.closest('section, footer'))].filter(Boolean);
  const folios = slots.map((slot) => ({ slot, head: slot.closest('.running-head') ?? slot, ...buildFolio(slot, sections.length) }));
  let chapters = [];
  let docHeight = 0;
  let scrollY = 0;
  let last = null;
  let shownProgress = '';
  let frame = 0;

  // Geometry is measured on refresh only, and the scroll offset is read in the scroll event: read
  // inside the frame, after the scroll animations had written their styles, scrollY and
  // scrollHeight forced an extra style and layout pass every frame.
  const measure = () => {
    scrollY = win.scrollY;
    docHeight = root.documentElement.scrollHeight;
    chapters = sections.map((section) => {
      const rect = section.getBoundingClientRect();
      return { top: rect.top + scrollY, height: rect.height };
    });
  };

  const render = () => {
    frame = 0;
    const next = folioState({ scrollY, viewport: win.innerHeight, docHeight, chapters });
    const changed = !last || next.page !== last.page || next.pages !== last.pages || next.chapter !== last.chapter;
    const progress = next.progress.toFixed(3);
    const inked = changed || progress !== shownProgress;
    shownProgress = progress;
    folios.forEach(({ ticks, page }) => {
      if (changed) {
        page.textContent = folioLabel(next);
        ticks.forEach((tick, index) => {
          tick.className = index < next.chapter ? 'is-done' : index === next.chapter ? 'is-current' : '';
        });
      }
      // on the current tick only (its ::after is the ink): on the head it restyled the whole head
      if (inked) ticks[next.chapter]?.style.setProperty('--folio-progress', progress);
    });
    last = next;
  };

  const schedule = () => {
    scrollY = win.scrollY;
    if (!frame) frame = win.requestAnimationFrame(render);
  };
  const refresh = () => {
    measure();
    last = null;
    render();
  };

  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', refresh);
  refresh();

  return {
    refresh,
    state: () => last,
    destroy() {
      win.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', refresh);
      if (frame) win.cancelAnimationFrame(frame);
    },
  };
}
