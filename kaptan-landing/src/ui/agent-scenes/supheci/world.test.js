import { describe, expect, it } from 'vitest';
import { STAGES } from './model.js';
import { BOARD, BOARD_AXES, IN_TOP, SLIP, SPYGLASS, boardPoint, slipPoint, slipPose, spyglassPose } from './world.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pose = (over) => slipPose({ stage: STAGES.board, move: 0, ...over }, new Float64Array(9));

describe('Şüpheci world', () => {
  it('gives the board an orthonormal frame, leaning back', () => {
    const { right, up, normal } = BOARD_AXES;
    for (const v of [right, up, normal]) expect(Math.hypot(...v)).toBeCloseTo(1, 10);
    expect(dot(right, up)).toBeCloseTo(0, 10);
    expect(dot(up, normal)).toBeCloseTo(0, 10);
    expect(normal[1]).toBeGreaterThan(0); // its face looks a little up
  });

  it('pins the slip inside the board, with a margin', () => {
    for (const [x, y] of [[-1, -1], [1, 1]]) {
      const p = slipPoint(x, y);
      const c = BOARD.centre;
      const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      expect(Math.abs(dot(d, BOARD_AXES.right))).toBeLessThan(BOARD.halfW - 0.1);
      expect(Math.abs(dot(d, BOARD_AXES.up))).toBeLessThan(BOARD.halfH - 0.1);
    }
    expect(boardPoint(0, 0, 0)).toEqual([...BOARD.centre]);
  });

  it('moves without jumps from the crate to the board and on', () => {
    const pinned = pose();
    const lifted = pose({ stage: STAGES.approach, move: 0 });
    IN_TOP.forEach((v, i) => expect(lifted[i]).toBeCloseTo(v, 10));
    expect(lifted[4]).toBeCloseTo(0, 10); // lying flat in the crate
    expect(lifted[7]).toBeCloseTo(0, 10);
    const landed = pose({ stage: STAGES.approach, move: 1 });
    const leaving = pose({ stage: STAGES.leave, move: 0 });
    for (let i = 0; i < 9; i += 1) {
      expect(landed[i]).toBeCloseTo(pinned[i], 10);
      expect(leaving[i]).toBeCloseTo(pinned[i], 10);
    }
    expect(Math.hypot(pinned[3], pinned[4], pinned[5])).toBeCloseTo(SLIP.halfW, 10);
    expect(Math.hypot(pinned[6], pinned[7], pinned[8])).toBeCloseTo(SLIP.halfH, 10);
  });

  it('holds the spyglass in front of the board, aimed at the point it looks at', () => {
    const out = new Float64Array(9);
    spyglassPose(0.3, 0.2, 0, out);
    const axis = [out[3], out[4], out[5]];
    expect(Math.hypot(...axis)).toBeCloseTo(1, 10);
    const toFocus = [out[6] - out[0], out[7] - out[1], out[8] - out[2]];
    expect(dot(toFocus, axis) / Math.hypot(...toFocus)).toBeCloseTo(-1, 6); // the objective looks straight at it
    const c = BOARD.centre;
    expect(dot([out[0] - c[0], out[1] - c[1], out[2] - c[2]], BOARD_AXES.normal)).toBeGreaterThan(0.3);
    expect(SPYGLASS.view).toBeLessThan(SLIP.halfH / 2);
  });
});
