import { beforeEach, describe, expect, test } from 'vitest';
import { snapshotChildren, splitLines, splitWords } from './split-text.js';

describe('splitLines', () => {
  let host;

  beforeEach(() => {
    host = document.createElement('h2');
    document.body.replaceChildren(host);
  });

  test('splits <br>-separated text into masked lines of characters', () => {
    host.innerHTML = '100%<br>Handmade';

    const { lines, chars } = splitLines(host);

    expect(lines).toHaveLength(2);
    expect(chars.map((c) => c.textContent).join('')).toBe('100%Handmade');
    expect(lines[0].classList.contains('split-line')).toBe(true);
  });

  test('treats element children as their own lines', () => {
    host.innerHTML = '<span>Measured</span><span>Purity</span>';

    const { lines } = splitLines(host);

    expect(lines.map((l) => l.textContent)).toEqual(['Measured', 'Purity']);
  });

  test('keeps words intact and spaces between them', () => {
    host.textContent = 'Made Without Compromise';

    const { words, lines } = splitLines(host);

    expect(words.map((w) => w.textContent)).toEqual(['Made', 'Without', 'Compromise']);
    expect(lines[0].textContent).toBe('Made Without Compromise');
  });

  test('keeps an accessible label and hides the fragments from assistive tech', () => {
    host.innerHTML = 'Sterling<br>&amp; Silver';

    splitLines(host);

    expect(host.getAttribute('aria-label')).toBe('Sterling & Silver');
    host.querySelectorAll('.split-line').forEach((line) => {
      expect(line.getAttribute('aria-hidden')).toBe('true');
    });
  });

  test('ignores empty lines', () => {
    host.innerHTML = '<br>Only<br><br>';

    const { lines } = splitLines(host);

    expect(lines).toHaveLength(1);
  });
});

describe('splitWords', () => {
  test('wraps every word of every paragraph and preserves the text', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>Each ring is forged</p><p>by a single pair</p>';

    const words = splitWords(host);

    expect(words).toHaveLength(8);
    expect(host.querySelectorAll('p')[0].textContent).toBe('Each ring is forged');
    expect(words[0].classList.contains('split-word')).toBe(true);
  });

  test('collapses whitespace from formatted markup', () => {
    const host = document.createElement('p');
    host.textContent = '\n   Weights   are\n deliberate.  ';

    const words = splitWords(host);

    expect(words.map((w) => w.textContent)).toEqual(['Weights', 'are', 'deliberate.']);
    expect(host.textContent).toBe('Weights are deliberate.');
  });
});

describe('splitLines with italic accents', () => {
  let host;

  beforeEach(() => {
    host = document.createElement('h2');
    document.body.replaceChildren(host);
  });

  test('keeps an inline <em> word on the same line and wraps its chars in an italic span', () => {
    host.innerHTML = 'Ödünsüz <em>Özen</em>';

    const { lines, words, chars } = splitLines(host);

    expect(lines).toHaveLength(1);
    expect(words.map((w) => w.textContent)).toEqual(['Ödünsüz', 'Özen']);
    expect(chars).toHaveLength(11);
    const em = words[1].querySelector('em.split-em');
    expect(em).not.toBeNull();
    expect(em.querySelectorAll('.split-char')).toHaveLength(4);
    expect(words[0].querySelector('em')).toBeNull();
    expect(host.getAttribute('aria-label')).toBe('Ödünsüz Özen');
  });

  test('keeps <em> after a <br> on its own line', () => {
    host.innerHTML = 'Finali<br><em>İzleyin</em>';

    const { lines } = splitLines(host);

    expect(lines.map((l) => l.textContent)).toEqual(['Finali', 'İzleyin']);
    expect(lines[1].querySelector('em.split-em').textContent).toBe('İzleyin');
  });

  test('finds <em> nested inside element lines', () => {
    host.innerHTML = '<span>Saf</span><span><em>Işıltı</em></span>';

    const { lines, chars } = splitLines(host);

    expect(lines.map((l) => l.textContent)).toEqual(['Saf', 'Işıltı']);
    expect(lines[0].querySelector('em')).toBeNull();
    expect(chars.map((c) => c.textContent).join('')).toBe('SafIşıltı');
  });

  test('splits a partly italic word into plain and italic runs', () => {
    host.innerHTML = 'ab<em>cd</em>';

    const { words } = splitLines(host);

    expect(words).toHaveLength(1);
    expect(words[0].querySelector('em.split-em').textContent).toBe('cd');
    expect(words[0].textContent).toBe('abcd');
  });

  test('collapses whitespace across run boundaries', () => {
    host.innerHTML = '  Bir <em> iki </em>  üç ';

    const { words, lines } = splitLines(host);

    expect(words.map((w) => w.textContent)).toEqual(['Bir', 'iki', 'üç']);
    expect(lines[0].textContent).toBe('Bir iki üç');
  });

  test('revert restores the original markup and label', () => {
    host.innerHTML = 'Ödünsüz <em>Özen</em>';

    const { revert } = splitLines(host);
    revert();

    expect(host.innerHTML).toBe('Ödünsüz <em>Özen</em>');
    expect(host.hasAttribute('aria-label')).toBe(false);
  });
});

describe('snapshotChildren', () => {
  test('restores content changed by splitWords', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>Bir iki</p>';
    const restore = snapshotChildren(host);

    splitWords(host);
    restore();

    expect(host.innerHTML).toBe('<p>Bir iki</p>');
  });
});
