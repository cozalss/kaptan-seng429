import { describe, expect, it } from 'vitest';
import { createCloth, placeCloth, stepCloth } from './cloth.js';

const env = (over = {}) => ({ ox: 10, oy: 20, furl: 0, hoistScale: 1, wind: 1, gust: 0, poke: null, ...over });
const run = (cloth, steps, e) => {
  let motion = 0;
  for (let i = 0; i < steps; i += 1) motion = stepCloth(cloth, 1 / 60, e);
  return motion;
};

describe('cloth', () => {
  it('allocates its grid and constraints once', () => {
    const cloth = createCloth({ cols: 16, rows: 9, length: 120, hoist: 66 });
    expect(cloth.n).toBe(17 * 10);
    expect(cloth.count).toBe(16 * 10 + 17 * 9 + 2 * 16 * 9);
    const { x, sx } = cloth;
    run(cloth, 10, env());
    expect(cloth.x).toBe(x);
    expect(cloth.sx).toBe(sx);
  });

  it('keeps the hoist pinned to the halyard', () => {
    const cloth = createCloth({ cols: 8, rows: 5, length: 90, hoist: 50 });
    placeCloth(cloth, 10, 20);
    run(cloth, 60, env({ gust: 1 }));
    for (let r = 0; r <= 5; r += 1) {
      expect(cloth.x[r * 9]).toBe(10);
      expect(cloth.y[r * 9]).toBeCloseTo(20 + (50 * r) / 5, 4);
    }
  });

  it('flies out in the breeze and settles to rest without a gust', () => {
    const cloth = createCloth({ cols: 12, rows: 7, length: 100, hoist: 55 });
    placeCloth(cloth, 10, 20);
    const motion = run(cloth, 600, env());
    expect(motion).toBeLessThan(0.03);
    expect(cloth.x[12]).toBeGreaterThan(10 + 80); // top fly corner held out, not hanging
  });

  it('sags toward the halyard when there is no wind', () => {
    const cloth = createCloth({ cols: 8, rows: 5, length: 90, hoist: 50 });
    placeCloth(cloth, 10, 20);
    run(cloth, 600, env({ wind: 0 }));
    expect(cloth.x[8]).toBeLessThan(10 + 90 * 0.7);
    expect(cloth.y[8]).toBeGreaterThan(20 + 50);
  });

  it('ripples toward the reader in a gust', () => {
    const cloth = createCloth({ cols: 12, rows: 7, length: 100, hoist: 55, seed: 3 });
    placeCloth(cloth, 10, 20);
    run(cloth, 90, env({ gust: 1 }));
    const depth = cloth.z.reduce((m, z) => Math.max(m, Math.abs(z)), 0);
    expect(depth).toBeGreaterThan(2);
    expect(cloth.sx.every(Number.isFinite)).toBe(true);
  });

  it('rolls up narrow when furled and bunches when the hoist is gathered', () => {
    const cloth = createCloth({ cols: 8, rows: 5, length: 90, hoist: 50 });
    placeCloth(cloth, 0, 0, 1, 0.5);
    expect(cloth.x[8]).toBeCloseTo(90 * 0.22, 3);
    expect(cloth.y[5 * 9]).toBeCloseTo(25, 3);
  });

  it('is pushed by a passing pointer', () => {
    const cloth = createCloth({ cols: 8, rows: 5, length: 90, hoist: 50 });
    placeCloth(cloth, 0, 0);
    stepCloth(cloth, 1 / 60, env({ ox: 0, oy: 0, wind: 0, poke: { x: 45, y: 25, vx: 600, vy: 0, r: 40 } }));
    expect(cloth.z.some((z) => z > 0.5)).toBe(true);
  });
});
