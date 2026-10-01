import { describe, expect, test, vi } from 'vitest';
import { createPageTurn } from './page-turn.js';
import { PHASE, buildStripTimeline, spreadOwnsPin, turnProgressAt } from './strip-timeline.js';

const OPEN_AT = (PHASE.TURN_AT + PHASE.TURN) / PHASE.TOTAL;

function stage(options = {}) {
  document.body.innerHTML = `
    <div data-strip><ul data-track></ul></div>
    <div data-book><div data-leaf></div></div>`;
  const q = (s) => document.querySelector(s);
  const leaf = q('[data-leaf]');
  const book = q('[data-book]');
  const turn = createPageTurn({ leaf, book });
  const frames = [];
  const tl = buildStripTimeline(
    { strip: q('[data-strip]'), track: q('[data-track]'), ink: null },
    turn,
    () => 1000,
    { onFrame: (state) => frames.push(state), ...options },
  );
  return { tl, leaf, book, frames, turn };
}

describe('turnProgressAt', () => {
  test('is closed through the travel and the card hold, open once the turn is done', () => {
    expect(turnProgressAt(0)).toBe(0);
    expect(turnProgressAt(PHASE.TRAVEL)).toBe(0);
    expect(turnProgressAt(PHASE.TURN_AT)).toBe(0);
    expect(turnProgressAt(PHASE.TURN_AT + PHASE.TURN / 2)).toBeCloseTo(0.5, 6);
    expect(turnProgressAt(PHASE.TURN_AT + PHASE.TURN)).toBe(1);
    expect(turnProgressAt(PHASE.TOTAL)).toBe(1);
  });

  test('eases in and out (slow lift, faster fall, slow landing)', () => {
    const quarter = turnProgressAt(PHASE.TURN_AT + PHASE.TURN / 4);
    expect(quarter).toBeLessThan(0.25);
    expect(turnProgressAt(PHASE.TURN_AT + (PHASE.TURN * 3) / 4)).toBeCloseTo(1 - quarter, 6);
  });
});

describe('spreadOwnsPin', () => {
  test('hands the pin to the spread only once the leaf has passed upright', () => {
    expect(spreadOwnsPin(PHASE.TRAVEL)).toBe(false);
    expect(spreadOwnsPin(PHASE.TURN_AT + PHASE.TURN * 0.2)).toBe(false);
    expect(spreadOwnsPin(PHASE.TURN_AT + PHASE.TURN * 0.51)).toBe(true);
    expect(spreadOwnsPin(PHASE.TOTAL)).toBe(true);
  });
});

describe('buildStripTimeline (regression: the leaf must never fall shut past the turn)', () => {
  test('the leaf lies open at every progress after the turn, scrubbing forwards and backwards', () => {
    const { tl, leaf, book } = stage();
    const after = [];
    for (let p = OPEN_AT; p <= 1.0001; p += 0.01) after.push(Math.min(p, 1));
    // forwards, then a wild scrub: back to the start, forwards past the turn, backwards and on
    const path = [...after, 0, 0.3, ...after, 0.2, OPEN_AT + 0.05, 1, OPEN_AT, 0.95];
    path.forEach((p) => {
      tl.progress(p);
      if (p >= OPEN_AT - 1e-9) {
        expect(leaf.style.transform, `progress ${p.toFixed(3)}`).toBe('rotateY(0.00deg)');
        expect(book.classList.contains('is-closed'), `progress ${p.toFixed(3)}`).toBe(false);
      }
    });
  });

  test('a stray render of the turn state (GSAP _startAt) is overwritten on the next frame', () => {
    const { tl, leaf, book, turn } = stage();
    tl.progress(0.95);
    // what the old fromTo's _startAt did mid-climax: progress 0 rendered behind the playhead
    turn.state.progress = 0;
    turn.apply();
    tl.progress(0.951);
    expect(leaf.style.transform).toBe('rotateY(0.00deg)');
    expect(book.classList.contains('is-closed')).toBe(false);
  });

  test('the leaf is closed before the turn and while the cards hold', () => {
    const { tl, leaf, book } = stage();
    tl.progress(1);
    tl.progress(PHASE.TURN_AT / PHASE.TOTAL - 0.001);
    expect(leaf.style.transform).toBe('rotateY(180.00deg)');
    expect(book.classList.contains('is-closed')).toBe(true);
  });

  test('reports every frame with the time and whether the spread owns the pin', () => {
    const { tl, frames } = stage();
    tl.progress(0.2);
    tl.progress(1);
    expect(frames.at(-1).time).toBeCloseTo(PHASE.TOTAL, 9);
    expect(frames.at(-1).spread).toBe(true);
    expect(frames.some((f) => f.spread === false)).toBe(true);
  });
});

describe('buildStripTimeline (regression: a refresh past the pin left the leaf shut)', () => {
  test('each refresh of the pin redraws the leaf from the playhead', () => {
    const onRefresh = vi.fn();
    const { tl, leaf, book, turn } = stage({ scrollTrigger: { onRefresh } });
    tl.progress(1);
    // what ScrollTrigger's refresh leaves behind: the timeline reverted and its playhead put back
    // with events suppressed, so no onUpdate redraws the leaf
    turn.state.progress = 0;
    turn.apply();
    tl.vars.scrollTrigger.onRefresh({});
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(leaf.style.transform).toBe('rotateY(0.00deg)');
    expect(book.classList.contains('is-closed')).toBe(false);
  });
});
