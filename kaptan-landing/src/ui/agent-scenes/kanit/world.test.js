import { describe, expect, it } from 'vitest';
import { DRAWERS, STAGES } from './model.js';
import { CARD, CHEST, LEDGE_Y, QUERY_AT, QUERY_FROM, READ_AT, SLOTS, cardPlacement, chestPoint, drawerRect, queryPlacement } from './world.js';

const card = (over) => ({ stage: STAGES.rise, rise: 0, read: 0, fly: 0, ...over });
const place = (c, round = 0, i = 0) => {
  const out = [0, 0, 0];
  const grow = cardPlacement(c, round, i, out);
  return { out, grow };
};

describe('Kanıt world', () => {
  it('lays twelve drawers inside the chest front, none overlapping', () => {
    for (let d = 0; d < DRAWERS; d += 1) {
      const r = drawerRect(d);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(CHEST.width);
      expect(r.bottom).toBeGreaterThanOrEqual(CHEST.plinth);
      expect(r.top).toBeLessThanOrEqual(CHEST.height - CHEST.cap);
      for (let e = d + 1; e < DRAWERS; e += 1) {
        const o = drawerRect(e);
        const apart = o.left >= r.right || o.right <= r.left || o.bottom >= r.top || o.top <= r.bottom;
        expect(apart).toBe(true);
      }
    }
  });

  it('maps chest coordinates onto the turned box', () => {
    const centre = chestPoint(CHEST.width / 2, 0, -CHEST.depth / 2);
    expect(centre[0]).toBeCloseTo(CHEST.x);
    expect(centre[2]).toBeCloseTo(CHEST.z);
  });

  it('moves a card without jumps: drawer → reading place → slot', () => {
    const risen = place(card({ stage: STAGES.rise, rise: 1 }));
    READ_AT.forEach((v, i) => expect(risen.out[i]).toBeCloseTo(v));
    expect(risen.grow).toBe(1);
    expect(place(card({ rise: 0 })).grow).toBeLessThan(1);
    const read = place(card({ stage: STAGES.read, read: 0 })).out;
    READ_AT.forEach((v, i) => expect(read[i]).toBeCloseTo(v));
    const lifted = place(card({ stage: STAGES.flight, fly: 0 })).out;
    READ_AT.forEach((v, i) => expect(lifted[i]).toBeCloseTo(v));
    for (let i = 0; i < SLOTS.length; i += 1) {
      const landed = place(card({ stage: STAGES.flight, fly: 1 }), 1, i).out;
      const placed = place(card({ stage: STAGES.placed }), 1, i).out;
      SLOTS[i].forEach((v, k) => expect(landed[k]).toBeCloseTo(v));
      placed.forEach((v, k) => expect(v).toBeCloseTo(landed[k]));
    }
  });

  it('stands the row on its ledge, side by side without overlap', () => {
    expect(SLOTS[0][1] - CARD.halfH).toBeGreaterThan(LEDGE_Y);
    for (let i = 1; i < SLOTS.length; i += 1) expect(SLOTS[i][0] - SLOTS[i - 1][0]).toBeGreaterThan(CARD.halfW * 2);
  });

  it('slides the event card onto its easel', () => {
    const from = queryPlacement(0, [0, 0, 0]);
    const to = queryPlacement(1, [0, 0, 0]);
    QUERY_FROM.forEach((v, i) => expect(from[i]).toBeCloseTo(v));
    QUERY_AT.forEach((v, i) => expect(to[i]).toBeCloseTo(v));
  });
});
