import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTICLE_IDS, mountBench, readFilter } from './bench.js';
import { PENNANT_STATES } from './rules-check.js';

const html = readFileSync(`${path.resolve(process.cwd())}/index.html`, 'utf8');
const block = html.match(/<!-- OLAYLAR:START[\s\S]*?<!-- OLAYLAR:END -->/)[0];
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

class FakeIO {
  static all = [];
  constructor(callback, options) {
    Object.assign(this, { callback, options, targets: new Set(), disconnected: false });
    FakeIO.all.push(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }
  see(target) {
    if (this.targets.has(target)) this.callback([{ isIntersecting: true, target }]);
  }
}

function fakeParts() {
  const log = { instruments: new Map(), masts: [] };
  const parts = {
    createInstrument: vi.fn(({ host, rule, onChange, reduced }) => {
      const instrument = { host, rule, reduced, onChange, autoplay: vi.fn(() => Promise.resolve()), set: vi.fn(), destroy: vi.fn() };
      log.instruments.set(rule, instrument);
      return instrument;
    }),
    createMast: vi.fn(() => {
      const mast = { states: {}, setState: vi.fn((id, state) => (mast.states[id] = state)), destroy: vi.fn() };
      log.masts.push(mast);
      return mast;
    }),
  };
  return { parts, log };
}

// All instruments share one onChange; the screen has no host on the page any more, so it reports through E1's.
const fire = (log, rule, event) => (log.instruments.get(rule) ?? log.instruments.get('E1')).onChange({ rule, ...event });

describe('readFilter', () => {
  it('reads the instrument result first, then the value or fired', () => {
    expect(readFilter({ rule: 'leak', result: 'skip-or-halve' })).toEqual({ leak: 'skip-or-halve' });
    expect(readFilter({ rule: 'leak', result: 'pass', value: 2 })).toEqual({ leak: 'pass' });
    expect(readFilter({ rule: 'leak', value: 9 })).toEqual({ leak: 'skip-or-halve' });
    expect(readFilter({ rule: 'screen', result: { pass: false, failed: ['tradable'] } })).toEqual({ screened: false });
    expect(readFilter({ rule: 'screen', fired: true })).toEqual({ screened: false });
    expect(readFilter({ rule: 'screen', fired: false })).toEqual({ screened: true });
  });
});

describe('mountBench', () => {
  let section;
  beforeEach(() => {
    FakeIO.all = [];
    document.body.innerHTML = block;
    section = document.getElementById('olaylar');
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  const mount = ({ reduced = false } = {}) => {
    const { parts, log } = fakeParts();
    const bench = mountBench({ section, reduced, parts, IntersectionObserverImpl: FakeIO, wait: () => Promise.resolve() });
    return { bench, log, parts };
  };
  const seeBench = () => FakeIO.all.forEach((observer) => observer.see(section.querySelector('.articles')));
  const shown = () => section.querySelector('.rules__slot .is-active')?.dataset.instrument;

  it('creates one mast and an instrument per slot host, passing reduced motion on', () => {
    const { log, parts } = mount({ reduced: true });
    expect(log.masts).toHaveLength(1);
    expect([...log.instruments.keys()]).toEqual(['E1', 'E2', 'E3', 'E4', 'leak']);
    parts.createInstrument.mock.calls.forEach(([options]) => expect(options.reduced).toBe(true));
    expect(Object.values(log.masts[0].states)).toEqual(['down', 'down', 'down', 'down']);
  });

  it('hoists a pennant when its rule fires and lowers it when it stops', () => {
    const { log, bench } = mount();
    fire(log, 'E1', { fired: true, value: 0.31 });
    expect(log.masts[0].states.E1).toBe('hoisted');
    expect(section.querySelector('#madde-e1').dataset.pennantState).toBe('hoisted');
    fire(log, 'E1', { fired: false, value: 0.19 });
    expect(bench.states()).toEqual({ E1: 'down', E2: 'down', E3: 'down', E4: 'down' });
  });

  it('only sends a state when it changes', () => {
    const { log } = mount();
    const before = log.masts[0].setState.mock.calls.length;
    fire(log, 'E2', { fired: true });
    fire(log, 'E2', { fired: true });
    expect(log.masts[0].setState.mock.calls.length - before).toBe(1);
  });

  it('lets the filters lower hoisted pennants and never raise one', () => {
    const { log, bench } = mount();
    fire(log, 'E1', { fired: true });
    fire(log, 'E3', { fired: true });
    fire(log, 'leak', { value: 11, result: 'skip-or-halve' });
    expect(bench.states()).toEqual({ E1: 'half', E2: 'down', E3: 'half', E4: 'down' });
    fire(log, 'screen', { fired: true, result: { pass: false, failed: ['noMeasure'] } });
    expect(bench.states()).toEqual({ E1: 'folded', E2: 'down', E3: 'folded', E4: 'down' });
    fire(log, 'screen', { fired: false, result: { pass: true, failed: [] } });
    fire(log, 'leak', { value: 2, result: 'pass' });
    expect(bench.states()).toEqual({ E1: 'hoisted', E2: 'down', E3: 'hoisted', E4: 'down' });
  });

  it('property: no sequence of filter moves lifts a pennant above what its rule allows', () => {
    const { log, bench } = mount();
    const rank = (state) => PENNANT_STATES.indexOf(state);
    const lastFired = Object.fromEntries(ARTICLE_IDS.map((id) => [id, false]));
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let step = 0; step < 400; step += 1) {
      const pick = random();
      if (pick < 0.4) {
        const id = ARTICLE_IDS[Math.floor(random() * 4)];
        lastFired[id] = random() > 0.5;
        fire(log, id, { fired: lastFired[id] });
      } else if (pick < 0.7) {
        fire(log, 'leak', { value: random() * 16 });
      } else {
        const pass = random() > 0.5;
        fire(log, 'screen', { fired: !pass, result: { pass, failed: pass ? [] : ['tradable'] } });
      }
      const states = bench.states();
      ARTICLE_IDS.forEach((id) => {
        expect(log.masts[0].states[id]).toBe(states[id]);
        if (!lastFired[id]) expect(states[id]).toBe('down');
        else expect(rank(states[id])).toBeLessThanOrEqual(rank('hoisted'));
      });
    }
  });

  it('ignores unknown or empty reports', () => {
    const { log, bench } = mount();
    log.instruments.get('E1').onChange(undefined);
    log.instruments.get('E1').onChange({ rule: 'E9', fired: true });
    expect(bench.states().E1).toBe('down');
  });

  it('steps through E1 → E4 once when the bench is first seen, each in the slot as it plays', async () => {
    const { log, bench } = mount();
    const order = [];
    ARTICLE_IDS.forEach((id) =>
      log.instruments.get(id).autoplay.mockImplementation(() => {
        order.push([id, shown()]);
        return Promise.resolve();
      }),
    );
    seeBench();
    seeBench();
    await flush();
    expect(order).toEqual([['E1', 'E1'], ['E2', 'E2'], ['E3', 'E3'], ['E4', 'E4']]);
    expect(bench.current()).toBe('E4');
    expect(log.instruments.get('leak').autoplay).not.toHaveBeenCalled();
  });

  it('stops the tour as soon as the visitor touches the bench, and plays what they pick', async () => {
    const { log } = mount();
    seeBench();
    section.querySelector('.rules__bench').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flush();
    expect(log.instruments.get('E2').autoplay).not.toHaveBeenCalled();
    section.querySelector('#madde-e3 .article__toggle').click();
    await flush();
    expect(shown()).toBe('E3');
    expect(log.instruments.get('E3').autoplay).toHaveBeenCalledTimes(1);
  });

  it('prints every rule fired at once under reduced motion, keeping E1 in the slot', async () => {
    const { log } = mount({ reduced: true });
    seeBench();
    await flush();
    ARTICLE_IDS.forEach((id) => expect(log.instruments.get(id).autoplay).toHaveBeenCalledTimes(1));
    expect(shown()).toBe('E1');
  });

  it('runs the leak what-if from its button and puts the line back at rest on leaving', async () => {
    const { log } = mount();
    section.querySelector('[data-show="leak"]').click();
    await flush();
    expect(shown()).toBe('leak');
    expect(log.instruments.get('leak').autoplay).toHaveBeenCalledTimes(1);
    section.querySelector('#madde-e2 .article__toggle').click();
    expect(log.instruments.get('leak').set).toHaveBeenCalledWith(0);
  });

  it('survives a part that throws and a rejected autoplay', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { parts, log } = fakeParts();
    parts.createMast.mockImplementation(() => {
      throw new Error('no canvas');
    });
    const bench = mountBench({ section, parts, IntersectionObserverImpl: FakeIO, wait: () => Promise.resolve() });
    log.instruments.get('E1').autoplay.mockImplementation(() => Promise.reject(new Error('boom')));
    seeBench();
    await flush();
    fire(log, 'E1', { fired: true });
    expect(bench.states().E1).toBe('hoisted');
    expect(warn).toHaveBeenCalled();
  });

  it('plays at once without IntersectionObserver', async () => {
    const { parts, log } = fakeParts();
    mountBench({ section, parts, IntersectionObserverImpl: undefined, wait: () => Promise.resolve() });
    await flush();
    expect(log.instruments.get('E4').autoplay).toHaveBeenCalled();
  });

  it('tears everything down', () => {
    const { log, bench } = mount();
    fire(log, 'E1', { fired: true });
    bench.destroy();
    log.instruments.forEach((instrument) => expect(instrument.destroy).toHaveBeenCalled());
    expect(log.masts[0].destroy).toHaveBeenCalled();
    expect(FakeIO.all.every((observer) => observer.disconnected)).toBe(true);
    expect(section.querySelector('#madde-e1').dataset.pennantState).toBeUndefined();
    expect(section.querySelector('.article__toggle')).toBeNull();
  });

  it('pose mode: no tour, no timed hoists; picks go to onPick and the scroll reads a snapshot', async () => {
    const { parts, log } = fakeParts();
    const onPick = vi.fn();
    const bench = mountBench({ section, parts, mode: 'pose', hero: true, onPick, IntersectionObserverImpl: FakeIO, wait: () => Promise.resolve() });
    expect(parts.createMast.mock.calls[0][0].hero).toBe(true);
    seeBench();
    await flush();
    expect(log.instruments.get('E1').autoplay).not.toHaveBeenCalled();
    const before = log.masts[0].setState.mock.calls.length;
    fire(log, 'E1', { fired: true });
    fire(log, 'leak', { value: 9, result: 'skip-or-halve' });
    expect(log.masts[0].setState.mock.calls.length).toBe(before);
    expect(bench.states().E1).toBe('half');
    expect(bench.snapshot()).toMatchObject({ fired: { E1: true, E2: false }, leak: 'skip-or-halve', leakValue: 9 });
    expect(bench.instrument('E3')).toBe(log.instruments.get('E3'));
    expect(bench.mast()).toBe(log.masts[0]);
    section.querySelector('#madde-e3 .article__toggle').click();
    expect(onPick).toHaveBeenCalledWith('E3');
    expect(log.instruments.get('E3').autoplay).not.toHaveBeenCalled();
    bench.select('E4');
    expect(bench.current()).toBe('E4');
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without a section', () => {
    const { parts } = fakeParts();
    const bench = mountBench({ section: null, parts });
    expect(bench.states()).toEqual({});
    expect(bench.current()).toBeNull();
    expect(bench.snapshot()).toEqual({});
    expect(bench.instrument('E1')).toBeNull();
    expect(bench.mast()).toBeNull();
    expect(() => bench.select('E1')).not.toThrow();
    expect(() => bench.destroy()).not.toThrow();
  });
});
