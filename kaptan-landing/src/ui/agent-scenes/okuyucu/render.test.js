import { describe, expect, it } from 'vitest';
import { CAST, FIELDS, LOOP, STILL_ELAPSED } from './model.js';
import scene from './index.js';
import { FORM_SLOTS, drawPageSheet } from './sprites.js';

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

describe('Okuyucu renderer', () => {
  it('draws a whole loop of frames (and the still) without throwing', () => {
    const calls = [];
    const canvas = fakeCanvas(calls);
    const plate = scene.create({ canvas });
    plate.setSize(574, 285, 2);
    expect(canvas.width).toBe(1148);
    for (let e = 0; e < LOOP + 1; e += 0.19) plate.render(e);
    plate.render(STILL_ELAPSED);
    expect(calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(300);
    expect(calls).toContain('fillText');
    expect(calls).toContain('clip');
    expect(calls).toContain('setLineDash');
    plate.dispose();
    expect(canvas.width).toBe(0);
  });

  it('refuses a canvas without a 2D context', () => {
    const canvas = { ownerDocument: { createElement: () => ({}) }, getContext: () => null };
    expect(() => scene.create({ canvas })).toThrow(/2D canvas/);
  });

  it('carries its plate copy: a legend keyed a–c and a spoken description', () => {
    expect(scene.id).toBe('okuyucu');
    expect(scene.legend.map((l) => l.key)).toEqual(['a', 'b', 'c']);
    expect(scene.legend.map((l) => l.text)).toEqual(['metin', 'alan', 'form']);
    expect(scene.description).toMatch(/Temsili/);
    expect(scene.description).toMatch(/birleştirme düğümü/);
  });
});

describe('Okuyucu sprites', () => {
  it('records where each value phrase sits on its page', () => {
    const calls = [];
    const { spots } = drawPageSheet(fakeCanvas(calls).ownerDocument);
    expect(spots).toHaveLength(CAST.length * FIELDS.length * 2);
    for (let i = 0; i < spots.length; i += 2) {
      expect(spots[i]).toBeGreaterThan(-1);
      expect(spots[i + 1]).toBeGreaterThan(spots[i]);
      expect(spots[i + 1]).toBeLessThan(1);
    }
  });

  it('lays the three slots top to bottom inside the form', () => {
    for (let f = 1; f < FORM_SLOTS.length; f += 1) expect(FORM_SLOTS[f].y).toBeGreaterThan(FORM_SLOTS[f - 1].y);
  });
});
