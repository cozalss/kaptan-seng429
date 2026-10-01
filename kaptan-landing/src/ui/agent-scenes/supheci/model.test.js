import { describe, expect, it } from 'vitest';
import {
  CAST,
  LOOP,
  SPOTS,
  STAGES,
  STILL_ELAPSED,
  TIMING,
  createFrameState,
  focusAt,
  frameAt,
  slipClock,
  wrap,
} from './model.js';

/** Elapsed time at which slip k is at local time u. */
const at = (k, u) => k * TIMING.period + u + TIMING.start;

describe('Şüpheci model', () => {
  it('casts three fictional drafts: one cut back, one passed as it is, one vetoed', () => {
    expect(CAST.map((c) => c.verdict)).toEqual(['kucult', 'aynen', 'veto']);
    expect(CAST.map((c) => c.finding)).toEqual(['sızıntı', '', 'abartı']);
    for (const slip of CAST) {
      expect(slip.issuer).toMatch(/^ÖRNEK /);
      expect(slip.code).toMatch(/^E[1-4]$/);
      expect(slip.size).toBeGreaterThan(0);
      expect(slip.size).toBeLessThanOrEqual(1);
      expect(slip.path[0]).toEqual(SPOTS.home);
    }
    expect(CAST[2].phrase).not.toBe('');
  });

  it('wraps each slip clock into its window', () => {
    for (let t = 0; t < LOOP; t += 0.37) {
      for (let k = 0; k < CAST.length; k += 1) {
        const u = slipClock(t, k);
        expect(u).toBeGreaterThanOrEqual(-TIMING.approach);
        expect(u).toBeLessThan(LOOP - TIMING.approach);
      }
    }
    expect(wrap(-1, 5)).toBe(4);
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(12.3, createFrameState());
    const b = frameAt(12.3 + LOOP, createFrameState());
    a.slips.forEach((slip, k) => {
      for (const [key, value] of Object.entries(slip)) expect(b.slips[k][key]).toBeCloseTo(value, 9);
    });
    expect(b.spy.fx).toBeCloseTo(a.spy.fx, 10);
    expect(b.spy.bob).toBeCloseTo(a.spy.bob, 10);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro / 2).intro).toBeGreaterThan(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('walks each slip through approach → board → leave → gone', () => {
    const state = createFrameState();
    const k = 1;
    const seen = [];
    for (let u = -TIMING.approach + 0.01; u < TIMING.period + 1; u += 0.05) {
      frameAt(at(k, u), state);
      const stage = state.slips[k].stage;
      if (seen[seen.length - 1] !== stage) seen.push(stage);
    }
    expect(seen).toEqual([STAGES.approach, STAGES.board, STAGES.leave, STAGES.hidden]);
  });

  it('pins one slip to the board at a time', () => {
    const state = createFrameState();
    for (let e = 0; e < LOOP; e += 0.1) {
      frameAt(e, state);
      expect(state.slips.filter((slip) => slip.stage === STAGES.board).length).toBeLessThanOrEqual(1);
    }
  });

  it('never enlarges a proposal: its size only holds or falls', () => {
    const state = createFrameState();
    CAST.forEach((cast, k) => {
      let last = Infinity;
      for (let u = -TIMING.approach; u < TIMING.period; u += 0.02) {
        frameAt(at(k, u), state);
        const size = state.slips[k].size;
        expect(size).toBeLessThanOrEqual(cast.size + 1e-12);
        expect(size).toBeLessThanOrEqual(last + 1e-12);
        last = size;
      }
    });
  });

  it('cuts the leak to half, passes the clean draft as it is, vetoes the puffed one to zero', () => {
    const state = frameAt(at(0, TIMING.leaveFrom - 0.01));
    expect(state.slips[0].size).toBeCloseTo(CAST[0].size / 2, 10);
    frameAt(at(1, TIMING.leaveFrom - 0.01), state);
    expect(state.slips[1].size).toBe(CAST[1].size);
    frameAt(at(2, TIMING.leaveFrom - 0.01), state);
    expect(state.slips[2].size).toBe(0);
    expect(state.slips[2].stamp).toBe(1);
  });

  it('rings the find before it acts on it', () => {
    expect(TIMING.ringFrom + TIMING.ringFor).toBeLessThanOrEqual(TIMING.verdictFrom);
    expect(TIMING.sweepTo).toBeLessThanOrEqual(TIMING.ringFrom);
    const state = frameAt(at(0, TIMING.verdictFrom));
    expect(state.slips[0].ring).toBe(1);
    expect(state.slips[0].cut).toBe(0);
  });

  it('draws the "büyüt" ghost once a loop, and strikes it out before it fades', () => {
    const state = createFrameState();
    let rises = 0;
    let was = false;
    for (let e = 0; e < LOOP; e += 0.02) {
      frameAt(e, state);
      const on = state.slips.some((slip) => slip.ghost > 0);
      if (on && !was) rises += 1;
      was = on;
      for (let k = 0; k < CAST.length; k += 1) if (CAST[k].verdict !== 'aynen') expect(state.slips[k].ghost).toBe(0);
    }
    expect(rises).toBe(1);
    expect(TIMING.ghostStrikeFrom + TIMING.ghostStrikeFor).toBeLessThan(TIMING.ghostFadeFrom);
  });

  it('sweeps the spyglass along each path to its find and back, with no jump between slips', () => {
    const out = [0, 0];
    CAST.forEach((cast) => {
      expect(focusAt(cast, 0, out)).toEqual([...SPOTS.home]);
      const last = cast.path[cast.path.length - 1];
      focusAt(cast, TIMING.sweepTo + 0.05, out);
      expect(out[0]).toBeCloseTo(last[0], 10);
      expect(out[1]).toBeCloseTo(last[1], 10);
      focusAt(cast, TIMING.period - 1e-6, out);
      expect(out[0]).toBeCloseTo(SPOTS.home[0], 10);
    });
    const a = frameAt(at(1, -1e-4));
    const fa = [a.spy.fx, a.spy.fy];
    const b = frameAt(at(1, 1e-4));
    expect(b.spy.fx).toBeCloseTo(fa[0], 6);
    expect(b.spy.fy).toBeCloseTo(fa[1], 6);
    expect(b.spy.slip).toBe(1);
  });

  it('prints the leak, ringed and cut back, as its still', () => {
    const state = frameAt(STILL_ELAPSED);
    expect(state.intro).toBe(1);
    expect(state.slips[0].stage).toBe(STAGES.board);
    expect(state.slips[0].ring).toBe(1);
    expect(state.slips[0].wipe).toBe(1);
  });
});
