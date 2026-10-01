// Minimal text splitter for scroll typography (no innerHTML — text nodes only).
// <em>/<i> accents survive the split: their characters are wrapped in an em.split-em.

import { el } from './dom.js';

const ITALIC_TAGS = new Set(['EM', 'I']);

function normaliseSpace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Flattens text runs into glyphs ({ char, italic }), collapsing whitespace across run boundaries. */
function toGlyphs(runs) {
  const glyphs = [];
  runs.forEach(({ text, italic }) => {
    [...text.replace(/\s+/g, ' ')].forEach((char) => {
      const last = glyphs[glyphs.length - 1];
      if (char === ' ' && (!last || last.char === ' ')) return;
      glyphs.push({ char, italic });
    });
  });
  while (glyphs.length && glyphs[glyphs.length - 1].char === ' ') glyphs.pop();
  return glyphs;
}

/** Groups content into glyph lines: <br> breaks lines, italic tags stay inline, other elements are lines. */
function collectLines(el) {
  const lines = [];
  let runs = [];
  const flush = () => {
    const glyphs = toGlyphs(runs);
    if (glyphs.length) lines.push(glyphs);
    runs = [];
  };
  const walk = (parent, italic) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) runs.push({ text: node.textContent, italic });
      else if (node.nodeName === 'BR') flush();
      else if (ITALIC_TAGS.has(node.nodeName)) walk(node, true);
      else if (node.nodeType === Node.ELEMENT_NODE) {
        flush();
        walk(node, italic);
        flush();
      }
    });
  };
  walk(el, false);
  flush();
  return lines;
}

const span = (className, text) => el('span', className, text);

function splitOnSpaces(glyphs) {
  const groups = [[]];
  glyphs.forEach((glyph) => {
    if (glyph.char === ' ') groups.push([]);
    else groups[groups.length - 1].push(glyph);
  });
  return groups.filter((group) => group.length);
}

function buildWord(glyphs, chars) {
  const word = span('split-word');
  let em = null;
  glyphs.forEach(({ char, italic }) => {
    const node = span('split-char', char);
    chars.push(node);
    if (!italic) {
      em = null;
      word.append(node);
      return;
    }
    if (!em) {
      em = document.createElement('em');
      em.className = 'split-em';
      word.append(em);
    }
    em.append(node);
  });
  return word;
}

function buildLine(glyphs, chars, words) {
  const line = span('split-line');
  const inner = span('split-line__inner');
  line.setAttribute('aria-hidden', 'true');
  line.append(inner);

  splitOnSpaces(glyphs).forEach((wordGlyphs, index) => {
    if (index > 0) inner.append(document.createTextNode(' '));
    const word = buildWord(wordGlyphs, chars);
    inner.append(word);
    words.push(word);
  });
  return line;
}

/** Deep-copies an element's children; the returned function puts that copy back. */
export function snapshotChildren(el) {
  const copies = [...el.childNodes].map((node) => node.cloneNode(true));
  return () => el.replaceChildren(...copies);
}

/**
 * Splits a heading into masked lines → words → characters.
 * The original text is kept as the element's accessible label; `revert` restores the markup.
 */
export function splitLines(el) {
  const restore = snapshotChildren(el);
  const previousLabel = el.getAttribute('aria-label');
  const glyphLines = collectLines(el);
  const chars = [];
  const words = [];
  const lines = glyphLines.map((glyphs) => buildLine(glyphs, chars, words));

  el.setAttribute('aria-label', glyphLines.map((glyphs) => glyphs.map((g) => g.char).join('')).join(' '));
  el.replaceChildren(...lines);

  const revert = () => {
    restore();
    if (previousLabel === null) el.removeAttribute('aria-label');
    else el.setAttribute('aria-label', previousLabel);
  };
  return { lines, words, chars, revert };
}

/** Wraps every word inside `el` (and its descendants) in a span.split-word. Text stays readable. */
export function splitWords(el) {
  const words = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const parts = normaliseSpace(node.textContent).split(' ').filter(Boolean);
    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index > 0) fragment.append(document.createTextNode(' '));
      const word = span('split-word', part);
      fragment.append(word);
      words.push(word);
    });
    node.replaceWith(fragment);
  });
  return words;
}
