import { describe, expect, it } from 'vitest';
import { BENCH_COPY, EVENT_ARTICLES, EVENT_FILTERS, HOLD_SCALE_DAYS, LEAK_FILTER, SCREEN_GATES } from './events.js';

describe('EVENT_ARTICLES', () => {
  it('lists the four buy-only event types E1–E4 in order, numbered I–IV', () => {
    expect(EVENT_ARTICLES.map((article) => article.code)).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(EVENT_ARTICLES.map((article) => article.numeral)).toEqual(['I', 'II', 'III', 'IV']);
  });

  it('states the brief thresholds and holding periods', () => {
    const byCode = Object.fromEntries(EVENT_ARTICLES.map((article) => [article.code, article]));
    expect(byCode.E1.condition).toContain('10 seans');
    expect(byCode.E1.condition).toContain('%0,25');
    expect(byCode.E3.condition).toContain('%10');
    expect(EVENT_ARTICLES.map((article) => article.holding)).toEqual(['20–40 gün', '20–60 gün', '5 gün', '5–10 gün']);
  });

  it('gives the holding period as numbers that match the printed range', () => {
    expect(EVENT_ARTICLES.map((article) => article.hold)).toEqual([[20, 40], [20, 60], [5, 5], [5, 10]]);
    EVENT_ARTICLES.forEach(({ hold: [min, max], holding }) => {
      expect(min).toBeLessThanOrEqual(max);
      expect(max).toBeLessThanOrEqual(HOLD_SCALE_DAYS);
      expect(holding).toBe(min === max ? `${min} gün` : `${min}–${max} gün`);
    });
  });

  it('explains the threshold-free articles instead of inventing a threshold', () => {
    const byCode = Object.fromEntries(EVENT_ARTICLES.map((article) => [article.code, article]));
    expect(byCode.E1.trigger).toBeNull();
    expect(byCode.E3.trigger).toBeNull();
    [byCode.E2, byCode.E4].forEach((article) => {
      expect(article.trigger).toMatch(/Sayısal eşik yok/);
      expect(article.condition).not.toMatch(/%/);
    });
  });

  it('gives every article all its text fields', () => {
    EVENT_ARTICLES.forEach((article) => {
      ['id', 'code', 'numeral', 'name', 'condition', 'holding'].forEach((key) => expect(article[key], `${article.id}.${key}`).toMatch(/\S/));
    });
  });
});

describe('EVENT_FILTERS', () => {
  it('carries the leak filter and the 16-rule risk gate that only shrinks or rejects', () => {
    const byId = Object.fromEntries(EVENT_FILTERS.map((filter) => [filter.id, filter]));
    expect(byId.sizinti.condition).toBe('Son 5 seansta > %8 yükseliş.');
    expect(byId['risk-kapisi']).toMatchObject({ code: 'R01–R16', effect: 'Bir öneriyi yalnızca küçültür ya da reddeder.' });
  });

  it('has unique ids and complete rows', () => {
    expect(new Set(EVENT_FILTERS.map((filter) => filter.id)).size).toBe(EVENT_FILTERS.length);
    EVENT_FILTERS.forEach((filter) => {
      ['name', 'condition', 'effect'].forEach((key) => expect(filter[key], `${filter.id}.${key}`).toMatch(/\S/));
    });
  });
});

describe('bench constants', () => {
  it('names the three screening gates and the leak numbers from the brief', () => {
    expect(SCREEN_GATES.map((gate) => gate.key)).toEqual(['tradable', 'noMeasure', 'inUniverse']);
    expect(LEAK_FILTER).toEqual({ sessions: 5, risePct: 8 });
  });

  it('states the leak effect exactly and never promises a trade', () => {
    const byId = Object.fromEntries(EVENT_FILTERS.map((filter) => [filter.id, filter]));
    expect(byId.sizinti.effect).toBe('Öneri atlanır ya da yarıya indirilir.');
    expect(BENCH_COPY.leakEffect).toBe(byId.sizinti.effect);
    expect(BENCH_COPY.result).toBe('Öneri adayı → filtreler → insan onayı. Otomatik emir yok.');
    const copy = [...Object.values(BENCH_COPY), ...EVENT_ARTICLES.flatMap((a) => [a.condition, a.trigger ?? ''])].join(' ');
    expect(copy).not.toMatch(/(^|\s)(al|kazandırır|garanti)(\s|[.,!]|$)/iu);
  });
});

describe('frozen data', () => {
  it('is frozen down to the rows', () => {
    [EVENT_ARTICLES, EVENT_FILTERS, EVENT_ARTICLES[0], EVENT_ARTICLES[0].hold, EVENT_FILTERS[0], SCREEN_GATES, LEAK_FILTER, BENCH_COPY].forEach((value) => expect(Object.isFrozen(value)).toBe(true));
  });
});
