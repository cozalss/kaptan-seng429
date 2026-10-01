import { describe, expect, it } from 'vitest';
import { FULL_DESCENT } from './funnel.js';
import {
  COMPASS_X,
  IDLE,
  LEAD,
  PHASES,
  PLATES,
  PREROLL_FALL,
  TIMING,
  actProgress,
  damp,
  needleAt,
  phaseAt,
  platesFor,
  poseAt,
  span,
} from './timeline.js';

const steps = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);

describe('phases', () => {
  it('are four acts in scroll order and map every progress to one of them', () => {
    expect(PHASES.map((p) => p.label)).toEqual(['Gürültü', 'Kanıt', 'Onay', 'Yön']);
    expect(phaseAt(0)).toBe(0);
    expect(phaseAt(PHASES[1].from)).toBe(1);
    expect(phaseAt(0.7)).toBe(2);
    expect(phaseAt(1)).toBe(3);
  });

  it('reports progress within the act', () => {
    expect(actProgress(0)).toBe(0);
    expect(actProgress(PHASES[1].from)).toBe(0);
    expect(actProgress(1)).toBe(1);
    expect(actProgress((PHASES[2].from + PHASES[3].from) / 2)).toBeCloseTo(0.5);
  });

  it('agrees with the act rail proportions in compass.css (18 · 34 · 26 · 22)', () => {
    const shares = PHASES.map((p, i) => Math.round(((PHASES[i + 1]?.from ?? 1) - p.from) * 100));
    expect(shares).toEqual([18, 34, 26, 22]);
  });

  it('gives every act a resting key frame of at least 0.4 viewport (0.133 of a 300vh pin)', () => {
    const HOLD = 0.4 / 3;
    // I: the storm before it gathers (plus the whole pre-roll)
    expect(TIMING.gather[0] - PHASES[0].from + LEAD).toBeGreaterThanOrEqual(HOLD);
    // II: the column in the sieve, counting down
    expect(TIMING.descent[1] - TIMING.descent[0]).toBeGreaterThanOrEqual(HOLD);
    // III: the stamped slip, before it moves to the side
    expect(TIMING.toSide[0] - TIMING.stamp[1]).toBeGreaterThanOrEqual(HOLD);
    // IV: the needle locked on north, until the section leaves (and through the exit)
    expect(1 + LEAD * 0.2 - TIMING.needleSettle[1]).toBeGreaterThanOrEqual(HOLD);
  });
});

