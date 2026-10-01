import { describe, expect, it } from 'vitest';
import { lineBlurPx } from './hero-motion.js';

describe('lineBlurPx', () => {
  it('blurs a line by the mean dissolve progress of its glyphs', () => {
    expect(lineBlurPx([0, 0.5, 1], 10)).toBeCloseTo(5);
    expect(lineBlurPx([1, 1], 10)).toBe(10);
  });

  it('is zero for an untouched or empty line', () => {
    expect(lineBlurPx([0, 0], 10)).toBe(0);
    expect(lineBlurPx([], 10)).toBe(0);
  });
});
