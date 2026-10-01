import { describe, expect, it } from 'vitest';
import {
  BOOK_LAND,
  CAST,
  LOOP,
  STEPS,
  STILL_ELAPSED,
  THRESHOLD,
  TIMING,
  WEIGHT_LAND,
  beamAngle,
  createFrameState,
  frameAt,
  residual,
} from './model.js';
import { BALANCE, THRESHOLD_BAND } from './world.js';

describe('Önemlilik model', () => {
  it('weighs fictional companies only', () => {
    expect(CAST.length).toBeGreaterThanOrEqual(2);
    for (const c of CAST) {
      expect(c.issuer).toMatch(/^ÖRNEK .* A\.Ş\.$/);
      expect(c.books).toHaveLength(2);
      expect(c.rest).toBeGreaterThan(0); // the ledgers always outweigh the amount: right pan down
    }
  });

  it('steps the beam target back to level over a loop (the target is periodic)', () => {
    const sum = STEPS.reduce((acc, [, delta]) => acc + delta, 0);
    expect(sum).toBeCloseTo(0, 12);
    for (let i = 1; i < STEPS.length; i += 1) expect(STEPS[i][0]).toBeGreaterThan(STEPS[i - 1][0]);
    expect(STEPS[STEPS.length - 1][0]).toBeLessThan(LOOP);
  });

  it('rings out each step: a unit residual decays from 1 toward 0', () => {
    expect(residual(0)).toBeCloseTo(1, 12);
    expect(Math.abs(residual(4))).toBeLessThan(0.02);
  });

  it('swings the beam continuously, the loop seam included', () => {
    let prev = beamAngle(0);
    for (let t = 0.005; t < LOOP; t += 0.005) {
      const theta = beamAngle(t);
      expect(Math.abs(theta - prev)).toBeLessThan(0.02);
      prev = theta;
    }
    expect(beamAngle(LOOP - 1e-7)).toBeCloseTo(beamAngle(0), 5);
  });

  it('tips left under the lone weight, then settles right under the ledgers', () => {
    expect(beamAngle(BOOK_LAND[0] - 0.05)).toBeLessThan(-0.15);
    CAST.forEach((c, i) => {
      const settled = beamAngle(i * TIMING.every + TIMING.leaveAt - 0.05);
      expect(settled).toBeGreaterThan(0);
      expect(Math.abs(settled - c.rest)).toBeLessThan(0.05);
    });
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(7.3, createFrameState());
    const b = frameAt(7.3 + LOOP, createFrameState());
    expect(b.weight).toEqual(a.weight);
    expect(b.books).toEqual(a.books);
    expect(b.label).toEqual(a.label);
    expect(b.theta).toBeCloseTo(a.theta, 10);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro / 2).intro).toBeGreaterThan(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('sets the weight down before the ledgers come, and lifts all of it off together', () => {
    expect(WEIGHT_LAND).toBeLessThan(TIMING.bookFrom[0]);
    expect(BOOK_LAND[1]).toBeLessThan(TIMING.leaveAt);
    const state = createFrameState();
    frameAt(WEIGHT_LAND + 0.1, state);
    expect(state.weight.fly).toBe(1);
    expect(state.books.every((b) => !b.visible)).toBe(true);
    frameAt(TIMING.leaveAt + 0.5, state);
    expect(state.weight.leave).toBeCloseTo(state.books[0].leave, 12);
    expect(state.weight.leave).toBeGreaterThan(0);
    frameAt(TIMING.every - 0.2, state);
    expect(state.weight.visible || state.books.some((b) => b.visible)).toBe(false);
  });

  it('names the weighed company on the chest, one weighing at a time', () => {
    const state = createFrameState();
    for (let i = 0; i < CAST.length; i += 1) {
      frameAt(i * TIMING.every + 3, state);
      expect(state.weighing).toBe(i);
      expect(state.label.weighing).toBe(i);
      expect(state.label.alpha).toBe(1);
    }
    frameAt(TIMING.every - 0.01, state);
    expect(state.label.alpha).toBeLessThan(0.05);
  });

  it('prints a still with both pans loaded and the beam settled', () => {
    const state = frameAt(STILL_ELAPSED);
    expect(state.weight.fly).toBe(1);
    expect(state.books.every((b) => b.fly === 1 && b.leave === 0)).toBe(true);
    expect(Math.abs(state.theta - CAST[0].rest)).toBeLessThan(0.05);
  });

  it('never lets the needle reach the threshold band: it weighs, it does not decide', () => {
    expect(BALANCE.needle).toBeLessThan(BALANCE.dialR * THRESHOLD_BAND.from);
    expect(THRESHOLD).toBeGreaterThan(0);
    // the threshold is a constant of the rules: nothing in a frame moves it
    expect(Object.keys(createFrameState())).not.toContain('threshold');
  });
});
