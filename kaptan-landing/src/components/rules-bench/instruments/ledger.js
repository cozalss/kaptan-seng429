// E1 · "10 seanslık defter": ten ledger columns, the running buyback total rises as an indigo wash
// with an ink step line; where it passes the capital line of %0,25 the wash is hatched, the dashed
// pencil rule is inked through and a small "Öneri adayı" stamp is pressed.

import { checkRule, RULES } from '../rules-check.js';
import { artSvg, overHatch, s, stamp, thresholdLine } from './dom.js';
import { dragOn } from './base.js';
import { cumulative, inkPath, map } from './motion.js';
import { COPY, formatPct } from './text.js';

const W = 400;
const H = 102;
const X0 = 46;
const X1 = 394;
const BASE = 80;
const TOP = 24;
const MAX = 0.5;
const COL = (X1 - X0) / 10;
const y = (v) => map(v, 0, MAX, BASE, TOP);

function drawLedger(parent, { set }) {
  const svg = artSvg(parent, W, H);
  const thrY = y(RULES.E1.threshold);
  const hatched = overHatch(svg, { x: X0, y: 0, width: X1 - X0, height: thrY });

  const ruling = s('g', { class: 'inst__ruling' }, svg);
  for (let v = 0.125; v <= MAX; v += 0.125) s('path', { d: `M${X0} ${y(v)}H${X1}` }, ruling);
  for (let i = 1; i < 10; i += 1) s('path', { d: `M${X0 + i * COL} ${TOP}V${BASE}` }, ruling);
  s('path', { d: `M${X0 - 3} ${TOP - 2}V${H - 2}M${X0} ${TOP - 2}V${H - 2}`, class: 'inst__margin' }, svg);
  s('path', { d: inkPath([[X0 - 6, BASE], [X1, BASE]], 3), class: 'inst__ink' }, svg);
  for (let i = 0; i < 10; i += 1) {
    s('text', { x: X0 + (i + 0.5) * COL, y: H - 5, class: 'inst__axis is-mid', text: String(i + 1) }, svg);
  }
  s('text', { x: X0 - 8, y: H - 5, class: 'inst__axis is-end', text: 'Seans' }, svg);
  s('text', { x: X0 - 8, y: BASE + 4, class: 'inst__axis is-end', text: '0' }, svg);
  s('text', { x: X1, y: 12, class: 'inst__axis is-end is-muted', text: 'geri alım · sermayeye oran' }, svg);

  const area = s('path', { class: 'inst__wash' }, svg);
  const over = s('path', { class: 'inst__over', ...hatched }, svg);
  const line = s('path', { class: 'inst__ink is-strong' }, svg);
  thresholdLine(svg, `M${X0 - 6} ${thrY}H${X1}`);
  s('text', { x: X0 - 8, y: thrY + 4, class: 'inst__axis is-end is-thr', text: formatPct(RULES.E1.threshold) }, svg);
  const dot = s('circle', { r: 3.6, cx: X1, class: 'inst__dot' }, svg);
  stamp(svg, X0 + 10, TOP + 1, ['Öneri adayı']);

  const stop = dragOn(svg, (p) => set(map(p.y, BASE, TOP, 0, MAX)));

  return {
    update(total) {
      const pts = cumulative(total).flatMap((c, i) => [
        [X0 + i * COL, y(c)],
        [X0 + (i + 1) * COL, y(c)],
      ]);
      const top = pts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join('L');
      const shape = `M${X0} ${BASE}L${top}L${X1} ${BASE}Z`;
      area.setAttribute('d', shape);
      over.setAttribute('d', shape);
      line.setAttribute('d', inkPath(pts, 11, 0.5));
      dot.setAttribute('cy', y(total).toFixed(1));
    },
    destroy: stop,
  };
}

export const E1_SPEC = {
  title: 'E1 · 10 seanslık defter',
  label: '10 seansta geri alınan pay, sermayenin yüzdesi',
  min: 0,
  max: MAX,
  step: 0.01,
  preset: 0.19,
  target: 0.31,
  threshold: RULES.E1.threshold,
  format: (v) => formatPct(v),
  valuetext: COPY.E1.valuetext,
  evaluate(v) {
    const { fired, margin } = checkRule('E1', { sharePct: v });
    return { fired, text: COPY.E1.state(v, fired), extra: { margin } };
  },
  draw: drawLedger,
};
