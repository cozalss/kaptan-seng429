import { describe, expect, it } from 'vitest';
import { INK } from '../../../lib/ink3d/ink.js';
import { LOOP, STILL_ELAPSED, TIMING } from './model.js';
import scene from './index.js';
import { STAMP_CELL, stampWidth } from './sprites.js';

/** A 2D context that records calls, texts and fill colours, and accepts any property (jsdom has no canvas). */
function fakeContext(log) {
  const state = {};
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'measureText') return (text) => ({ width: String(text).length * 7 });
      return (...args) => {
        log.calls.push(name);
        if (name === 'fillText') log.texts.push(args[0]);
        if (name === 'fill' || name === 'fillRect') log.fills.push(target.fillStyle);
      };
    },
    set(target, name, value) {
      target[name] = value;
      return true;
    },
  });
}

function fakeCanvas(log) {
  const doc = { createElement: () => fakeCanvas(log) };
  return { width: 0, height: 0, ownerDocument: doc, getContext: () => fakeContext(log) };
}

const newLog = () => ({ calls: [], texts: [], fills: [] });

describe('Risk Kapısı renderer', () => {
  it('draws a whole loop of frames (and the still) without throwing', () => {
    const log = newLog();
    const canvas = fakeCanvas(log);
    const plate = scene.create({ canvas });
    plate.setSize(574, 285, 2);
    expect(canvas.width).toBe(1148);
    for (let e = 0; e < LOOP + 1; e += 0.37) plate.render(e);
    plate.render(STILL_ELAPSED);
    expect(log.calls).toContain('drawImage');
    expect(log.calls).toContain('clip');
    plate.dispose();
    expect(canvas.width).toBe(0);
  });

  it('letters the rules, the gate’s tag and the kill switch’s sign on a desktop plate', () => {
    const log = newLog();
    const plate = scene.create({ canvas: fakeCanvas(log) });
    plate.setSize(574, 285, 1);
    log.texts.length = 0;
    plate.render(STILL_ELAPSED);
    for (const code of ['R01', 'R08', 'R16', 'R01–R16', 'Kill switch', 'zirveden −%5']) expect(log.texts).toContain(code);
  });

  it('falls back to a few labels on a phone plate, never to type under 8 px', () => {
    const log = newLog();
    const plate = scene.create({ canvas: fakeCanvas(log) });
    plate.setSize(240, 150, 2);
    log.texts.length = 0;
    plate.render(STILL_ELAPSED);
    expect(log.texts).toContain('R01');
    expect(log.texts).toContain('R16');
    expect(log.texts).not.toContain('R08');
  });

  it('inks one north-red mark only — the kill switch’s handle', () => {
    const log = newLog();
    const plate = scene.create({ canvas: fakeCanvas(log) });
    plate.setSize(574, 285, 1);
    for (const e of [STILL_ELAPSED, TIMING.kill + 0.8 - TIMING.start]) {
      log.fills.length = 0;
      plate.render(e);
      expect(log.fills.filter((fill) => fill === INK.north)).toHaveLength(1);
    }
  });

  it('refuses a canvas without a 2D context', () => {
    const canvas = { ownerDocument: { createElement: () => ({}) }, getContext: () => null };
    expect(() => scene.create({ canvas })).toThrow(/2D canvas/);
  });

  it('carries its plate copy: a legend keyed a–c and a spoken description', () => {
    expect(scene.id).toBe('risk-kapisi');
    expect(scene.legend.map((l) => l.key)).toEqual(['a', 'b', 'c']);
    expect(scene.description).toMatch(/^Canlı şema: /);
    expect(scene.description).toMatch(/R01–R16/);
    expect(scene.description).toMatch(/büyütmez/);
    expect(scene.description).toMatch(/pozisyon satılmaz/);
  });
});

describe('stampWidth', () => {
  it('fits a verdict word with its border, never wider than its cell', () => {
    expect(stampWidth(100)).toBe(156);
    expect(stampWidth(1000)).toBe(STAMP_CELL.width - 8);
  });
});
