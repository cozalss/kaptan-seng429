import { describe, expect, it } from 'vitest';
import { mastLayout } from './halyard.js';
import { blow, createRig, gustLevel, isResting, setRigState, settleRig, stepRig } from './rig.js';

const L = mastLayout(150, 620);
const rig = (state = 'down', id = 'E2') =>
  createRig({ id, cols: 16, rows: 9, length: L.length, hoist: L.hoist, spot: L.spots[1], x: L.halyard, state, seed: 2 });
const runUntilRest = (r, seconds = 15, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) {
    stepRig(r, dt);
    if (isResting(r)) return t;
  }
  return Infinity;
};

describe('rig', () => {
  it('starts at its state with hatch and boundary art for its numeral', () => {
    const r = rig('hoisted', 'E3');
    expect(r.n).toBe(3);
    expect(r.env.oy).toBe(L.spots[1].slot);
    expect(r.art.vertical.length).toBeGreaterThan(0);
    expect(r.art.horizontal.length).toBeGreaterThan(0);
    expect(r.art.bounds).toHaveLength(2);
  });

  it('hoists: tug, rise, catch the wind, then rest (so the stage can sleep)', () => {
    const r = rig('down');
    setRigState(r, 'hoisted');
    expect(gustLevel(r.gust)).toBe(0);
    stepRig(r, 1 / 60);
    expect(r.env.oy).toBeGreaterThan(L.spots[1].foot); // the tug pulls it down first
    const rest = runUntilRest(r);
    expect(rest).toBeLessThan(9);
    expect(r.env.oy).toBe(L.spots[1].slot);
    expect(r.furl).toBe(0);
  });

  it.each(['half', 'folded', 'down'])('settles after hoisted → %s within a few seconds', (state) => {
    const r = rig('hoisted');
    runUntilRest(r);
    setRigState(r, state);
    expect(runUntilRest(r)).toBeLessThan(4.5);
  });

  it('folds without a gust (a rolled pennant takes no wind)', () => {
    const r = rig('down');
    setRigState(r, 'folded');
    expect(r.gust.dur).toBe(0);
  });

  it('steps in fixed 1/60 s steps, at most three per frame', () => {
    const r = rig('hoisted');
    expect(stepRig(r, 0.001)).toBe(false);
    const t0 = r.cloth.time;
    stepRig(r, 1);
    expect(r.cloth.time - t0).toBeCloseTo(3 / 60, 5);
  });

  it('keeps the stronger gust and never jumps the wind', () => {
    const r = rig('hoisted');
    blow(r, 'hoist');
    for (let i = 0; i < 60; i += 1) stepRig(r, 1 / 60);
    const before = gustLevel(r.gust);
    blow(r, 'idle');
    expect(gustLevel(r.gust)).toBeCloseTo(before, 5);
    runUntilRest(r);
    blow(r, 'idle');
    expect(r.gust.amp).toBeCloseTo(0.55);
  });

  it('jumps straight to its target when settled', () => {
    const r = rig('down');
    setRigState(r, 'hoisted');
    settleRig(r);
    expect(r.halyard.y).toBe(L.spots[1].slot);
    expect(r.furl).toBe(0);
    expect(r.halyard.moving).toBe(false);
  });
});
