import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE_DURATION_MS, cardParts, createDetailMotion, motionMode, whenImageReady } from './service-modal-motion.js';

function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
}

function placeAt(el, box) {
  el.getBoundingClientRect = () => box;
}

/** A window double: viewport size plus the media queries that decide the mode. */
function fakeWindow({ reduced = false, sheet = false } = {}) {
  return {
    innerWidth: 1440,
    innerHeight: 900,
    getComputedStyle: (el) => window.getComputedStyle(el),
    matchMedia: (query) => ({ matches: (query.includes('reduce') && reduced) || (query.includes('max-width') && sheet) }),
  };
}

function markLoaded(img) {
  Object.defineProperty(img, 'complete', { value: true, configurable: true });
  Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('motionMode', () => {
  it('prefers reduced motion, then the phone sheet, then the desktop page', () => {
    expect(motionMode(fakeWindow({ reduced: true, sheet: true }))).toBe('reduced');
    expect(motionMode(fakeWindow({ sheet: true }))).toBe('sheet');
    expect(motionMode(fakeWindow())).toBe('page');
  });

  it('falls back to the page mode without matchMedia', () => {
    expect(motionMode({})).toBe('page');
  });
});

describe('cardParts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the plate, its photo and the name, or null without a photo', () => {
    document.body.innerHTML = `
      <button id="a"><span class="service-card__media"><img></span><span class="service-card__name">X</span></button>
      <button id="b"><span class="service-card__media"></span></button>`;
    const parts = cardParts(document.getElementById('a'));
    expect(parts.plate.className).toBe('service-card__media');
    expect(parts.img.tagName).toBe('IMG');
    expect(parts.name.textContent).toBe('X');
    expect(cardParts(document.getElementById('b'))).toBeNull();
    expect(cardParts(undefined)).toBeNull();
  });
});

