import { describe, expect, it } from 'vitest';
import {
  LEAK_SHAPE,
  SESSION_WEIGHTS,
  beamAngle,
  clamp,
  cumulative,
  easeInOut,
  inkPath,
  leakPoints,
  map,
  rng,
  settled,
  snap,
  springStep,
} from './motion.js';

describe('snap / clamp / map', () => {
  const grid = { min: 0, max: 0.5, step: 0.01 };

  it('snaps to the step grid without float noise', () => {
    expect(snap(0.1 + 0.2, grid)).toBe(0.3);
    expect(snap(0.2549, grid)).toBe(0.25);
    expect(snap(0.25, grid)).toBe(0.25);
  });

  it('clamps outside the range', () => {
    expect(snap(-3, grid)).toBe(0);
    expect(snap(9, grid)).toBe(0.5);
    expect(clamp(5, 0, 1)).toBe(1);
  });

  it('maps linearly and eases symmetrically', () => {
    expect(map(5, 0, 10, 100, 200)).toBe(150);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});

describe('ledger', () => {
  it('session weights sum to one', () => {
    expect(SESSION_WEIGHTS).toHaveLength(10);
    expect(SESSION_WEIGHTS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('the running total rises and ends exactly at the total', () => {
    const run = cumulative(0.31);
    expect(run).toHaveLength(10);
    expect(run[9]).toBe(0.31);
    run.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(run[i]));
  });
});

describe('beamAngle', () => {
  it('is level only at equality (the rule holds at ≥)', () => {
    expect(beamAngle(10)).toBe(0);
  });

  it('tips towards the heavier pan with a kick', () => {
    expect(beamAngle(10.5)).toBeGreaterThan(4);
    expect(beamAngle(9.5)).toBeLessThan(-4);
    expect(beamAngle(12)).toBeGreaterThan(beamAngle(10.5));
  });

  it('is limited', () => {
    expect(beamAngle(100)).toBe(12);
    expect(beamAngle(-100)).toBe(-12);
  });
});

describe('springStep', () => {
  it('returns a new state and settles on the target with an overshoot', () => {
    const start = { x: 0, v: 0 };
    let state = start;
    let peak = 0;
    for (let i = 0; i < 400; i += 1) {
      state = springStep(state, 6, 1 / 60, 120, 8.5);
      peak = Math.max(peak, state.x);
    }
    expect(start).toEqual({ x: 0, v: 0 });
    expect(peak).toBeGreaterThan(6); // it overshoots: a damped swing, not a slide
    expect(settled(state, 6)).toBe(true);
  });

  it('is not settled while moving', () => {
    expect(settled({ x: 5, v: 0 }, 6)).toBe(false);
    expect(settled({ x: 6, v: 3 }, 6)).toBe(false);
  });
});

describe('leakPoints', () => {
  it('starts at 0, ends at the rise and follows the default shape', () => {
    const pts = leakPoints(10);
    expect(pts).toHaveLength(LEAK_SHAPE.length);
    expect(pts[0]).toBe(0);
    expect(pts[5]).toBe(10);
    expect(pts[2]).toBeCloseTo(4.6);
  });

  it('keeps points the visitor drew', () => {
    const pts = leakPoints(10, [undefined, -2, undefined, 12]);
    expect(pts[1]).toBe(-2);
    expect(pts[3]).toBe(12);
    expect(pts[2]).toBeCloseTo(4.6);
  });
});

describe('ink', () => {
  it('rng is seeded and in [0, 1)', () => {
    const a = rng(7);
    const b = rng(7);
    const xs = Array.from({ length: 20 }, () => a());
    expect(xs).toEqual(Array.from({ length: 20 }, () => b()));
    xs.forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    });
  });

  it('inkPath is deterministic and passes through every point', () => {
    const pts = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    const d = inkPath(pts, 3);
    expect(d).toBe(inkPath(pts, 3));
    expect(d.startsWith('M0.0 0.0')).toBe(true);
    expect(d).toContain(' 10.0 0.0');
    expect(d.endsWith(' 10.0 10.0')).toBe(true);
    expect(inkPath([[0, 0], [0, 0]], 1)).toContain('Q');
  });
});
