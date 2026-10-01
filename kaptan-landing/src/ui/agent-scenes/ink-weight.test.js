import { describe, expect, test } from 'vitest';
import { inkWeightFor, weightLines } from './ink-weight.js';

class FakeCtx {
  constructor() {
    this._w = 1;
  }

  get lineWidth() {
    return this._w;
  }

  set lineWidth(v) {
    this._w = v;
  }
}

describe('inkWeightFor', () => {
  test('no extra weight up to the size the scenes were drawn at, then heavier, capped', () => {
    expect(inkWeightFor(0)).toBe(1);
    expect(inkWeightFor(300)).toBe(1);
    expect(inkWeightFor(552)).toBeCloseTo(1.2, 5);
    expect(inkWeightFor(2000)).toBe(1.4);
  });
});

describe('weightLines', () => {
  test('weights what a scene sets, reads back what it set, and undoes cleanly', () => {
    const ctx = new FakeCtx();
    let k = 1.25;
    const undo = weightLines(ctx, () => k);
    ctx.lineWidth = 2;
    expect(ctx._w).toBe(2.5);
    expect(ctx.lineWidth).toBe(2);
    k = 1;
    ctx.lineWidth = 2;
    expect(ctx._w).toBe(2);
    undo();
    ctx.lineWidth = 3;
    expect(ctx._w).toBe(3);
  });

  test('leaves a context without the accessor alone', () => {
    expect(() => weightLines({}, () => 2)()).not.toThrow();
    expect(() => weightLines(null, () => 2)()).not.toThrow();
  });
});
