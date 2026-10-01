import { describe, expect, it } from 'vitest';
import { CAST, RAIL, STAGES } from './model.js';
import { BENCH, BRIDGE, CARD, DIAL, HOPPER, TRAY, cardPlacement, deckPoint, gatesClear, slotRest } from './world.js';

const card = (over) => ({ stage: STAGES.feed, deck: 0, feed: 0, travel: 0, drop: 0, u: 0, ...over });
const place = (c, k = 0) => {
  const out = [0, 0, 0];
  return { shown: cardPlacement(c, k, out), out };
};

describe('Kural Motoru world', () => {
  it('fits the gates on the rail past the bridge, a tray under each', () => {
    expect(gatesClear()).toBe(true);
    expect(TRAY.halfW).toBeGreaterThan(CARD.halfW);
  });

  it('rests tray cards under the rail, the back one higher than the front', () => {
    for (let g = 0; g < RAIL.gates.length; g += 1) {
      const back = slotRest(g, 0);
      const front = slotRest(g, 1);
      expect(back[1] + CARD.halfH).toBeLessThan(BENCH.rail[2]);
      expect(back[1]).toBeGreaterThan(front[1]);
      expect(front[2]).toBeGreaterThan(back[2]);
      expect(front[1] - CARD.halfH).toBeGreaterThanOrEqual(TRAY.floor);
    }
  });

  it('moves without jumps between stages', () => {
    const fed = place(card({ stage: STAGES.feed, feed: 0 })).out;
    deckPoint(0, []).forEach((v, i) => expect(fed[i]).toBeCloseTo(v));
    const read = place(card({ stage: STAGES.read })).out;
    const arrived = place(card({ stage: STAGES.feed, feed: 1 })).out;
    read.forEach((v, i) => expect(arrived[i]).toBeCloseTo(v));
    const k = 1;
    const over = place(card({ stage: STAGES.travel, travel: 1 }), k).out;
    const dropping = place(card({ stage: STAGES.drop, drop: 0 }), k).out;
    over.forEach((v, i) => expect(dropping[i]).toBeCloseTo(v));
    const landed = place(card({ stage: STAGES.drop, drop: 1 }), k).out;
    slotRest(CAST[k].gateIndex, CAST[k].slot).forEach((v, i) => expect(landed[i]).toBeCloseTo(v));
    expect(place(card({ stage: STAGES.hidden })).shown).toBe(false);
  });

  it('reads under the bridge, the hopper to its left, the dial above it', () => {
    expect(BRIDGE.x).toBe(RAIL.reader);
    expect(HOPPER.x + HOPPER.halfW).toBeLessThan(BRIDGE.x - BRIDGE.halfW);
    expect(BRIDGE.pinRest).toBeGreaterThan(BENCH.railTop + CARD.halfH * 2);
    expect(DIAL.y - DIAL.r).toBeGreaterThan(BENCH.backboard[3]);
  });
});
