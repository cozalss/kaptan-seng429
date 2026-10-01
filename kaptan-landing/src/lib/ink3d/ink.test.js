import { describe, expect, it } from 'vitest';
import { brushRibbon, noise1 } from './ink.js';

const recorder = () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  return { ctx, calls };
};

describe('noise1', () => {
  it('is smooth, deterministic and stays in [0, 1]', () => {
    for (let x = -20; x < 20; x += 0.37) {
      const v = noise1(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(noise1(x)).toBe(v);
      expect(Math.abs(noise1(x + 0.01) - v)).toBeLessThan(0.05);
    }
  });
});

describe('brushRibbon', () => {
  it('outlines both sides of the stroke as one closed, filled path', () => {
    const { ctx, calls } = recorder();
    const xs = new Float32Array([0, 10, 20, 30]);
    const ys = new Float32Array([0, 0, 0, 0]);
    brushRibbon(ctx, xs, ys, 0, 4, () => 4);
    const names = calls.map((c) => c[0]);
    expect(names.filter((n) => n === 'lineTo')).toHaveLength(7);
    expect(names.at(-1)).toBe('fill');
    const [, , y0] = calls.find((c) => c[0] === 'moveTo');
    expect(Math.abs(y0)).toBeCloseTo(2);
  });

  it('draws nothing for fewer than two points', () => {
    const { ctx, calls } = recorder();
    brushRibbon(ctx, new Float32Array(3), new Float32Array(3), 1, 2, () => 1);
    expect(calls).toHaveLength(0);
  });
});
