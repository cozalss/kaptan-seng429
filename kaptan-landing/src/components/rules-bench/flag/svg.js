// The printed pennant: the same hatch runs and colour boundaries as the cloth, laid on the rest shape
// (540 × 300, the ICS drawing's own units) as a static SVG string. For reduced motion, print and the
// moment before the canvas takes over. Pure; no ids, so any number can sit on one page.

import { INK } from '../../../lib/ink3d/ink.js';
import { boundaryLines, hatchRuns, numeralOf, restY } from './pennants.js';

const W = 540;
const H = 300;
const LINES = 26; // vertical hatch lines along the length
const ROWS = 13; // horizontal hatch lines across the hoist

const f = (n) => Math.round(n * 10) / 10;
const pt = (u, v) => `${f(u * W)} ${f(restY(u, v) * H)}`;

function hatchPath(n) {
  const { vertical, horizontal } = hatchRuns(n, LINES, ROWS);
  let d = '';
  // on the rest shape every hatch run is one straight segment
  for (let k = 0; k < vertical.length; k += 3) d += `M${pt(vertical[k], vertical[k + 1])}L${pt(vertical[k], vertical[k + 2])}`;
  for (let k = 0; k < horizontal.length; k += 3) {
    const y = f(horizontal[k] * H);
    d += `M${f(horizontal[k + 1] * W)} ${y}H${f(horizontal[k + 2] * W)}`;
  }
  return d;
}

function boundaryPath(n) {
  return boundaryLines(n)
    .map((line) => {
      let d = '';
      for (let k = 0; k < line.length; k += 2) d += `${k === 0 ? 'M' : 'L'}${pt(line[k], line[k + 1])}`;
      return d;
    })
    .join('');
}

const cache = new Map();

/**
 * Static SVG markup of the pennant for rule 'E1'..'E4' (ICS numeral pennants 1–4), hatched in ink.
 * Decorative: the article text carries the meaning, so it is aria-hidden.
 */
export function pennantSvg(id) {
  const n = numeralOf(id);
  if (!cache.has(n)) {
    const outline = `M0 0L${W} ${H * 0.25}L${W} ${H * 0.75}L0 ${H}Z`;
    const stroke = `fill="none" stroke="${INK.sumi}" vector-effect="non-scaling-stroke"`;
    cache.set(
      n,
      `<svg class="flag-svg" viewBox="-6 -6 552 312" preserveAspectRatio="xMinYMin meet" aria-hidden="true" focusable="false">` +
        `<path d="${outline}" fill="${INK.sheet}"/>` +
        `<path d="${hatchPath(n)}" ${stroke} stroke-width="0.85" stroke-opacity="0.85"/>` +
        `<path d="${boundaryPath(n)}" ${stroke} stroke-width="1"/>` +
        `<path d="${outline}" ${stroke} stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M0 0V${H}" ${stroke} stroke-width="2.4"/>` +
        `</svg>`,
    );
  }
  return cache.get(n);
}
