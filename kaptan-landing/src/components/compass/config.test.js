import { describe, expect, it } from 'vitest';
import { CARD_COUNT, MAX_DPR, MAX_DPR_COMPACT, hasCanvas2D, sceneSettings, stickyProgress } from './config.js';

describe('sceneSettings', () => {
  it('caps the pixel ratio at 1.5 on wide screens (2 on small phones), with fewer cards', () => {
    expect(sceneSettings({ width: 1440, dpr: 3 })).toEqual({ compact: false, dpr: MAX_DPR, cards: CARD_COUNT.wide });
    expect(sceneSettings({ width: 390, dpr: 3 })).toEqual({ compact: true, dpr: MAX_DPR_COMPACT, cards: CARD_COUNT.compact });
    expect(sceneSettings({ width: 1440, dpr: 1 }).dpr).toBe(1);
    expect(MAX_DPR).toBeLessThanOrEqual(1.5);
    expect(CARD_COUNT.compact).toBeLessThan(CARD_COUNT.wide);
  });

  it('treats a missing or broken ratio as 1', () => {
    expect(sceneSettings({ width: 1200 }).dpr).toBe(1);
    expect(sceneSettings({ width: 1200, dpr: Number.NaN }).dpr).toBe(1);
    expect(sceneSettings({ width: 1200, dpr: 0 }).dpr).toBe(1);
  });
});

describe('stickyProgress', () => {
  it('runs 0 → 1 while the stage is held', () => {
    expect(stickyProgress({ top: 100, height: 2000 }, 800)).toBe(0);
    expect(stickyProgress({ top: 0, height: 2000 }, 800)).toBe(0);
    expect(stickyProgress({ top: -600, height: 2000 }, 800)).toBeCloseTo(0.5);
    expect(stickyProgress({ top: -1200, height: 2000 }, 800)).toBe(1);
    expect(stickyProgress({ top: -5000, height: 2000 }, 800)).toBe(1);
  });

  it('jumps straight through a section with no travel', () => {
    expect(stickyProgress({ top: 10, height: 800 }, 800)).toBe(0);
    expect(stickyProgress({ top: -10, height: 800 }, 800)).toBe(1);
  });
});

describe('hasCanvas2D', () => {
  it('asks the document for a 2D context and never throws', () => {
    const doc = (context) => ({ createElement: () => ({ getContext: () => context }) });
    expect(hasCanvas2D(doc({}))).toBe(true);
    expect(hasCanvas2D(doc(null))).toBe(false);
    expect(hasCanvas2D({ createElement: () => { throw new Error('no'); } })).toBe(false);
    expect(hasCanvas2D(null)).toBe(false);
  });
});
