import { describe, expect, it } from 'vitest';
import { boundaryLines, clothV, hatchOf, hatchRuns, numeralOf, onCloth, regionAt, restY, TAPER } from './pennants.js';

describe('ICS numeral pennants 1–4', () => {
  it('maps rule ids to numerals and rejects anything else', () => {
    expect(['E1', 'E2', 'E3', 'E4'].map(numeralOf)).toEqual([1, 2, 3, 4]);
    expect(() => numeralOf('E5')).toThrow(TypeError);
    expect(() => numeralOf(undefined)).toThrow(TypeError);
  });

  it('pennant 1 is white with a red disc near the hoist', () => {
    expect(regionAt(1, 150 / 540, 0.5)).toBe('r');
    expect(regionAt(1, 0.8, 0.5)).toBe('w');
    expect(regionAt(1, 0.02, 0.1)).toBe('w');
  });

  it('pennant 2 is blue with a white disc', () => {
    expect(regionAt(2, 150 / 540, 0.5)).toBe('w');
    expect(regionAt(2, 0.8, 0.5)).toBe('b');
  });

  it('pennant 3 is red, white, blue from the hoist', () => {
    expect([0.1, 0.5, 0.9].map((x) => regionAt(3, x, 0.5))).toEqual(['r', 'w', 'b']);
  });

  it('pennant 4 is red with a white cross', () => {
    expect(regionAt(4, 150 / 540, 0.1)).toBe('w');
    expect(regionAt(4, 0.9, 0.5)).toBe('w');
    expect(regionAt(4, 0.05, 0.1)).toBe('r');
    expect(regionAt(4, 0.7, 0.3)).toBe('r');
  });

  it('prints colours as Petra Sancta hatching', () => {
    expect(hatchOf('r')).toEqual({ vertical: true, horizontal: false });
    expect(hatchOf('b')).toEqual({ vertical: false, horizontal: true });
    expect(hatchOf('w')).toEqual({ vertical: false, horizontal: false });
    expect(hatchOf('k')).toEqual({ vertical: true, horizontal: true });
  });

  it('tapers to a blunt fly and inverts its own parametrisation', () => {
    expect(restY(1, 0)).toBeCloseTo(TAPER);
    expect(restY(1, 1)).toBeCloseTo(1 - TAPER);
    expect(clothV(0.6, restY(0.6, 0.3))).toBeCloseTo(0.3);
    expect(onCloth(1, 0.1)).toBe(false);
    expect(onCloth(0, 0.1)).toBe(true);
  });
});

describe('hatchRuns', () => {
  it('hatches pennant 1 only inside the disc, vertically', () => {
    const { vertical, horizontal } = hatchRuns(1, 36, 18);
    expect(horizontal.length).toBe(0);
    expect(vertical.length).toBeGreaterThan(0);
    for (let k = 0; k < vertical.length; k += 3) {
      const [u, a, b] = [vertical[k], vertical[k + 1], vertical[k + 2]];
      expect(b).toBeGreaterThan(a);
      expect(regionAt(1, u, restY(u, (a + b) / 2))).toBe('r');
      expect(u).toBeLessThan(0.5);
    }
  });

  it('gives pennant 2 level lines that stop at the disc and at the taper', () => {
    const { vertical, horizontal } = hatchRuns(2, 36, 18);
    expect(vertical.length).toBe(0);
    const mid = [];
    for (let k = 0; k < horizontal.length; k += 3) if (horizontal[k] === 0.5) mid.push(horizontal[k + 1], horizontal[k + 2]);
    expect(mid.length).toBe(4); // interrupted once, by the disc
    let firstEnd = null;
    for (let k = 0; k < horizontal.length && firstEnd === null; k += 3) {
      if (Math.abs(horizontal[k] - 1 / 18) < 1e-6) firstEnd = horizontal[k + 2];
    }
    expect(firstEnd).toBeCloseTo(1 / 18 / TAPER, 2); // the top line leaves the cloth at the taper
  });

  it('hatches both colours of pennant 3 and nothing on its white stripe', () => {
    const { vertical, horizontal } = hatchRuns(3, 30, 15);
    for (let k = 0; k < vertical.length; k += 3) expect(vertical[k]).toBeLessThan(1 / 3 + 1e-6);
    for (let k = 0; k < horizontal.length; k += 3) expect(horizontal[k + 1]).toBeGreaterThan(2 / 3 - 1e-3);
  });
});

describe('boundaryLines', () => {
  it('draws the disc, the stripe edges and the cross as cloth polylines inside the cloth', () => {
    expect(boundaryLines(1)).toHaveLength(1);
    expect(boundaryLines(3)).toHaveLength(2);
    expect(boundaryLines(4)).toHaveLength(4);
    for (const n of [1, 2, 3, 4]) {
      for (const line of boundaryLines(n)) {
        expect(line.length % 2).toBe(0);
        for (const value of line) {
          expect(value).toBeGreaterThanOrEqual(-1e-6);
          expect(value).toBeLessThanOrEqual(1 + 1e-6);
        }
      }
    }
  });
});
