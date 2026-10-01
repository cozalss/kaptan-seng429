import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCROLLED_THRESHOLD_PX, initHeaderState, isScrolledPast } from './header.js';

describe('isScrolledPast', () => {
  it('is false at and below the threshold, true above it', () => {
    expect(isScrolledPast(0)).toBe(false);
    expect(isScrolledPast(SCROLLED_THRESHOLD_PX)).toBe(false);
    expect(isScrolledPast(SCROLLED_THRESHOLD_PX + 1)).toBe(true);
    expect(isScrolledPast(10, 5)).toBe(true);
  });

  it('treats non-finite input as not scrolled', () => {
    expect(isScrolledPast(Number.NaN)).toBe(false);
    expect(isScrolledPast(undefined)).toBe(false);
  });
});

describe('initHeaderState', () => {
  let header;
  let win;
  let frames;

  beforeEach(() => {
    header = document.createElement('header');
    frames = [];
    win = Object.assign(new EventTarget(), {
      scrollY: 0,
      requestAnimationFrame: vi.fn((callback) => frames.push(callback)),
      cancelAnimationFrame: vi.fn(),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const flush = () => frames.splice(0).forEach((callback) => callback());

  it('sets the initial state immediately', () => {
    win.scrollY = 300;
    initHeaderState({ header, win });
    expect(header.dataset.scrolled).toBe('true');
  });

  it('updates once per frame however many scroll events arrive', () => {
    initHeaderState({ header, win });
    expect(header.dataset.scrolled).toBe('false');
    win.scrollY = 120;
    win.dispatchEvent(new Event('scroll'));
    win.dispatchEvent(new Event('scroll'));
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(1);
    flush();
    expect(header.dataset.scrolled).toBe('true');
  });

  it('stops listening on destroy', () => {
    const { destroy } = initHeaderState({ header, win });
    destroy();
    win.scrollY = 500;
    win.dispatchEvent(new Event('scroll'));
    flush();
    expect(header.dataset.scrolled).toBe('false');
  });

  it('is a no-op without a header', () => {
    expect(() => initHeaderState({ header: null, win }).destroy()).not.toThrow();
  });
});
