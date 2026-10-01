import { describe, expect, it } from 'vitest';
import { LOOP, STILL_ELAPSED } from './model.js';
import scene from './index.js';
import { giftWrap } from './scenery.js';
import { wrapLines } from './sprites.js';

/** A 2D context that records calls and accepts any property (jsdom has no canvas). */
function fakeContext(calls, fills) {
  const state = {};
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'measureText') return (text) => ({ width: String(text).length * 7 });
      return (...args) => {
        calls.push(name);
        if (name === 'fillText') fills.push(String(args[0]));
      };
    },
    set(target, name, value) {
      target[name] = value;
      return true;
    },
  });
}

function fakeCanvas(calls, fills) {
  const doc = { createElement: () => fakeCanvas(calls, fills) };
  return { width: 0, height: 0, ownerDocument: doc, getContext: () => fakeContext(calls, fills) };
}

describe('Uyum renderer', () => {
  it('draws a whole loop of frames (and the still) without throwing', () => {
    const calls = [];
    const fills = [];
    const canvas = fakeCanvas(calls, fills);
    const plate = scene.create({ canvas });
    plate.setSize(574, 285, 2);
    expect(canvas.width).toBe(1148);
    for (let e = 0; e < LOOP + 1; e += 0.23) plate.render(e);
    plate.render(STILL_ELAPSED);
    expect(calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(100);
    expect(calls).toContain('clip');
    // the counter is printed every frame, and it only ever reads 0
    expect(fills).toContain('Emir:');
    expect(fills.filter((t) => /^\d+$/.test(t)).every((t) => t === '0')).toBe(true);
    // the hidden line is a fragment only, never a real prompt
    expect(fills).toContain('…talimat…');
    plate.dispose();
    expect(canvas.width).toBe(0);
  });

  it('refuses a canvas without a 2D context', () => {
    const canvas = { ownerDocument: { createElement: () => ({}) }, getContext: () => null };
    expect(() => scene.create({ canvas })).toThrow(/2D canvas/);
  });

  it('carries its plate copy: a legend keyed a–c and a spoken description', () => {
    expect(scene.id).toBe('uyum');
    expect(scene.legend.map((l) => l.key)).toEqual(['a', 'b', 'c']);
    expect(scene.description).toMatch(/Temsili/);
    expect(scene.description).toMatch(/Emir: 0/);
  });
});

describe('giftWrap', () => {
  it('returns the hull of a square with an inner point', () => {
    const xs = new Float32Array([0, 10, 10, 0, 5]);
    const ys = new Float32Array([0, 0, 10, 10, 5]);
    const order = new Uint8Array(8);
    const n = giftWrap(xs, ys, 5, order);
    expect(n).toBe(4);
    expect(Array.from(order.subarray(0, n)).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('wrapLines', () => {
  const ctx = { measureText: (t) => ({ width: t.length * 10 }) };
  it('wraps words to a width and ellipsises past the line limit', () => {
    expect(wrapLines(ctx, 'Genel kurul ilanı', 120)).toEqual(['Genel kurul', 'ilanı']);
    expect(wrapLines(ctx, 'bir iki üç dört beş', 40, 2)).toEqual(['bir', 'iki…']);
  });
});
