import { describe, expect, it } from 'vitest';
import { markTitleDiacritics, titleNeedsMarkRoom } from './title-marks.js';

describe('titleNeedsMarkRoom', () => {
  it.each([
    ['Sekiz kişilik', 'tayfa.', true], // Ş cedilla hangs into line 2
    ['Seyir', 'haritası.', true], // İ dot rises into line 1
    ['350 bildirim.', 'Tek yön.', true], // Ö dots
    ['Kanıt', 'önce.', true],
    ['Dört olay.', 'Yalnızca alım.', false], // Ö is on the first line: harmless
    ['Bir bildirimin', 'rotası.', false],
    ['Kolofon', '', false],
  ])('%s / %s → %s', (first, second, expected) => {
    expect(titleNeedsMarkRoom(first, second)).toBe(expected);
  });

  it('uppercases the Turkish way (i → İ, not I)', () => {
    expect(titleNeedsMarkRoom('Sefer', 'ilk')).toBe(true);
    expect(titleNeedsMarkRoom('Sefer', 'ılık')).toBe(false);
  });
});

describe('markTitleDiacritics', () => {
  it('tags only the two-line titles that collide', () => {
    document.body.innerHTML = `
      <h2 class="chapter-title" id="a">Sekiz kişilik<span class="chapter-title__indent">tayfa.</span></h2>
      <h2 class="chapter-title" id="b">Bir bildirimin <span class="chapter-title__indent">rotası.</span></h2>
      <h2 class="chapter-title" id="c">Kolofon</h2>
      <p class="chapter-title" id="d"><span>Seyir</span><span class="chapter-title__indent">haritası.</span></p>`;
    expect(markTitleDiacritics()).toBe(2);
    expect(document.getElementById('a').classList.contains('chapter-title--marks')).toBe(true);
    expect(document.getElementById('b').classList.contains('chapter-title--marks')).toBe(false);
    expect(document.getElementById('c').classList.contains('chapter-title--marks')).toBe(false);
    expect(document.getElementById('d').classList.contains('chapter-title--marks')).toBe(true);
  });
});
