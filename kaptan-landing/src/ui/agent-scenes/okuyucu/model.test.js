import { describe, expect, it } from 'vitest';
import {
  CAST,
  FIELDS,
  LOOP,
  STILL_ELAPSED,
  TAG,
  TIMING,
  VALUE_ROWS,
  createFrameState,
  frameAt,
  pinAt,
  rulePosition,
  wrap,
} from './model.js';

/** Elapsed seconds at which page p's clock reads u. */
const at = (p, u) => p * TIMING.page + u - TIMING.start;

describe('Okuyucu model', () => {
  it('reads three fields from fictional pages, each with a value per field', () => {
    expect(FIELDS.map((f) => f.label)).toEqual(['Tutar', 'Karşı taraf', 'Süre']);
    for (const page of CAST) {
      expect(page.issuer).toMatch(/^ÖRNEK /);
      expect(page.values).toHaveLength(FIELDS.length);
    }
    // the form never asks for a ratio: no field is one
    expect(FIELDS.some((f) => /oran/i.test(f.label))).toBe(false);
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(12.3, createFrameState());
    const b = frameAt(12.3 + LOOP, createFrameState());
    expect(b.tags).toEqual(a.tags);
    expect(b.spots).toEqual(a.spots);
    expect(b.form).toEqual(a.form);
    expect(b.rule).toEqual(a.rule);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
    expect(wrap(-1, 5)).toBe(4);
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro / 2).intro).toBeGreaterThan(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('runs the reading rule down the page, resting on each value it finds', () => {
    let last = -Infinity;
    for (let u = 0; u < TIMING.page; u += 0.05) {
      const y = rulePosition(u);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      last = y;
    }
    TIMING.find.forEach((find, f) => {
      expect(rulePosition(find + 0.01)).toBe(VALUE_ROWS[f]);
      expect(rulePosition(find + TIMING.hold - 0.01)).toBe(VALUE_ROWS[f]);
    });
  });

  it('walks each tag through hidden → lift → flight → pinned, in field order', () => {
    const state = createFrameState();
    for (let f = 0; f < FIELDS.length; f += 1) {
      const seen = [];
      for (let u = 0; u < TIMING.asideAt; u += 0.02) {
        frameAt(at(1, u), state);
        const stage = state.tags[f].stage;
        if (seen[seen.length - 1] !== stage) seen.push(stage);
      }
      expect(seen).toEqual([TAG.hidden, TAG.lift, TAG.flight, TAG.pinned]);
    }
    for (let f = 1; f < FIELDS.length; f += 1) expect(pinAt(f)).toBeGreaterThan(pinAt(f - 1) + TIMING.pin);
    expect(pinAt(FIELDS.length - 1) + TIMING.pin).toBeLessThan(TIMING.asideAt);
  });

  it('keeps at most one value in north red and one tag in the air at a time', () => {
    const state = createFrameState();
    for (let e = 0; e < LOOP; e += 0.05) {
      frameAt(e, state);
      expect(state.spots.filter((s) => s.red > 0).length).toBeLessThanOrEqual(1);
      expect(state.tags.filter((t) => t.stage === TAG.lift || t.stage === TAG.flight).length).toBeLessThanOrEqual(1);
    }
  });

  it('sets the filled form aside, puts up a blank one and feeds the next page', () => {
    const state = createFrameState();
    frameAt(at(0, TIMING.asideAt - 0.1), state);
    expect(state.form.onBoard).toBe(true);
    expect(state.tags.every((t) => t.stage === TAG.pinned)).toBe(true);
    expect(state.form.stackTop).toBe(CAST.length - 1);
    frameAt(at(0, TIMING.asideAt + TIMING.aside / 2), state);
    expect(state.form.onBoard).toBe(false);
    expect(state.form.aside).toBeGreaterThan(0);
    frameAt(at(0, TIMING.blankAt + TIMING.blank + 0.05), state);
    expect(state.form.stackTop).toBe(0);
    expect(state.form.blank).toBe(1);
    expect(state.form.blankPage).toBe(1);
    frameAt(at(1, TIMING.feed / 2), state);
    expect(state.page).toBe(1);
    expect(state.feed).toBeGreaterThan(0);
    expect(state.feed).toBeLessThan(1);
    expect(state.tags.every((t) => t.stage === TAG.hidden)).toBe(true);
  });

  it('prints a still with one field pinned and the next tag on its course', () => {
    const state = frameAt(STILL_ELAPSED);
    expect(STILL_ELAPSED).toBeGreaterThan(TIMING.intro);
    expect(state.tags[0].stage).toBe(TAG.pinned);
    expect(state.tags[1].stage).toBe(TAG.flight);
    expect(state.tags[2].stage).toBe(TAG.hidden);
  });
});
