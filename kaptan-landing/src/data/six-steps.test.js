import { describe, expect, it } from 'vitest';
import { SIX_STEPS } from './six-steps.js';

describe('SIX_STEPS', () => {
  it('has six numbered steps that end with your approval', () => {
    expect(SIX_STEPS).toHaveLength(6);
    expect(SIX_STEPS.map((step) => step.number)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(SIX_STEPS.at(-1).title).toBe('Sen onaylarsın');
    SIX_STEPS.forEach((step) => expect(step.text.length).toBeGreaterThan(40));
  });

  it('names a distinct storyboard drawing for every panel', () => {
    const arts = SIX_STEPS.map((step) => step.art);
    expect(arts).toEqual(['arrive', 'read', 'weigh', 'doubt', 'rules', 'approve']);
  });
});
