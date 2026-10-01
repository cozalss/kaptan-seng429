// Shared drawing kit for the KAPtan procedural visuals: palette, seeded RNG, SVG helpers and the
// common "plate" frame (paper ground, soft light, caption) every card and journey image sits on.
// Everything is plain SVG text: librsvg (through sharp) rasterises it.

export const INK = '#161616';
export const INK_SOFT = '#4A4A48';
export const HAIR = '#8E8C86';
export const FAINT = '#C9C6BE';
export const WHISPER = '#DEDBD3';
export const PAPER = '#F2F1EC';
export const SHEET = '#FBFAF7';
export const NAVY = '#0E3A66';
export const NAVY_TINT = '#E3E8EE';
export const NORTH_RED = '#B3261E';

export const SERIF = 'Instrument Serif';
export const SANS = 'Inter';

/** Stroke weights in viewBox units (cards/journey use a 1200 × 1600 box). */
export const W = Object.freeze({ hair: 1.1, fine: 1.6, line: 2.4, bold: 3.6 });

/** Mulberry32: small, fast, deterministic. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const f = (n) => (Math.round(n * 100) / 100).toString();

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function attrs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? f(v) : esc(v)}"`)
    .join(' ');
}

export const el = (tag, a = {}, inner = null) => (inner === null ? `<${tag} ${attrs(a)}/>` : `<${tag} ${attrs(a)}>${inner}</${tag}>`);

export const line = (x1, y1, x2, y2, a = {}) => el('line', { x1, y1, x2, y2, stroke: INK, 'stroke-width': W.line, ...a });
export const rect = (x, y, width, height, a = {}) => el('rect', { x, y, width, height, fill: 'none', ...a });
export const circle = (cx, cy, r, a = {}) => el('circle', { cx, cy, r, fill: 'none', ...a });
export const path = (d, a = {}) => el('path', { d, fill: 'none', stroke: INK, 'stroke-width': W.line, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...a });
export const group = (inner, a = {}) => el('g', a, Array.isArray(inner) ? inner.join('') : inner);

/** Text; `size` in viewBox units. Tracking in em (like CSS letter-spacing). */
export function text(x, y, content, { size = 24, family = SANS, weight = 400, fill = INK, anchor = 'start', tracking = 0, italic = false, ...rest } = {}) {
  return el(
    'text',
    {
      x,
      y,
      'font-family': family,
      'font-size': size,
      'font-weight': weight,
      'font-style': italic ? 'italic' : undefined,
      'letter-spacing': tracking ? f(tracking * size) : undefined,
      'text-anchor': anchor,
      fill,
      ...rest,
    },
    esc(content),
  );
}

/** Small caps-like label (the site's mono-meta role, set in Inter with wide tracking). */
export const label = (x, y, content, opts = {}) =>
  text(x, y, content.toLocaleUpperCase('tr-TR'), { size: 17, weight: 500, tracking: 0.16, fill: INK_SOFT, ...opts });

/** Polyline path data from points. */
export const poly = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
export function smooth(pts, closed = false) {
  if (pts.length < 3) return poly(pts);
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f(p[1][0])} ${f(p[1][1])}`;
  for (let i = 1; i < p.length - 2; i += 1) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const [x3, y3] = p[i + 2];
    d += ` C${f(x1 + (x2 - x0) / 6)} ${f(y1 + (y2 - y0) / 6)} ${f(x2 - (x3 - x1) / 6)} ${f(y2 - (y3 - y1) / 6)} ${f(x2)} ${f(y2)}`;
  }
  return closed ? `${d} Z` : d;
}

/** Shared <defs>: two-layer paper shadow and a softer "lifted" shadow. */
export function sharedDefs(extra = '') {
  const shadow = (id, blurA, dyA, alphaA, blurB, dyB, alphaB) => `
    <filter id="${id}" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${blurA}" result="a"/>
      <feOffset in="a" dy="${dyA}" result="ao"/>
      <feComponentTransfer in="ao" result="as"><feFuncA type="linear" slope="${alphaA}"/></feComponentTransfer>
      <feGaussianBlur in="SourceAlpha" stdDeviation="${blurB}" result="b"/>
      <feOffset in="b" dy="${dyB}" result="bo"/>
      <feComponentTransfer in="bo" result="bs"><feFuncA type="linear" slope="${alphaB}"/></feComponentTransfer>
      <feMerge><feMergeNode in="bs"/><feMergeNode in="as"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  return `<defs>
    ${shadow('paper', 1.4, 1.2, 0.16, 26, 22, 0.1)}
    ${shadow('lift', 3, 4, 0.14, 46, 44, 0.12)}
    <radialGradient id="light" cx="50%" cy="42%" r="75%">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#8C877C" stop-opacity="0.10"/>
    </radialGradient>
    ${extra}
  </defs>`;
}

/**
 * A complete SVG document. `view` is the viewBox [x, y, w, h] (a crop of the 0 0 bw bh plate for
 * detail frames); `px` the output pixel size.
 */
export function svgDoc({ box, view = [0, 0, box[0], box[1]], px, defs = '', body, caption = null }) {
  const [bw, bh] = box;
  const cap = caption
    ? group([
        text(90, bh - 70, caption.left, { size: 17, weight: 500, tracking: 0.18, fill: HAIR }),
        text(bw - 90, bh - 70, caption.right, { size: 17, weight: 500, tracking: 0.18, fill: HAIR, anchor: 'end' }),
      ])
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px[0]}" height="${px[1]}" viewBox="${view.map(f).join(' ')}" preserveAspectRatio="xMidYMid slice">
  ${sharedDefs(defs)}
  <rect x="-10" y="-10" width="${bw + 20}" height="${bh + 20}" fill="${PAPER}"/>
  <rect x="-10" y="-10" width="${bw + 20}" height="${bh + 20}" fill="url(#light)"/>
  ${body}
  ${cap}
</svg>`;
}

/** Grey "text" bars that read as body copy at a distance. */
export function textBars(x, y, width, count, r, { gap = 22, height = 7, fill = WHISPER, lastRatio = 0.55 } = {}) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const w = isLast ? width * (lastRatio + r() * 0.2) : width * (0.86 + r() * 0.14);
    out.push(rect(x, y + i * gap, w, height, { fill, rx: height / 2 }));
  }
  return out.join('');
}

/** Ticks around a ring (the compass-dial motif). */
export function dialTicks(cx, cy, r, count, { long = 16, short = 8, every = 4, stroke = INK, width = W.fine, start = 0 } = {}) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = start + (i / count) * Math.PI * 2 - Math.PI / 2;
    const len = i % every === 0 ? long : short;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push(`M${f(cx + c * r)} ${f(cy + s * r)} L${f(cx + c * (r - len))} ${f(cy + s * (r - len))}`);
  }
  return path(out.join(' '), { stroke, 'stroke-width': width, 'stroke-linecap': 'butt' });
}

/** Standard normal via Box–Muller from a seeded uniform source. */
export function gauss(r) {
  const u = Math.max(r(), 1e-9);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
