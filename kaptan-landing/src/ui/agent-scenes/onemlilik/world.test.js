import { describe, expect, it } from 'vitest';
import { CAST } from './model.js';
import { BALANCE, CHEST, LEAVE_WEIGHT, WEIGHT_FROM, beamEnd, bookPlacement, bookRest, needleTip, panCentre, weightPlacement, weightRest } from './world.js';

const load = (over) => ({ visible: true, fly: 0, leave: 0, alpha: 1, ...over });
const v = () => [0, 0, 0];

describe('Önemlilik world', () => {
  it('hangs both pans level and plumb under a level beam, clear of the deck', () => {
    const l = panCentre(-1, 0, v());
    const r = panCentre(1, 0, v());
    expect(l[1]).toBeCloseTo(r[1]);
    expect(l[0]).toBeCloseTo(-r[0]);
    expect(l[1]).toBeCloseTo(BALANCE.pivot[1] - BALANCE.cord);
    expect(l[1] - BALANCE.panDepth).toBeGreaterThan(0);
  });

  it('lowers the right pan when the beam tilts right (theta > 0)', () => {
    expect(panCentre(1, 0.2, v())[1]).toBeLessThan(panCentre(-1, 0.2, v())[1]);
    expect(beamEnd(1, 0.2, v())[1]).toBeLessThan(BALANCE.pivot[1]);
  });

  it('turns the needle with the beam, its reach fixed', () => {
    const tip = needleTip(0.2, v());
    expect(tip[0]).toBeGreaterThan(BALANCE.pivot[0]);
    expect(Math.hypot(tip[0] - BALANCE.pivot[0], tip[1] - BALANCE.pivot[1])).toBeCloseTo(BALANCE.needle);
  });

  it('flies the weight from off the plate onto the left pan, then carries it back off', () => {
    const start = weightPlacement(load({ fly: 0 }), 0.1, v());
    WEIGHT_FROM.forEach((c, i) => expect(start[i]).toBeCloseTo(c));
    const rest = weightRest(0.1, v());
    weightPlacement(load({ fly: 1 }), 0.1, v()).forEach((c, i) => expect(c).toBeCloseTo(rest[i]));
    const gone = weightPlacement(load({ fly: 1, leave: 1 }), 0.1, v());
    expect(gone[0]).toBeCloseTo(rest[0] + LEAVE_WEIGHT[0]);
    expect(gone[0]).toBeLessThan(rest[0]); // back the way it came, clear of the dial
    expect(gone[1]).toBeGreaterThan(rest[1]);
  });

  it('lifts the ledgers out of the chest and stacks them on the right pan', () => {
    const out = bookPlacement(0, load({ fly: 0 }), 0, 0.2, v());
    expect(out[0]).toBeCloseTo(CHEST.x);
    expect(out[1]).toBeLessThan(CHEST.height + 0.1); // out of the chest mouth
    const bottom = bookRest(0, 0, 0.2, v());
    const top = bookRest(1, 0, 0.2, v());
    expect(top[1] - bottom[1]).toBeCloseTo(CAST[0].books[0]);
    bookPlacement(1, load({ fly: 1 }), 0, 0.2, v()).forEach((c, i) => expect(c).toBeCloseTo(top[i]));
  });
});
