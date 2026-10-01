// Sızıntı filtresi · "beş seanslık çizgi": the visitor draws the last five sessions (sweep across
// the chart) or drags the rise with the range. Above %8 the part over the line is hatched, the
// pencil rule inks through and the stamp says exactly "atlanır ya da yarıya indirilir".

import { leakFilter } from '../rules-check.js';
import { artSvg, overHatch, s, stamp, thresholdLine } from './dom.js';
import { dragOn } from './base.js';
import { clamp, inkPath, leakPoints, map, snap } from './motion.js';
import { COPY, LEAK_EFFECT, formatPct } from './text.js';

const W = 404;
const H = 102;
const X0 = 46;
const STEP = 68;
const LO = -4;
const HI = 16;
const THR = 8;
const TOP = 22;
const BOT = 82;
const y = (v) => map(v, LO, HI, BOT, TOP);
const x = (i) => X0 + i * STEP;
const GRID = { min: LO, max: HI, step: 0.5 };

function drawLeak(parent, { set, redraw }) {
  const svg = artSvg(parent, W, H);
  svg.classList.add('is-drawable');
  const hatched = overHatch(svg, { x: X0, y: 0, width: STEP * 5, height: y(THR) });

  const ruling = s('g', { class: 'inst__ruling' }, svg);
  for (let v = LO; v <= HI; v += 4) s('path', { d: `M${X0} ${y(v)}H${x(5)}` }, ruling);
  for (let i = 0; i <= 5; i += 1) {
    s('path', { d: `M${x(i)} ${BOT}V${BOT + 4}`, class: 'inst__tickmark' }, svg);
    s('text', { x: x(i), y: H - 5, class: 'inst__axis is-mid', text: String(i) }, svg);
  }
  s('text', { x: X0 - 8, y: H - 5, class: 'inst__axis is-end', text: 'Seans' }, svg);
  s('path', { d: inkPath([[X0, y(0)], [x(5), y(0)]], 4), class: 'inst__ink' }, svg);
  s('text', { x: X0 - 8, y: y(0) + 4, class: 'inst__axis is-end', text: '0' }, svg);
  s('text', { x: x(5), y: 12, class: 'inst__axis is-end is-muted', text: 'çizgiyi sürükleyip çizin' }, svg);

  const area = s('path', { class: 'inst__wash' }, svg);
  const over = s('path', { class: 'inst__over', ...hatched }, svg);
  thresholdLine(svg, `M${X0 - 6} ${y(THR)}H${x(5)}`);
  s('text', { x: X0 - 8, y: y(THR) + 4, class: 'inst__axis is-end is-thr', text: formatPct(THR, 0, true) }, svg);
  const line = s('path', { class: 'inst__ink is-strong' }, svg);
  const dim = s('path', { class: 'inst__dim' }, svg);
  const handles = [1, 2, 3, 4, 5].map((i) => s('rect', { class: `inst__handle${i === 5 ? ' is-end' : ''}` }, svg));
  stamp(svg, X0 + 8, TOP - 5, ['Atlanır ya da yarıya indirilir'], 170);

  let drawn = [];
  const stop = dragOn(svg, (p) => {
    const i = clamp(Math.round((p.x - X0) / STEP), 1, 5);
    const v = snap(map(p.y, BOT, TOP, LO, HI), GRID);
    if (i === 5) return set(v);
    drawn = Object.assign([], drawn, { [i]: v });
    return redraw();
  });

  return {
    update(rise) {
      const pts = leakPoints(rise, drawn).map((r, i) => [x(i), y(r)]);
      const top = pts.map(([px, py]) => `${px} ${py.toFixed(1)}`).join('L');
      area.setAttribute('d', `M${X0} ${y(0)}L${top}L${x(5)} ${y(0)}Z`);
      over.setAttribute('d', `M${X0} ${BOT}L${top}L${x(5)} ${BOT}Z`);
      line.setAttribute('d', inkPath(pts, 21, 0.6));
      const ex = x(5) + 8;
      dim.setAttribute('d', `M${ex} ${y(0)}V${y(rise)}M${ex - 3} ${y(0)}H${ex + 3}M${ex - 3} ${y(rise)}H${ex + 3}`);
      handles.forEach((el, k) => {
        const size = k === 4 ? 9 : 7;
        el.setAttribute('x', pts[k + 1][0] - size / 2);
        el.setAttribute('y', (pts[k + 1][1] - size / 2).toFixed(1));
        el.setAttribute('width', size);
        el.setAttribute('height', size);
      });
    },
    destroy: stop,
  };
}

export const LEAK_SPEC = {
  title: 'Sızıntı filtresi · beş seanslık çizgi',
  label: 'Son 5 seanstaki yükseliş',
  min: 0,
  max: HI,
  step: 0.5,
  preset: 6.5,
  target: 10,
  threshold: THR,
  format: (v) => formatPct(v, 1, true),
  valuetext: COPY.leak.valuetext,
  evaluate(v) {
    const result = leakFilter(v);
    const fired = result === 'skip-or-halve';
    return { fired, text: COPY.leak.state(v, fired), extra: { result, effect: fired ? LEAK_EFFECT : null } };
  },
  draw: drawLeak,
};
