// "KAPtan" as SVG outlines from the site's wordmark font (public/fonts/bodoni-moda-wordmark.woff2,
// Bodoni Moda 700). Fontconfig cannot pick that file by weight: it is a 6-glyph subset, so for
// "Bodoni Moda" the full Display face always wins on language coverage. Reading the outlines
// directly draws the real mark. Minimal TrueType reader: cmap format 4, hmtx, simple glyf only.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { woff2ToSfnt } from './woff2.mjs';
import { f } from './kit.mjs';

const FONT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/fonts/bodoni-moda-wordmark.woff2');

function tables(b) {
  const out = {};
  for (let i = 0; i < b.readUInt16BE(4); i += 1) {
    const o = 12 + i * 16;
    out[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8);
  }
  return out;
}

/** Unicode → glyph id from the (3,1) format-4 subtable. */
function glyphId(b, cmap, code) {
  let sub = null;
  for (let i = 0; i < b.readUInt16BE(cmap + 2); i += 1) {
    const r = cmap + 4 + i * 8;
    if (b.readUInt16BE(r) === 3 && b.readUInt16BE(r + 2) === 1) sub = cmap + b.readUInt32BE(r + 4);
  }
  if (sub === null || b.readUInt16BE(sub) !== 4) throw new Error('og-wordmark: no (3,1) format-4 cmap');
  const segs = b.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const offsets = deltas + segs * 2;
  for (let s = 0; s < segs; s += 1) {
    if (code > b.readUInt16BE(ends + s * 2) || code < b.readUInt16BE(starts + s * 2)) continue;
    const ro = b.readUInt16BE(offsets + s * 2);
    const delta = b.readInt16BE(deltas + s * 2);
    if (ro === 0) return (code + delta) & 0xffff;
    const g = b.readUInt16BE(offsets + s * 2 + ro + (code - b.readUInt16BE(starts + s * 2)) * 2);
    return g === 0 ? 0 : (g + delta) & 0xffff;
  }
  throw new Error(`og-wordmark: U+${code.toString(16)} not in the wordmark font`);
}

/** Simple-glyph outline → SVG path data (font units, y up), quadratic curves. */
function outline(b, t, gid, longLoca) {
  const at = (i) => (longLoca ? b.readUInt32BE(t.loca + i * 4) : b.readUInt16BE(t.loca + i * 2) * 2);
  const start = t.glyf + at(gid);
  if (at(gid + 1) === at(gid)) return '';
  const contours = b.readInt16BE(start);
  if (contours < 0) throw new Error('og-wordmark: composite glyphs are not supported');
  const endPts = Array.from({ length: contours }, (_, i) => b.readUInt16BE(start + 10 + i * 2));
  const count = endPts[contours - 1] + 1;
  let p = start + 10 + contours * 2;
  p += 2 + b.readUInt16BE(p);
  const flags = [];
  while (flags.length < count) {
    const flag = b[p++];
    flags.push(flag);
    if (flag & 8) for (let r = b[p++]; r > 0; r -= 1) flags.push(flag);
  }
  const coords = (short, same) => {
    let v = 0;
    return flags.map((flag) => {
      if (flag & short) v += flag & same ? b[p++] : -b[p++];
      else if (!(flag & same)) { v += b.readInt16BE(p); p += 2; }
      return v;
    });
  };
  const xs = coords(2, 16);
  const ys = coords(4, 32);
  let d = '';
  let first = 0;
  for (const last of endPts) {
    const pts = [];
    for (let i = first; i <= last; i += 1) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
    first = last + 1;
    d += contourPath(pts);
  }
  return d;
}

/** One closed contour: implied on-curve points between consecutive off-curve ones. */
function contourPath(pts) {
  const mid = (a, c) => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, on: true });
  const startIdx = pts.findIndex((q) => q.on);
  const ring = startIdx >= 0 ? [...pts.slice(startIdx), ...pts.slice(0, startIdx)] : [mid(pts[0], pts[1]), ...pts.slice(1), pts[0]];
  const [s] = ring;
  let d = `M${f(s.x)} ${f(-s.y)}`;
  let ctrl = null;
  for (const q of [...ring.slice(1), s]) {
    if (q.on) {
      d += ctrl ? `Q${f(ctrl.x)} ${f(-ctrl.y)} ${f(q.x)} ${f(-q.y)}` : `L${f(q.x)} ${f(-q.y)}`;
      ctrl = null;
    } else if (ctrl) {
      const m = mid(ctrl, q);
      d += `Q${f(ctrl.x)} ${f(-ctrl.y)} ${f(m.x)} ${f(-m.y)}`;
      ctrl = q;
    } else {
      ctrl = q;
    }
  }
  return `${d}Z`;
}

/**
 * Path data for `word` set at `size` with its baseline at (x, y), tracked by `tracking` units
 * (like SVG letter-spacing).
 */
export function wordmarkPath(word, { x, y, size, tracking = 0 }) {
  const b = woff2ToSfnt(readFileSync(FONT));
  const t = tables(b);
  const upem = b.readUInt16BE(t.head + 18);
  const longLoca = b.readInt16BE(t.head + 50) === 1;
  const hMetrics = b.readUInt16BE(t.hhea + 34);
  const scale = size / upem;
  let pen = 0;
  const parts = [];
  for (const ch of word) {
    const gid = glyphId(b, t.cmap, ch.codePointAt(0));
    const d = outline(b, t, gid, longLoca);
    if (d) parts.push(`<path transform="translate(${f(x + pen)} ${f(y)}) scale(${scale})" d="${d}"/>`);
    pen += b.readUInt16BE(t.hmtx + Math.min(gid, hMetrics - 1) * 4) * scale + tracking;
  }
  return parts.join('');
}
