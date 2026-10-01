// E3 · "Terazi": the annualised amount (as % of yearly revenue, dragged directly — no invented
// annualising formula) weighed against a %10 counterweight. The beam tips as soon as one side is
// heavier and settles on a damped spring; at equality it is level (the rule holds at ≥).

import { checkRule, RULES } from '../rules-check.js';
import { artSvg, nextId, s, stamp } from './dom.js';
import { dragOn } from './base.js';
import { beamAngle, clamp, inkPath, map, settled, springStep } from './motion.js';
import { COPY, formatPct } from './text.js';

const W = 400;
const H = 98;
const PX = 200;
const PY = 34;
const ARM = 112;
const MAX = 20;
const LOAD_H = 26; // a load of %20 of revenue
const THR = RULES.E3.threshold;
const RAD = Math.PI / 180;
const TILT = { kick: 4, gain: 0.8, max: 10 };

function pan(parent, cls) {
  const g = s('g', { class: `inst__pan ${cls}` }, parent);
  s('path', { d: 'M0 0L-26 30M0 0L26 30', class: 'inst__string' }, g);
  s('path', { d: inkPath([[-31, 30], [-22, 35], [22, 35], [31, 30]], 5, 0.3), class: 'inst__ink is-strong' }, g);
  return g;
}

function drawBalance(parent, { set, reduced }) {
  const svg = artSvg(parent, W, H);
  const hatch = nextId('inst-xh');
  const pat = s('pattern', { id: hatch, width: 5, height: 5, patternUnits: 'userSpaceOnUse' }, s('defs', null, svg));
  s('path', { d: 'M0 0L5 5M5 0L0 5', class: 'inst__hatch' }, pat);

  s('path', { d: `M${PX - 4} ${PY + 5}L${PX - 9} ${H - 6}L${PX + 9} ${H - 6}L${PX + 4} ${PY + 5}Z`, class: 'inst__column' }, svg);
  s('path', { d: inkPath([[PX - 46, H - 5], [PX + 46, H - 5]], 7), class: 'inst__ink is-strong' }, svg);

  const left = pan(svg, 'is-left');
  const load = s('rect', { x: -16, width: 32, class: 'inst__load' }, left);
  const right = pan(svg, 'is-right');
  const counter = (THR / MAX) * LOAD_H;
  s('rect', { x: -16, y: 30 - counter, width: 32, height: counter, class: 'inst__weight', fill: `url(#${hatch})` }, right);

  const beam = s('g', { class: 'inst__beam' }, svg);
  s('path', { d: inkPath([[PX - ARM - 3, PY], [PX + ARM + 3, PY]], 9, 0.3), class: 'inst__ink is-beam' }, beam);
  s('path', { d: `M${PX} ${PY}V${PY - 14}`, class: 'inst__ink is-strong' }, beam);
  s('circle', { cx: PX, cy: PY, r: 3.8, class: 'inst__dot' }, svg);
  s('text', { x: W - 4, y: 12, class: 'inst__axis is-end is-muted', text: 'tutar · yıllık gelire oran' }, svg);
  const loadLabel = s('text', { x: 4, y: H - 4, class: 'inst__axis is-strong' }, svg);
  s('text', { x: W - 4, y: H - 4, class: 'inst__axis is-end is-strong', text: `eşik ${formatPct(THR, 0, true)}` }, svg);
  stamp(svg, 4, 21, ['Öneri adayı']);

  let spring = { x: 0, v: 0 };
  let target = 0;
  let raf = 0;
  let last = 0;

  const place = (deg) => {
    const c = Math.cos(deg * RAD);
    const sn = Math.sin(deg * RAD);
    beam.setAttribute('transform', `rotate(${(-deg).toFixed(2)} ${PX} ${PY})`);
    left.setAttribute('transform', `translate(${(PX - ARM * c).toFixed(1)} ${(PY + ARM * sn).toFixed(1)})`);
    right.setAttribute('transform', `translate(${(PX + ARM * c).toFixed(1)} ${(PY - ARM * sn).toFixed(1)})`);
  };

  const tick = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    spring = springStep(spring, target, dt, 120, 8.5);
    if (settled(spring, target)) {
      spring = { x: target, v: 0 };
      raf = 0;
    } else raf = requestAnimationFrame(tick);
    place(spring.x);
  };

  // press the amount pan down (or lift it) to change the amount
  const stop = dragOn(svg, (p) => set(map(p.y, PY + 30 - LOAD_H, PY + 30 + LOAD_H, 0, MAX)));
  place(0);

  return {
    update(v) {
      const hgt = clamp((v / MAX) * LOAD_H, 0, LOAD_H);
      load.setAttribute('y', (30 - hgt).toFixed(1));
      load.setAttribute('height', hgt.toFixed(1));
      loadLabel.textContent = `tutar ${formatPct(v, 1, true)}`;
      target = beamAngle(v, THR, TILT);
      if (reduced) {
        spring = { x: target, v: 0 };
        place(target);
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      stop();
    },
  };
}

export const E3_SPEC = {
  title: 'E3 · terazi',
  label: 'Yıllıklandırılmış tutar, yıllık gelirin yüzdesi',
  min: 0,
  max: MAX,
  step: 0.5,
  preset: 8.5,
  target: 12,
  threshold: THR,
  format: (v) => formatPct(v, 1, true),
  valuetext: COPY.E3.valuetext,
  evaluate(v) {
    const { fired, margin } = checkRule('E3', { annualisedPctOfRevenue: v });
    return { fired, text: COPY.E3.state(v, fired), extra: { margin } };
  },
  draw: drawBalance,
};
