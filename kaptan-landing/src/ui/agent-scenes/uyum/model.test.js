import { describe, expect, it } from 'vitest';
import { CAST, LANDED, LOOP, STAGES, STILL_ELAPSED, TIMING, VERDICTS, createFrameState, frameAt, goneAt, slipClock, wrap } from './model.js';

/** Elapsed time at which slip k's local clock reads u. */
const at = (k, u) => k * TIMING.every + u - TIMING.start;

describe('Uyum model', () => {
  it('casts fictional slips: exactly one hidden instruction and one measure per loop, the rest clean', () => {
    const kinds = CAST.map((slip) => slip.kind);
    expect(kinds.filter((k) => k === VERDICTS.inject)).toHaveLength(1);
    expect(kinds.filter((k) => k === VERDICTS.tedbir)).toHaveLength(1);
    expect(kinds.filter((k) => k === VERDICTS.pass).length).toBeGreaterThan(2);
    for (const slip of CAST) {
      expect(slip.issuer).toMatch(/^ÖRNEK /);
      expect(slip.stops).toBe(slip.kind !== VERDICTS.pass);
    }
  });

  it('wraps each slip clock into its window', () => {
    for (let t = 0; t < LOOP; t += 0.37) {
      for (let k = 0; k < CAST.length; k += 1) {
        const u = slipClock(t, k);
        expect(u).toBeGreaterThanOrEqual(-TIMING.stream);
        expect(u).toBeLessThan(LOOP - TIMING.stream);
      }
    }
    expect(wrap(-1, 5)).toBe(4);
    // every slip is gone before it comes round again
    expect(TIMING.stream + Math.max(goneAt(true), goneAt(false))).toBeLessThan(LOOP);
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(9.7, createFrameState());
    const b = frameAt(9.7 + LOOP, createFrameState());
    a.slips.forEach((slip, k) => {
      for (const [key, value] of Object.entries(slip)) expect(b.slips[k][key]).toBeCloseTo(value, 8);
    });
    expect(b.lantern.lit).toBeCloseTo(a.lantern.lit, 10);
    expect(b.lantern.sway).toBeCloseTo(a.lantern.sway, 8);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro / 2).intro).toBeGreaterThan(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('sends a clean slip on and drops the stopped ones into the box', () => {
    const state = createFrameState();
    const walk = (k) => {
      const seen = [];
      for (let u = -TIMING.stream + 0.01; u < 5; u += 0.05) {
        frameAt(at(k, u), state);
        const stage = state.slips[k].stage;
        if (seen[seen.length - 1] !== stage) seen.push(stage);
      }
      return seen;
    };
    const clean = CAST.findIndex((s) => s.kind === VERDICTS.pass);
    const inject = CAST.findIndex((s) => s.kind === VERDICTS.inject);
    const tedbir = CAST.findIndex((s) => s.kind === VERDICTS.tedbir);
    expect(walk(clean)).toEqual([STAGES.stream, STAGES.desk, STAGES.exit, STAGES.hidden]);
    expect(walk(inject)).toEqual([STAGES.stream, STAGES.desk, STAGES.flight, STAGES.drop, STAGES.hidden]);
    expect(walk(tedbir)).toEqual([STAGES.stream, STAGES.desk, STAGES.flight, STAGES.drop, STAGES.hidden]);
  });

  it('keeps one slip on the desk at a time, and the lantern lit only while one is there', () => {
    const state = createFrameState();
    for (let e = 0; e < LOOP; e += 0.05) {
      frameAt(e, state);
      const onDesk = state.slips.filter((slip) => slip.stage === STAGES.desk).length;
      expect(onDesk).toBeLessThanOrEqual(1);
      if (onDesk === 0) expect(state.lantern.lit).toBe(0);
    }
  });

  it('reveals in the right order: light, then the hidden line, then the strike, then the flag', () => {
    const k = CAST.findIndex((s) => s.kind === VERDICTS.inject);
    const state = createFrameState();
    const firstAbove = (key, threshold = 0.5) => {
      for (let u = 0; u < TIMING.liftAt; u += 0.01) {
        frameAt(at(k, u), state);
        if (state.slips[k][key] > threshold) return u;
      }
      return Infinity;
    };
    const lit = firstAbove('lit');
    const reveal = firstAbove('reveal');
    const mark = firstAbove('mark');
    const flag = firstAbove('flag');
    expect(lit).toBeLessThan(reveal);
    expect(reveal).toBeLessThan(mark);
    expect(mark).toBeLessThan(flag);
    expect(flag).toBeLessThan(TIMING.liftAt);
  });

  it('never raises anything on a clean slip and never flags a measure', () => {
    const state = createFrameState();
    for (let e = 0; e < LOOP; e += 0.1) {
      frameAt(e, state);
      CAST.forEach((cast, k) => {
        const slip = state.slips[k];
        if (cast.kind === VERDICTS.pass) expect(slip.reveal).toBe(0);
        if (cast.kind !== VERDICTS.inject) expect(slip.flag).toBe(0);
      });
    }
  });

  it('reads "Emir: 0" throughout, and underlines it as each stopped slip lands', () => {
    const state = createFrameState();
    let glows = 0;
    for (let e = 0; e < LOOP; e += 0.05) {
      frameAt(e, state);
      expect(state.orders).toBe(0);
      if (state.glow > 0.5) glows += 1;
    }
    expect(glows).toBeGreaterThan(0);
    const k = CAST.findIndex((s) => s.stops);
    frameAt(at(k, LANDED + 0.3), state);
    expect(state.glow).toBeGreaterThan(0.5);
    frameAt(at(k, LANDED - 0.4), state);
    expect(state.glow).toBe(0);
  });

  it('prints the still with the hidden line struck and the flag pinned', () => {
    const state = frameAt(STILL_ELAPSED);
    const k = CAST.findIndex((s) => s.kind === VERDICTS.inject);
    const slip = state.slips[k];
    expect(slip.stage).toBe(STAGES.desk);
    expect(slip.reveal).toBe(1);
    expect(slip.mark).toBe(1);
    expect(slip.flag).toBe(1);
    expect(state.lantern.lit).toBeGreaterThan(0.8);
  });
});
