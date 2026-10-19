// The Open Graph card (1280 × 853, 3:2): the hero as one printed graphic-novel panel. Rice paper,
// the KAPtan mark, "KANIT / ÖNCE." in Bodoni caps, a static sumi-e sea whose swells follow the
// hero's printed fallback (index.html .hero-sea__print), the hero's inked boat with its red flag
// (the card's only red), and one Inter caption panel (ink border, hard offset shadow).
// Everything that must read sits inside the central 1200 × 630 so 1.91:1 crops keep it.

import { el, f, group, path, rect, rng, smooth, text } from './kit.mjs';
import { wordmarkPath } from './og-wordmark.mjs';

// The site palette (src/styles/tokens.css).
const SUMI = '#121318';
const PAPER = '#F3F1EC';
const PANEL = '#FBFAF6';
const BRAND = '#0E3A66';
const NORTH = '#B3261E';
const MUTED = '#666663';

const BOX = [1280, 853];
const DISPLAY = 'Bodoni Moda'; // weight 400 → the Bodoni Moda Display file
const SANS = 'Inter';
const SHADOW = 6; // hard offset, like --shadow-panel-lg

/**
 * Swell layers, back to front: the four tones of .hero-sea__print, from the wash to near-sumi.
 * `base` is the mean crest height, `amp` the swell amplitude, `phase` shifts the crests; each band
 * is washed from a darker `crest` tone down to its `fill`, like ink pooling under a brush edge.
 */
const SWELLS = Object.freeze([
  { base: 590, amp: 9, len: 520, phase: 0.4, fill: '#DCDFE3', crest: '#B9C1CB', ink: 0.22 },
  { base: 634, amp: 13, len: 470, phase: 2.1, fill: '#B9C1CB', crest: '#8C97A5', ink: 0.34 },
  { base: 694, amp: 17, len: 430, phase: 4.0, fill: '#7D8896', crest: '#4E5968', ink: 0.55 },
  { base: 764, amp: 22, len: 400, phase: 1.3, fill: '#2B3340', crest: '#161A22', ink: 0.9 },
]);
const BOAT_LAYER = 2; // the boat rides the third band, as in the hero
const BOAT = { x: 880, scale: 1.9 };
const ROSE = { x: 1086, y: 390, scale: 0.98 }; // the hero compass (viewBox -24 -24 248 248), centre at (x, y)

/** Crest height of a swell at x: two sines, so the rhythm is not mechanical. */
const crestY = ({ base, amp, len, phase }, x) =>
  base + amp * Math.sin((x / len) * Math.PI * 2 + phase) + amp * 0.35 * Math.sin((x / (len * 0.43)) * Math.PI * 2 + phase * 1.7);

const crestPoints = (swell, step = 40) => Array.from({ length: Math.ceil((BOX[0] + 80) / step) + 1 }, (_, i) => [i * step - 40, crestY(swell, i * step - 40)]);

/** A brush stroke along a crest: a filled band that swells and thins, not a uniform line. */
function brushStroke(points, weight, r) {
  const top = points.map(([x, y], i) => [x, y - weight * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + r() * 0.6)))]);
  const bottom = points.map(([x, y]) => [x, y + weight * 0.2]).reverse();
  return `${smooth(top)} L${f(bottom[0][0])} ${f(bottom[0][1])} ${smooth(bottom).slice(1)} Z`;
}

/** Short dry-brush hatches just below a crest (the sumi texture of the hero's shader). */
function hatches(swell, r, count, opacity) {
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const x = 20 + r() * (BOX[0] - 40);
    const y = crestY(swell, x) + 10 + r() * 26;
    const len = 18 + r() * 46;
    const tilt = (crestY(swell, x + len) - crestY(swell, x)) * 0.8;
    parts.push(`M${f(x)} ${f(y)} Q${f(x + len / 2)} ${f(y - 3 + tilt / 2)} ${f(x + len)} ${f(y + tilt)}`);
  }
  return path(parts.join(' '), { stroke: SUMI, 'stroke-width': 1.3, 'stroke-opacity': opacity });
}

