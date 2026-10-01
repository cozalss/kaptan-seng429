import { describe, expect, test } from 'vitest';
import { clamp, damp, easeInCubic, easeInQuart, mapRange, staggerProgress } from './math.js';

describe('clamp', () => {
  test('keeps values inside the range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  test('limits values outside the range', () => {
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(7, 0, 1)).toBe(1);
  });
});

describe('mapRange', () => {
  test('maps a value from one range to 0..1 and clamps', () => {
    expect(mapRange(0.9, 0.8, 1)).toBeCloseTo(0.5);
    expect(mapRange(0.1, 0.8, 1)).toBe(0);
    expect(mapRange(2, 0.8, 1)).toBe(1);
  });

  test('returns 1 at or past a zero-width range', () => {
    expect(mapRange(0.5, 0.5, 0.5)).toBe(1);
    expect(mapRange(0.4, 0.5, 0.5)).toBe(0);
  });
});

describe('easing', () => {
  test('cubic and quartic ease-in hit their end points', () => {
    expect(easeInCubic(0)).toBe(0);
    expect(easeInCubic(1)).toBe(1);
    expect(easeInQuart(0.5)).toBeCloseTo(0.0625);
  });
});

describe('damp', () => {
  test('moves the current value toward the target, frame-rate independently', () => {
    const oneFrame = damp(0, 1, 8, 1 / 60);
    const twoHalfFrames = damp(damp(0, 1, 8, 1 / 120), 1, 8, 1 / 120);
    expect(oneFrame).toBeGreaterThan(0);
    expect(oneFrame).toBeLessThan(1);
    expect(twoHalfFrames).toBeCloseTo(oneFrame, 6);
  });

  test('snaps when the difference is negligible', () => {
    expect(damp(0.99999, 1, 8, 1 / 60)).toBe(1);
  });
});

describe('staggerProgress', () => {
  test('first item leads, last item trails', () => {
    const first = staggerProgress(0.5, 0, 10, 0.6);
    const last = staggerProgress(0.5, 9, 10, 0.6);
    expect(first).toBeGreaterThan(last);
  });

  test('every item is complete at progress 1 and untouched at 0', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(staggerProgress(1, i, 5, 0.6)).toBe(1);
      expect(staggerProgress(0, i, 5, 0.6)).toBe(0);
    }
  });

  test('handles a single item', () => {
    expect(staggerProgress(0.5, 0, 1, 0.6)).toBeCloseTo(0.5);
  });
});
