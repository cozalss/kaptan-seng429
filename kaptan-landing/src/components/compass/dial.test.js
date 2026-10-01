import { describe, expect, it } from 'vitest';
import { compassStages, drawCompass } from './dial.js';

const inks = Array.from({ length: 201 }, (_, i) => i / 200);

/** A 2D context stub that records the alpha and fill of every fill() call. */
function recorder() {
  const fills = [];
  const ctx = new Proxy(
    { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 },
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'fill') return () => fills.push({ alpha: target.globalAlpha, style: target.fillStyle });
        return () => {};
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  return { ctx, fills };
}

describe('compassStages', () => {
  it('sweeps the paper face exactly with the outer brush stroke', () => {
    inks.forEach((ink) => expect(compassStages(ink).face).toBe(compassStages(ink).ring));
  });

  it('sets the face on its shadow only once the ring has closed', () => {
    inks.forEach((ink) => {
      const s = compassStages(ink);
      if (s.ring < 1) expect(s.shadow).toBe(0);
    });
    expect(compassStages(1).shadow).toBe(1);
  });

  it('inks in drawing order: ring, ticks, underwash, rose, letters', () => {
    const first = (key, at = 0) => inks.find((ink) => compassStages(ink)[key] > at);
    expect(first('ring')).toBeLessThan(first('ticks'));
    expect(first('ticks')).toBeLessThan(first('wash'));
    expect(first('wash')).toBeLessThan(first('rose'));
    expect(first('rose')).toBeLessThan(first('letters'));
    const done = compassStages(1);
    expect(done).toMatchObject({ ring: 1, face: 1, inner: 1, ticks: 1, hub: 1, wash: 1, rose: 8, letters: 4 });
  });
});

describe('drawCompass', () => {
  it('never fills a half-strength disc (no grey placeholder at any ink amount)', () => {
    inks.forEach((ink) => {
      const { ctx, fills } = recorder();
      drawCompass(ctx, { x: 200, y: 200, r: 150, ink, needle: 0.4, needleIn: ink });
      fills.forEach((fill) => expect(fill.alpha).toBe(1));
    });
  });

  it('draws nothing before the ink starts', () => {
    const { ctx, fills } = recorder();
    drawCompass(ctx, { x: 0, y: 0, r: 100, ink: 0, needle: 0, needleIn: 0 });
    expect(fills).toHaveLength(0);
  });
});