/** Per-band washes and a slight turbulence that roughens the brush edges (librsvg filters). */
function seaDefs() {
  const washes = SWELLS.map(
    (swell, i) => `<linearGradient id="wash-${i}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(swell.base - swell.amp * 1.4)}" x2="0" y2="${f(swell.base + 70)}">
      <stop offset="0" stop-color="${swell.crest}"/><stop offset="1" stop-color="${swell.fill}"/></linearGradient>`,
  );
  return `<defs>${washes.join('')}
    <filter id="brush" x="-2%" y="-40%" width="104%" height="180%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.22" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
    </filter></defs>`;
}

function sea() {
  const r = rng(8531);
  return SWELLS.map((swell, index) => {
    const pts = crestPoints(swell);
    const body = `${smooth(pts)} L${BOX[0] + 40} ${BOX[1] + 20} L-40 ${BOX[1] + 20} Z`;
    const layer = [
      path(body, { fill: `url(#wash-${index})`, stroke: 'none' }),
      path(brushStroke(pts, 2.2 + index * 1.1, r), { fill: SUMI, 'fill-opacity': swell.ink, stroke: 'none', filter: 'url(#brush)' }),
      hatches(swell, r, 10 + index * 6, 0.12 + index * 0.08),
    ];
    return group(index === BOAT_LAYER ? [boat(swell), ...layer] : layer);
  }).join('');
}

/** The hero's boat (index.html .hero-boat, viewBox 160 × 120, keel y 108 on the water line). */
function boat(swell) {
  const { x, scale } = BOAT;
  const y = crestY(swell, x) + 8 * scale; // settle the hull into the swell
  const slope = (crestY(swell, x + 30) - crestY(swell, x - 30)) / 60;
  const angle = (Math.atan(slope) * 180) / Math.PI;
  const hull = 'M14 92 C 30 97 110 99 148 88 C 140 101 124 108 96 110 L 52 110 C 34 108 22 102 14 92 Z';
  const fills = ['M76 26 C 64 48 52 70 40 88 L 76 88 Z', 'M81 22 C 100 40 116 66 124 86 L 82 88 Z', hull];
  const inks = [
    hull,
    'M20 97 C 60 102 110 102 142 94',
    'M78 95 L 80 17',
    'M81 22 C 100 40 116 66 124 86 L 82 88',
    'M76 26 C 64 48 52 70 40 88 L 76 88',
    'M83 42 L 107 45 M83 60 L 116 63 M83 76 L 121 78',
    'M58 94 L 57 83 M53 88 L 62 86',
    'M6 99 C 10 93 16 93 20 97 M140 97 C 146 92 152 92 156 97',
  ];
  return group(
    [
      ...fills.map((d) => path(d, { fill: PANEL, stroke: 'none' })),
      ...inks.map((d) => path(d, { stroke: SUMI, 'stroke-width': 2.2 })),
      el('circle', { cx: 57, cy: 79, r: 3.2, fill: 'none', stroke: SUMI, 'stroke-width': 2.2 }),
      path('M80 17 L 94 21 L 80 25 Z', { fill: NORTH, stroke: 'none' }),
    ],
    { transform: `translate(${f(x)} ${f(y)}) rotate(${f(angle)}) scale(${scale}) translate(-80 -108)` },
  );
}

/** The #kaptan-logo symbol (index.html), 212 × 64, at `scale`. */
function logo(x, y, scale) {
  return group(
    [
      el('ellipse', { cx: 30, cy: 32, rx: 26.5, ry: 27.5, fill: 'none', stroke: BRAND, 'stroke-width': 5.5 }),
      path('M6.6 32H10.2M49.8 32H53.4', { stroke: BRAND, 'stroke-width': 1.4, 'stroke-linecap': 'butt' }),
      path('M30 10.6 32.7 32H27.3Z', { fill: BRAND, stroke: 'none' }),
      path('M27.3 32 30 53.4 32.7 32', { stroke: BRAND, 'stroke-width': 1.3 }),
      el('circle', { cx: 30, cy: 32, r: 1.7, fill: BRAND }),
      group(wordmarkPath('KAPtan', { x: 67, y: 46, size: 38, tracking: -0.5 }), { fill: BRAND }),
    ],
    { transform: `translate(${f(x)} ${f(y)}) scale(${scale})` },
  );
}

/** Running head, as in a printed book: the mark on the left, the chapter on the right, a rule. */
function runningHead() {
  return group([
    logo(64, 120, 1.3),
    text(1216, 176, 'Bölüm 1 · Fırtına', { family: SANS, size: 26, weight: 500, fill: SUMI, anchor: 'end' }),
    rect(64, 210, 1152, 2, { fill: SUMI }),
  ]);
}

