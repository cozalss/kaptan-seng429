import { describe, expect, it } from 'vitest';
import {
  BINS,
  CAST,
  LOOP,
  STAGES,
  STILL_ELAPSED,
  TIMING,
  createFrameState,
  frameAt,
  landingPhase,
  slipClock,
  wrap,
  writeTallies,
} from './model.js';

const countsByBin = () => BINS.map((_, b) => CAST.filter((slip) => slip.binIndex === b).length);

describe('Sınıflandırıcı model', () => {
  it('casts every slip into one of the six bins, E1–E4 each at least once', () => {
    expect(BINS.map((bin) => bin.code)).toEqual(['E1', 'E2', 'E3', 'E4', 'Filtre', 'Diğer']);
    for (const slip of CAST) expect(slip.binIndex).toBeGreaterThanOrEqual(0);
    const counts = countsByBin();
    expect(counts.every((n) => n >= 1)).toBe(true);
    // most of a day's traffic is neither E1–E4
    expect(counts[4] + counts[5]).toBeGreaterThan(counts[0] + counts[1] + counts[2] + counts[3]);
    for (const slip of CAST) expect(slip.issuer).toMatch(/^ÖRNEK /);
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
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(12.3, createFrameState());
    const b = frameAt(12.3 + LOOP, createFrameState());
    expect(b.slips).toEqual(a.slips);
    expect(b.tallies).toEqual(a.tallies);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro / 2).intro).toBeGreaterThan(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('walks each slip through stream → read → flight → slide → gone', () => {
    const state = createFrameState();
    const seen = [];
    const k = 3;
    for (let u = -TIMING.stream + 0.01; u < 4; u += 0.05) {
      frameAt(k * TIMING.every + u - TIMING.start, state);
      const stage = state.slips[k].stage;
      if (seen[seen.length - 1] !== stage) seen.push(stage);
    }
    expect(seen).toEqual([STAGES.stream, STAGES.read, STAGES.flight, STAGES.slide, STAGES.hidden]);
  });

  it('keeps one slip on the easel at a time', () => {
    const state = createFrameState();
    for (let e = 0; e < LOOP; e += 0.1) {
      frameAt(e, state);
      expect(state.slips.filter((slip) => slip.stage === STAGES.read).length).toBeLessThanOrEqual(1);
    }
  });

  it('points the plaque of the bin a stamped slip is bound for', () => {
    const state = frameAt(STILL_ELAPSED);
    expect(state.target).toBe(CAST[6].binIndex);
    expect(state.targetGlow).toBeGreaterThan(0.9);
    expect(state.slips[6].stamp).toBe(1);
  });

  it('tallies each landing once and closes the day with a strike, then a clean page', () => {
    const tallies = createFrameState().tallies;
    const end = LOOP - 0.001;
    writeTallies(tallies, end);
    expect(tallies.map((t) => t.marks)).toEqual(countsByBin());
    expect(tallies.every((t) => t.strike === 0 && t.alpha === 1)).toBe(true);
    // just after the break: yesterday's strokes, being ruled off
    writeTallies(tallies, 0.2);
    expect(tallies.map((t) => t.marks)).toEqual(countsByBin());
    expect(tallies[0].strike).toBeGreaterThan(0);
    // wiped before the day's first landing
    writeTallies(tallies, landingPhase(0) - 0.01);
    expect(tallies.every((t) => t.marks === 0)).toBe(true);
    // the first landing inks one stroke in its bin
    writeTallies(tallies, landingPhase(0) + TIMING.tallyInk / 2);
    expect(tallies[CAST[0].binIndex].marks).toBe(1);
    expect(tallies[CAST[0].binIndex].ink).toBeCloseTo(0.5, 5);
  });

  it('lands the slips in order through the day', () => {
    for (let k = 1; k < CAST.length; k += 1) expect(landingPhase(k)).toBeGreaterThan(landingPhase(k - 1));
    expect(landingPhase(0)).toBeGreaterThan(TIMING.wipeFrom + TIMING.wipeFor);
  });
});
