import { describe, expect, it } from 'vitest';
import {
  COUNTS,
  FULL_DESCENT,
  FUNNEL,
  NEAR_SHARE,
  VARIANTS,
  buildCards,
  cardPose,
  counterAt,
  createPoseBuffers,
  crossingWindow,
  radiusAt,
  rejectionPlan,
  seededRandom,
  writeCardPoses,
} from './funnel.js';

const rest = { gather: 1, swirl: 0, descent: 0, time: 0 };

describe('seededRandom', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    values.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
    expect(seededRandom(43)()).not.toBe(values[0]);
  });
});

describe('rejectionPlan', () => {
  it('follows 350 → 42 → 7 → 1 on desktop (the slip is the one)', () => {
    expect(rejectionPlan(350)).toEqual([308, 35, 6]);
  });

  it('scales down for phones and always accounts for every funnel card', () => {
    const plan = rejectionPlan(120);
    expect(plan.reduce((a, b) => a + b, 0)).toBe(119);
    expect(plan[2]).toBe(6);
    expect(rejectionPlan(3).reduce((a, b) => a + b, 0)).toBe(2);
    expect(rejectionPlan(1)).toEqual([0, 0, 0]);
  });
});

describe('buildCards', () => {
  it('is deterministic, one card per funnel slot, fates shuffled', () => {
    const cards = buildCards(350);
    expect(cards).toHaveLength(349);
    expect(buildCards(350)).toEqual(cards);
    expect(buildCards(350, 1)).not.toEqual(cards);
    const byFate = [0, 1, 2].map((f) => cards.filter((c) => c.fate === f).length);
    expect(byFate).toEqual([308, 35, 6]);
    expect(cards.slice(0, 20).some((c) => c.fate !== 0)).toBe(true);
    cards.forEach((c) => {
      expect(c.level).toBeGreaterThanOrEqual(0);
      expect(c.level).toBeLessThan(1);
      expect(c.variant).toBeGreaterThanOrEqual(0);
      expect(c.variant).toBeLessThan(VARIANTS);
    });
  });
});

describe('cardPose', () => {
  const cards = buildCards(350);

  it('blows about as noise before it gathers, then sits inside the column wall', () => {
    const card = cards.find((c) => c.arrival > 0.3);
    const noise = cardPose(card, { ...rest, gather: 0 });
    expect(noise.position[0]).toBeCloseTo(card.noise[0] + Math.sin(card.phase) * 0.35, 5);
    const landed = cardPose(card, rest);
    expect(landed.position[1]).toBeGreaterThanOrEqual(FUNNEL.columnBottom);
    expect(landed.position[1]).toBeLessThanOrEqual(FUNNEL.columnTop);
    expect(Math.hypot(landed.position[0], landed.position[2])).toBeLessThanOrEqual(radiusAt(landed.position[1]) + 1e-9);
    expect(landed.struck).toBe(0);
    expect(landed.fade).toBe(0);
  });

  it('strikes each slip out only below the ring that rejects it', () => {
    for (const card of cards.slice(0, 60)) {
      const ring = FUNNEL.rings[card.fate];
      for (let d = 0; d <= FULL_DESCENT; d += 0.25) {
        const pose = cardPose(card, { ...rest, descent: d });
        const free = FUNNEL.columnBottom + card.level * (FUNNEL.columnTop - FUNNEL.columnBottom) - d;
        if (free >= ring.y) {
          expect(pose.struck).toBe(0);
          expect(pose.fade).toBe(0);
        }
        if (free < ring.y - FUNNEL.strikeDepth) expect(pose.fade).toBe(1);
      }
    }
  });

  it('flings struck slips outward, past their ring', () => {
    const card = cards.find((c) => c.fate === 0);
    const ring = FUNNEL.rings[0];
    const free = FUNNEL.columnBottom + card.level * (FUNNEL.columnTop - FUNNEL.columnBottom);
    const pose = cardPose(card, { ...rest, descent: free - ring.y + 0.9 });
    expect(Math.hypot(pose.position[0], pose.position[2])).toBeGreaterThan(radiusAt(pose.position[1]));
    expect(pose.struck).toBe(1);
    expect(pose.fade).toBeGreaterThan(0.3);
  });

  it('lets every slip still under a ring fall away on release (act III)', () => {
    const end = { ...rest, descent: FULL_DESCENT };
    cards.slice(0, 80).forEach((card) => {
      const released = cardPose(card, { ...end, release: 1 });
      expect(released.struck).toBe(1);
      expect(released.fade).toBe(1);
    });
  });

  it('hangs the storm above the page during the pre-roll (fall), then lets it drift down', () => {
    const card = cards[3];
    const calm = cardPose(card, { ...rest, gather: 0 }).position[1];
    const above = cardPose(card, { ...rest, gather: 0, fall: 9 }).position[1];
    expect(above - calm).toBeGreaterThan(9 * 0.7);
    expect(cardPose(card, { ...rest, gather: 1, fall: 9 }).position[1]).toBeCloseTo(cardPose(card, rest).position[1], 9);
  });

  it('blows a few slips past close to the lens (the depth of the storm)', () => {
    const near = cards.filter((c) => c.noise[2] > 6);
    expect(near.length).toBeGreaterThan(cards.length * 0.03);
    expect(near.length).toBeLessThan(cards.length * NEAR_SHARE * 2);
  });

  it('writes into a reused record when given one', () => {
    const out = { position: [0, 0, 0] };
    expect(cardPose(cards[0], rest, out)).toBe(out);
    expect(out.position.every(Number.isFinite)).toBe(true);
  });
});

