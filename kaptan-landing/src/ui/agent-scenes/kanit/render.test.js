import { describe, expect, it } from 'vitest';
import { convexHull } from './chest.js';
import { LOOP, STILL_ELAPSED } from './model.js';
import scene from './index.js';
import { returnPath, wrapLines } from './sprites.js';

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

describe('Kanıt renderer', () => {
  it('draws a whole loop of frames (and the still) without throwing', () => {
    const calls = [];
    const canvas = fakeCanvas(calls);
    const plate = scene.create({ canvas });
    plate.setSize(574, 305, 2);
    expect(canvas.width).toBe(1148);
    for (let e = 0; e < LOOP + 1; e += 0.19) plate.render(e);
    plate.render(STILL_ELAPSED);
    expect(calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(100);
    expect(calls).toContain('fillText');
    expect(calls).toContain('clip');
    plate.dispose();
    expect(canvas.width).toBe(0);
  });

  it('refuses a canvas without a 2D context', () => {
    const canvas = { ownerDocument: { createElement: () => ({}) }, getContext: () => null };
    expect(() => scene.create({ canvas })).toThrow(/2D canvas/);
  });

  it('carries its plate copy: a legend keyed a–c and a spoken description', () => {
    expect(scene.id).toBe('kanit');
    expect(scene.legend.map((l) => l.key)).toEqual(['a', 'b', 'c']);
    expect(scene.description).toMatch(/^Canlı şema: /);
    expect(scene.description).toMatch(/kod/);
  });
});

describe('convexHull', () => {
  it('returns the hull of a square with an inner point', () => {
    const xs = new Float32Array([0, 10, 10, 0, 5]);
    const ys = new Float32Array([0, 0, 10, 10, 5]);
    const out = new Float32Array(32);
    expect(convexHull(xs, ys, 5, new Uint8Array(16), out)).toBe(4);
  });
});

describe('Kanıt sprites', () => {
  it('wraps words to a width and ellipsises past the line limit', () => {
    const ctx = { measureText: (t) => ({ width: t.length * 10 }) };
    expect(wrapLines(ctx, 'Yeni iş ilişkisi', 120)).toEqual(['Yeni iş', 'ilişkisi']);
    expect(wrapLines(ctx, 'bir iki üç dört beş', 40, 2)).toEqual(['bir', 'iki…']);
  });

  it('draws a return line that starts flat and ends at its result', () => {
    const path = returnPath(0.4, 7);
    expect(path[0]).toBe(0);
    expect(path[path.length - 1]).toBeCloseTo(0.4);
    expect(path.every((v) => v >= -1 && v <= 1)).toBe(true);
  });
});
