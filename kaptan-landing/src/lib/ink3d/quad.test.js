import { describe, expect, it } from 'vitest';
import { aimFrame, createFrame } from './camera.js';
import { stillLine } from './paths.js';
import { writeCardTransform, writeQuadAffine } from './quad.js';
import { seededRandom } from './random.js';

const frame = () => aimFrame(createFrame(), { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10, focal: 500, cx: 400, cy: 300 });

describe('writeQuadAffine', () => {
  it('maps a camera-facing quad onto its projected box', () => {
    const out = new Float32Array(7);
    writeQuadAffine(frame(), 0, 0, 0, 1, 0, 0, 0, 2, 0, new Float64Array(4), out, 0);
    // a = 1 unit × 50 px, d = 2 units × 50 px (canvas y down), centred
    expect(Array.from(out)).toEqual([50, 0, 0, 100, 400, 300, 10]);
  });

  it('agrees with the compass card transform for a facing card', () => {
    const a = new Float32Array(7);
    const b = new Float32Array(7);
    const f = frame();
    writeCardTransform(f, 1, 1, 0, 0, 0, 0, 0.5, 0.7, new Float64Array(4), a, 0);
    writeQuadAffine(f, 1, 1, 0, 0.5, 0, 0, 0, 0.7, 0, new Float64Array(4), b, 0);
    Array.from(a).forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));
  });
});

describe('stillLine', () => {
  it('draws the same kinks for the same seed', () => {
    const record = () => {
      const pts = [];
      const ctx = { moveTo: (x, y) => pts.push(['m', x, y]), lineTo: (x, y) => pts.push(['l', x, y]) };
      stillLine(ctx, 0, 0, 100, 0, 3, 1);
      return pts;
    };
    expect(record()).toEqual(record());
    const pts = record();
    expect(pts[0]).toEqual(['m', 0, 0]);
    expect(pts[pts.length - 1]).toEqual(['l', 100, 0]);
    expect(pts.some(([, , y]) => y !== 0)).toBe(true);
  });
});

describe('seededRandom', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    for (let i = 0; i < 50; i += 1) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
