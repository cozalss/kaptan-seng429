import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_WAIT_MS, MIN_SHOW_MS, NEEDLE_PERFORMANCE, NEEDLE_SWING_DEG, criticalImages, hideLoader, needleAngle, runLoader, whenHeroFontSettles, whenImageSettles } from './loader.js';

function markup() {
  document.body.innerHTML = `
    <div data-loader>
      <div data-loader-bar></div>
      <p aria-hidden="true">Bildirimler taranıyor · <span data-loader-count>0/0</span></p>
    </div>
    <p role="status" data-loader-status></p>
    <img data-loader-critical alt="" />
    <img loading="lazy" alt="" />
    <img alt="" />`;
  return {
    root: document.querySelector('[data-loader]'),
    status: document.querySelector('[data-loader-status]'),
    count: document.querySelector('[data-loader-count]'),
  };
}

function pendingImage() {
  const image = document.createElement('img');
  Object.defineProperty(image, 'complete', { value: false });
  return image;
}

describe('criticalImages', () => {
  it('returns only images marked data-loader-critical', () => {
    markup();
    const images = criticalImages();
    expect(images).toHaveLength(1);
    expect(images[0].hasAttribute('data-loader-critical')).toBe(true);
  });
});

describe('runLoader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts settled assets and announces "Sayfa hazır" exactly once at the end', async () => {
    const { root, status, count } = markup();
    const image = pendingImage();
    const done = runLoader({ root, images: [image], status, animate: false });
    expect(count.textContent).toBe('0/2');
    expect(status.textContent).toBe('');

    image.dispatchEvent(new Event('load'));
    await done;
    expect(count.textContent).toBe('2/2');
    expect(status.textContent).toBe('Sayfa hazır');
  });

  it('treats a failed image as settled', async () => {
    const { root, status } = markup();
    const image = pendingImage();
    const done = runLoader({ root, images: [image], status, animate: false });
    image.dispatchEvent(new Event('error'));
    await done;
    expect(status.textContent).toBe('Sayfa hazır');
  });

  it('gives up waiting after the time cap', async () => {
    const { root, status } = markup();
    const done = runLoader({ root, images: [pendingImage()], status, animate: false });
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    await done;
    expect(status.textContent).toBe('Sayfa hazır');
  });
});

describe('whenHeroFontSettles', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads the hero headline face (Bodoni display roman)', async () => {
    const fonts = { load: vi.fn(() => Promise.resolve([])) };
    await whenHeroFontSettles(fonts, 300);
    expect(fonts.load).toHaveBeenCalledTimes(1);
    expect(fonts.load.mock.calls.map(([font]) => font).join()).toMatch(/Bodoni Moda Display/);
  });

  it('stops waiting after the timeout when the font hangs', async () => {
    const fonts = { load: vi.fn(() => new Promise(() => {})) };
    let settled = false;
    whenHeroFontSettles(fonts, 300).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('treats a failed font load or a missing FontFaceSet as settled', async () => {
    await expect(whenHeroFontSettles({ load: () => Promise.reject(new Error('x')) }, 300)).resolves.toBeUndefined();
    await expect(whenHeroFontSettles(undefined)).resolves.toBeUndefined();
  });
});

describe('whenImageSettles', () => {
  it('waits for decode after load, and survives a decode failure', async () => {
    const image = pendingImage();
    image.decode = vi.fn(() => Promise.reject(new Error('bad')));
    const done = whenImageSettles(image);
    image.dispatchEvent(new Event('load'));
    await expect(done).resolves.toBeUndefined();
    expect(image.decode).toHaveBeenCalledOnce();
  });
});

describe('hideLoader', () => {
  it('fades the loader out and hides it from assistive tech', () => {
    const { root } = markup();
    hideLoader(root);
    expect(root.classList.contains('is-done')).toBe(true);
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(() => hideLoader(null)).not.toThrow();
  });
});

describe('needleAngle', () => {
  it('swings to alternating sides with a shrinking amplitude', () => {
    expect(needleAngle(0, 0)).toBe(NEEDLE_SWING_DEG);
    expect(needleAngle(0.5, 1)).toBe(-NEEDLE_SWING_DEG / 2);
    expect(Math.abs(needleAngle(0.75, 2))).toBeLessThan(Math.abs(needleAngle(0.5, 1)));
  });

  it('settles exactly on north once loading is done, and tolerates bad input', () => {
    expect(needleAngle(1, 3)).toBe(0);
    expect(needleAngle(2, 0)).toBe(0);
    expect(needleAngle(Number.NaN, 0)).toBe(NEEDLE_SWING_DEG);
  });
});

describe('runLoader needle', () => {
  it('swings the needle while loading and turns it to north when every asset has settled', async () => {
    document.body.innerHTML = '<div data-loader><svg><g data-loader-needle></g></svg><span data-loader-count></span></div>';
    const root = document.querySelector('[data-loader]');
    const needle = root.querySelector('[data-loader-needle]');
    const image = pendingImage();
    const done = runLoader({ root, images: [image], animate: false });
    expect(gsap.getProperty(needle, 'rotation')).toBe(NEEDLE_SWING_DEG);
    image.dispatchEvent(new Event('load'));
    await done;
    expect(gsap.getProperty(needle, 'rotation')).toBe(0);
  });
});

describe('runLoader performance (animated)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds for the short performance even when assets are instant, and never past the cap', async () => {
    expect(MIN_SHOW_MS).toBeLessThan(MAX_WAIT_MS);
    expect(MAX_WAIT_MS).toBeLessThanOrEqual(700);
    document.body.innerHTML = '<div data-loader><svg><g data-loader-needle></g></svg></div><p data-loader-status></p>';
    const root = document.querySelector('[data-loader]');
    const status = document.querySelector('[data-loader-status]');
    const done = runLoader({ root, images: [], status, animate: true });
    await vi.advanceTimersByTimeAsync(MIN_SHOW_MS - 50);
    expect(status.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    await done;
    expect(status.textContent).toBe('Sayfa hazır');
    // the needle ends exactly on north
    expect(gsap.getProperty(root.querySelector('[data-loader-needle]'), 'rotation')).toBe(0);
  });

  it('swings smaller each time and ends on north', () => {
    const angles = NEEDLE_PERFORMANCE.map(([angle]) => Math.abs(angle));
    angles.slice(1).forEach((angle, i) => expect(angle).toBeLessThan(angles[i]));
    expect(NEEDLE_PERFORMANCE.at(-1)[0]).toBe(0);
    const seconds = NEEDLE_PERFORMANCE.reduce((sum, [, duration]) => sum + duration, 0);
    expect(Math.round(seconds * 1000)).toBeLessThanOrEqual(MIN_SHOW_MS);
  });
});
