import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const triggers = [];
vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {
    name: 'ScrollTriggerStub',
    create: vi.fn((config) => {
      const trigger = { config, kill: vi.fn(), getVelocity: () => 0, labelToScroll: vi.fn((label) => `y:${label}`) };
      triggers.push(trigger);
      return trigger;
    }),
    sort: vi.fn(),
    refresh: vi.fn(),
  },
}));
vi.mock('gsap/SplitText', () => ({
  SplitText: { name: 'SplitTextStub', create: vi.fn(() => ({ chars: [], revert: vi.fn() })) },
}));
vi.mock('gsap/DrawSVGPlugin', () => ({ DrawSVGPlugin: { name: 'drawSVG', init: () => true } }));

const { createShow, scrollShiftFor } = await import('./show.js');
const { BEAT_LABELS } = await import('./beats.js');

const html = readFileSync(`${path.resolve(process.cwd())}/index.html`, 'utf8');
const block = html.match(/<!-- OLAYLAR:START[\s\S]*?<!-- OLAYLAR:END -->/)[0];

function fakeBench({ fired = { E1: true, E2: true, E3: true, E4: true }, leak = 'pass', leakValue = 0 } = {}) {
  const instruments = Object.fromEntries(['E1', 'E2', 'E3', 'E4', 'leak'].map((id) => [id, { progress: vi.fn() }]));
  const mast = { setPose: vi.fn(), gust: vi.fn() };
  return {
    instruments,
    mastStub: mast,
    select: vi.fn(),
    instrument: (id) => instruments[id],
    snapshot: () => ({ fired, leak, leakValue }),
    mast: () => mast,
  };
}

describe('createShow', () => {
  let section;
  beforeEach(() => {
    triggers.length = 0;
    document.body.innerHTML = block;
    section = document.getElementById('olaylar');
  });
  afterEach(() => document.body.replaceChildren());

  const pinOf = () => triggers.find((t) => t.config.pin);
  const playTo = (p) => pinOf().config.animation.progress(p);

  it('pins the stage with a scrubbed timeline that snaps to the beats', () => {
    createShow({ section, bench: fakeBench() });
    const { config } = pinOf();
    expect(config.pin).toBe(section.querySelector('.rules__stage'));
    expect(config.scrub).toBeGreaterThan(0);
    expect(config.snap.snapTo).toBe('labels');
    expect(Object.keys(config.animation.labels)).toEqual(Object.keys(BEAT_LABELS));
    expect(section.dataset.show).toBe('pin');
  });

  it('prints each rule line once more under the list, hidden from assistive tech', () => {
    createShow({ section, bench: fakeBench() });
    const caption = section.querySelector('.rules__caption');
    expect(caption.getAttribute('aria-hidden')).toBe('true');
    expect([...caption.children].map((cap) => cap.dataset.rule)).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(section.querySelectorAll('.articles .rules__underline')).toHaveLength(4);
  });

  it('walks the rules with the scroll: slot, instrument, pennant', () => {
    const bench = fakeBench();
    createShow({ section, bench });
    playTo(BEAT_LABELS.E2);
    expect(bench.select).toHaveBeenLastCalledWith('E2');
    expect(bench.instruments.E2.progress).toHaveBeenLastCalledWith(1);
    expect(bench.mastStub.setPose).toHaveBeenCalledWith('E2', 1, 0);
    expect(bench.mastStub.setPose).toHaveBeenLastCalledWith('E4', 0, 0);
    expect(section.querySelector('.rules__cap[data-rule="E2"]').classList.contains('is-active')).toBe(true);
    playTo(BEAT_LABELS.E1);
    expect(bench.select).toHaveBeenLastCalledWith('E1');
  });

  it('keeps a pennant down when its rule does not fire, and dips them all when the leak acts', () => {
    const bench = fakeBench({ fired: { E1: false, E2: true, E3: true, E4: true }, leak: 'skip-or-halve', leakValue: 10 });
    createShow({ section, bench });
    playTo(BEAT_LABELS.filters);
    expect(bench.select).toHaveBeenLastCalledWith('leak');
    expect(bench.mastStub.setPose).toHaveBeenCalledWith('E1', 0, 1);
    expect(bench.mastStub.setPose).toHaveBeenCalledWith('E3', 1, 1);
    expect(bench.instruments.leak.progress).toHaveBeenLastCalledWith(1);
  });

  it('poses the bench again on a refresh (regression: a resize past the pin left the opening pose)', () => {
    const bench = fakeBench();
    createShow({ section, bench });
    playTo(1);
    // the refresh's revert draws the opening pose, then puts the playhead back without events
    playTo(0);
    pinOf().config.animation.progress(1, true);
    expect(bench.select).toHaveBeenLastCalledWith('E1');
    pinOf().config.onRefresh();
    expect(bench.select).toHaveBeenLastCalledWith('leak');
  });

  it('sends a pick to its beat through the smooth scroller', () => {
    const scroller = { scrollToY: vi.fn() };
    const show = createShow({ section, bench: fakeBench(), scroller });
    show.goTo('leak');
    expect(scroller.scrollToY).toHaveBeenCalledWith('y:filters');
    show.goTo('E3');
    expect(scroller.scrollToY).toHaveBeenLastCalledWith('y:E3');
  });

  it('tears down to the calm page', () => {
    const show = createShow({ section, bench: fakeBench() });
    show.destroy();
    triggers.forEach((trigger) => expect(trigger.kill).toHaveBeenCalled());
    expect(section.querySelector('.rules__caption')).toBeNull();
    expect(section.querySelector('.rules__underline')).toBeNull();
    expect(section.dataset.show).toBeUndefined();
  });

  it('is a no-op without a stage', () => {
    section.querySelector('.rules__stage').remove();
    const show = createShow({ section, bench: fakeBench() });
    expect(() => show.goTo('E1')).not.toThrow();
    expect(triggers).toHaveLength(0);
  });
});

describe('scrollShiftFor', () => {
  const box = (top, height) => ({ top, bottom: top + height, height });

  it('follows the growth when the chapter lies above the reader (scrolling back up)', () => {
    expect(scrollShiftFor(box(-3000, 1200), 2820, 900)).toBe(1620);
  });

  it('follows it when the head has gone and the foot is on screen (a jump to the next chapter)', () => {
    expect(scrollShiftFor(box(-1100, 1200), 2820, 900)).toBe(1620);
  });

  it('stays put when the room opens below what the reader sees', () => {
    expect(scrollShiftFor(box(2000, 1200), 2820, 900)).toBe(0); // still ahead
    expect(scrollShiftFor(box(0, 1200), 2820, 900)).toBe(0); // landed on the chapter
    expect(scrollShiftFor(box(80, 600), 2220, 900)).toBe(0); // whole chapter on screen
    expect(scrollShiftFor(box(-200, 1200), 2820, 900)).toBe(0); // reading inside it
  });
});
