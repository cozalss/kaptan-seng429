import { describe, expect, test } from 'vitest';
import { LANDMARKS, buoy, landmarkSlot, lighthouse, mole, shoal } from './rota-landmarks.js';

const valid = (mark) => [...mark.paper, ...mark.wash, ...mark.ink].every((d) => /^M .*Z$/.test(d) && !/NaN|Infinity/.test(d));

describe('landmarks', () => {
  test('one per waypoint, in order: buoy, lighthouse, shoal, mole', () => {
    expect(LANDMARKS).toEqual([buoy, lighthouse, shoal, mole]);
  });

  test('each draws closed paths in paper, wash and ink layers around its waterline', () => {
    LANDMARKS.forEach((draw) => {
      const mark = draw(400, 300, 1.2);
      expect(mark.ink.length).toBeGreaterThan(3);
      expect(valid(mark)).toBe(true);
      const [l, t, r, b] = mark.box;
      expect(l).toBeLessThan(400);
      expect(r).toBeGreaterThan(400);
      expect(t).toBeLessThan(300);
      expect(b).toBeGreaterThan(300);
    });
  });

  test('scale grows the landmark', () => {
    const small = lighthouse(0, 0, 0.6).box;
    const big = lighthouse(0, 0, 1.2).box;
    expect(big[3] - big[1]).toBeGreaterThan(small[3] - small[1]);
  });

  test('the shoal carries its soundings', () => {
    const { figures } = shoal(200, 200);
    expect(figures.length).toBeGreaterThanOrEqual(4);
    figures.forEach((figure) => expect(figure.text).toMatch(/^\d$/));
  });

  test('the mole runs from its beacon toward the side it is given', () => {
    const left = mole(500, 200, 1, { length: 300, side: -1 }).box;
    const right = mole(500, 200, 1, { length: 300, side: 1 }).box;
    expect(left[0]).toBeLessThan(220);
    expect(right[2]).toBeGreaterThan(780);
    expect(valid(mole(500, 200))).toBe(true);
  });
});

describe('landmarkSlot', () => {
  const panels = [
    { left: 0, top: 100, right: 560, bottom: 460 },
    { left: 780, top: 390, right: 1340, bottom: 750 },
    { left: 0, top: 680, right: 560, bottom: 1040 },
  ];
  const base = { width: 1340, lane: 220, panels };

  test('sits in the open water beside the mark, above the next panel on that side', () => {
    const slot = landmarkSlot({ ...base, index: 0, mark: { x: 670, y: 137 }, side: 1, depth: 0.2 });
    expect(slot.x).toBeGreaterThan(780);
    expect(slot.y).toBeLessThan(390 - 18);
    expect(slot.s).toBeGreaterThan(0.55);
  });

  test('on the left side: below the panel above and above the next one', () => {
    const slot = landmarkSlot({ ...base, index: 1, mark: { x: 670, y: 427 }, side: -1, depth: 0.5 });
    expect(slot.x).toBeLessThan(560);
    expect(slot.y - 154 * slot.s).toBeGreaterThanOrEqual(460);
    expect(slot.y).toBeLessThanOrEqual(680);
  });

  test('null when the column is too narrow, the room too short or the input is bad', () => {
    expect(landmarkSlot({ ...base, width: 760, index: 0, mark: { x: 670, y: 137 }, side: 1, depth: 0 })).toBeNull();
    const cramped = [
      { left: 700, top: 0, right: 1340, bottom: 130 },
      { left: 700, top: 200, right: 1340, bottom: 400 },
    ];
    expect(landmarkSlot({ ...base, panels: cramped, index: 1, mark: { x: 670, y: 140 }, side: 1, depth: 1 })).toBeNull();
    expect(landmarkSlot({ ...base, index: 9, mark: { x: 1, y: 1 }, side: 1, depth: 0 })).toBeNull();
    expect(landmarkSlot({ ...base, index: 0, mark: null, side: 1, depth: 0 })).toBeNull();
  });
});
