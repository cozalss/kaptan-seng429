// Sancak Tezgâhı — the pure rule logic of "Seyir Kuralları" (#olaylar). No DOM. Instruments ask it
// whether an article fires; the glue asks it which state a pennant may fly in. Numbers only from
// KAPTAN-BRIEF.md §0 (via data/events.js): no invented thresholds, no annualising formula.

import { EVENT_HOLDS, LEAK_FILTER, SCREEN_GATES } from '../../data/events.js';

const holdOf = (code) => EVENT_HOLDS[code];

/** Thresholds in percent (E1: of capital, E3: annualised amount of yearly revenue); null = no number. */
export const RULES = Object.freeze({
  E1: Object.freeze({ threshold: 0.25, unit: '%', hold: holdOf('E1') }),
  E2: Object.freeze({ threshold: null, hold: holdOf('E2') }),
  E3: Object.freeze({ threshold: 10, unit: '%', hold: holdOf('E3') }),
  E4: Object.freeze({ threshold: null, hold: holdOf('E4') }),
});

/** Pennant states from lowest to highest. A filter may only move a pennant to the left. */
export const PENNANT_STATES = Object.freeze(['down', 'folded', 'half', 'hoisted']);

const INPUT_KEY = Object.freeze({ E1: 'sharePct', E3: 'annualisedPctOfRevenue' });

const isReading = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * @param {'E1'|'E2'|'E3'|'E4'} id
 * @param {{ sharePct?: number, annualisedPctOfRevenue?: number, disclosed?: boolean }} [input]
 * @returns {{ fired: boolean, margin: number | null }} margin = value − threshold (null without a number)
 */
export function checkRule(id, input = {}) {
  const rule = RULES[id];
  if (!rule) throw new Error(`Unknown rule "${id}"`);
  if (rule.threshold === null) return { fired: input.disclosed === true, margin: null };
  const value = input[INPUT_KEY[id]];
  if (!isReading(value)) return { fired: false, margin: null };
  const margin = value - rule.threshold;
  return { fired: margin >= 0, margin };
}

/**
 * Leak filter: a rise of more than 8 % over the last 5 sessions. The brief does not say when the
 * proposal is skipped and when it is halved, so neither is picked here.
 * @param {number} risePct
 * @returns {'pass' | 'skip-or-halve'}
 */
export function leakFilter(risePct) {
  return Number.isFinite(risePct) && risePct > LEAK_FILTER.risePct ? 'skip-or-halve' : 'pass';
}

/**
 * Ön eleme, before any AI reads the disclosure. A gate that is not explicitly open counts as failed.
 * @param {{ tradable?: boolean, noMeasure?: boolean, inUniverse?: boolean }} [gates]
 * @returns {{ pass: boolean, failed: string[] }}
 */
export function screenGates(gates = {}) {
  const failed = SCREEN_GATES.map((gate) => gate.key).filter((key) => gates[key] !== true);
  return { pass: failed.length === 0, failed };
}

/**
 * Where an article's pennant flies. Filters can only lower it: a failed screen folds it, a leak
 * half-masts it, and nothing a filter says can hoist a rule that did not fire.
 * @param {boolean} fired
 * @param {{ screened?: boolean, leak?: 'pass' | 'skip-or-halve' }} [filters] screened = the screen passed
 * @returns {'down' | 'hoisted' | 'half' | 'folded'}
 */
export function pennantState(fired, filters = {}) {
  if (fired !== true) return 'down';
  if (filters.screened === false) return 'folded';
  if (filters.leak === 'skip-or-halve') return 'half';
  return 'hoisted';
}
