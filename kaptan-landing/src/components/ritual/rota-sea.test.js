import { describe, expect, test } from 'vitest';
import { inkStroke, nearness, seaBands, seaRows, seededRandom, swellAt, washPools } from './rota-sea.js';

describe('seededRandom', () => {
  test('repeats for a seed and stays in [0, 1)', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('swellAt', () => {
  test('is calm at the horizon and in port, roughest mid-course', () => {
    expect(swellAt(0)).toBeCloseTo(0.35, 6);
    expect(swellAt(1)).toBeCloseTo(0.35, 6);
    expect(swellAt(0.5)).toBeCloseTo(1, 6);
    expect(swellAt(0.5)).toBeGreaterThan(swellAt(0.15));
  });

  test('clamps out-of-range and invalid depths', () => {
    expect(swellAt(-3)).toBe(swellAt(0));
    expect(swellAt(9)).toBe(swellAt(1));
    expect(swellAt(Number.NaN)).toBe(swellAt(0));
  });
});

describe('nearness', () => {
  test('runs 0 → 1, eases toward the reader and clamps', () => {
    expect(nearness(0)).toBe(0);
    expect(nearness(1)).toBe(1);
    expect(nearness(-1)).toBe(0);
    expect(nearness(0.5)).toBeGreaterThan(0.5);
  });
});

describe('seaRows', () => {
  test('starts at the horizon and widens the gap toward the reader (perspective)', () => {
    const rows = seaRows({ height: 1500, horizon: 20 });
    expect(rows[0].y).toBe(20);
    const gaps = rows.map((row) => row.gap);
    gaps.slice(1).forEach((gap, i) => expect(gap).toBeGreaterThanOrEqual(gaps[i]));
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0] * 6);
    expect(rows.every((row) => row.y < 1500)).toBe(true);
  });

  test('is empty when there is no water below the horizon', () => {
    expect(seaRows({ height: 10, horizon: 20 })).toEqual([]);
  });
});

describe('inkStroke', () => {
  test('is a closed outline, and empty for fewer than two points', () => {
    expect(inkStroke([[0, 0], [50, 2], [100, 0]], 4)).toMatch(/^M .* Z$/);
    expect(inkStroke([[0, 0]], 4)).toBe('');
    expect(inkStroke(null, 4)).toBe('');
  });
});

describe('seaBands', () => {
  const sea = seaBands({ width: 1200, height: 1500, horizon: 20 });

  test('lays bands from the horizon down, top to bottom', () => {
    expect(sea.length).toBeGreaterThan(12);
    const ys = sea.map((band) => band.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(ys[0]).toBe(20);
  });

  test('no two adjacent crests share amplitude or weight; both grow toward the reader', () => {
    sea.slice(1).forEach((band, i) => {
      expect(band.weight).not.toBe(sea[i].weight);
      expect(band.amplitude).not.toBe(sea[i].amplitude);
    });
    const last = sea[sea.length - 1];
    expect(last.weight).toBeGreaterThan(sea[0].weight * 3);
    expect(last.amplitude).toBeGreaterThan(sea[0].amplitude * 3);
    expect(last.washOpacity).toBeGreaterThan(sea[0].washOpacity);
  });

  test('draws each crest as closed brush strokes with dry-brush gaps between them', () => {
    sea.forEach((band) => {
      expect(band.crests.length).toBeGreaterThanOrEqual(2);
      band.crests.forEach((d) => expect(d).toMatch(/^M .* Z$/));
      expect(band.wash).toMatch(/^M .* Z$/);
    });
    expect(sea.some((band) => band.ripples.length > 0)).toBe(true);
    expect(sea.flatMap((band) => [band.wash, ...band.crests, ...band.ripples]).join(' ')).not.toMatch(/NaN|Infinity/);
  });

  test('is deterministic for a size and seed, different for another seed', () => {
    expect(seaBands({ width: 1200, height: 1500, horizon: 20 })).toEqual(sea);
    expect(seaBands({ width: 1200, height: 1500, horizon: 20, seed: 1 })[0].wash).not.toBe(sea[0].wash);
  });

  test('draws nothing for an empty box', () => {
    expect(seaBands({ width: 0, height: 500 })).toEqual([]);
    expect(seaBands({ width: 500, height: Number.NaN })).toEqual([]);
  });
});

describe('washPools', () => {
  test('lays three pools on wide water, two on narrow, all closed and faint', () => {
    const pools = washPools({ width: 1400, height: 1500, horizon: 20 });
    expect(pools).toHaveLength(3);
    pools.forEach((pool) => {
      expect(pool.d).toMatch(/^M .* Z$/);
      expect(pool.opacity).toBeGreaterThan(0);
      expect(pool.opacity).toBeLessThan(0.2);
    });
    expect(washPools({ width: 390, height: 1500 })).toHaveLength(2);
    expect(washPools({ width: 0, height: 100 })).toEqual([]);
  });
});
