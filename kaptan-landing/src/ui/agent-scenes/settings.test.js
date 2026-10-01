import { describe, expect, it } from 'vitest';
import { hasAgentScene } from './registry.js';
import { DENSE_MAX_AREA, MAX_STEP_S, advance, canDraw2D, sceneDpr } from './settings.js';

describe('agent scene settings', () => {
  it('caps the pixel density at 2×, and 1.5× for a large plate', () => {
    expect(sceneDpr(3, 1000)).toBe(2);
    expect(sceneDpr(3, DENSE_MAX_AREA + 1)).toBe(1.5);
    expect(sceneDpr(1, DENSE_MAX_AREA + 1)).toBe(1);
    expect(sceneDpr(NaN, 10)).toBe(1);
    expect(sceneDpr(0, 10)).toBe(1);
  });

  it('advances the clock by the frame step, clamped after a stall', () => {
    expect(advance(1, 16)).toBeCloseTo(1.016);
    expect(advance(1, 5000)).toBeCloseTo(1 + MAX_STEP_S);
    expect(advance(1, -3)).toBe(1);
    expect(advance(1, NaN)).toBe(1);
  });

  it('finds no 2D canvas in jsdom (without asking jsdom for one)', () => {
    expect(canDraw2D(window)).toBe(false);
    expect(canDraw2D(undefined)).toBe(false);
    const throwing = { CanvasRenderingContext2D: function Ctx() {}, document: { createElement: () => ({ getContext: () => { throw new Error('no'); } }) } };
    expect(canDraw2D(throwing)).toBe(false);
  });

  it('knows which agents have a plate', () => {
    expect(hasAgentScene('siniflandirici')).toBe(true);
    expect(hasAgentScene('kaptan')).toBe(false); // not an agent id
    expect(hasAgentScene('toString')).toBe(false);
  });
});
