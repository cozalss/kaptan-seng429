import { describe, expect, it } from 'vitest';
import {
  COPY,
  GATES,
  LEAK_EFFECT,
  RESULT_LINE,
  formatNumber,
  formatPct,
  joinTr,
  pctWithSuffix,
  possessiveSuffix,
  screenSentence,
  screenShort,
  SHORT,
} from './text.js';

const BANNED = /(?<!\p{L})(al|sat|AL)(?!\p{L})|kazandırır|garanti/iu;

describe('formatNumber / formatPct', () => {
  it('uses a decimal comma and fixed digits', () => {
    expect(formatNumber(0.25)).toBe('0,25');
    expect(formatNumber(0.3)).toBe('0,30');
    expect(formatPct(0.19)).toBe('%0,19');
  });

  it('trims only decimal zeros', () => {
    expect(formatPct(10, 0, true)).toBe('%10');
    expect(formatPct(20, 1, true)).toBe('%20');
    expect(formatPct(8.5, 1, true)).toBe('%8,5');
    expect(formatPct(12, 1, true)).toBe('%12');
    expect(formatPct(0, 1, true)).toBe('%0');
  });

  it('puts the minus before the percent sign and never prints −0', () => {
    expect(formatPct(-2.5, 1, true)).toBe('−%2,5');
    expect(formatNumber(-0.001, 1, true)).toBe('0');
  });
});

describe('possessiveSuffix', () => {
  it.each([
    ['0,25', 'i'], // yirmi beş
    ['0,19', 'u'], // on dokuz
    ['0,31', 'i'], // otuz bir
    ['0,30', 'u'], // otuz
    ['0,22', 'si'], // yirmi iki
    ['0,26', 'sı'], // yirmi altı
    ['0,23', 'ü'], // yirmi üç
    ['0,40', 'ı'], // kırk
    ['0,50', 'si'], // elli
    ['0,60', 'ı'], // altmış
    ['0,70', 'i'], // yetmiş
    ['0,80', 'i'], // seksen
    ['0,90', 'ı'], // doksan
    ['0,20', 'si'], // yirmi
    ['12', 'si'],
    ['10', 'u'],
    ['8,5', 'i'],
    ['7', 'si'],
    ['4', 'ü'],
    ['9', 'u'],
    ['100', 'ü'],
    ['1000', 'i'],
    ['0', 'ı'],
    ['0,00', 'ı'],
  ])('%s → %s', (text, suffix) => {
    expect(possessiveSuffix(text)).toBe(suffix);
  });

  it('builds the Turkish forms used in the copy', () => {
    expect(pctWithSuffix(0.25)).toBe("%0,25'i");
    expect(pctWithSuffix(0.19)).toBe("%0,19'u");
    expect(pctWithSuffix(12, 1, true)).toBe("%12'si");
    expect(pctWithSuffix(10, 0, true)).toBe("%10'u");
  });
});

describe('COPY', () => {
  it('E1 says whether the rule holds and gives the threshold', () => {
    expect(COPY.E1.state(0.31, true)).toBe(
      "E1 tutar: 10 seansta geri alım sermayenin %0,31'i, eşik %0,25. Öneri adayı doğar.",
    );
    expect(COPY.E1.state(0.19, false)).toMatch(/^E1 tutmaz: .*%0,19'u.*Öneri yok\.$/);
    expect(COPY.E1.valuetext(0.25, true)).toBe("sermayenin %0,25'i, eşiğe ulaşıyor");
    expect(COPY.E1.valuetext(0.2, false)).toBe("sermayenin %0,20'si, eşiğin altında");
  });

  it('E3 speaks of the annualised amount against yearly revenue', () => {
    expect(COPY.E3.state(12, true)).toContain("yıllık gelirin %12'si, eşik %10");
    expect(COPY.E3.state(8.5, false)).toContain('E3 tutmaz');
    expect(COPY.E3.valuetext(10, true)).toBe("yıllık gelirin %10'u, eşiğe ulaşıyor");
  });

  it('E2 and E4 have no number', () => {
    for (const code of ['E2', 'E4']) {
      expect(COPY[code].state(true)).toMatch(/^E\d tutar/);
      expect(COPY[code].state(false)).toMatch(/Öneri yok\.$/);
      expect(COPY[code].state(true)).not.toMatch(/%/);
    }
  });

  it('leak says exactly "atlanır ya da yarıya indirilir" and never picks one', () => {
    expect(LEAK_EFFECT).toBe('atlanır ya da yarıya indirilir');
    expect(COPY.leak.state(10, true)).toContain('Öneri atlanır ya da yarıya indirilir.');
    expect(COPY.leak.state(6.5, false)).toContain('Öneri küçülmez.');
    expect(COPY.leak.valuetext(8, false)).toBe('son 5 seansta yükseliş %8, eşiği aşmıyor');
  });

  it('never uses the forbidden words', () => {
    const all = [
      RESULT_LINE,
      COPY.E1.state(0.3, true),
      COPY.E1.state(0.1, false),
      COPY.E3.state(12, true),
      COPY.E3.state(2, false),
      COPY.E2.state(true),
      COPY.E2.state(false),
      COPY.E4.state(true),
      COPY.E4.state(false),
      COPY.leak.state(10, true),
      COPY.leak.state(1, false),
      screenSentence([]),
      screenSentence(['tradable']),
    ];
    all.forEach((line) => expect(line).not.toMatch(BANNED));
  });
});

describe('screen sentences', () => {
  it('joins Turkish lists', () => {
    expect(joinTr([])).toBe('');
    expect(joinTr(['a'])).toBe('a');
    expect(joinTr(['a', 'b'])).toBe('a ve b');
    expect(joinTr(['a', 'b', 'c'])).toBe('a, b ve c');
  });

  it('names the shut gates in lower case', () => {
    expect(screenSentence([])).toMatch(/üç kapı da açık/);
    expect(screenSentence(['noMeasure'])).toBe(
      'Ön eleme: tedbir kapısı kapalı. Bildirim yapay zekâya ulaşmadan elenir.',
    );
    expect(screenSentence(['tradable', 'inUniverse'])).toContain('işlem görebilirlik ve evren kapıları kapalı');
    expect(screenSentence(['other'])).toContain('other kapısı');
  });

  it('short verdicts', () => {
    expect(screenShort([])).toBe('Üç kapı açık: bildirim ajanlara ulaşır.');
    expect(screenShort(['tradable'])).toBe('İşlem görebilirlik kapısı kapalı: bildirim elenir.');
    expect(screenShort(['noMeasure', 'inUniverse'])).toBe('Tedbir ve evren kapıları kapalı: bildirim elenir.');
    expect(screenShort(['x'])).toBe('X kapısı kapalı: bildirim elenir.');
    Object.values(SHORT).flat().forEach((line) => expect(line).not.toMatch(BANNED));
    expect(SHORT.leak[1]).toContain('atlanır ya da yarıya indirilir');
  });

  it('matches the gate keys of rules-check', () => {
    expect(GATES.map((g) => g.key)).toEqual(['tradable', 'noMeasure', 'inUniverse']);
  });
});
