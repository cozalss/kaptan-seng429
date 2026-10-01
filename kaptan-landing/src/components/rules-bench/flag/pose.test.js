// The scrubbed (scroll-driven) hoist added for the pinned chapter sequence.
import { describe, expect, it } from 'vitest';
import { createHalyard, followTo, mastLayout, poseTarget, stepHalyard } from './halyard.js';
import { blow, createRig, gustLevel, isResting, setRigPose, stepRig } from './rig.js';

const spot = { slot: 40, foot: 500, halfDrop: 30 };

describe('poseTarget', () => {
  it('runs from the foot (furled bundle) to the slot (open in the wind)', () => {
    expect(poseTarget(spot, 0)).toEqual({ y: 500, furl: 1, hoistScale: 0.5, wind: 0 });
    expect(poseTarget(spot, 1)).toEqual({ y: 40, furl: 0, hoistScale: 1, wind: 1 });
    const mid = poseTarget(spot, 0.5);
    expect(mid.y).toBeGreaterThan(40);
    expect(mid.y).toBeLessThan(500);
    expect(mid.furl).toBe(1); // still furled half way up: it opens over the last stretch
  });

  it('only rises as the hoist grows (monotone) and clamps out-of-range input', () => {
    let last = Infinity;
    for (let h = 0; h <= 1.0001; h += 0.05) {
      const { y } = poseTarget(spot, h);
      expect(y).toBeLessThanOrEqual(last);
      last = y;
    }
    expect(poseTarget(spot, -1)).toEqual(poseTarget(spot, 0));
    expect(poseTarget(spot, 2)).toEqual(poseTarget(spot, 1));
  });

  it('dips a hoisted pennant to half-mast, and a pennant still at the foot not at all', () => {
    const half = poseTarget(spot, 1, 1);
    expect(half.y).toBe(70);
    expect(half.wind).toBe(0.5);
    expect(poseTarget(spot, 0, 1).y).toBe(500);
  });
});

describe('followTo', () => {
  it('moves the hand at once and lets the pennant follow on the spring', () => {
    const h = createHalyard(500);
    followTo(h, 100);
    expect(h.hand).toBe(100);
    let y = 500;
    for (let k = 0; k < 120; k += 1) y = stepHalyard(h, 1 / 60);
    expect(y).toBeCloseTo(100, 0);
    expect(h.moving).toBe(false);
    followTo(h, 100); // a repeat is a no-op
    expect(h.moving).toBe(false);
  });
});

describe('setRigPose and scroll gusts', () => {
  const L = mastLayout(600, 720, { hero: true });
  const make = () => createRig({ id: 'E1', cols: 16, rows: 9, length: L.length, hoist: L.hoist, spot: L.spots[0], x: L.halyard, seed: 1 });

  it('grows the pennants for the hero mast', () => {
    expect(L.length).toBeGreaterThan(mastLayout(150, 720).length);
    expect(L.pole).toBeGreaterThan(mastLayout(150, 720).pole);
  });

  it('keeps the flying pennants above the reserved foot of the hero mast', () => {
    const clear = 260;
    const R = mastLayout(600, 800, { hero: true, clear });
    const lowest = R.spots[3].slot + R.hoist + R.spots[3].halfDrop;
    expect(lowest).toBeLessThanOrEqual(800 - clear);
    expect(R.hoist).toBeLessThan(mastLayout(600, 800, { hero: true }).hoist);
  });

  it('follows a scrubbed hoist to the slot, opens, catches a gust and comes to rest', () => {
    const rig = make();
    setRigPose(rig, 1);
    expect(rig.state).toBe('hoisted');
    expect(gustLevel(rig.gust) >= 0).toBe(true);
    for (let t = 0; t < 12 && !isResting(rig); t += 1 / 60) stepRig(rig, 1 / 60);
    expect(isResting(rig)).toBe(true);
    expect(rig.env.oy).toBeCloseTo(L.spots[0].slot, 0);
    setRigPose(rig, 1, 1);
    expect(rig.state).toBe('half');
    setRigPose(rig, 0);
    expect(rig.state).toBe('down');
    setRigPose(rig, 0.4);
    expect(rig.state).toBe('moving');
  });

  it('scales a scroll gust by speed and ignores a whisper', () => {
    const rig = make();
    blow(rig, 'scroll', 0.01);
    expect(rig.gust.amp).toBe(0);
    blow(rig, 'scroll', 0.5);
    expect(rig.gust.amp).toBeCloseTo(0.4, 5);
  });
});
