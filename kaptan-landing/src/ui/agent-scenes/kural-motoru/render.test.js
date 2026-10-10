import { describe, expect, it } from 'vitest';
import { convexHull } from './machine.js';
import { LOOP, STILL_ELAPSED } from './model.js';
import scene from './index.js';

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

describe('Kural Motoru renderer', () => {
  it('draws a whole loop of frames (and the still) without throwing, at desktop and phone sizes', () => {
    for (const [w, h, dpr] of [
      [574, 234, 2],
      [358, 201, 3],
    ]) {
      const calls = [];
      const canvas = fakeCanvas(calls);
      const plate = scene.create({ canvas });
      plate.setSize(w, h, dpr);
      expect(canvas.width).toBe(w * dpr);
      for (let e = 0; e < LOOP + 1; e += 0.23) plate.render(e);
      plate.render(STILL_ELAPSED);
      expect(calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(200);
      expect(calls).toContain('fillText');
      expect(calls).toContain('clip');
      expect(calls).toContain('arc');
      plate.dispose();
      expect(canvas.width).toBe(0);
    }
  });

  it('refuses a canvas without a 2D context', () => {
    const canvas = { ownerDocument: { createElement: () => ({}) }, getContext: () => null };
    expect(() => scene.create({ canvas })).toThrow(/2D canvas/);
  });

  it('carries its plate copy: a legend keyed a–c and a spoken description', () => {
    expect(scene.id).toBe('kural-motoru');
    expect(scene.legend.map((l) => l.key)).toEqual(['a', 'b', 'c']);
    expect(scene.description).toMatch(/^Canlı şema: /);
    expect(scene.description).toMatch(/%0,25/);
    expect(scene.description).toMatch(/aynı girdi, aynı karar/);
  });
});

describe('convexHull', () => {
  it('returns the hull of a square with an inner point', () => {
    const xs = new Float32Array([0, 10, 10, 0, 5]);
    const ys = new Float32Array([0, 0, 10, 10, 5]);
    const out = new Float32Array(32);
    const n = convexHull(xs, ys, 5, new Uint8Array(16), out);
    expect(n).toBe(4);
    const pts = Array.from({ length: n }, (_, i) => `${out[i * 2]},${out[i * 2 + 1]}`);
    expect(pts.sort()).toEqual(['0,0', '0,10', '10,0', '10,10']);
  });
});
