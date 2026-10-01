import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTLE_MS, initKeepPlace, placeY, shapeChanged } from './keep-place.js';

describe('shapeChanged', () => {
  it('counts a new width or a big height change as a new shape', () => {
    expect(shapeChanged({ width: 390, height: 844 }, { width: 844, height: 390 })).toBe(true);
    expect(shapeChanged({ width: 390, height: 844 }, { width: 390, height: 400 })).toBe(true);
    expect(shapeChanged(null, { width: 390, height: 844 })).toBe(true);
  });

  it('ignores the mobile URL bar showing and hiding', () => {
    expect(shapeChanged({ width: 390, height: 844 }, { width: 390, height: 780 })).toBe(false);
    expect(shapeChanged({ width: 390, height: 844 }, { width: 390, height: 844 })).toBe(false);
  });
});

describe('placeY', () => {
  const chapters = [
    { top: 0, height: 2000 },
    { top: 2000, height: 6000 },
  ];

  it('puts the remembered point of the chapter back on the reading line', () => {
    expect(placeY({ chapter: 1, progress: 0.5 }, chapters, 1000)).toBe(4500);
  });

  it('never goes above the top and needs a known chapter', () => {
    expect(placeY({ chapter: 0, progress: 0 }, chapters, 1000)).toBe(0);
    expect(placeY({ chapter: 5, progress: 0.5 }, chapters, 1000)).toBeNull();
    expect(placeY(null, chapters, 1000)).toBeNull();
  });
});

describe('initKeepPlace', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  function setup() {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <section id="hero"></section>
      <section id="a"><div class="running-head"><span data-folio></span></div></section>`;
    const layout = { hero: [0, 2000], a: [2000, 6000] };
    const listeners = {};
    const win = {
      scrollY: 0,
      innerWidth: 390,
      innerHeight: 1000,
      addEventListener: (type, fn) => (listeners[type] = fn),
      removeEventListener: (type) => delete listeners[type],
      requestAnimationFrame: (fn) => {
        fn();
        return 0;
      },
      cancelAnimationFrame: vi.fn(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
    };
    document.querySelectorAll('section').forEach((el) => {
      el.getBoundingClientRect = () => ({ top: layout[el.id][0] - win.scrollY, height: layout[el.id][1] });
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 8000 });
    const refreshers = [];
    const trigger = { addEventListener: (type, fn) => refreshers.push(fn), removeEventListener: vi.fn() };
    const scroller = { shift: vi.fn((dy) => (win.scrollY += dy)) };
    const keep = initKeepPlace({ scroller, win, trigger });
    return { win, layout, listeners, refresh: () => refreshers.forEach((fn) => fn()), scroller, keep };
  }

  it('sets the reader back in the same chapter after a refresh at a new viewport shape', () => {
    const { win, layout, listeners, refresh, scroller } = setup();
    win.scrollY = 4500; // half-way through chapter "a"
    listeners.scroll();
    // turned to landscape: the page is half as long and the browser clamped the scroll
    win.innerWidth = 844;
    win.innerHeight = 500;
    layout.hero = [0, 1000];
    layout.a = [1000, 3000];
    win.scrollY = 0;
    listeners.scroll();
    listeners.resize();
    refresh();
    expect(scroller.shift).toHaveBeenCalled();
    expect(win.scrollY).toBe(1000 + 1500 - 250);
  });

  it('leaves the scroll alone on a refresh at the same shape (lazy pins, deep links)', () => {
    const { win, listeners, refresh, scroller } = setup();
    win.scrollY = 4500;
    listeners.scroll();
    refresh();
    expect(scroller.shift).not.toHaveBeenCalled();
  });

  it('takes the new shape as settled once resizing and refreshing are over', () => {
    const { win, listeners, refresh, scroller } = setup();
    win.innerWidth = 844;
    listeners.resize();
    vi.advanceTimersByTime(SETTLE_MS + 1);
    win.scrollY = 300;
    listeners.scroll();
    refresh();
    expect(scroller.shift).not.toHaveBeenCalled();
  });

  it('stops listening when destroyed, and is a no-op without chapters', () => {
    const { listeners, keep } = setup();
    keep.destroy();
    expect(listeners.scroll).toBeUndefined();
    document.body.innerHTML = '';
    expect(() => initKeepPlace({ scroller: { shift() {} }, trigger: { addEventListener() {} } }).destroy()).not.toThrow();
  });
});
