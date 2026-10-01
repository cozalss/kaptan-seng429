import { afterEach, describe, expect, it, vi } from 'vitest';
import { initInkIn } from './ink-in.js';

function setup() {
  document.body.innerHTML = '<p data-ink-in id="a"></p><p data-ink-in id="b"></p><p id="c"></p>';
  return ['a', 'b', 'c'].map((id) => document.getElementById(id));
}

describe('initInkIn', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('inks a panel the first time it is seen, then stops watching it', () => {
    const [a, b, c] = setup();
    let callback;
    const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    const win = {
      IntersectionObserver: vi.fn(function Observer(cb) {
        callback = cb;
        return observer;
      }),
    };
    const { destroy } = initInkIn({ win });
    expect(observer.observe).toHaveBeenCalledTimes(2);
    callback([
      { target: a, isIntersecting: true },
      { target: b, isIntersecting: false },
    ]);
    expect(a.classList.contains('is-inked')).toBe(true);
    expect(b.classList.contains('is-inked')).toBe(false);
    expect(c.classList.contains('is-inked')).toBe(false);
    expect(observer.unobserve).toHaveBeenCalledWith(a);
    destroy();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('shows every panel at once without IntersectionObserver', () => {
    const [a, b] = setup();
    initInkIn({ win: {} }).destroy();
    expect(a.classList.contains('is-inked')).toBe(true);
    expect(b.classList.contains('is-inked')).toBe(true);
  });
});
