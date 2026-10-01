// Fictional disclosure sheet ("bildirim") shared by several plates. Never imitates any real
// platform: generic layout, fictional issuer, and a visible "Temsili" mark.

import { FAINT, HAIR, INK, INK_SOFT, NAVY, SERIF, SHEET, W, esc, f, group, label, line, rect, text, textBars } from './kit.mjs';

export const ISSUER = 'ÖRNEK ENERJİ A.Ş.';
export const TICKER = 'ORNEK';

/**
 * A disclosure page at (x, y) of size w × h (in its own unrotated frame).
 * `sentences` are real lines drawn after the meta block: { pre, mark, post }, `mark` set in navy
 * and underlined (the span a reader agent extracts).
 */
export function disclosureSheet({ x, y, w, h, r, title = 'Özel Durum Açıklaması', subject = 'Yeni İş İlişkisi', date = '14.10.2026 18:42', sentences = [], barsAfter = 9, shadow = 'paper', extra = '' }) {
  const pad = w * 0.085;
  const ix = x + pad;
  const iw = w - pad * 2;
  const parts = [];
  parts.push(rect(x, y, w, h, { fill: SHEET, filter: shadow ? `url(#${shadow})` : undefined }));
  parts.push(rect(x, y, w, 7, { fill: NAVY }));
  let cy = y + pad + 14;
  parts.push(label(ix, cy, `${ISSUER}  ·  ${TICKER}`, { size: 15, fill: INK, weight: 600, tracking: 0.12 }));
  parts.push(label(x + w - pad, cy, 'Temsili', { size: 13, fill: HAIR, anchor: 'end' }));
  cy += 62;
  parts.push(text(ix, cy, title, { family: SERIF, size: 46, fill: INK }));
  cy += 30;
  parts.push(line(ix, cy, ix + iw, cy, { stroke: INK, 'stroke-width': W.hair }));
  cy += 36;
  const meta = [
    ['Konu', subject],
    ['Yayım', date],
    ['Özet bilgi', 'Evet'],
  ];
  meta.forEach(([k, v], i) => {
    const yy = cy + i * 34;
    parts.push(text(ix, yy, k, { size: 17, fill: INK_SOFT }));
    parts.push(text(ix + iw * 0.3, yy, v, { size: 17, fill: INK, weight: 500 }));
    parts.push(line(ix, yy + 13, ix + iw, yy + 13, { stroke: FAINT, 'stroke-width': W.hair }));
  });
  cy += meta.length * 34 + 30;
  parts.push(textBars(ix, cy, iw, 4, r, { gap: 24 }));
  cy += 4 * 24 + 26;
  sentences.forEach(({ pre = '', mark = '', post = '' }) => {
    const marked = mark
      ? `<tspan fill="${NAVY}" font-weight="600" text-decoration="underline">${esc(mark)}</tspan>`
      : '';
    parts.push(`<text x="${f(ix)}" y="${f(cy)}" font-family="Inter" font-size="19" fill="${INK}">${esc(pre)}${marked}${esc(post)}</text>`);
    cy += 32;
  });
  cy += 14;
  parts.push(textBars(ix, cy, iw, barsAfter, r, { gap: 24 }));
  parts.push(extra);
  return group(parts);
}
