import { describe, expect, it } from 'vitest';
import { BINS, STAGES, TIMING } from './model.js';
import { LOCKER, SLIP, STATION, WAIT, binTargets, holeRect, insideDepth, lockerPoint, slipPlacement } from './world.js';

const slip = (over) => ({ stage: STAGES.stream, stream: 0, u: 0, read: 0, stamp: 0, fly: 0, slide: 0, flutter: 0, ...over });
const place = (s, bin = 0) => {
  const out = [0, 0, 0];
  const flat = slipPlacement(s, bin, out);
  return { out, flat };
};

describe('Sınıflandırıcı world', () => {
  it('lays six holes inside the locker front, each wide and deep enough for a slip', () => {
    BINS.forEach((_, bin) => {
      const r = holeRect(bin);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(LOCKER.width);
      expect(r.bottom).toBeGreaterThanOrEqual(LOCKER.plinth);
      expect(r.top).toBeLessThanOrEqual(LOCKER.height - LOCKER.cap);
      expect(r.right - r.left).toBeGreaterThan(SLIP.halfW * 2);
    });
    expect(LOCKER.depth).toBeGreaterThan(SLIP.halfH * 2);
  });

  it('maps locker coordinates onto the turned box', () => {
    const centre = lockerPoint(LOCKER.width / 2, 0, -LOCKER.depth / 2);
    expect(centre[0]).toBeCloseTo(LOCKER.x);
    expect(centre[2]).toBeCloseTo(LOCKER.z);
  });

  it('rests a filed slip inside its cubby, behind the front face', () => {
    const { mouth, rest } = binTargets(5);
    const front = lockerPoint(0, 0, 0);
    const n = [Math.sin(LOCKER.yaw), 0, Math.cos(LOCKER.yaw)];
    const along = (p) => (p[0] - front[0]) * n[0] + (p[2] - front[2]) * n[2];
    expect(along(mouth)).toBeGreaterThan(0);
    expect(along(rest)).toBeLessThan(-SLIP.halfH);
  });

  it('moves without jumps between stages', () => {
    const waiting = place(slip({ stage: STAGES.stream, stream: 1, u: -TIMING.approach })).out;
    WAIT.forEach((v, i) => expect(waiting[i]).toBeCloseTo(v));
    const landed = place(slip({ stage: STAGES.stream, stream: 1, u: -1e-6 })).out;
    STATION.forEach((v, i) => expect(landed[i]).toBeCloseTo(v, 3));
    const lifted = place(slip({ stage: STAGES.flight, fly: 0 })).out;
    STATION.forEach((v, i) => expect(lifted[i]).toBeCloseTo(v));
    const arrived = place(slip({ stage: STAGES.flight, fly: 1 }), 2);
    const sliding = place(slip({ stage: STAGES.slide, slide: 0 }), 2);
    arrived.out.forEach((v, i) => expect(sliding.out[i]).toBeCloseTo(v));
    expect(arrived.flat).toBe(1);
  });

  it('holds the slip on the easel while it is read (the stamp jolts it back a hair)', () => {
    const still = place(slip({ stage: STAGES.read, u: 0.5 })).out;
    const struck = place(slip({ stage: STAGES.read, u: 1.1, stamp: 0.5 })).out;
    expect(struck[2]).toBeLessThan(still[2]);
  });

  it('reports how deep a sliding slip is', () => {
    expect(insideDepth(slip({ stage: STAGES.flight }))).toBe(-1);
    expect(insideDepth(slip({ stage: STAGES.slide, slide: 1 }))).toBeGreaterThan(SLIP.halfH);
  });
});
