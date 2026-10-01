import { beforeEach, describe, expect, test } from 'vitest';
import { RITUAL_IMAGE_SIZES, WARM_MARGIN, fadeInOnLoad, renderRitualImages, warmRitualImages } from './ritual-render.js';

describe('renderRitualImages', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="r">
        <div data-ritual-media="yolculuk-2"><svg></svg></div>
        <div data-ritual-media="not-a-set"></div>
      </section>`;
  });

  test('adds a lazy, decorative picture for known image sets as the frame’s first child', () => {
    renderRitualImages(document.querySelector('#r'));
    const media = document.querySelector('[data-ritual-media="yolculuk-2"]');
    const image = media.querySelector('img');
    expect(media.firstElementChild.tagName).toBe('PICTURE');
    expect(media.querySelectorAll('source')).toHaveLength(2);
    expect(image.getAttribute('alt')).toBe('');
    // jsdom has no IntersectionObserver, so the warm-up asks for every plate at once.
    expect(image.getAttribute('loading')).toBe('eager');
    expect(image.getAttribute('sizes')).toBe(RITUAL_IMAGE_SIZES);
    expect(image.getAttribute('src')).toContain('/images/generated/yolculuk-2-');
  });

  test('skips unknown sets, is idempotent and tolerates a missing root', () => {
    const root = document.querySelector('#r');
    renderRitualImages(root);
    renderRitualImages(root);
    expect(root.querySelectorAll('picture')).toHaveLength(1);
    expect(() => renderRitualImages(null)).not.toThrow();
  });

  test('hides each image until it loads, then marks it loaded for the CSS fade', () => {
    renderRitualImages(document.querySelector('#r'));
    const image = document.querySelector('[data-ritual-media="yolculuk-2"] img');
    expect(image.classList.contains('is-loading')).toBe(true);
    image.dispatchEvent(new Event('load'));
    expect(image.classList.contains('is-loading')).toBe(false);
    expect(image.classList.contains('is-loaded')).toBe(true);
  });
});

describe('warmRitualImages', () => {
  const lazyRoot = () => {
    document.body.innerHTML = '<section id="w"><div data-ritual-media="yolculuk-1"><img loading="lazy"></div></section>';
    return document.querySelector('#w');
  };

  test('switches the plates to eager once the chapter is a viewport away', () => {
    const root = lazyRoot();
    let fire = null;
    let options = null;
    const win = {
      IntersectionObserver: class {
        constructor(callback, opts) {
          fire = callback;
          options = opts;
        }
        observe() {}
        disconnect() {}
      },
    };
    const stop = warmRitualImages(root, win);
    expect(options.rootMargin).toBe(WARM_MARGIN);
    const image = root.querySelector('img');
    fire([{ isIntersecting: false }]);
    expect(image.getAttribute('loading')).toBe('lazy');
    fire([{ isIntersecting: true }]);
    expect(image.getAttribute('loading')).toBe('eager');
    expect(() => stop()).not.toThrow();
  });

  test('warms at once without IntersectionObserver and ignores an empty root', () => {
    const root = lazyRoot();
    warmRitualImages(root, {});
    expect(root.querySelector('img').getAttribute('loading')).toBe('eager');
    expect(warmRitualImages(null)).toBeTypeOf('function');
  });
});

describe('fadeInOnLoad', () => {
  test('reveals a failed image too, and marks an already decoded image loaded at once', () => {
    const failed = document.createElement('img');
    fadeInOnLoad(failed);
    failed.dispatchEvent(new Event('error'));
    expect(failed.className).toBe('is-loaded');

    const cached = document.createElement('img');
    Object.defineProperty(cached, 'complete', { value: true });
    Object.defineProperty(cached, 'naturalWidth', { value: 800 });
    fadeInOnLoad(cached);
    expect(cached.className).toBe('is-loaded');
    expect(() => fadeInOnLoad(null)).not.toThrow();
  });
});
