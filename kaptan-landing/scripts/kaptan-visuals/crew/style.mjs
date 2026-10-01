// Crew portraits — shared ink style (see STYLE.md next to this file).
// Sumi ink on paper, after the hero's sea: confident brush contours as filled variable-width
// paths, flat indigo washes, bare paper for light, one focal prop, one tiny north-red accent at
// most. Everything is plain SVG that librsvg (sharp) rasterises; randomness is seeded (kit.mjs).
// Plates are drawn in the 1200 × 1600 card box used by pipeline.mjs.

import { rng, svgDoc } from '../kit.mjs';

export const CARD = Object.freeze([1200, 1600]);


/* ── Palette (hero.css / sea-shader.js) ─────────────────────────────────────────────────────── */

export const PAPER = '#F3F1EC';
export const INK = '#121318';
export const INDIGO = '#2B4261';
export const RED = '#B3261E'; // one tiny accent per plate, never more

/* ── Framing ────────────────────────────────────────────────────────────────────────────────── */

export const FRAME = Object.freeze({
  top: 190, // top of the head (cap included)
  waist: 1462, // the figure is cut here by the caption strip (≈ 80 % of the height)
  horizon: 992, // 62 % of 1600
  captionRule: 1488,
});

/* ── Numbers ────────────────────────────────────────────────────────────────────────────────── */

const q = (n) => (Math.round(n * 10) / 10).toString();
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a, b, t) => a + (b - a) * t;

/** Attributes → string (numbers rounded to 0.1). */
function at(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? q(v) : v}"`)
    .join(' ');
}

export const g = (inner, a = {}) => `<g ${at(a)}>${Array.isArray(inner) ? inner.join('') : inner}</g>`;

/* ── Curves ─────────────────────────────────────────────────────────────────────────────────── */

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