/** "KANIT / ÖNCE." — Bodoni caps, the second line set in from the left (hero__line--indent). */
function headline() {
  const size = 180;
  const attrs = { 'font-family': DISPLAY, 'font-size': size, 'font-weight': 400, fill: SUMI, 'letter-spacing': f(-0.012 * size) };
  return group([
    el('text', { x: 56, y: 382, ...attrs }, 'KANIT'),
    el('text', { x: 56 + size * 1.05, y: 382 + size * 0.98, ...attrs }, 'ÖNCE.'), // clears Ö's dots
  ]);
}

/** Caption panel: panel sheet, ink border, hard offset shadow, Inter sentence case. */
function captionPanel() {
  const [x, y, w, h] = [64, 598, 560, 138];
  return group([
    rect(x + SHADOW, y + SHADOW, w, h, { fill: SUMI }),
    rect(x, y, w, h, { fill: PANEL, stroke: SUMI, 'stroke-width': 2.4 }),
    text(x + 26, y + 50, 'Yapay zekâ okur, kurallar karar verir,', { family: SANS, size: 29, weight: 500, fill: SUMI }),
    text(x + 26, y + 88, 'insan onaylar.', { family: SANS, size: 29, weight: 500, fill: SUMI }),
    text(x + 26, y + 120, 'Otomatik emir yok.', { family: SANS, size: 17, fill: MUTED }),
  ]);
}

/** The hero compass rose, needle on north; sumi only (the flag keeps the card's one red). */
function compass() {
  const { x, y, scale } = ROSE;
  const points = [
    ['M131.1,68.9 L95.1,95.1 L100,100 Z', 'M131.1,68.9 L104.9,104.9 L100,100 Z'],
    ['M131.1,131.1 L104.9,95.1 L100,100 Z', 'M131.1,131.1 L95.1,104.9 L100,100 Z'],
    ['M68.9,131.1 L104.9,104.9 L100,100 Z', 'M68.9,131.1 L95.1,95.1 L100,100 Z'],
    ['M68.9,68.9 L95.1,104.9 L100,100 Z', 'M68.9,68.9 L104.9,95.1 L100,100 Z'],
    ['M100,30 L90,100 L100,100 Z', 'M100,30 L110,100 L100,100 Z'],
    ['M170,100 L100,90 L100,100 Z', 'M170,100 L100,110 L100,100 Z'],
    ['M100,170 L110,100 L100,100 Z', 'M100,170 L90,100 L100,100 Z'],
    ['M30,100 L100,110 L100,100 Z', 'M30,100 L100,90 L100,100 Z'],
  ];
  const letter = (lx, ly, ch) => el('text', { x: lx, y: ly + 9, 'font-family': DISPLAY, 'font-size': 26, fill: SUMI, 'text-anchor': 'middle' }, ch);
  return group(
    [
      el('ellipse', { cx: 100, cy: 100, rx: 86, ry: 89, fill: PANEL, stroke: SUMI, 'stroke-width': 7 }),
      el('circle', { cx: 100, cy: 100, r: 78, fill: 'none', stroke: SUMI, 'stroke-width': 5, 'stroke-dasharray': '0.9 5.91' }),
      ...points.flatMap(([dark, light]) => [
        path(dark, { fill: SUMI, stroke: 'none' }),
        path(light, { fill: PANEL, stroke: SUMI, 'stroke-width': 1 }),
      ]),
      letter(100, -6, 'K'),
      letter(208, 101, 'D'),
      letter(100, 210, 'G'),
      letter(-8, 101, 'B'),
      el('circle', { cx: 100, cy: 100, r: 5, fill: SUMI }),
    ],
    { transform: `translate(${f(x - 100 * scale)} ${f(y - 100 * scale)}) scale(${scale})` },
  );
}

/** OG card SVG at `px` (1280 × 853). */
export function ogSvg({ px }) {
  const body = [seaDefs(), rect(-10, -10, BOX[0] + 20, BOX[1] + 20, { fill: PAPER }), sea(), runningHead(), headline(), compass(), captionPanel()].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px[0]}" height="${px[1]}" viewBox="0 0 ${BOX.join(' ')}">${body}</svg>`;
}
