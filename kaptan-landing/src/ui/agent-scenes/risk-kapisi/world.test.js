import { describe, expect, it } from 'vitest';
import { CANAL, HARBOUR } from './model.js';
import {
  BARGE,
  BOLLARD,
  BOLLARD_X,
  BOX_FACES,
  GATE,
  HARBOUR_POSTS,
  LEVER,
  PLAQUE,
  QUAY,
  QUEUE_POSTS,
  TAG,
  bargeAxes,
  deckY,
  writeBox,
} from './world.js';

describe('Risk Kapısı world', () => {
  it('stands the bollards on the far quay and the queue’s posts on the near one', () => {
    for (const x of BOLLARD_X) expect(Number.isFinite(x)).toBe(true);
    expect(BOLLARD.z).toBeLessThan(QUAY.back);
    for (const post of QUEUE_POSTS) expect(post[2]).toBeGreaterThan(QUAY.front);
    for (const post of HARBOUR_POSTS) expect(post[2]).toBeLessThan(QUAY.back);
    expect(HARBOUR_POSTS).toHaveLength(HARBOUR.length * 2);
    // tags are narrower than the spacing between bollards (they never overlap)
    expect(TAG.halfW * 2).toBeLessThan(BOLLARD_X[1] - BOLLARD_X[0]);
    expect(TAG.y + TAG.halfH).toBeLessThanOrEqual(QUAY.top);
  });

  it('keeps the lanes inside the canal and the barges between its quays', () => {
    for (const lane of [CANAL.main, CANAL.back]) {
      expect(lane + BARGE.halfWidth).toBeLessThan(QUAY.front);
      expect(lane - BARGE.halfWidth).toBeGreaterThan(QUAY.back);
    }
    expect(CANAL.main - CANAL.back).toBeGreaterThan(BARGE.halfWidth * 2);
  });

  it('puts the kill switch on the near gate post, and its sign on the near quay', () => {
    expect(LEVER.pivot[0]).toBeCloseTo(GATE.x, 0);
    expect(LEVER.pivot[2]).toBeGreaterThan(GATE.frontZ);
    expect(LEVER.pivot[1] + LEVER.length).toBeLessThan(GATE.height);
    expect(PLAQUE.centre[2]).toBeGreaterThan(QUAY.front);
    expect(PLAQUE.centre[1] - PLAQUE.halfH).toBeGreaterThan(QUAY.top);
    // the gate clears the tallest stack
    expect(GATE.height - GATE.transom).toBeGreaterThan(deckY(0) + BARGE.cargoHeight);
  });

  it('rides a light barge higher than a laden one', () => {
    expect(deckY(0.4)).toBeGreaterThan(deckY(1));
    expect(deckY(1)).toBeCloseTo(BARGE.hull);
  });

  it('heads a barge along its yaw, its near side toward the viewer', () => {
    const ax = new Float64Array(6);
    bargeAxes(0, ax);
    expect([...ax]).toEqual([1, 0, -0, 0, 0, 1]);
    bargeAxes(Math.PI, ax);
    expect(ax[0]).toBeCloseTo(-1);
    expect(ax[5]).toBeCloseTo(-1);
    bargeAxes(0.7, ax);
    expect(ax[0] * ax[3] + ax[2] * ax[5]).toBeCloseTo(0);
  });

  it('writes a raked box: its top larger than its waterline, every face a loop of four corners', () => {
    const ax = bargeAxes(0, new Float64Array(6));
    const out = new Float64Array(24);
    writeBox(out, 0, ax, 1, 0.2, 0, 0.2, 0.44, 0.2, 0.55, 0.25);
    const corner = (l, v, w) => out.subarray((l + 2 * v + 4 * w) * 3, (l + 2 * v + 4 * w) * 3 + 3);
    expect(corner(1, 1, 1)[0]).toBeCloseTo(1.55);
    expect(corner(1, 0, 1)[0]).toBeCloseTo(1.44);
    expect(corner(0, 1, 0)[2]).toBeCloseTo(-0.05);
    expect(corner(0, 0, 0)[1]).toBe(0);
    expect(corner(0, 1, 0)[1]).toBe(0.2);
    for (const face of BOX_FACES) {
      expect(new Set(face).size).toBe(4);
      for (const i of face) expect(i).toBeLessThan(8);
    }
  });
});
