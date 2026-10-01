import { describe, expect, test } from 'vitest';
import { LOGO_RING, lensFrame, ringBox } from './ring.js';

describe('ringBox', () => {
  test('keeps the logo ring proportions (slightly taller than wide)', () => {
    const box = ringBox(140);
    expect(box.height).toBe(140);
    expect(box.width).toBeCloseTo((140 * LOGO_RING.rx) / LOGO_RING.ry, 6);
    expect(box.width).toBeLessThan(box.height);
  });

  test('returns an empty box for non-positive or invalid heights', () => {
    expect(ringBox(0)).toEqual({ width: 0, height: 0 });
    expect(ringBox(-5)).toEqual({ width: 0, height: 0 });
    expect(ringBox(Number.NaN)).toEqual({ width: 0, height: 0 });
  });
});

describe('lensFrame', () => {
  const radius = { rx: 67.5, ry: 70 };

  test('maps the pointer into untransformed parent px when the parent is not scaled', () => {
    const frame = lensFrame({ pointer: { x: 300, y: 200 }, rect: { left: 100, top: 50, width: 1000 }, localWidth: 1000, radius, magnify: 1.25 });
    expect(frame.x).toBe(200);
    expect(frame.y).toBe(150);
  });

  test('keeps the pointed spot fixed under magnification (translate = p·(1 − m))', () => {
    const frame = lensFrame({ pointer: { x: 400, y: 300 }, rect: { left: 0, top: 0, width: 1000 }, localWidth: 1000, radius, magnify: 1.25 });
    expect(frame.x * 1.25 + frame.tx).toBeCloseTo(frame.x, 6);
    expect(frame.y * 1.25 + frame.ty).toBeCloseTo(frame.y, 6);
  });

  test('shrinks the local clip so the on-screen ring size stays constant under push-in', () => {
    const frame = lensFrame({ pointer: { x: 0, y: 0 }, rect: { left: -200, top: -100, width: 1450 }, localWidth: 1000, radius, magnify: 1.25 });
    expect(frame.rx * 1.45 * 1.25).toBeCloseTo(radius.rx, 6);
    expect(frame.ry * 1.45 * 1.25).toBeCloseTo(radius.ry, 6);
    expect(frame.x).toBeCloseTo(200 / 1.45, 6);
  });

  test('falls back to scale 1 and no magnification for degenerate input', () => {
    const frame = lensFrame({ pointer: { x: 10, y: 10 }, rect: { left: 0, top: 0, width: 0 }, localWidth: 0, radius, magnify: 0 });
    expect(frame).toEqual({ x: 10, y: 10, rx: radius.rx, ry: radius.ry, tx: 0, ty: 0 });
  });
});