describe('poseAt', () => {
  it('opens on noise: 350 on the counter, rings not yet inked, no stamp, no compass', () => {
    const pose = poseAt(0);
    expect(pose.counter).toBe(350);
    expect(pose.clock.gather).toBe(0);
    expect(pose.rings.ink.every((v) => v === 0)).toBe(true);
    expect(pose.stamp.visible).toBe(false);
    expect(pose.compass.visible).toBe(false);
    expect(pose.slip.lift).toBe(0);
  });

  it('inks the rings in act II and has the column gathered before it sinks', () => {
    expect(poseAt(PHASES[1].from).rings.ink[0]).toBeGreaterThan(0);
    const pose = poseAt(TIMING.descent[0]);
    expect(pose.clock.gather).toBe(1);
    expect(pose.rings.ink).toEqual([1, 1, 1]);
    expect(pose.counter).toBe(350);
  });

  it('pre-rolls: the storm already drifts in from above while the section arrives', () => {
    const arriving = poseAt(-LEAD);
    expect(arriving.entry).toBe(0);
    expect(arriving.clock.fall).toBe(PREROLL_FALL);
    expect(arriving.clock.time).toBeLessThan(0);
    expect(arriving.progress).toBe(0);
    expect(arriving.counter).toBe(350);
    const half = poseAt(-LEAD / 2);
    expect(half.clock.fall).toBeGreaterThan(0);
    expect(half.clock.fall).toBeLessThan(PREROLL_FALL);
    expect(poseAt(0).entry).toBe(1);
    expect(poseAt(0).clock.fall).toBe(0);
  });

  it('exits after the pin without changing the final frame', () => {
    const end = poseAt(1);
    const leaving = poseAt(1 + LEAD / 2);
    expect(end.exit).toBe(0);
    expect(leaving.exit).toBeCloseTo(0.5);
    expect(leaving.compass).toEqual(end.compass);
    expect(leaving.slip).toEqual(end.slip);
    expect(poseAt(1 + LEAD).exit).toBeCloseTo(1, 10);
  });

  it('gives act III its own beat: the sieve drops away and the survivor is raised, then set down', () => {
    expect(poseAt(TIMING.ringsOut[0]).rings.drop).toBe(0);
    expect(poseAt(TIMING.ringsOut[1]).rings.drop).toBe(1);
    expect(poseAt(TIMING.ringsOut[1]).clock.release).toBe(1);
    expect(poseAt(TIMING.descent[1]).clock.release).toBe(0);
    const mid = (TIMING.lift[0] + TIMING.stamp[0]) / 2;
    expect(poseAt(mid).slip.raise).toBeCloseTo(1, 5);
    expect(poseAt(TIMING.stamp[0]).slip.raise).toBeCloseTo(0, 10);
    expect(poseAt(TIMING.lift[0]).slip.raise).toBeCloseTo(0, 10);
  });

  it('docks the caption by continuous weights (no jump across act changes)', () => {
    steps(400).slice(1).forEach((p) => {
      const a = poseAt(p - 1 / 400);
      const b = poseAt(p);
      expect(Math.abs(a.focus - b.focus)).toBeLessThan(0.1);
      ['sieve', 'plate', 'compass'].forEach((k) => expect(Math.abs(a.dock[k] - b.dock[k])).toBeLessThan(0.12));
    });
    expect(poseAt(TIMING.descent[0]).focus).toBe(0);
    expect(poseAt(TIMING.descent[1]).focus).toBe(2);
  });

  it('counts down monotonically through act II and reaches 1 exactly as it ends', () => {
    let last = 351;
    steps(200).forEach((p) => {
      const { counter } = poseAt(p);
      expect(counter).toBeLessThanOrEqual(last);
      last = counter;
    });
    expect(poseAt(TIMING.descent[1]).clock.descent).toBeCloseTo(FULL_DESCENT, 6);
    expect(poseAt(TIMING.descent[1]).counter).toBe(1);
    expect(poseAt(TIMING.descent[1] - 0.03).counter).toBeGreaterThan(1);
  });

  it('lifts the slip, then stamps it once, and the ink stays', () => {
    expect(poseAt(TIMING.stamp[0] - 0.001).stamp.visible).toBe(false);
    expect(poseAt(TIMING.lift[1]).slip.lift).toBe(1);
    expect(TIMING.lift[1]).toBeLessThan(TIMING.stamp[0]);
    const after = poseAt(TIMING.stamp[1] + 0.01).stamp;
    expect(after.scale).toBe(1);
    expect(after.ink).toBe(1);
    expect(poseAt(1).stamp.visible).toBe(true);
  });

  it('ends on the final composition: slip at the side, compass inked, needle locked north', () => {
    const pose = poseAt(1);
    expect(pose.slip.plate).toEqual({ ...PLATES.wide.side });
    expect(pose.compass.ink).toBe(1);
    expect(pose.compass.needle).toBe(0);
    expect(pose.compass.locked).toBe(true);
    expect(pose.rings.fade).toBe(1);
    expect(poseAt(1, { compact: true }).slip.plate).toEqual({ ...PLATES.compact.side });
  });

  it('is a pure function of progress (scrolling back draws the same frame)', () => {
    expect(poseAt(0.37)).toEqual(poseAt(0.37));
    expect(poseAt(-1)).toEqual(poseAt(-LEAD));
    expect(poseAt(Number.NaN)).toEqual(poseAt(0));
    expect(poseAt(9)).toEqual(poseAt(1 + LEAD));
    expect(poseAt(-0.2, { lead: 0.5 }).entry).toBeCloseTo(0.6);
    expect(poseAt(-0.2, { lead: 0 })).toEqual(poseAt(-0.2, { lead: LEAD }));
  });

  it('moves the camera continuously (no jumps between nearby frames)', () => {
    steps(400).slice(1).forEach((p) => {
      const a = poseAt(p - 1 / 400).camera;
      const b = poseAt(p).camera;
      expect(Math.abs(a.yaw - b.yaw)).toBeLessThan(0.01);
      expect(Math.abs(a.pitch - b.pitch)).toBeLessThan(0.01);
      expect(Math.abs(a.target[1] - b.target[1])).toBeLessThan(0.02);
    });
  });
});

