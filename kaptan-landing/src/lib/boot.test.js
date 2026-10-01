import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterNextPaint, attempt, chapterFromHash, debounce, setInert, warmLazyImages, yieldToMain } from './boot.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('attempt', () => {
  it('returns the step result', () => {
    expect(attempt('ok', () => 42)).toBe(42);
  });

  it('logs and swallows a throwing step so later steps still run', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const later = vi.fn();
    expect(attempt('menu', () => {
      throw new Error('boom');
    })).toBeUndefined();
    attempt('next', later);
    expect(later).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[kaptan] menu failed', expect.any(Error));
  });
});

describe('debounce', () => {
  it('runs once, after the last call, with its arguments', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('can be cancelled', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced();
    debounced.cancel();
    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('setInert', () => {
  it('sets and clears inert on every element, skipping nulls', () => {
    const header = document.createElement('header');
    const main = document.createElement('main');
    setInert([header, null, main], true);
    expect(header.hasAttribute('inert')).toBe(true);
    expect(main.inert).toBe(true);
    setInert([header, main], false);
    expect(header.hasAttribute('inert')).toBe(false);
    expect(main.inert).toBe(false);
  });
});

describe('warmLazyImages', () => {
  it('switches only marked lazy images to eager', () => {
    document.body.innerHTML = `
      <img data-lazy-warm loading="lazy" alt="" />
      <img loading="lazy" alt="" />`;
    warmLazyImages();
    const [warm, other] = document.querySelectorAll('img');
    expect(warm.getAttribute('loading')).toBe('eager');
    expect(other.getAttribute('loading')).toBe('lazy');
  });
});


describe('yieldToMain', () => {
  it('uses scheduler.yield when available', async () => {
    const scheduler = { yield: vi.fn(() => Promise.resolve()) };
    await yieldToMain({ scheduler });
    expect(scheduler.yield).toHaveBeenCalledOnce();
  });

  it('falls back to a macrotask', async () => {
    vi.useFakeTimers();
    let done = false;
    yieldToMain({}).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});

describe('afterNextPaint', () => {
  it('waits for a frame, then a macrotask', async () => {
    vi.useFakeTimers();
    const requestAnimationFrame = vi.fn((callback) => setTimeout(callback, 16));
    let done = false;
    afterNextPaint({ requestAnimationFrame }).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(15);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it('falls back to yieldToMain without rAF', async () => {
    const scheduler = { yield: vi.fn(() => Promise.resolve()) };
    await afterNextPaint({ scheduler });
    expect(scheduler.yield).toHaveBeenCalledOnce();
  });
});

describe('chapterFromHash', () => {
  it('returns the chapter a deep link names', () => {
    document.body.innerHTML = '<section id="olaylar"></section>';
    expect(chapterFromHash('#olaylar')).toBe(document.getElementById('olaylar'));
  });

  it('ignores no hash, a bare "#", agent details, unknown ids and broken escapes', () => {
    document.body.innerHTML = '<section id="olaylar"></section><div id="ajan-kanit"></div>';
    expect(chapterFromHash('')).toBeNull();
    expect(chapterFromHash('#')).toBeNull();
    expect(chapterFromHash('#ajan-kanit')).toBeNull();
    expect(chapterFromHash('#yok')).toBeNull();
    expect(chapterFromHash('#%E0%A4%A')).toBeNull();
    expect(chapterFromHash(undefined)).toBeNull();
  });
});
