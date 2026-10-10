// "Seyir Kuralları" is printed as static text in index.html (it must read with JavaScript off);
// src/data/events.js holds the same facts. This test keeps the two in step and checks the hosts the
// rules bench mounts into.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { EVENT_ARTICLES } from '../../data/events.js';

const html = readFileSync(`${path.resolve(process.cwd())}/index.html`, 'utf8');
const block = html.match(/<!-- OLAYLAR:START[\s\S]*?<!-- OLAYLAR:END -->/)[0];
const squash = (text) => text.replace(/\s+/g, ' ').trim();

let section;
beforeAll(() => {
  document.body.innerHTML = block;
  section = document.getElementById('olaylar');
});

describe('#olaylar: the four rules, printed in full', () => {
  it('prints E1–E4 in order with the texts of events.js', () => {
    const rows = [...section.querySelectorAll('.articles > .article')];
    expect(rows.map((row) => row.dataset.rule)).toEqual(EVENT_ARTICLES.map((article) => article.code));
    rows.forEach((row, index) => {
      const article = EVENT_ARTICLES[index];
      expect(row.id).toBe(`madde-${article.id}`);
      expect(row.querySelector('.article__name .rule-code').textContent).toBe(article.code);
      expect(row.querySelector('.article__title').textContent).toBe(article.name);
      expect(squash(row.querySelector('.article__condition').textContent)).toBe(article.condition);
      expect(row.querySelector('.article__days').textContent).toBe(article.holding);
      expect(row.querySelector('.article__trigger')?.textContent ?? null).toBe(article.trigger);
    });
  });

  it('starts with E1 chosen', () => {
    expect([...section.querySelectorAll('.article.is-active')].map((row) => row.dataset.rule)).toEqual(['E1']);
  });
});

describe('#olaylar: hosts for the bench', () => {
  it('has one mast, hidden from assistive tech, and one shared slot with five instrument hosts', () => {
    expect(section.querySelectorAll('[data-mast]')).toHaveLength(1);
    expect(section.querySelector('[data-mast]').getAttribute('aria-hidden')).toBe('true');
    expect([...section.querySelectorAll('#rules-slot [data-instrument]')].map((host) => host.dataset.instrument)).toEqual([
      'E1',
      'E2',
      'E3',
      'E4',
      'leak',
    ]);
    expect(section.querySelector('.rules__sample').textContent).toBe('ÖRNEK ENERJİ A.Ş.');
  });

  it('keeps the leak button hidden until the bench can answer it', () => {
    const button = section.querySelector('[data-show="leak"]');
    expect(button.hidden).toBe(true);
    expect(button.getAttribute('aria-controls')).toBe('rules-slot');
  });
});

describe('#olaylar: filters and honesty', () => {
  it('states every filter fact of the brief', () => {
    const filters = squash(`${section.querySelector('.rules__filters').textContent} ${section.querySelector('#filtre-risk').textContent}`);
    [
      'yalnızca indirir',
      'işlem görebilirlik, tedbir ve evreni',
      'son 5 seansta %8’den fazla yükseliş',
      'atlanır ya da yarıya indirilir',
      'R01–R16',
      'yalnızca küçültür ya da reddeder',
      '%0,5 risk, pozisyon ≤ %10',
      '−%1’de yeni emir durur',
      '−%5’te kill switch açık emirleri iptal eder; pozisyon satılmaz',
    ].forEach((fact) => expect(filters).toContain(fact));
  });

  it('keeps the footnote: buy-only, no leverage, 0 to +5 %, a human approves, not investment advice', () => {
    const note = squash(section.querySelector('#rules-note').textContent);
    expect(note).toContain('Yalnızca alım; kaldıraç yok.');
    expect(note).toContain('BIST-100’e göre yılda 0 ile +%5');
    expect(note).toMatch(/otomatik emir yok/i);
    expect(note).toContain('Yatırım tavsiyesi değildir.');
  });

  it('never says "al", "kazandırır" or "garanti"', () => {
    expect(squash(section.textContent)).not.toMatch(/(^|[\s(“"])(al|kazandırır|garanti)([\s.,!;:)”"]|$)/iu);
  });

  it('is not a KPI grid', () => {
    expect(block).not.toMatch(/kpi|stat-/i);
  });
});
