import { describe, expect, it } from 'vitest';
import { STAGES, TIMING } from './model.js';
import { ABOVE_SLOT, BOX, DESK, DROP_DEPTH, SLIP, SLOT_CENTRE, STATION, WAIT, boxPoint, slipPose } from './world.js';

const slip = (over) => ({ stage: STAGES.stream, stream: 0, u: 0, mark: 0, fly: 0, drop: 0, exit: 0, flutter: 0, ...over });
const pose = (s) => slipPose(s, new Float64Array(5));
const close = (a, b, digits = 4) => [0, 1, 2].forEach((i) => expect(a[i]).toBeCloseTo(b[i], digits));

describe('Uyum world', () => {
  it('builds an orthonormal desk frame leaning back toward the eye', () => {
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    [DESK.right, DESK.up, DESK.normal].forEach((v) => expect(Math.hypot(...v)).toBeCloseTo(1));
    expect(dot(DESK.right, DESK.up)).toBeCloseTo(0);
    expect(dot(DESK.right, DESK.normal)).toBeCloseTo(0);
    expect(dot(DESK.up, DESK.normal)).toBeCloseTo(0);
    expect(DESK.normal[1]).toBeGreaterThan(0); // the board faces up a little
    expect(DESK.halfW).toBeGreaterThan(SLIP.halfW);
    expect(DESK.halfH).toBeGreaterThan(SLIP.halfH);
  });

  it('puts the slot in the middle of the lid, wide enough for a slip', () => {
    expect(SLOT_CENTRE[1]).toBe(BOX.height);
    const centre = boxPoint(BOX.width / 2, 0, -BOX.depth / 2);
    expect(SLOT_CENTRE[0]).toBeCloseTo(centre[0]);
    expect(SLOT_CENTRE[2]).toBeCloseTo(centre[2]);
    expect(BOX.slot.half).toBeGreaterThan(SLIP.halfW);
    // a dropped slip ends wholly inside the box
    expect(ABOVE_SLOT[1] - DROP_DEPTH + SLIP.halfH).toBeLessThan(BOX.height);
    expect(ABOVE_SLOT[1] - DROP_DEPTH - SLIP.halfH).toBeGreaterThan(0);
  });

  it('moves without jumps between stages', () => {
    close(pose(slip({ stage: STAGES.stream, stream: 1, u: -TIMING.approach })), WAIT);
    const landed = pose(slip({ stage: STAGES.stream, stream: 1, u: -1e-6 }));
    close(landed, STATION, 3);
    expect(landed[3]).toBeCloseTo(1, 3);
    const desk = pose(slip({ stage: STAGES.desk, u: 0.5 }));
    close(desk, STATION);
    expect(desk[3]).toBe(1);
    close(pose(slip({ stage: STAGES.flight, fly: 0 })), STATION);
    close(pose(slip({ stage: STAGES.exit, exit: 0 })), STATION);
    expect(pose(slip({ stage: STAGES.exit, exit: 0 }))[3]).toBe(1);
    const arrived = pose(slip({ stage: STAGES.flight, fly: 1 }));
    const dropping = pose(slip({ stage: STAGES.drop, drop: 0 }));
    close(arrived, dropping);
    expect(arrived[4]).toBe(1);
    expect(dropping[4]).toBe(1);
  });

  it('lets a clean slip go off into the distance and a stopped one down through the lid', () => {
    const gone = pose(slip({ stage: STAGES.exit, exit: 1 }));
    expect(gone[2]).toBeLessThan(-20);
    const sunk = pose(slip({ stage: STAGES.drop, drop: 1 }));
    expect(sunk[1] + SLIP.halfH).toBeLessThan(BOX.height);
  });
});
