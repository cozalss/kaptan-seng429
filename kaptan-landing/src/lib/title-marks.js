// Turkish diacritics vs. the display leading (0.9). A two-line Bodoni title collides when the
// first line carries a mark *below* the baseline (the cedilla of Ş/Ç) or the second line a mark
// *above* the cap height (İ's dot, Ö/Ü's dots, Ğ's breve, the circumflex). Such titles get
// `.chapter-title--marks`, which sets the second line down by `--title-mark-room` (book.css);
// every other title keeps the tight leading.

/** Marks hanging below the baseline (after tr-TR uppercasing). */
const BELOW = /[ŞÇ]/;
/** Marks rising above the cap height (after tr-TR uppercasing). */
const ABOVE = /[İÖÜĞÂÎÛ]/;

const upper = (text) => String(text ?? '').toLocaleUpperCase('tr-TR');

/** Pure: does a title whose lines read `first` / `second` need room between them? */
export function titleNeedsMarkRoom(first, second) {
  if (!String(second ?? '').trim()) return false;
  return BELOW.test(upper(first)) || ABOVE.test(upper(second));
}

/** The text before the set-in line, and the set-in line itself. */
function splitTitle(title) {
  const indent = title.querySelector('.chapter-title__indent');
  if (!indent) return null;
  let first = '';
  for (const node of title.childNodes) {
    if (node === indent || node.contains?.(indent)) break;
    first += node.textContent;
  }
  return [first, indent.textContent];
}

/**
 * Tags every two-line chapter title that needs room for its marks.
 * @param {ParentNode} [root]
 * @returns {number} how many titles were tagged
 */
export function markTitleDiacritics(root = document) {
  let count = 0;
  root.querySelectorAll('.chapter-title').forEach((title) => {
    const lines = splitTitle(title);
    const needs = Boolean(lines) && titleNeedsMarkRoom(lines[0], lines[1]);
    title.classList.toggle('chapter-title--marks', needs);
    if (needs) count += 1;
  });
  return count;
}
