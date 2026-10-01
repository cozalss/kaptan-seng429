import { describe, expect, it } from 'vitest';
import {
  DRAWERS,
  LOOP,
  PICKS,
  ROUNDS,
  STAGES,
  STILL_ELAPSED,
  TIMING,
  createFrameState,
  frameAt,
  pickLands,
  pickStart,
  revealStart,
  wrap,
  writeDrawer,
} from './model.js';

/** Elapsed seconds that land on round-local time r of round k. */
const at = (r, k = 0) => k * TIMING.round + r - TIMING.start;

describe('Kanıt model', () => {
  it('casts fictional events only, three picks each from distinct drawers', () => {
    expect(ROUNDS.length).toBeGreaterThanOrEqual(2);
    for (const round of ROUNDS) {
      expect(round.query.issuer).toMatch(/^ÖRNEK /);
      expect(round.query.code).toMatch(/^E[1-4]$/);
      expect(round.picks).toHaveLength(PICKS);
      const drawers = new Set();
      for (const pick of round.picks) {
        expect(pick.issuer).toMatch(/^ÖRNEK /);
        expect(pick.drawer).toBeGreaterThanOrEqual(0);
        expect(pick.drawer).toBeLessThan(DRAWERS);
        expect(Math.abs(pick.result)).toBeLessThanOrEqual(1);
        drawers.add(pick.drawer);
      }
      expect(drawers.size).toBe(PICKS);
    }
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(12.3, createFrameState());
    const b = frameAt(12.3 + LOOP, createFrameState());
    expect(b.cards).toEqual(a.cards);
    expect(b.query).toEqual(a.query);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
    expect(wrap(-1, 5)).toBe(4);
  });

  it('is empty at a round seam: the wipe is done before the next event comes in', () => {
    const end = frameAt(at(TIMING.round - 0.01), createFrameState());
    expect(end.fade).toBe(0);
    expect(end.query.alpha).toBe(0);
    const start = frameAt(at(0.001, 1), createFrameState());
    expect(start.cards.every((c) => c.stage === STAGES.hidden)).toBe(true);
    expect(start.drawer).toBe(-1);
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('walks each card through rise → read → flight → placed', () => {
    const state = createFrameState();
    for (let i = 0; i < PICKS; i += 1) {
      const seen = [];
      for (let r = 0; r < TIMING.round; r += 0.03) {
        frameAt(at(r), state);
        const stage = state.cards[i].stage;
        if (seen[seen.length - 1] !== stage) seen.push(stage);
      }
      expect(seen).toEqual([STAGES.hidden, STAGES.rise, STAGES.read, STAGES.flight, STAGES.placed]);
    }
  });

  it('chooses first and uncovers later: no mask moves before the choice is closed', () => {
    const state = createFrameState();
    for (let e = 0; e < LOOP; e += 0.05) {
      frameAt(e, state);
      const anyUncovered = state.cards.some((c) => c.mask > 0 || c.bar > 0);
      if (anyUncovered) {
        expect(state.close).toBe(1);
        expect(state.cards.every((c) => c.stage === STAGES.placed)).toBe(true);
      }
      // a card being read or flown is always fully covered
      for (const c of state.cards) if (c.stage !== STAGES.placed && c.stage !== STAGES.hidden) expect(c.mask).toBe(0);
    }
    expect(pickLands(PICKS - 1)).toBeLessThan(TIMING.closeAt);
    expect(TIMING.closeAt + TIMING.closeFor).toBeLessThan(revealStart(0));
  });

  it('keeps at most one drawer open, the one the card in hand came from', () => {
    const state = createFrameState();
    for (let r = 0; r < TIMING.round; r += 0.05) {
      writeDrawer(state, r, 1);
      if (state.drawer >= 0) expect(ROUNDS[1].picks.map((p) => p.drawer)).toContain(state.drawer);
      expect(state.open).toBeGreaterThanOrEqual(0);
      expect(state.open).toBeLessThanOrEqual(1);
    }
    writeDrawer(state, pickStart(1) + TIMING.drawerOut + 0.1, 1);
    expect(state.drawer).toBe(ROUNDS[1].picks[1].drawer);
    expect(state.open).toBe(1);
  });

  it('lifts the masks one by one and inks the summary last', () => {
    for (let j = 1; j < PICKS; j += 1) expect(revealStart(j)).toBeGreaterThan(revealStart(j - 1) + TIMING.rod + TIMING.unmask);
    const done = frameAt(at(TIMING.sumAt + TIMING.sumFor + 0.1));
    expect(done.cards.every((c) => c.mask === 1 && c.bar === 1)).toBe(true);
    expect(done.sum).toBe(1);
    expect(done.crank).toBeCloseTo(Math.PI * 2, 5);
  });

  it('prints a still with the choice closed and the code at work', () => {
    const still = frameAt(STILL_ELAPSED);
    expect(still.close).toBe(1);
    expect(still.cards[0].mask).toBe(1);
    expect(still.cards[2].mask).toBe(0);
  });
});
