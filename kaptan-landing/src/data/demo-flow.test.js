import { describe, expect, it } from 'vitest';
import { DEMO_FINAL, DEMO_STEPS } from './demo-flow.js';

describe('DEMO_STEPS', () => {
  it('has six numbered steps that end with the human approval', () => {
    expect(DEMO_STEPS).toHaveLength(6);
    expect(DEMO_STEPS.map((step) => step.number)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(DEMO_STEPS.at(-1).title).toBe('İnsan onaylar');
    DEMO_STEPS.forEach((step) => expect(step.text.length).toBeGreaterThan(40));
  });

  it('names a distinct storyboard drawing for every panel', () => {
    const arts = DEMO_STEPS.map((step) => step.art);
    expect(arts).toEqual(['arrive', 'read', 'weigh', 'doubt', 'rules', 'approve']);
  });

  it('points at the January 2027 final', () => {
    expect(DEMO_FINAL.date).toBe('2027-01');
  });
});
