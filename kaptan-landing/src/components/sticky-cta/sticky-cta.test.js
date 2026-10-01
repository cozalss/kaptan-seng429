import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initStickyCta, nextScrollIntent, QUIET_SELECTOR, DIRECTION_SLOP_PX } from './sticky-cta.js';

class FakeIntersectionObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(target) {
    this.target = target;
    this.targets = [...(this.targets ?? []), target];
  }
  disconnect() {
    this.disconnected = true;
  }
  emit(isIntersecting, target = this.target) {
    this.callback([{ isIntersecting, target }]);
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  document.body.replaceChildren();
  const hero = Object.assign(document.createElement('section'), { id: 'hero' });
  const root = document.createElement('aside');
  root.dataset.stickyCta = '';
  const demo = document.createElement('button');
  demo.dataset.action = 'open-demo';
  const agents = Object.assign(document.createElement('a'), { href: '#ajanlar' });
  agents.dataset.scrollTo = '#ajanlar';
  root.append(demo, agents);
  const overlays = Object.assign(document.createElement('div'), { id: 'overlays' });
  document.body.append(hero, root, overlays);
  return { hero, root, overlays };
}

describe('initStickyCta', () => {
  let dom;
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    dom = setup();
  });
  afterEach(() => document.body.replaceChildren());

  function init() {
    return initStickyCta({ ...dom, IntersectionObserverImpl: FakeIntersectionObserver });
  }

  it('starts hidden and inert while the hero may be on screen', () => {
    const cta = init();
    expect(cta.isVisible()).toBe(false);
    expect(dom.root.dataset.visible).toBe('false');
    expect(dom.root.inert).toBe(true);
  });

  it('shows once the hero leaves the viewport and hides when it returns', () => {
    const cta = init();
    const observer = FakeIntersectionObserver.instances[0];
    expect(observer.target).toBe(dom.hero);
    observer.emit(false);
    expect(cta.isVisible()).toBe(true);
    expect(dom.root.dataset.visible).toBe('true');
    expect(dom.root.inert).toBe(false);
    observer.emit(true);
    expect(dom.root.dataset.visible).toBe('false');
  });

  it('hides while any overlay is open', async () => {
    init();
    FakeIntersectionObserver.instances[0].emit(false);
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.dataset.state = 'closed';
    dom.overlays.append(overlay);
    await flush();
    expect(dom.root.dataset.visible).toBe('true');
    overlay.dataset.state = 'open';
    await flush();
    expect(dom.root.dataset.visible).toBe('false');
    overlay.dataset.state = 'closed';
    await flush();
    expect(dom.root.dataset.visible).toBe('true');
  });

  it('stays out of the way while a quiet zone (the rules bench) is on screen', () => {
    const bench = document.createElement('section');
    const other = document.createElement('section');
    document.body.append(bench, other);
    const cta = initStickyCta({ ...dom, quiet: [bench, other], IntersectionObserverImpl: FakeIntersectionObserver });
    const [heroObserver, quietObserver] = FakeIntersectionObserver.instances;
    expect(quietObserver.targets).toEqual([bench, other]);
    heroObserver.emit(false);
    expect(cta.isVisible()).toBe(true);
    quietObserver.emit(true, bench);
    quietObserver.emit(true, other);
    expect(cta.isVisible()).toBe(false);
    expect(dom.root.inert).toBe(true);
    quietObserver.emit(false, bench);
    expect(cta.isVisible()).toBe(false);
    quietObserver.emit(false, other);
    expect(cta.isVisible()).toBe(true);
    cta.destroy();
    expect(quietObserver.disconnected).toBe(true);
  });

  it('falls back to a scroll check without IntersectionObserver', () => {
    dom.hero.getBoundingClientRect = () => ({ bottom: -10 });
    const cta = initStickyCta({ ...dom, IntersectionObserverImpl: undefined });
    expect(cta.isVisible()).toBe(true);
    cta.destroy();
  });

  it('never builds a messaging link: the bar only holds the demo action and the agents link', () => {
    init();
    expect(dom.root.querySelector('[href*="wa.me"]')).toBeNull();
    expect(dom.root.querySelector('[data-action="open-demo"]')).not.toBeNull();
  });

  it('is a no-op without its root element', () => {
    const cta = initStickyCta({ root: null });
    expect(cta.isVisible()).toBe(false);
    expect(() => cta.destroy()).not.toThrow();
  });

  it('destroy disconnects the observers', () => {
    const cta = init();
    cta.destroy();
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
  });
});

describe('nextScrollIntent', () => {
  it('flips to reading (down) only after more than the slop', () => {
    const start = { anchorY: 100, up: true };
    expect(nextScrollIntent(start, 100 + DIRECTION_SLOP_PX)).toEqual(start);
    expect(nextScrollIntent(start, 101 + DIRECTION_SLOP_PX)).toEqual({ anchorY: 101 + DIRECTION_SLOP_PX, up: false });
  });

  it('follows the extreme while the direction holds, then flips back up past the slop', () => {
    let s = { anchorY: 0, up: false };
    s = nextScrollIntent(s, 500);
    expect(s).toEqual({ anchorY: 500, up: false });
    s = nextScrollIntent(s, 495);
    expect(s.up).toBe(false);
    s = nextScrollIntent(s, 480);
    expect(s).toEqual({ anchorY: 480, up: true });
    s = nextScrollIntent(s, 300);
    expect(s).toEqual({ anchorY: 300, up: true });
  });
});

describe('initStickyCta scroll intent', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
  });

  it('quiets #ajanlar, the rules bench and in-section ink buttons by default', () => {
    expect(QUIET_SELECTOR).toContain('#ajanlar');
    expect(QUIET_SELECTOR).toContain('[data-sticky-quiet]');
    expect(QUIET_SELECTOR).toContain('main .pill');
  });

  it('hides while the reader scrolls down and returns when they scroll up', () => {
    const dom = setup();
    const scroller = new EventTarget();
    scroller.scrollY = 0;
    const cta = initStickyCta({ ...dom, scrollTarget: scroller, IntersectionObserverImpl: FakeIntersectionObserver });
    FakeIntersectionObserver.instances[0].emit(false);
    expect(cta.isVisible()).toBe(true);
    scroller.scrollY = 400;
    scroller.dispatchEvent(new Event('scroll'));
    expect(cta.isVisible()).toBe(false);
    expect(dom.root.inert).toBe(true);
    scroller.scrollY = 300;
    scroller.dispatchEvent(new Event('scroll'));
    expect(cta.isVisible()).toBe(true);
    cta.destroy();
    scroller.scrollY = 900;
    scroller.dispatchEvent(new Event('scroll'));
    expect(cta.isVisible()).toBe(true);
  });
});
