import { afterEach, describe, expect, it, vi } from 'vitest';
import { folioLabel, folioState, initFolios } from './folio.js';

const chapters = [
  { top: 0, height: 2000 },
  { top: 2000, height: 6000 },
  { top: 8000, height: 1000 },
];

describe('folioState', () => {
  it('counts pages as viewports and reads at half a viewport down', () => {
    const s = folioState({ scrollY: 0, viewport: 1000, docHeight: 9000, chapters });
    expect(s).toEqual({ page: 1, pages: 9, chapter: 0, progress: 0.25 });
  });

  it('follows the chapter whose top the reading line has passed, with its progress', () => {
    const s = folioState({ scrollY: 4500, viewport: 1000, docHeight: 9000, chapters });
    expect(s.chapter).toBe(1);
    expect(s.page).toBe(6);
    expect(s.progress).toBeCloseTo(0.5);
  });

  it('clamps at the ends and survives odd input', () => {
    const end = folioState({ scrollY: 99999, viewport: 1000, docHeight: 9000, chapters });
    expect(end).toMatchObject({ page: 9, chapter: 2, progress: 1 });
    expect(folioState({ scrollY: 0, viewport: 0, docHeight: 0, chapters: [] })).toEqual({ page: 1, pages: 1, chapter: 0, progress: 0 });
  });

  it('labels the page', () => {
    expect(folioLabel({ page: 7, pages: 19 })).toBe('s. 7 / 19');
  });
});

describe('initFolios', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function fakeWindow() {
    const listeners = {};
    return {
      scrollY: 0,
      innerHeight: 1000,
      addEventListener: vi.fn((type, fn) => (listeners[type] = fn)),
      removeEventListener: vi.fn((type) => delete listeners[type]),
      requestAnimationFrame: (fn) => {
        fn();
        return 0;
      },
      cancelAnimationFrame: vi.fn(),
      fire: (type) => listeners[type]?.(),
      listeners,
    };
  }

  it('replaces the head\'s left slot with ticks and a live page number', () => {
    document.body.innerHTML = `
      <section id="hero"></section>
      <section id="a"><div class="running-head"><span data-folio></span><span>Bölüm 2 · Tayfa</span></div></section>
      <footer id="b"><div class="running-head"><span data-folio></span><span>Kolofon</span></div></footer>`;
    const tops = { hero: 0, a: 2000, b: 8000 };
    document.querySelectorAll('section, footer').forEach((el) => {
      el.getBoundingClientRect = () => ({ top: tops[el.id] - win.scrollY, height: el.id === 'a' ? 6000 : 2000 });
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 10000 });
    const win = fakeWindow();
    const folios = initFolios({ win });

    const slot = document.querySelector('#a [data-folio]');
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    expect(slot.querySelectorAll('.folio-ticks i')).toHaveLength(3);
    expect(slot.textContent).toBe('s. 1 / 10');
    expect(document.body.textContent).not.toContain('KAPtan');

    win.scrollY = 4500;
    win.fire('scroll');
    expect(slot.querySelector('.folio-page').textContent).toBe('s. 6 / 10');
    expect([...slot.querySelectorAll('.folio-ticks i')].map((t) => t.className)).toEqual(['is-done', 'is-current', '']);
    expect(slot.closest('.running-head').style.getPropertyValue('--folio-progress')).toBe('0.500');

    folios.destroy();
    expect(win.listeners.scroll).toBeUndefined();
  });

  it('is a no-op without slots', () => {
    const folios = initFolios({ win: fakeWindow() });
    expect(folios.state()).toBeNull();
    expect(() => folios.destroy()).not.toThrow();
  });
});
