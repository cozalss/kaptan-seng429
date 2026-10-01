import { describe, expect, it } from 'vitest';
import {
  CANAL,
  CAST,
  FATES,
  HARBOUR,
  LOOP,
  RULES,
  RULE_COUNT,
  STAGES,
  STILL_ELAPSED,
  TIMING,
  VERDICTS,
  bowTime,
  createFrameState,
  departure,
  frameAt,
  leverAt,
  rejectPlan,
  ruleX,
  run,
  runTime,
  wrap,
} from './model.js';

/** Elapsed seconds that put the loop clock at loop time t. */
const at = (t) => t - TIMING.start;
const sailing = (k) => CAST[k].fate !== 'iptal';

describe('Risk Kapısı model', () => {
  it('numbers sixteen rules R01–R16 along the quay, between the queue and the gate', () => {
    expect(RULES).toHaveLength(16);
    expect(RULES[0]).toBe('R01');
    expect(RULES[15]).toBe('R16');
    for (let i = 1; i < RULE_COUNT; i += 1) expect(ruleX(i)).toBeGreaterThan(ruleX(i - 1));
    expect(CANAL.queue[0] + CANAL.halfLength).toBeLessThan(ruleX(0));
    expect(CANAL.gate).toBeGreaterThan(ruleX(RULE_COUNT - 1));
    for (const berth of HARBOUR) expect(berth.x - CANAL.halfLength).toBeGreaterThan(CANAL.gate);
  });

  it('casts each verdict at least once, and every cut only lowers a stack', () => {
    const fates = new Set(CAST.map((b) => b.fate));
    expect([...fates].sort()).toEqual(['aynen', 'iptal', 'kucult', 'reddet']);
    expect(CAST.filter((b) => b.fate === 'reddet')).toHaveLength(1);
    for (const barge of CAST) {
      let size = barge.size;
      for (const cut of barge.cuts) {
        expect(cut.to).toBeLessThan(size);
        expect(cut.rule).toBeGreaterThanOrEqual(0);
        expect(cut.rule).toBeLessThan(RULE_COUNT);
        size = cut.to;
      }
      expect(barge.fate === 'kucult').toBe(barge.cuts.length > 0);
    }
    expect(VERDICTS[FATES.iptal]).toBe('İptal');
  });

  it('runs and inverts the cast-off curve', () => {
    expect(run(0)).toBe(0);
    for (const d of [0.1, 0.3, 1, 4.2]) expect(run(runTime(d))).toBeCloseTo(d, 9);
  });

  it('loops without a seam: the same frame one loop later', () => {
    const a = frameAt(11.7, createFrameState());
    const b = frameAt(11.7 + LOOP, createFrameState());
    const same = (x, y) => {
      for (const key of Object.keys(x)) expect(y[key]).toBeCloseTo(x[key], 9);
    };
    a.barges.forEach((barge, k) => same(barge, b.barges[k]));
    a.rules.forEach((rule, i) => same(rule, b.rules[i]));
    expect(b.lever).toBeCloseTo(a.lever, 10);
    expect(b.camera.yaw).toBeCloseTo(a.camera.yaw, 10);
  });

  it('inks the plate in over the intro, then holds it', () => {
    expect(frameAt(0).intro).toBe(0);
    expect(frameAt(TIMING.intro / 2).intro).toBeGreaterThan(0);
    expect(frameAt(TIMING.intro + 1).intro).toBe(1);
  });

  it('never enlarges a proposal: every stack only ever shrinks through the loop', () => {
    const state = createFrameState();
    const last = CAST.map(() => Infinity);
    for (let t = 0; t < LOOP; t += 0.05) {
      frameAt(at(t), state);
      state.barges.forEach((barge, k) => {
        if (barge.stage === STAGES.hidden) {
          last[k] = Infinity;
          return;
        }
        expect(barge.size).toBeLessThanOrEqual(CAST[k].size + 1e-9);
        if (barge.stage >= STAGES.sail) {
          expect(barge.size).toBeLessThanOrEqual(last[k] + 1e-9);
          last[k] = barge.size;
        }
      });
    }
  });

  it('stamps each passed barge at the gate: Aynen if untouched, Küçült if cut', () => {
    const state = createFrameState();
    CAST.forEach((cast, k) => {
      if (!sailing(k) || cast.reject >= 0) return;
      frameAt(at(departure(k) + bowTime(CANAL.gate) + 0.5), state);
      const barge = state.barges[k];
      expect(barge.x + CANAL.halfLength).toBeGreaterThan(CANAL.gate);
      expect(VERDICTS[barge.verdict]).toBe(cast.cuts.length ? 'Küçült' : 'Aynen');
      expect(barge.stamp).toBe(1);
    });
  });

  it('stops the rejected barge at its rule, stamps it Reddet and turns it back before the gate', () => {
    const k = CAST.findIndex((b) => b.fate === 'reddet');
    const plan = rejectPlan(CAST[k].reject);
    const state = createFrameState();
    frameAt(at(departure(k) + plan.stopAt + 0.5), state);
    expect(state.barges[k].stage).toBe(STAGES.stop);
    expect(state.barges[k].x).toBeCloseTo(plan.stopX, 5);
    expect(VERDICTS[state.barges[k].verdict]).toBe('Reddet');
    expect(state.rules[CAST[k].reject].boom).toBe(1);
    // its hull never reaches the boom, not even while it warps round
    let maxX = -Infinity;
    for (let s = 0; s < plan.leaveAt + TIMING.leave; s += 0.05) {
      frameAt(at(departure(k) + s), state);
      const b = state.barges[k];
      if (b.stage === STAGES.hidden) continue;
      maxX = Math.max(maxX, b.x + Math.abs(Math.cos(b.yaw)) * CANAL.halfLength + Math.abs(Math.sin(b.yaw)) * 0.25);
    }
    expect(maxX).toBeLessThan(ruleX(CAST[k].reject));
    frameAt(at(departure(k) + plan.leaveAt + 1), state);
    expect(state.barges[k].yaw).toBeCloseTo(Math.PI, 5);
    expect(state.barges[k].z).toBeCloseTo(CANAL.back, 5);
  });

  it('swings each cutting rule’s arm out to the new limit, never above the stack it meets', () => {
    const state = createFrameState();
    CAST.forEach((cast, k) => {
      let prev = cast.size;
      for (const cut of cast.cuts) {
        frameAt(at(departure(k) + bowTime(ruleX(cut.rule))), state);
        expect(state.rules[cut.rule].arm).toBe(1);
        expect(state.rules[cut.rule].armSize).toBe(cut.to);
        expect(state.rules[cut.rule].armSize).toBeLessThan(prev);
        prev = cut.to;
      }
    });
  });

  it('throws the kill switch once a loop with the row clear, then sets it back', () => {
    let throws = 0;
    let prev = leverAt(0);
    for (let t = 0.01; t < LOOP; t += 0.01) {
      const lever = leverAt(t);
      if (prev < 0.5 && lever >= 0.5) throws += 1;
      prev = lever;
    }
    expect(throws).toBe(1);
    const state = frameAt(at(TIMING.kill + TIMING.throw));
    expect(state.lever).toBe(1);
    for (const barge of state.barges) {
      if (barge.stage === STAGES.hidden) continue;
      // nothing is between the rules when the switch is thrown
      const inRow = barge.x + CANAL.halfLength > ruleX(0) && barge.x - CANAL.halfLength < CANAL.gate;
      expect(inRow).toBe(false);
    }
  });

  it('unmoors and cancels only the queue when the switch is thrown; the harbour stays tied', () => {
    const state = createFrameState();
    frameAt(at(TIMING.kill - 0.1), state);
    const queued = state.barges.map((b, k) => (b.stage === STAGES.moored ? k : -1)).filter((k) => k >= 0);
    expect(queued.sort()).toEqual([5, 6]);
    for (const k of queued) expect(state.barges[k].rope).toBe(1);
    frameAt(at(TIMING.kill + TIMING.throw + TIMING.unmoor + 1), state);
    for (const k of queued) {
      expect(state.barges[k].stage).toBe(STAGES.drift);
      expect(state.barges[k].rope).toBe(0);
      expect(VERDICTS[state.barges[k].verdict]).toBe('İptal');
    }
    expect(state.kill).toBe(1);
    // the harbour's barges are fixed scenery: nothing in the timeline moves or cuts them
    expect(Object.isFrozen(HARBOUR)).toBe(true);
    frameAt(at(TIMING.kill + TIMING.throw + TIMING.unmoor + TIMING.drift + 0.1), state);
    for (const k of queued) expect(state.barges[k].stage).toBe(STAGES.hidden);
  });

  it('keeps barges from running into one another', () => {
    const state = createFrameState();
    const pts = (b) => [-0.45, 0, 0.45].map((f) => [b.x + Math.cos(b.yaw) * f, b.z - Math.sin(b.yaw) * f]);
    for (let t = 0; t < LOOP; t += 0.05) {
      frameAt(at(t), state);
      const live = state.barges.filter((b) => b.stage !== STAGES.hidden && b.alpha > 0.05);
      for (let i = 0; i < live.length; i += 1) {
        for (let j = i + 1; j < live.length; j += 1) {
          let min = Infinity;
          for (const p of pts(live[i])) for (const q of pts(live[j])) min = Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1]));
          expect(min).toBeGreaterThan(0.38);
        }
      }
      // never two moored at one berth
      for (const x of CANAL.queue) expect(state.barges.filter((b) => b.stage === STAGES.moored && b.x === x).length).toBeLessThanOrEqual(1);
    }
  });

  it('prints a still with a cut, a stopped barge and the queue astir', () => {
    const state = frameAt(STILL_ELAPSED);
    const t = wrap(STILL_ELAPSED + TIMING.start, LOOP);
    expect(state.t).toBeCloseTo(t, 9);
    expect(state.barges.some((b) => VERDICTS[b.verdict] === 'Reddet')).toBe(true);
    expect(state.rules.some((r) => r.arm > 0 || r.boom > 0)).toBe(true);
    expect(state.barges.filter((b) => b.stage === STAGES.shift || b.stage === STAGES.moored).length).toBeGreaterThanOrEqual(1);
    expect(state.lever).toBe(0);
  });
});