describe('writeCardPoses', () => {
  it('fills the preallocated buffers for every slip', () => {
    const cards = buildCards(12);
    const out = createPoseBuffers(cards.length);
    expect(writeCardPoses(cards, rest, out)).toBe(out);
    expect(out.state[2]).toBe(cards[0].variant);
    expect([...out.position, ...out.angles].every(Number.isFinite)).toBe(true);
  });
});

describe('counterAt', () => {
  it('reads 350 until the first ring, then falls to 1 by the last ring', () => {
    expect(counterAt(0)).toBe(350);
    expect(counterAt(crossingWindow(0)[0])).toBe(350);
    expect(counterAt(crossingWindow(2)[1])).toBe(1);
    expect(counterAt(crossingWindow(2)[1] + 5)).toBe(1);
    expect(counterAt(Number.NaN)).toBe(350);
    expect(COUNTS).toEqual([350, 42, 7, 1]);
  });

  it('never rests on the illustrative in-between counts (42, 7 are not facts)', () => {
    const [from] = crossingWindow(0);
    const [, to] = crossingWindow(2);
    const step = (to - from) / 400;
    const held = (value) => {
      let run = 0;
      let longest = 0;
      for (let d = from; d <= to; d += step) {
        run = counterAt(d) === value ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      return longest;
    };
    // A plateau would hold the value over a whole gap between two rings (≈ 35 samples here).
    expect(held(42)).toBeLessThan(8);
    expect(held(7)).toBeLessThan(12);
    expect(counterAt((crossingWindow(0)[1] + crossingWindow(1)[0]) / 2)).not.toBe(42);
    expect(counterAt((crossingWindow(1)[1] + crossingWindow(2)[0]) / 2)).not.toBe(7);
  });

  it('never goes up as the column sinks', () => {
    let last = Infinity;
    for (let d = 0; d < 10; d += 0.05) {
      const n = counterAt(d);
      expect(n).toBeLessThanOrEqual(last);
      last = n;
    }
  });
});

describe('geometry', () => {
  it('narrows the funnel downward, capped at the top, always inside its rings', () => {
    expect(radiusAt(2)).toBeGreaterThan(radiusAt(-2));
    expect(radiusAt(50)).toBe(FUNNEL.maxRadius);
    FUNNEL.rings.forEach((ring) => expect(radiusAt(ring.y)).toBeLessThan(ring.radius));
  });

  it('stacks the rings on one axis, top to bottom, each narrower than the last', () => {
    FUNNEL.rings.slice(1).forEach((ring, i) => {
      expect(ring.y).toBeLessThan(FUNNEL.rings[i].y);
      expect(ring.radius).toBeLessThan(FUNNEL.rings[i].radius);
    });
  });
});

describe('cardPose idle', () => {
  it('tumbles a slip in the air with idle time but leaves where the cloud drifts to', () => {
    const [card] = buildCards(4);
    const clock = { gather: 0, swirl: 0, descent: 0, time: 1 };
    const a = cardPose(card, clock);
    const b = cardPose(card, { ...clock, idle: 2 });
    expect(b.yaw).not.toBeCloseTo(a.yaw, 4);
    expect(b.position[1]).toBeCloseTo(a.position[1], 6);
  });
});
