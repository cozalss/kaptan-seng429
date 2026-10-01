import { describe, expect, it } from 'vitest';
import { formatDayTr, formatMonthTr } from './format.js';

describe('Turkish date formatting', () => {
  it('formats a day with the short Turkish month', () => {
    expect(formatDayTr(new Date(2026, 10, 23))).toBe('23 Kas 2026');
  });

  it('formats a month in full', () => {
    expect(formatMonthTr(new Date(2027, 0, 1))).toBe('Ocak 2027');
  });

  it('rejects invalid dates', () => {
    expect(() => formatDayTr(new Date('x'))).toThrow(TypeError);
    expect(() => formatMonthTr('2027-01')).toThrow(TypeError);
  });
});