describe('platesFor', () => {
  it('sets the compass over the Rota course start on wide screens, within the composition', () => {
    expect(platesFor(false, null)).toBe(PLATES.wide);
    expect(platesFor(true, 0.7)).toBe(PLATES.compact);
    const over = platesFor(false, 0.72);
    expect(over.compass.x).toBe(0.72);
    expect(over.compass.r).toBe(PLATES.wide.compass.r);
    expect(over.compass.x - over.side.x).toBeGreaterThanOrEqual(COMPASS_X.slipGap - 1e-9);
    expect(platesFor(false, 0.2).compass.x).toBe(COMPASS_X.min);
    expect(platesFor(false, 0.99).compass.x).toBe(COMPASS_X.max);
    expect(poseAt(1, { compassX: 0.7 }).compass.x).toBe(0.7);
  });
});

describe('needleAt', () => {
  it('trembles away from north, then settles exactly on it', () => {
    expect(Math.abs(needleAt(TIMING.needleIn[0]))).toBeGreaterThan(0.2);
    expect(needleAt(TIMING.needleSettle[1])).toBe(0);
    expect(needleAt(1)).toBe(0);
  });

  it('never jumps once the tremor has given way to the swing', () => {
    const [start, to] = TIMING.needleSettle;
    const from = start + 0.012;
    for (let p = from; p < to; p += 0.0005) expect(Math.abs(needleAt(p + 0.0005) - needleAt(p))).toBeLessThan(0.12);
  });
});

describe('helpers', () => {
  it('span clamps to [0, 1]', () => {
    expect(span(-1, 0, 1)).toBe(0);
    expect(span(0.25, 0, 0.5)).toBe(0.5);
    expect(span(3, 0, 1)).toBe(1);
  });

  it('damp halves the distance every half-life, independent of frame rate', () => {
    expect(damp(0, 1, 0.1, 0.1)).toBeCloseTo(0.5);
    const fine = Array.from({ length: 10 }).reduce((v) => damp(v, 1, 0.1, 0.01), 0);
    expect(fine).toBeCloseTo(0.5);
    expect(damp(0, 1, 0, 0.1)).toBe(1);
    expect(damp(0.3, 1, 0.1, 0)).toBe(1);
  });
});

describe('idle life', () => {
  it('leaves the pose unchanged at rest time 0 and only turns and tumbles the slips with idle time', () => {
    const still = poseAt(0.3);
    const rested = poseAt(0.3, { idle: 4 });
    expect(still.clock.idle).toBe(0);
    expect(rested.clock.idle).toBeCloseTo(4 * IDLE.tumble);
    expect(rested.clock.swirl - still.clock.swirl).toBeCloseTo(4 * IDLE.swirl);
    // nothing else moves: the counter, the descent and the drift of the cloud stay put
    expect(rested.counter).toBe(still.counter);
    expect(rested.clock.descent).toBe(still.clock.descent);
    expect(rested.clock.time).toBe(still.clock.time);
  });
});