/** Points along a Catmull-Rom spline through `pts`, roughly every `step` units. */
export function sample(pts, step = 7, closed = false) {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  const out = [];
  for (let i = 0; i < segs; i += 1) {
    const k = Math.max(2, Math.ceil(dist(P(i), P(i + 1)) / step));
    for (let j = 0; j < k; j += 1) out.push(catmull(P(i - 1), P(i), P(i + 1), P(i + 2), j / k));
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** Points along straight segments (for ruled edges: boards, flags, paper). */
function linear(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const k = Math.max(1, Math.ceil(dist(pts[i], pts[i + 1]) / step));
    for (let j = 0; j < k; j += 1) out.push([lerp(pts[i][0], pts[i + 1][0], j / k), lerp(pts[i][1], pts[i + 1][1], j / k)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Smooth closed/open path data through points (for silhouettes, masses, washes). */
export function curve(pts, closed = true) {
  const s = sample(pts, 9, closed);
  return `M${s.map(([x, y]) => `${q(x)} ${q(y)}`).join(' L')}${closed ? ' Z' : ''}`;
}

/** Straight polygon path data (hard-edged shapes: flags, boards, paper). */
export const poly = (pts, closed = true) => `M${pts.map(([x, y]) => `${q(x)} ${q(y)}`).join(' L')}${closed ? ' Z' : ''}`;

/* ── Brush ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * "Pressure" noise: control values smoothly interpolated over 0…1, about one every 110 units of
 * stroke, so a long contour swells and thins several times (a brush, not a pen).
 */
function pressure(r, amount, length = 500) {
  if (!r || !amount) return () => 1;
  const k = Math.max(3, Math.min(12, Math.round(length / 110)));
  const v = Array.from({ length: k + 1 }, () => 1 + (r() * 2 - 1) * amount);
  return (s) => {
    const x = s * k;
    const i = Math.min(k - 1, Math.floor(x));
    const t = x - i;
    const e = t * t * (3 - 2 * t);
    return lerp(v[i], v[i + 1], e);
  };
}

/**
 * A brush stroke as a filled outline: `pts` are the centreline control points (Catmull-Rom),
 * `w` the full width (number, or one width per control point), `taper` the fraction of the length
 * over which each end narrows to a point ([start, end]; 0 = blunt). `r` adds pressure wobble.
 */
export function brush(pts, { w = 8, taper = [0.3, 0.4], tip = 0.06, r = null, wobble = 0.2, fill = INK, opacity, step = 6, straight = false } = {}) {
  const s = straight ? linear(pts, step) : sample(pts, step);
  const n = s.length;
  const lens = [0];
  for (let i = 1; i < n; i += 1) lens.push(lens[i - 1] + dist(s[i - 1], s[i]));
  const total = lens[n - 1] || 1;
  const widthAt = Array.isArray(w)
    ? (u) => {
        const x = u * (w.length - 1);
        const i = Math.min(w.length - 2, Math.floor(x));
        return lerp(w[i], w[i + 1], x - i);
      }
    : () => w;
  const press = pressure(r, wobble, total);
  const ease = (t) => Math.sin((Math.min(1, Math.max(0, t)) * Math.PI) / 2);
  const left = [];
  const right = [];
  for (let i = 0; i < n; i += 1) {
    const u = lens[i] / total;
    let k = 1;
    if (taper[0] > 0 && u < taper[0]) k = tip + (1 - tip) * ease(u / taper[0]);
    if (taper[1] > 0 && u > 1 - taper[1]) k = Math.min(k, tip + (1 - tip) * ease((1 - u) / taper[1]));
    const half = (widthAt(u) * k * press(u)) / 2;
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(n - 1, i + 1)];
    const len = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    left.push([s[i][0] + nx * half, s[i][1] + ny * half]);
    right.push([s[i][0] - nx * half, s[i][1] - ny * half]);
  }
  const d = `M${[...left, ...right.reverse()].map(([x, y]) => `${q(x)} ${q(y)}`).join(' L')} Z`;
  return `<path ${at({ d, fill, 'fill-opacity': opacity })}/>`;
}

/** Several strokes sharing options (one call per feature: brows, folds, ribs…). */
export const strokes = (list, opts) => list.map((pts) => brush(pts, opts)).join('');

/** A flat filled shape through smooth points (ink mass, paper silhouette, wash). */
export function mass(pts, { fill = INK, opacity, closed = true, sharp = false, extra = {} } = {}) {
  return `<path ${at({ d: sharp ? poly(pts) : curve(pts, closed), fill, 'fill-opacity': opacity, ...extra })}/>`;
}

/**
 * A sumi wash: flat tint with a slightly darker pooled edge (the pigment that dries at the rim),
 * bled by the `crew-bleed` filter. Default: indigo at 22 %.
 */
export function wash(pts, { color = INDIGO, opacity = 0.22, edge = 0.35, sharp = false } = {}) {
  const d = sharp ? poly(pts) : curve(pts);
  return g(
    [
      `<path ${at({ d, fill: color, 'fill-opacity': opacity })}/>`,
      edge ? `<path ${at({ d, fill: 'none', stroke: color, 'stroke-opacity': opacity * edge, 'stroke-width': 3.2 })}/>` : '',
    ],
    { filter: 'url(#crew-bleed)' },
  );
}

/** Dots of dry ink (stubble, rust, knit texture) scattered inside an ellipse. */
export function stipple(cx, cy, rx, ry, count, r, { size = [1.4, 3], fill = INK, opacity = 0.75, angle = 0 } = {}) {
  const out = [];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let i = 0; i < count; i += 1) {
    const t = r() * Math.PI * 2;
    const m = Math.sqrt(r());
    const x = Math.cos(t) * rx * m;
    const y = Math.sin(t) * ry * m;
    const rad = lerp(size[0], size[1], r());
    out.push(`M${q(cx + x * ca - y * sa)} ${q(cy + x * sa + y * ca)}m-${q(rad)} 0a${q(rad)} ${q(rad)} 0 1 0 ${q(rad * 2)} 0a${q(rad)} ${q(rad)} 0 1 0 -${q(rad * 2)} 0`);
  }
  return `<path ${at({ d: out.join(''), fill, 'fill-opacity': opacity })}/>`;
}

/** Stable id from content (same drawing → same id, whatever else is drawn). */
function hashId(prefix, text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

/**
 * Parallel hatching clipped to a shape. `clip` is path data; lines run at `angle` degrees,
 * `gap` apart, each a thin tapered brush stroke with a little wobble and a ragged start/end.
 */
export function hatch(clip, { angle = 45, gap = 12, w = 2, r, box, color = INK, opacity = 0.9, ragged = 0.18 } = {}) {
  const id = hashId('crew-clip', `${clip}|${angle}|${gap}`);
  const [x, y, bw, bh] = box;
  const cx = x + bw / 2;
  const cy = y + bh / 2;
  const diag = Math.hypot(bw, bh) / 2;
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const lines = [];
  for (let o = -diag; o <= diag; o += gap) {
    const ox = cx - dy * o;
    const oy = cy + dx * o;
    const s0 = -diag * (1 - r() * ragged);
    const s1 = diag * (1 - r() * ragged);
    const bend = (r() - 0.5) * gap * 0.35;
    lines.push(brush(
      [[ox + dx * s0, oy + dy * s0], [ox + dx * (s0 + s1) / 2 - dy * bend, oy + dy * (s0 + s1) / 2 + dx * bend], [ox + dx * s1, oy + dy * s1]],
      { w, taper: [0.15, 0.25], r, wobble: 0.25, fill: color, step: 14 },
    ));
  }
  return `<clipPath id="${id}"><path d="${clip}"/></clipPath>${g(lines, { 'clip-path': `url(#${id})`, opacity })}`;
}

/**
 * Dry-brush wrapper: the ink breaks into hair streaks running at `angle` degrees (`coarse` for
 * a wide, loaded brush: broader streaks, used for sky and big washes).
 */
export function dry(inner, angle = 0, coarse = false) {
  const filter = `url(#crew-dry${coarse ? '-wide' : ''})`;
  if (!angle) return g(inner, { filter });
  return g(g(inner, { transform: `rotate(${-angle})` }), { transform: `rotate(${angle})`, filter });
}

/**
 * A sumi-filled shape: opaque paper underneath, a flat ink body at `base` strength and a
 * dry-brush layer on top whose streaks run at `angle` (the direction the brush travelled).
 * Reads as a loaded brush rather than a flat vector fill. Use for clothing, caps, hair.
 */
export function sumi(pts, { angle = 0, base = 0.9, fill = INK, coarse = true, sharp = false } = {}) {
  return [
    mass(pts, { fill: PAPER, sharp }),
    mass(pts, { fill, opacity: base, sharp }),
    dry(mass(pts, { fill, sharp }), angle, coarse),
  ].join('');
}

/** Rough ink edge (the brush's hairs on paper) around any group. */
export const rough = (inner) => g(inner, { filter: 'url(#crew-rough)' });

/**
 * Place a drawing made in a local frame: `origin` is where local (0, 0) lands, `angle` the
 * rotation in degrees, `scale` uniform (negative x-scale mirrors). Use it for hands and props
 * drawn once in a convenient orientation.
 */
export function place(inner, { origin: [x, y], angle = 0, scale = 1, mirror = false }) {
  const [kx, ky] = Array.isArray(scale) ? scale : [scale, scale]; // [along, across] for foreshortening
  return g(inner, { transform: `translate(${q(x)} ${q(y)}) rotate(${q(angle)}) scale(${q(mirror ? -kx : kx)} ${q(ky)})` });
}

/**
 * A sleeve from `elbow` to `wrist`: a tapered ink mass (w0 → w1 wide) with a dry-brush sheen on
 * the lit side (`sheen` 1 or −1 picks the side) and a ribbed cuff at the wrist. `texture: false`
 * gives a flat wash (oilskin); `gap: true` rules a thin paper line along both sides so a dark
 * forearm reads in front of a dark body (start the elbow inside the body silhouette).
 */
export function sleeve(r, elbow, wrist, { w0 = 150, w1 = 96, sheen = 1, cuff = true, fill = INK, base, texture = true, gap = false } = {}) {
  const [ex, ey] = elbow;
  const [wx, wy] = wrist;
  const len = Math.hypot(wx - ex, wy - ey);
  const nx = -(wy - ey) / len;
  const ny = (wx - ex) / len;
  const side = (k, s) => {
    const half = (w0 + (w1 - w0) * k) / 2;
    return [ex + (wx - ex) * k + nx * s * half, ey + (wy - ey) * k + ny * s * half];
  };
  const angle = (Math.atan2(wy - ey, wx - ex) * 180) / Math.PI;
  const outline = [side(0, 1), side(0.5, 1.08), side(1, 1), side(1.02, 0), side(1, -1), side(0.5, -1.06), side(0, -1), side(-0.12, 0)];
  const out = [texture ? sumi(outline, { fill, angle, base }) : [mass(outline, { fill: PAPER }), mass(outline, { fill, opacity: base ?? 0.9 })].join('')];
  if (gap) {
    for (const k of [1, -1]) out.push(brush([side(0.18, k * 1.02), side(0.5, k * 1.1), side(0.97, k * 1.02)], { w: 3.4, taper: [0.5, 0.1], r, fill: PAPER, opacity: 0.75 }));
  }
  out.push(dry(strokes([[side(0.12, 0.55 * sheen), side(0.78, 0.6 * sheen)], [side(0.25, 0.25 * sheen), side(0.7, 0.32 * sheen)]], { w: 10, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.35 })));
  if (cuff) {
    const ribs = [];
    for (let i = 0; i < 7; i += 1) {
      const t = -0.8 + (i / 6) * 1.6;
      ribs.push([side(0.85, t), side(0.99, t * 1.02)]);
    }
    out.push(strokes(ribs, { w: 2.6, taper: [0.2, 0.2], r, fill: PAPER, opacity: 0.5 }));
  }
  return out.join('');
}

/* ── Defs ───────────────────────────────────────────────────────────────────────────────────── */

export function crewDefs() {
  // Regions follow each element's bounding box (a plate-sized region per wash is far too slow).
  const region = 'x="-0.15" y="-0.15" width="1.3" height="1.3"';
  const full = 'x="-20" y="-20" width="1240" height="1640" filterUnits="userSpaceOnUse"';
  return `<defs>
  <filter id="crew-rough" ${region} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="crew-bleed" ${region} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="11" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0.9"/>
  </filter>
  <filter id="crew-dry" ${region} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.003 0.11" numOctaves="2" seed="5" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  7 0 0 0 -2.9" result="m"/>
    <feComposite in="SourceGraphic" in2="m" operator="in" result="c"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="n2"/>
    <feDisplacementMap in="c" in2="n2" scale="3" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="crew-dry-wide" ${region} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0016 0.04" numOctaves="3" seed="23" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 0 0 0 -2.5" result="m"/>
    <feComposite in="SourceGraphic" in2="m" operator="in" result="c"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="29" result="n2"/>
    <feDisplacementMap in="c" in2="n2" scale="6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="crew-mottle" ${full} color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.006" numOctaves="3" seed="19" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.17  0 0 0 0 0.26  0 0 0 0 0.38  0 0 0 -0.5 0.3"/>
  </filter>
  <linearGradient id="crew-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${INDIGO}" stop-opacity="0.05"/>
    <stop offset="0.55" stop-color="${INDIGO}" stop-opacity="0.03"/>
    <stop offset="1" stop-color="${INDIGO}" stop-opacity="0"/>
  </linearGradient>
</defs>`;
}

/* ── Ground: paper, sky, sea, rail ──────────────────────────────────────────────────────────── */

/** Paper with a faint indigo sky wash and a low mottle, like washi that took the damp. */
export function paperGround() {
  const [w, h] = CARD;
  return [
    `<rect x="-20" y="-20" width="${w + 40}" height="${h + 40}" fill="${PAPER}"/>`,
    `<rect x="-20" y="-20" width="${w + 40}" height="${FRAME.horizon + 20}" fill="url(#crew-sky)"/>`,
    `<rect x="-20" y="-20" width="${w + 40}" height="${h + 40}" filter="url(#crew-mottle)" opacity="0.35"/>`,
  ].join('');
}

/**
 * Storm sky — the one rule for the series: two wet dry-brush sweeps and slanting rain. The high
 * sweep comes in from the edge the sailor faces (`storm`: 'left' | 'right') and dies out behind
 * the head, so the face reads against a darker ground; the low, thinner one enters from the other
 * edge at shoulder height and stops short of the figure. Plates never add sky strokes of their own.
 */
export function sky(r, { storm = 'right', rain = 14 } = {}) {
  const out = [];
  const flip = storm === 'left' ? (x) => 1200 - x : (x) => x;
  const hi = 280 + r() * 50;
  const lo = 600 + r() * 40;
  const high = [[1240, hi + 10], [980, hi - 14], [700, hi + 6], [380, hi - 4]].map(([x, y]) => [flip(x), y + (r() - 0.5) * 12]);
  const low = [[-40, lo], [170, lo - 14], [380, lo + 4]].map(([x, y]) => [flip(x), y + (r() - 0.5) * 10]);
  out.push(dry(brush(high, { w: [90, 128, 100, 50], taper: [0.08, 0.55], r, wobble: 0.35, fill: INDIGO, opacity: 0.17 }), 0, true));
  out.push(dry(brush(low, { w: [44, 58, 30], taper: [0.08, 0.6], r, wobble: 0.35, fill: INDIGO, opacity: 0.12 }), 0, true));
  const lines = [];
  for (let i = 0; i < rain; i += 1) {
    const x = r() * 1200;
    const y = 80 + r() * 700;
    const len = 50 + r() * 90;
    lines.push([[x, y], [x - len * 0.28, y + len]]);
  }
  out.push(g(strokes(lines, { w: 1.6, taper: [0.3, 0.5], r, fill: INDIGO }), { opacity: 0.35 }));
  return out.join('');
}

/**
 * The sea behind the crew: horizon at 62 %, three indigo bands getting darker toward the deck,
 * each crest a dry-brush ink line, plus a distant sister boat if `boat` is given ([x, scale]).
 */
export function sea(r, { boat = null } = {}) {
  const H = FRAME.horizon;
  const out = [];
  out.push(brush([[-20, H + 2], [400, H - 1], [800, H + 1], [1220, H - 2]], { w: 2.6, taper: [0, 0], r, fill: INDIGO, opacity: 0.8 }));
  const bands = [
    { y: H + 30, amp: 8, o: 0.12 },
    { y: H + 110, amp: 16, o: 0.2 },
    { y: H + 230, amp: 26, o: 0.32 },
  ];
  for (const band of bands) {
    const crest = [];
    const phase = r() * 6;
    for (let x = -60; x <= 1260; x += 60) crest.push([x, band.y + Math.sin(x / 140 + phase) * band.amp + (r() - 0.5) * band.amp * 0.6]);
    out.push(wash([...crest, [1260, 1700], [-60, 1700]], { opacity: band.o, edge: 0.7 }));
    out.push(dry(brush(crest, { w: 3 + band.amp * 0.18, taper: [0.1, 0.1], r, fill: INK, opacity: 0.55 }), 0));
  }
  if (boat) {
    const [bx, s] = boat;
    const by = H - 2;
    out.push(g([
      mass([[bx - 30 * s, by - 6 * s], [bx + 30 * s, by - 8 * s], [bx + 22 * s, by + 2 * s], [bx - 24 * s, by + 2 * s]], { sharp: true, fill: INDIGO, opacity: 0.7 }),
      brush([[bx, by - 6 * s], [bx + 1, by - 44 * s]], { w: 2, taper: [0, 0.2], fill: INDIGO, opacity: 0.7 }),
      mass([[bx + 2, by - 42 * s], [bx + 20 * s, by - 12 * s], [bx + 2, by - 10 * s]], { sharp: true, fill: INDIGO, opacity: 0.35 }),
    ]));
  }
  return out.join('');
}

/**
 * Boat cues behind the figure: the gunwale cap, stanchions with a top rail and a sagging
 * lifeline between them. The deck rolls a little (`tilt`: how far the right end rises).
 */
export function rail(r, { y = 1280, tilt = 14, posts = [70, 380, 690, 1000], height = 190 } = {}) {
  const at = (x, base) => base - (x / 1200 - 0.5) * 2 * tilt;
  const top = y - height;
  const out = [];
  out.push(brush([[-30, at(-30, top)], [600, at(600, top)], [1230, at(1230, top)]], { w: 6, taper: [0, 0], r, wobble: 0.2 }));
  const sag = (x0, x1) => {
    const mid = (x0 + x1) / 2;
    return brush([[x0, at(x0, top + 80)], [mid, at(mid, top + 102)], [x1, at(x1, top + 80)]], { w: 2.6, taper: [0, 0], r, wobble: 0.3 });
  };
  out.push(sag(posts[0] - 310, posts[0]));
  for (let i = 0; i < posts.length; i += 1) {
    const px = posts[i];
    out.push(brush([[px, at(px, top) - 4], [px + 1, at(px, y)]], { w: 8, taper: [0, 0], r }));
    out.push(`<circle cx="${q(px)}" cy="${q(at(px, top) - 4)}" r="7" fill="${INK}"/>`);
    out.push(sag(px, posts[i + 1] ?? px + 310));
  }
  out.push(brush([[-30, at(-30, y)], [600, at(600, y)], [1230, at(1230, y)]], { w: 24, taper: [0, 0], r, wobble: 0.08 }));
  out.push(brush([[-30, at(-30, y) + 20], [600, at(600, y) + 20], [1230, at(1230, y) + 20]], { w: 8, taper: [0, 0], r, fill: INDIGO, opacity: 0.55 }));
  return out.join('');
}

/* ── Caption strip ──────────────────────────────────────────────────────────────────────────── */

/**
 * Bare paper strip under the figure (cuts it at the waist) with a hand-ruled line. The pipeline
 * prints "No. 0N · Title" and "Temsili" on it (kit.svgDoc caption at y = 1530).
 */
export function captionStrip(r) {
  const [w, h] = CARD;
  const y = FRAME.waist;
  const edge = [];
  for (let x = -20; x <= w + 20; x += 40) edge.push([x, y + (r() - 0.5) * 6]);
  return [
    `<path d="${curve([...edge, [w + 20, h + 90], [-20, h + 90]])}" fill="${PAPER}"/>`, // no filter: displacement at the canvas edge leaks
    brush([[90, FRAME.captionRule], [600, FRAME.captionRule - 1.5], [1110, FRAME.captionRule + 1]], { w: 1.8, taper: [0.02, 0.06], r, wobble: 0.3, opacity: 0.8 }),
  ].join('');
}

/* ── Plate ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Assemble a crew plate (`storm`: the side the sailor faces, where the sky sweep comes in).
 * `draw(r)` returns { back, figure, front }: `back` goes over the sea
 * (rigging, the far rack), `figure` is the portrait (wrapped in the rough-ink filter), `front`
 * over it (props that must stay crisp). Returns the AGENT_PLATES-compatible parts plus a
 * standalone SVG document (the same one pipeline.mjs renders) for proofs.
 */
export function crewPlate({ n, title, seed, detail, draw, boat = null, railY = 1300, storm = 'right' }) {
  const r = rng(seed);
  const parts = draw(r);
  const body = [
    crewDefs(),
    paperGround(),
    sky(rng(seed + 1), { storm }),
    sea(rng(seed + 2), { boat }),
    parts.noRail ? '' : rail(rng(seed + 3), { y: railY }),
    parts.back ?? '',
    rough(parts.figure),
    parts.front ?? '',
    captionStrip(rng(seed + 4)),
  ].join('\n');
  const caption = { left: `No. ${String(n).padStart(2, '0')}  ·  ${title}`, right: 'Temsili' };
  const svg = svgDoc({ box: CARD, px: [1200, 1600], body, caption });
  return Object.freeze({ title, detail: Object.freeze({ ...detail }), body, svg });
}
