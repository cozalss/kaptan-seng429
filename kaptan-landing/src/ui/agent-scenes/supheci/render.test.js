import { describe, expect, it } from 'vitest';
import { LOOP, STILL_ELAPSED } from './model.js';
import scene from './index.js';
import { pricePath } from './sprites.js';

/** A 2D context that records calls and accepts any property (jsdom has no canvas). */
function fakeContext(calls) {
  const state = {};
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'measureText') return (text) => ({ width: String(text).length * 7 });
      return () => {
        calls.push(name);
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

describe('Şüpheci renderer', () => {
  it('draws a whole loop of frames (and the still) without throwing', () => {
    const calls = [];
    const canvas = fakeCanvas(calls);
    const plate = scene.create({ canvas });
    plate.setSize(574, 300, 2);
    expect(canvas.width).toBe(1148);
    for (let e = 0; e < LOOP + 1; e += 0.17) plate.render(e);
    plate.render(STILL_ELAPSED);
    expect(calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(100);
    expect(calls).toContain('fillText');
    expect(calls).toContain('clip'); // the spyglass's field
    expect(calls).toContain('ellipse'); // the tube's rings
    plate.dispose();
    expect(canvas.width).toBe(0);
  });

  it('refuses a canvas without a 2D context', () => {
    const canvas = { ownerDocument: { createElement: () => ({}) }, getContext: () => null };
    expect(() => scene.create({ canvas })).toThrow(/2D canvas/);
  });

  it('carries its plate copy: a legend keyed a–c and a spoken description', () => {
    expect(scene.id).toBe('supheci');
    expect(scene.legend.map((l) => l.key)).toEqual(['a', 'b', 'c']);
    expect(scene.description).toMatch(/^Canlı şema: /);
    expect(scene.description).toMatch(/büyütemez/);
  });
});

describe('pricePath', () => {
  it('climbs before the disclosure only for the leak', () => {
    const rise = (kind) => {
      const p = pricePath(kind);
      return p[p.length - 1][1] - p[Math.floor(p.length / 3)][1];
    };
    expect(rise('leak')).toBeGreaterThan(0.3);
    expect(Math.abs(rise('clean'))).toBeLessThan(0.15);
    expect(Math.abs(rise('puff'))).toBeLessThan(0.15);
  });
});
