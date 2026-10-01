import { describe, expect, it } from 'vitest';
import { EVENT_ARTICLES } from '../../data/events.js';
import { PENNANT_STATES, RULES, checkRule, leakFilter, pennantState, screenGates } from './rules-check.js';

const PASS = { screened: true, leak: 'pass' };

describe('RULES', () => {
  it('carries the brief thresholds and the holding periods of events.js', () => {
    expect(RULES.E1).toMatchObject({ threshold: 0.25, unit: '%', hold: [20, 40] });
    expect(RULES.E2).toMatchObject({ threshold: null, hold: [20, 60] });
    expect(RULES.E3).toMatchObject({ threshold: 10, unit: '%', hold: [5, 5] });
    expect(RULES.E4).toMatchObject({ threshold: null, hold: [5, 10] });
    EVENT_ARTICLES.forEach((article) => expect(RULES[article.code].hold).toEqual(article.hold));
  });

  it('is frozen', () => {
    expect(Object.isFrozen(RULES)).toBe(true);
    expect(Object.isFrozen(RULES.E1)).toBe(true);
  });
});

describe('checkRule', () => {
  it('E1 fires at 0,25 % of capital and not a hair below', () => {
    expect(checkRule('E1', { sharePct: 0.19 })).toEqual({ fired: false, margin: expect.closeTo(-0.06, 10) });
    expect(checkRule('E1', { sharePct: 0.2499 }).fired).toBe(false);
    expect(checkRule('E1', { sharePct: 0.25 })).toEqual({ fired: true, margin: 0 });
    expect(checkRule('E1', { sharePct: 0.31 }).margin).toBeCloseTo(0.06, 10);
  });

  it('E3 fires when the annualised amount reaches 10 % of yearly revenue', () => {
    expect(checkRule('E3', { annualisedPctOfRevenue: 9.9 }).fired).toBe(false);
    expect(checkRule('E3', { annualisedPctOfRevenue: 10 })).toEqual({ fired: true, margin: 0 });
    expect(checkRule('E3', { annualisedPctOfRevenue: 14 }).margin).toBeCloseTo(4, 10);
  });

  it('E2 and E4 have no number: the disclosure itself fires them, with no margin', () => {
    expect(checkRule('E2', { disclosed: true })).toEqual({ fired: true, margin: null });
    expect(checkRule('E2', { disclosed: false })).toEqual({ fired: false, margin: null });
    expect(checkRule('E4', { disclosed: true })).toEqual({ fired: true, margin: null });
    expect(checkRule('E4', {})).toEqual({ fired: false, margin: null });
  });

  it('never fires on missing or broken numbers', () => {
    [undefined, null, Number.NaN, Infinity, '0.3', -1].forEach((value) => {
      expect(checkRule('E1', { sharePct: value }).fired, String(value)).toBe(false);
      expect(checkRule('E3', { annualisedPctOfRevenue: value }).fired, String(value)).toBe(false);
    });
    expect(checkRule('E1').fired).toBe(false);
    expect(checkRule('E2', { disclosed: 'yes' }).fired).toBe(false);
  });

  it('throws on an unknown rule', () => {
    expect(() => checkRule('E5', {})).toThrow(/E5/);
  });
});

describe('leakFilter', () => {
  it('passes up to 8 % and skips or halves above it', () => {
    expect(leakFilter(0)).toBe('pass');
    expect(leakFilter(8)).toBe('pass');
    expect(leakFilter(8.01)).toBe('skip-or-halve');
    expect(leakFilter(-3)).toBe('pass');
  });

  it('treats an unreadable rise as a pass (the filter only acts on evidence)', () => {
    expect(leakFilter(Number.NaN)).toBe('pass');
    expect(leakFilter(undefined)).toBe('pass');
  });
});

describe('screenGates', () => {
  it('passes only when all three gates are open', () => {
    expect(screenGates({ tradable: true, noMeasure: true, inUniverse: true })).toEqual({ pass: true, failed: [] });
  });

  it('names every failed gate, in the brief order', () => {
    expect(screenGates({ tradable: false, noMeasure: true, inUniverse: false })).toEqual({
      pass: false,
      failed: ['tradable', 'inUniverse'],
    });
    expect(screenGates({}).failed).toEqual(['tradable', 'noMeasure', 'inUniverse']);
    expect(screenGates().pass).toBe(false);
  });
});

describe('pennantState', () => {
  it('hoists a fired rule when every filter passes, and leaves an unfired one down', () => {
    expect(pennantState(true, PASS)).toBe('hoisted');
    expect(pennantState(false, PASS)).toBe('down');
    expect(pennantState(true)).toBe('hoisted');
  });

  it('half-masts on a leak and folds when screening fails (screening wins)', () => {
    expect(pennantState(true, { screened: true, leak: 'skip-or-halve' })).toBe('half');
    expect(pennantState(true, { screened: false, leak: 'pass' })).toBe('folded');
    expect(pennantState(true, { screened: false, leak: 'skip-or-halve' })).toBe('folded');
  });

  it('filters can never raise a pennant: every filter combination ranks at or below the unfiltered state', () => {
    const rank = (state) => PENNANT_STATES.indexOf(state);
    const combos = [];
    [true, false, undefined].forEach((screened) =>
      ['pass', 'skip-or-halve', undefined, 'bogus'].forEach((leak) => combos.push({ screened, leak })),
    );
    [true, false].forEach((fired) => {
      const unfiltered = pennantState(fired, PASS);
      combos.forEach((filters) => {
        const state = pennantState(fired, filters);
        expect(PENNANT_STATES).toContain(state);
        expect(rank(state), `${fired} ${JSON.stringify(filters)}`).toBeLessThanOrEqual(rank(unfiltered));
      });
      // An unfired rule stays down whatever the filters say.
      if (!fired) combos.forEach((filters) => expect(pennantState(false, filters)).toBe('down'));
    });
  });

  it('orders the states from lowest to highest', () => {
    expect(PENNANT_STATES).toEqual(['down', 'folded', 'half', 'hoisted']);
  });
});
