import { describe, expect, it } from 'vitest';
import { LOOP, STILL_ELAPSED } from './model.js';
import scene from './index.js';
import { fontCache } from './sprites.js';

/** A 2D context that records calls (and the words it prints); jsdom has no canvas. */
function fakeContext(calls) {
  const state = {};
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'measureText') return (text) => ({ width: String(text).length * 7 });
      return (...args) => {
        calls.push(name);
        if (name === 'fillText') calls.push(`text:${args[0]}`);
        return undefined;
      };
    },
    set(target, name, value) {
      target[name] = value;
      return true;
    },
  });
}

function fakeCanvas(calls) {
  const doc = { createElement: () => fakeCanvas(calls) };
  return { width: 0, height: 0, ownerDocument: doc, getContext: () => fakeContext(calls) };
}

describe('Önemlilik renderer', () => {
  it('draws a whole loop of frames (and the still) without throwing', () => {
    const calls = [];
    const canvas = fakeCanvas(calls);
    const plate = scene.create({ canvas });
    plate.setSize(574, 305, 2);
    expect(canvas.width).toBe(1148);
    for (let e = 0; e < LOOP + 1; e += 0.23) plate.render(e);
    plate.render(STILL_ELAPSED);
    expect(calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(80);
    for (const word of ['Tutar', 'Yıllık gelir', 'Piyasa değeri', 'eşik', 'Temsili', 'ÖRNEK']) expect(calls).toContain(`text:${word}`);
    expect(calls).toContain('clip');
    plate.dispose();
    expect(canvas.width).toBe(0);
  });

  it('refuses a canvas without a 2D context', () => {
    const canvas = { ownerDocument: { createElement: () => ({}) }, getContext: () => null };
    expect(() => scene.create({ canvas })).toThrow(/2D canvas/);
  });

  it('carries its plate copy: a legend keyed a–c and a spoken description', () => {
    expect(scene.id).toBe('onemlilik');
    expect(scene.legend.map((l) => l.key)).toEqual(['a', 'b', 'c']);
    expect(scene.description).toMatch(/Temsili/);
    expect(scene.description).toMatch(/yıllık gelir/);
    expect(scene.description).toMatch(/karar vermez/);
    expect(scene.stillElapsed).toBe(STILL_ELAPSED);
  });
});

describe('fontCache', () => {
  it('builds one font string per half-pixel size and reuses it', () => {
    const font = fontCache(500, 'Inter');
    expect(font(9.2)).toBe('500 9px Inter');
    expect(font(9.3)).toBe('500 9.5px Inter');
    expect(font(9.24)).toBe(font(9.2));
  });
});
