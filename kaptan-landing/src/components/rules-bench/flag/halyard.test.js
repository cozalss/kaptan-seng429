import { describe, expect, it } from 'vitest';
import { assertState, createHalyard, handAt, mastLayout, setGoal, stateTarget, staffLayout, stepHalyard, STATES } from './halyard.js';

const simulate = (h, seconds, dt = 1 / 60) => {
  const ys = [];
  for (let t = 0; t < seconds; t += dt) ys.push(stepHalyard(h, dt));
  return ys;
};

describe('halyard motion', () => {
  it('tugs down before hoisting, then overshoots the top and settles on it', () => {
    const h = createHalyard(400);
    setGoal(h, 100);
    expect(handAt(h, 0.07)).toBeGreaterThan(400);
    const ys = simulate(h, 4);
    expect(Math.max(...ys.slice(0, 10))).toBeGreaterThan(400);
    expect(Math.min(...ys)).toBeLessThan(99);
    expect(h.y).toBe(100);
    expect(h.moving).toBe(false);
  });

  it('hoists in pulls: the hand rests between them', () => {
    const h = createHalyard(300);
    setGoal(h, 100);
    const a = handAt(h, 0.14 + 0.28 + 0.01);
    const b = handAt(h, 0.14 + 0.28 + 0.06);
    expect(a).toBeCloseTo(b, 5);
    expect(a).toBeLessThan(300);
  });

  it('caps a long hoist at five pulls', () => {
    const h = createHalyard(560);
    setGoal(h, 20);
    expect(handAt(h, 0.14 + 5 * 0.35)).toBe(20);
  });

  it('lowers smoothly without a tug', () => {
    const h = createHalyard(100);
    setGoal(h, 300);
    expect(handAt(h, 0.02)).toBeGreaterThanOrEqual(100);
    const ys = simulate(h, 3);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(99.5);
    expect(h.y).toBe(300);
  });

  it('does nothing when already there, and survives a long frame', () => {
    const h = createHalyard(50);
    setGoal(h, 50);
    expect(h.moving).toBe(false);
    expect(stepHalyard(h, 0.1)).toBe(50);
    setGoal(h, 10);
    const y = stepHalyard(h, 0.5);
    expect(Number.isFinite(y)).toBe(true);
    expect(Math.abs(y - 10)).toBeLessThan(80);
  });
});

describe('states', () => {
  const spot = { slot: 10, foot: 300, halfDrop: 20 };
  it('knows the four contract states and rejects others', () => {
    expect(STATES).toEqual(['down', 'hoisted', 'half', 'folded']);
    expect(() => assertState('raised')).toThrow(TypeError);
    expect(assertState('half')).toBe('half');
  });

  it('places each state', () => {
    expect(stateTarget('hoisted', spot)).toEqual({ y: 10, furl: 0, hoistScale: 1, wind: 1 });
    expect(stateTarget('half', spot).y).toBe(30);
    expect(stateTarget('half', spot).wind).toBeLessThan(1);
    expect(stateTarget('folded', spot)).toMatchObject({ y: 10, furl: 1, wind: 0 });
    expect(stateTarget('down', spot)).toMatchObject({ y: 300, furl: 1, hoistScale: 0.5 });
  });
});

describe('layouts', () => {
  it.each([[150, 620], [150, 504], [150, 420], [120, 700]])('fits four slots and four bundles in %i×%i', (w, h) => {
    const L = mastLayout(w, h);
    expect(L.length).toBeCloseTo(L.hoist * 1.8);
    expect(L.halyard + L.length).toBeLessThanOrEqual(w);
    const last = L.spots[3];
    expect(last.slot + last.halfDrop + L.hoist).toBeLessThanOrEqual(L.spots[0].foot + 1e-6);
    expect(L.spots[3].foot + L.hoist * 0.5).toBeLessThanOrEqual(L.base);
    for (let k = 1; k < 4; k += 1) expect(L.spots[k].slot).toBeGreaterThanOrEqual(L.spots[k - 1].slot + L.hoist);
  });

  it('never grows the mast pennant past its cap', () => {
    expect(mastLayout(400, 2000).length).toBeLessThanOrEqual(132);
  });

  it('sizes the mobile staff pennant to its small host', () => {
    const L = staffLayout(52, 36);
    expect(L.length).toBeGreaterThanOrEqual(30);
    expect(L.halyard + L.length).toBeLessThanOrEqual(52);
    expect(L.spots[0].slot + L.hoist).toBeLessThanOrEqual(36);
    expect(L.spots[0].halfDrop).toBeGreaterThan(0);
  });
});
