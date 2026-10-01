import { describe, expect, it } from 'vitest';
import { MILESTONES, formatMilestoneDate, milestoneRange, nextMilestoneIndex } from './milestones.js';

describe('MILESTONES', () => {
  it('runs from the proposal to the final, in date order', () => {
    expect(MILESTONES.map((m) => m.id)).toEqual(['proposal', 'iskelet', 'canli-test-kurallar', 'progress', 'final']);
    const starts = MILESTONES.map((m) => milestoneRange(m.date).start.getTime());
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe('milestoneRange', () => {
  it('spans one local day for YYYY-MM-DD', () => {
    const { start, end, precision } = milestoneRange('2026-10-12');
    expect(precision).toBe('day');
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 9, 12, 0]);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([12, 23, 59]);
  });

  it('spans the whole month for YYYY-MM', () => {
    const { start, end, precision } = milestoneRange('2027-01');
    expect(precision).toBe('month');
    expect([start.getMonth(), start.getDate()]).toEqual([0, 1]);
    expect([end.getMonth(), end.getDate()]).toEqual([0, 31]);
  });

  it('rejects anything else', () => {
    expect(() => milestoneRange('Ocak 2027')).toThrow(RangeError);
  });
});

describe('nextMilestoneIndex', () => {
  it('is the proposal before 12 October', () => {
    expect(nextMilestoneIndex(MILESTONES, new Date(2026, 8, 29))).toBe(0);
  });

  it('keeps a milestone "next" through its own day', () => {
    expect(nextMilestoneIndex(MILESTONES, new Date(2026, 9, 12, 18))).toBe(0);
    expect(nextMilestoneIndex(MILESTONES, new Date(2026, 9, 13))).toBe(1);
  });

  it('keeps the month-only final next through January 2027, then none', () => {
    expect(nextMilestoneIndex(MILESTONES, new Date(2026, 11, 1))).toBe(4);
    expect(nextMilestoneIndex(MILESTONES, new Date(2027, 0, 31, 12))).toBe(4);
    expect(nextMilestoneIndex(MILESTONES, new Date(2027, 1, 1))).toBe(-1);
  });
});

describe('formatMilestoneDate', () => {
  it('writes days short and month-only dates long, in Turkish', () => {
    expect(formatMilestoneDate('2026-10-12')).toBe('12 Eki 2026');
    expect(formatMilestoneDate('2026-11-09')).toBe('9 Kas 2026');
    expect(formatMilestoneDate('2027-01')).toBe('Ocak 2027');
  });
});