describe('whenImageReady', () => {
  it('resolves at once for a loaded image', async () => {
    const img = document.createElement('img');
    markLoaded(img);
    await expect(whenImageReady(img)).resolves.toBeUndefined();
  });

  it('waits for decode(), swallowing a decode failure', async () => {
    const img = document.createElement('img');
    img.decode = vi.fn(() => Promise.reject(new Error('broken')));
    await expect(whenImageReady(img)).resolves.toBeUndefined();
    expect(img.decode).toHaveBeenCalled();
  });

  it('falls back to the load event, or gives up after the timeout', async () => {
    const loading = document.createElement('img');
    loading.decode = undefined;
    const loaded = whenImageReady(loading, 10_000);
    loading.dispatchEvent(new Event('load'));
    await expect(loaded).resolves.toBeUndefined();

    vi.useFakeTimers();
    const stuck = document.createElement('img');
    stuck.decode = () => new Promise(() => {});
    const gaveUp = whenImageReady(stuck, 50);
    vi.advanceTimersByTime(50);
    await expect(gaveUp).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('createDetailMotion', () => {
  let parts;
  let card;
  let cardBox;
  let cardName;
  let main;
  let motion;

  function build(win = fakeWindow()) {
    motion = createDetailMotion({ ...parts, win });
    return motion;
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <main id="main">
        <button class="service-card">
          <span class="service-card__media"><img src="/card.jpg"></span>
          <span class="service-card__name">Kanıt</span>
        </button>
        <button class="other-card"><span class="service-card__media"><img src="/other.jpg"></span></button>
      </main>
      <div class="overlay">
        <div class="overlay__scrim"></div>
        <div class="overlay__panel">
          <button class="overlay__close"></button>
          <picture class="service-modal__media"><img class="service-modal__image" src="/detail.jpg"></picture>
          <h2><span class="line">Kanıt</span></h2><p class="label"></p><p class="meta"></p>
          <p class="description">Uzun bir açıklama.</p><p class="caption"></p><button class="cta"></button>
        </div>
      </div>`;
    main = document.getElementById('main');
    card = document.querySelector('.service-card');
    cardBox = card.querySelector('.service-card__media');
    cardName = card.querySelector('.service-card__name');
    placeAt(cardBox, rect(600, 300, 210, 280));
    placeAt(cardBox.querySelector('img'), rect(600, 300, 210, 280));
    placeAt(cardName, rect(600, 600, 120, 40));
    placeAt(document.querySelector('.other-card .service-card__media'), rect(900, 300, 210, 280));
    placeAt(main, rect(0, -2000, 1440, 9000));
    const title = document.querySelector('.line');
    placeAt(title, rect(800, 100, 300, 100));
    const media = document.querySelector('.service-modal__media');
    placeAt(media, rect(40, 60, 600, 800));
    const image = document.querySelector('.service-modal__image');
    markLoaded(image);
    parts = {
      panel: document.querySelector('.overlay__panel'),
      scrim: document.querySelector('.overlay__scrim'),
      media,
      image,
      title,
      head: [document.querySelector('.overlay__close'), document.querySelector('.label')],
      meta: document.querySelector('.meta'),
      description: document.querySelector('.description'),
      caption: document.querySelector('.caption'),
      cta: document.querySelector('.cta'),
    };
  });

  afterEach(() => {
    motion?.destroy();
    motion = null;
  });

  const plate = () => document.querySelector('.service-modal-ghost--plate');
  const nameGhost = () => document.querySelector('.service-modal-ghost--name');
  const edge = () => document.querySelector('.service-modal__edge');

  it('keeps the exit shorter than the overlay hide delay', () => {
    expect(CLOSE_DURATION_MS).toBeGreaterThanOrEqual(900);
  });

  it('adds the page edge beside the panel, hidden at rest, and removes it on destroy', () => {
    build();
    expect(edge().getAttribute('aria-hidden')).toBe('true');
    expect(edge().style.visibility).toBe('hidden');
    motion.destroy();
    expect(edge()).toBeNull();
  });

  it('page mode: lifts the plate and name off the card and sets them down on the detail page', async () => {
    build();
    const tl = motion.open(card);

    expect(plate().getAttribute('aria-hidden')).toBe('true');
    expect(plate().querySelector('img').src).toContain('/card.jpg');
    // laid out at the detail plate, posed over the card by transform alone
    expect(plate().style.left).toBe('40px');
    expect(plate().style.width).toBe('600px');
    expect(Number(gsap.getProperty(plate(), 'scaleX'))).toBeCloseTo(0.35);
    expect(Number(gsap.getProperty(plate(), 'x'))).toBeCloseTo(705 - 340);
    expect(nameGhost().textContent).toBe('Kanıt');
    expect(cardBox.style.visibility).toBe('hidden');
    expect(cardName.style.visibility).toBe('hidden');
    expect(parts.media.style.visibility).toBe('hidden');
    expect(parts.title.style.visibility).toBe('hidden');
    expect(parts.panel.style.clipPath).toContain('100%');

    tl.time(0.35);
    expect(Number(gsap.getProperty(main, 'scale'))).toBeLessThan(1);
    expect(plate().style.boxShadow).toMatch(/^\d/); // lifted: a hard shadow

    tl.progress(1);
    expect(Number(gsap.getProperty(plate() ?? parts.media, 'x'))).toBe(0);
    expect(main.hasAttribute('style')).toBe(false); // the covered page is left untransformed
    await flush();
    expect(plate()).toBeNull();
    expect(nameGhost()).toBeNull();
    expect(parts.media.style.visibility).toBe('');
    expect(parts.title.style.visibility).toBe('');
    expect(cardBox.style.visibility).toBe('hidden'); // until the detail closes back onto it
    expect(edge().style.visibility).toBe('hidden');
  });

  it('page mode: without a visible card the plate uncovers in place and the title rises', () => {
    placeAt(cardBox, rect(600, 1200, 210, 280)); // below the fold
    build();
    const tl = motion.open(card);
    expect(plate()).toBeNull();
    expect(nameGhost()).toBeNull();
    expect(parts.media.style.clipPath).toContain('100%');
    tl.progress(1);
    expect(parts.media.style.clipPath).toBe('inset(0% 0% 0% 0%)');
    expect(cardBox.style.visibility).toBe('');
  });

  it('sheet mode: measures the plate before the sheet drops, then slides it up', () => {
    build(fakeWindow({ sheet: true }));
    const tl = motion.open(card);
    expect(plate()).not.toBeNull();
    expect(parts.panel.style.transform).toContain('100%');
    tl.progress(1);
    expect(Number(gsap.getProperty(parts.panel, 'yPercent'))).toBe(0);
  });

  it('reduced motion: a plain fade, no ghosts and no page transform', () => {
    build(fakeWindow({ reduced: true }));
    const tl = motion.open(card);
    expect(plate()).toBeNull();
    expect(parts.panel.style.opacity).toBe('0');
    tl.progress(1);
    expect(parts.panel.style.opacity).toBe('1');
    expect(main.style.transform).toBe('');

    const out = motion.close();
    expect(plate()).toBeNull();
    out.progress(1);
    expect(parts.panel.style.opacity).toBe('0');
  });

  it('close: lifts the plate off the detail page and sets it down exactly on the card', async () => {
    build();
    motion.open(card).progress(1);
    await flush();
    const tl = motion.close();

    expect(plate().querySelector('img').src).toContain('/detail.jpg');
    expect(parts.media.style.visibility).toBe('hidden');
    tl.progress(0.5);
    expect(Number(gsap.getProperty(main, 'scale'))).toBeLessThan(1);
    tl.progress(1);
    expect(plate()).toBeNull();
    expect(cardBox.style.visibility).toBe('');
    expect(cardName.style.visibility).toBe('');
    expect(main.hasAttribute('style')).toBe(false);
    expect(parts.panel.style.clipPath).toContain('100%');
  });

  it('close lands the ghost on the card pose before it is removed', async () => {
    build();
    motion.open(card).progress(1);
    await flush();
    const tl = motion.close();
    const ghost = plate();
    tl.progress(0.99);
    expect(Number(gsap.getProperty(ghost, 'scaleX'))).toBeCloseTo(0.35, 1);
  });

  it('close mid-open carries on with the ghosts in flight', () => {
    build();
    motion.open(card).progress(0.4);
    const inFlight = plate();
    const tl = motion.close();
    expect(plate()).toBe(inFlight);
    tl.progress(1);
    expect(inFlight.isConnected).toBe(false);
    expect(main.hasAttribute('style')).toBe(false);
  });

  it('reopening the same card mid-close turns the same ghosts round', () => {
    build();
    motion.open(card).progress(1);
    motion.close().progress(0.3);
    const inFlight = plate();
    motion.open(card);
    expect(plate()).toBe(inFlight);
    expect(document.querySelectorAll('.service-modal-ghost--plate')).toHaveLength(1);
    expect(cardBox.style.visibility).toBe('hidden');
  });

  it('opening another card mid-close restores the first card and lifts the new one', () => {
    build();
    motion.open(card).progress(1);
    motion.close().progress(0.3);
    const other = document.querySelector('.other-card');
    motion.open(other);
    expect(cardBox.style.visibility).toBe('');
    expect(document.querySelectorAll('.service-modal-ghost--plate')).toHaveLength(1);
    expect(plate().querySelector('img').src).toContain('/other.jpg');
  });

  it('close with fade (hand-off to the next section) skips the morph', () => {
    build();
    motion.open(card).progress(1);
    const tl = motion.close({ fade: true });
    expect(plate()).toBeNull();
    expect(cardBox.style.visibility).toBe('');
    tl.progress(1);
    expect(parts.panel.style.opacity).toBe('0');
  });

  it('close fade also returns a page still scaled mid-open to rest', () => {
    build();
    motion.open(card).progress(0.4);
    const tl = motion.close({ fade: true });
    tl.progress(1);
    expect(main.hasAttribute('style')).toBe(false);
  });

  it('close with the card scrolled away just turns the page back', () => {
    build();
    motion.open(card).progress(1);
    placeAt(cardBox, rect(-500, 300, 210, 280));
    const tl = motion.close();
    expect(plate()).toBeNull();
    expect(parts.media.style.visibility).toBe('');
    tl.progress(1);
    expect(cardBox.style.visibility).toBe('');
  });

  it('a close without any open still turns the page away', () => {
    build();
    const tl = motion.close();
    expect(plate()).toBeNull();
    tl.progress(1);
    expect(parts.panel.style.clipPath).toContain('100%');
  });

  it('sheet close slides the page back down', () => {
    build(fakeWindow({ sheet: true }));
    motion.open(card).progress(1);
    motion.close().progress(1);
    expect(Number(gsap.getProperty(parts.panel, 'yPercent'))).toBe(100);
  });

  it('a landing superseded by a close leaves the ghost to the close', async () => {
    build();
    motion.open(card).progress(1);
    motion.close();
    await flush();
    expect(parts.media.style.visibility).toBe('hidden');
    expect(plate()).not.toBeNull();
  });

  it('works without a #main page element', () => {
    main.remove();
    build();
    motion.open(card).progress(1);
    motion.close().progress(1);
    expect(plate()).toBeNull();
  });

  it('destroy() removes the ghosts in flight and restores the card', () => {
    build();
    motion.open(card).progress(0.3);
    motion.destroy();
    expect(plate()).toBeNull();
    expect(nameGhost()).toBeNull();
    expect(cardBox.style.visibility).toBe('');
  });
});
