import { describe, expect, it } from 'vitest';
import {
  CAST,
  DAY_BREAK,
  GATES,
  INPUTS,
  LOOP,
  REJECT,
  REPEAT_CARD,
  STAGES,
  STILL_ELAPSED,
  TIMING,
  cardClock,
  createFrameState,
  frameAt,
  landingPhase,
  lerpAngle,
  needleAngle,
  wrap,
  writeTrays,
} from './model.js';

describe('Kural Motoru model', () => {
  it('lays out four gates E1–E4 and the end of the rail, with the written thresholds', () => {
    expect(GATES.map((g) => g.code)).toEqual(['E1', 'E2', 'E3', 'E4', 'Eşik altı']);
    expect(GATES[0].rule.join(' ')).toMatch(/10 seans.*%0,25/);
    expect(GATES[2].rule.join(' ')).toMatch(/%10/);
    for (const input of INPUTS) expect(input.issuer).toMatch(/^ÖRNEK /);
  });

  it('decides by the written threshold: E1 at or above %0,25 passes, below it does not', () => {
    const e1 = INPUTS.filter((input) => input.code === 'E1');
    const pct = (input) => Number(input.field.match(/%(\d+,\d+)/)[1].replace(',', '.'));
    for (const input of e1) expect(input.gateIndex === 0).toBe(pct(input) >= 0.25);
    expect(e1.some((input) => input.gateIndex === REJECT)).toBe(true);
  });

  it('feeds the same card twice and sends it through the same gate both times', () => {
    const passes = CAST.filter((card) => card.input === CAST[REPEAT_CARD].input);
    expect(passes).toHaveLength(2);
    expect(new Set(passes.map((card) => card.gateIndex)).size).toBe(1);
    expect(passes.map((card) => card.slot)).toEqual([0, 1]);
    expect(CAST[REPEAT_CARD].repeat).toBe(true);
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(12.3, createFrameState());
    const b = frameAt(12.3 + LOOP, createFrameState());
    expect(b.cards).toEqual(a.cards);
    expect(b.trays).toEqual(a.trays);
    expect(b.needle).toBeCloseTo(a.needle, 10);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
  });

  it('is deterministic: the same elapsed always gives the same frame', () => {
    expect(frameAt(7.77, createFrameState())).toEqual(frameAt(7.77, createFrameState()));
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('walks each card through hopper → feed → read → travel → drop → in its tray', () => {
    const state = createFrameState();
    const k = 1;
    const seen = [];
    for (let u = -4 * TIMING.every; u < 4.9; u += 0.02) {
      frameAt(k * TIMING.every + u - TIMING.start, state);
      const stage = state.cards[k].stage;
      if (seen[seen.length - 1] !== stage) seen.push(stage);
    }
    expect(seen).toEqual([STAGES.hidden, STAGES.hopper, STAGES.feed, STAGES.read, STAGES.travel, STAGES.drop, STAGES.hidden]);
    for (let t = 0; t < LOOP; t += 0.5) {
      for (let c = 0; c < CAST.length; c += 1) {
        const u = cardClock(t, c);
        expect(u).toBeGreaterThanOrEqual(-(LOOP - 5));
        expect(u).toBeLessThan(5);
      }
    }
  });

  it('keeps one card under the bridge at a time', () => {
    const state = createFrameState();
    for (let e = 0; e < LOOP; e += 0.1) {
      frameAt(e, state);
      expect(state.cards.filter((card) => card.stage === STAGES.read).length).toBeLessThanOrEqual(1);
    }
  });

  it('swings the needle to the decided gate and holds it there', () => {
    const state = frameAt(STILL_ELAPSED);
    const card = CAST[4];
    expect(state.needle).toBeCloseTo(needleAngle(card.gateIndex), 5);
    expect(state.target).toBe(card.gateIndex);
    expect(state.slate.card).toBe(4);
    expect(needleAngle(REJECT)).toBeCloseTo(-Math.PI / 2);
    // the shorter way round: from E1 down the left side to the foot
    expect(lerpAngle(needleAngle(0), 1.5 * Math.PI, 1)).toBeCloseTo(1.5 * Math.PI, 5);
    expect(lerpAngle(needleAngle(0), -Math.PI / 2, 0.5)).toBeGreaterThan(needleAngle(0));
  });

  it('shows both passes of the repeat in its tray in the still, bracketed', () => {
    const state = frameAt(STILL_ELAPSED);
    const g = CAST[REPEAT_CARD].gateIndex;
    expect(state.trays[g].map((entry) => CAST[entry.card]?.input)).toEqual([CAST[REPEAT_CARD].input, CAST[REPEAT_CARD].input]);
    expect(state.bracket.ink).toBe(1);
  });

  it('fills each tray through the day and empties them before the first landing', () => {
    const trays = createFrameState().trays;
    writeTrays(trays, LOOP - 0.001);
    expect(trays.flat().filter((entry) => entry.card >= 0)).toHaveLength(CAST.length);
    const firstAt = wrap(landingPhase(0) - DAY_BREAK, LOOP);
    expect(firstAt).toBeGreaterThan(TIMING.wipeFor);
    writeTrays(trays, firstAt - 0.01);
    expect(trays.flat().every((entry) => entry.card < 0)).toBe(true);
    writeTrays(trays, TIMING.wipeFor * 0.5);
    expect(trays.flat().some((entry) => entry.sink > 0)).toBe(true);
  });
});
