import { describe, expect, it } from 'vitest';
import { BEAT_LABELS, RULE_IDS, beatProgress, labelFor, poseAt, smooth } from './beats.js';

describe('poseAt', () => {
  it('starts on E1 at its preset with every pennant down', () => {
    const pose = poseAt(0);
    expect(pose).toMatchObject({ active: 0, slot: 'E1', leak: 0, filterInk: 0 });
    expect(pose.gate).toEqual([0, 0, 0, 0]);
    expect(Object.values(pose.instrument)).toEqual([0, 0, 0, 0]);
  });

  it('rests on each rule fully fired and hoisted at its label', () => {
    RULE_IDS.forEach((id, k) => {
      const pose = poseAt(BEAT_LABELS[id]);
      expect(pose.active).toBe(k);
      expect(pose.slot).toBe(id);
      expect(pose.instrument[id]).toBe(1);
      expect(pose.gate.slice(0, k + 1)).toEqual(Array(k + 1).fill(1));
      expect(pose.gate.slice(k + 1)).toEqual(Array(3 - k).fill(0));
    });
  });

  it('stays on the rule a snapped scroll rests on, a pixel either side of its label', () => {
    RULE_IDS.forEach((id, k) => {
      expect(poseAt(BEAT_LABELS[id] + 0.0005).active).toBe(k);
      expect(poseAt(BEAT_LABELS[id] - 0.0005).active).toBe(k);
    });
  });

  it('crosses the threshold before the pennant starts up the halyard', () => {
    for (let p = 0; p <= 0.18; p += 0.005) {
      const pose = poseAt(p);
      if (pose.gate[0] > 0) expect(pose.instrument.E1).toBeGreaterThan(0.9);
    }
  });

  it('dips everything at the filters rest point and lets it rise again by the end', () => {
    const rest = poseAt(BEAT_LABELS.filters);
    expect(rest).toMatchObject({ active: 4, slot: 'leak', filterInk: 1 });
    expect(rest.leak).toBe(1);
    expect(rest.gate).toEqual([1, 1, 1, 1]);
    const end = poseAt(1);
    expect(end.leak).toBe(0);
    expect(end.gate).toEqual([1, 1, 1, 1]);
  });

  it('plays backwards exactly as forwards (a pure function of p)', () => {
    [0.13, 0.37, 0.58, 0.91].forEach((p) => expect(poseAt(p)).toEqual(poseAt(p)));
    let last = -1;
    for (let p = 0; p <= 0.72; p += 0.01) {
      const total = poseAt(p).gate.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(last);
      last = total;
    }
  });

  it('clamps nonsense input', () => {
    expect(poseAt(-2)).toEqual(poseAt(0));
    expect(poseAt(9)).toEqual(poseAt(1));
    expect(poseAt(Number.NaN)).toEqual(poseAt(0));
  });
});

describe('helpers', () => {
  it('smooth eases between its edges', () => {
    expect(smooth(0, 1, -1)).toBe(0);
    expect(smooth(0, 1, 0.5)).toBe(0.5);
    expect(smooth(0, 1, 2)).toBe(1);
  });

  it('draws each underline across its own beat', () => {
    expect(beatProgress(0, 0)).toBe(0);
    expect(beatProgress(BEAT_LABELS.E1, 0)).toBe(1);
    expect(beatProgress(BEAT_LABELS.E1, 1)).toBe(0);
    expect(beatProgress((BEAT_LABELS.E2 + BEAT_LABELS.E3) / 2, 2)).toBeCloseTo(0.5);
  });

  it('maps a click to the beat label', () => {
    expect(labelFor('E3')).toBe('E3');
    expect(labelFor('leak')).toBe('filters');
    expect(labelFor('x')).toBe('start');
  });

  it('keeps the labels in order', () => {
    const values = Object.values(BEAT_LABELS);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});
