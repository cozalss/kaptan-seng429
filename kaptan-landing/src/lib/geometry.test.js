import { describe, expect, test } from 'vitest';
import { coverRadius, pinScrollForOffset, ringFrame } from './geometry.js';

describe('coverRadius', () => {
  test('reaches the farthest viewport corner from the point', () => {
    expect(coverRadius(0, 0, 300, 400)).toBe(500);
    expect(coverRadius(100, 100, 400, 500)).toBe(500);
  });

  test('is symmetric around the centre', () => {
    expect(coverRadius(50, 50, 100, 100)).toBeCloseTo(Math.hypot(50, 50));
  });
});

describe('pinScrollForOffset', () => {
  const pin = { start: 1000, end: 2700, travel: 1000, travelShare: 1 / 1.7 };

  test('maps the start and end of travel onto the travel part of the pin', () => {
    expect(pinScrollForOffset(0, pin)).toBe(1000);
    expect(pinScrollForOffset(1000, pin)).toBeCloseTo(2000);
  });

  test('clamps offsets outside the track', () => {
    expect(pinScrollForOffset(-50, pin)).toBe(1000);
    expect(pinScrollForOffset(5000, pin)).toBeCloseTo(2000);
  });

  test('returns the pin start when there is nothing to travel', () => {
    expect(pinScrollForOffset(300, { ...pin, travel: 0 })).toBe(1000);
  });
});

describe('ringFrame', () => {
  test('locates the ring centre inside a letterboxed viewBox', () => {
    const frame = ringFrame({ left: 10, top: 20, width: 280, height: 64 }, { width: 140, height: 64, cx: 30, cy: 32, r: 27 });

    expect(frame.scale).toBe(1);
    expect(frame.originX).toBe(100);
    expect(frame.x).toBe(110);
    expect(frame.y).toBe(52);
    expect(frame.r).toBe(27);
  });
});
