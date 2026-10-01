import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettleFlag } from './settle-flag.js';

describe('createSettleFlag', () => {
  let el;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('div');
  });

  afterEach(() => vi.useRealTimers());

  it('sets the class on a poke and clears it once pokes stop for the delay', () => {
    const flag = createSettleFlag({ el, className: 'is-scrolling', delay: 150 });
    flag.poke();
    expect(el.classList.contains('is-scrolling')).toBe(true);
    vi.advanceTimersByTime(100);
    flag.poke(); // still moving: the timer restarts
    vi.advanceTimersByTime(100);
    expect(el.classList.contains('is-scrolling')).toBe(true);
    vi.advanceTimersByTime(50);
    expect(el.classList.contains('is-scrolling')).toBe(false);
  });

  it('clears at once on destroy', () => {
    const flag = createSettleFlag({ el, className: 'is-scrolling' });
    flag.poke();
    flag.destroy();
    expect(el.classList.contains('is-scrolling')).toBe(false);
    vi.advanceTimersByTime(500);
    expect(el.classList.contains('is-scrolling')).toBe(false);
  });
});
