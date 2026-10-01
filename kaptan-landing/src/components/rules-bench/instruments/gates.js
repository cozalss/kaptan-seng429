// Ön eleme · "Üç kapı": a canal with three lock gates (işlem görebilirlik, tedbir, evren) before
// the AI crew. Each gate is a real <button aria-pressed>; a closed gate swings across the canal
// and the notice slip stops before it, struck out: it never reaches the agents.

import { screenGates } from '../rules-check.js';
import { controller, plate } from './base.js';
import { artSvg, h, s } from './dom.js';
import { inkPath } from './motion.js';
import { GATES, screenSentence, screenShort } from './text.js';

const W = 400;
const H = 80;
const TOPB = 28;
const BOTB = 56;
const GX = [150, 240, 330];
const START = 6;
const END = 364;
const SLIP_W = 26;

function drawCanal(parent) {
  const svg = artSvg(parent, W, H);
  s('path', { d: inkPath([[4, TOPB], [396, TOPB]], 31, 0.5), class: 'inst__ink is-strong' }, svg);
  s('path', { d: inkPath([[4, BOTB], [396, BOTB]], 32, 0.5), class: 'inst__ink is-strong' }, svg);
  const bank = s('g', { class: 'inst__ruling' }, svg);
  for (let bx = 8; bx < 396; bx += 8) s('path', { d: `M${bx} ${BOTB + 2}l-4 5` }, bank);
  s('text', { x: W - 4, y: 12, class: 'inst__axis is-end is-muted', text: 'yapay zekâ ajanlarına →' }, svg);
  const arms = GX.map((gx, i) => {
    s('rect', { x: gx - 2.5, y: TOPB - 9, width: 5, height: 9, class: 'inst__post' }, svg);
    s('text', { x: gx, y: H - 6, class: 'inst__axis is-mid', text: GATES[i].name }, svg);
    const arm = s('path', { d: `M${gx} ${TOPB}V${BOTB - 2}`, class: 'inst__arm' }, svg);
    arm.style.transformOrigin = `${gx}px ${TOPB}px`;
    return arm;
  });
  const slip = s('g', { class: 'inst__canal-slip' }, svg);
  s('rect', { x: 0, y: 34, width: SLIP_W, height: 16, class: 'inst__slip-sheet' }, slip);
  [39, 43, 47].forEach((ly) => s('path', { d: `M4 ${ly}H${SLIP_W - 5}`, class: 'inst__slip-line' }, slip));
  s('path', { d: `M-3 31L${SLIP_W + 3} 53M-3 53L${SLIP_W + 3} 31`, class: 'inst__strike' }, slip);
  return { arms, slip };
}

export function gatesInstrument({ host, rule, reduced, onChange }) {
  const parts = plate(host, { rule, title: 'Ön eleme · üç kapı' });
  const { arms, slip } = drawCanal(parts.art);
  const group = h('div', { class: 'inst__gates', role: 'group', 'aria-label': 'Ön eleme kapıları' }, parts.controls);
  const buttons = GATES.map((gate) => {
    const b = h('button', { type: 'button', class: 'inst__gate', 'aria-pressed': 'true', 'data-key': gate.key }, group);
    h('span', { class: 'inst__box', 'aria-hidden': 'true' }, b);
    h('span', { class: 'inst__gate-name', text: gate.on }, b);
    return b;
  });

  let waiting = !reduced; // before autoplay the slip waits at the canal's mouth
  const place = (gates, result) => {
    const firstShut = GATES.findIndex((g) => !gates[g.key]);
    const to = waiting ? START : firstShut < 0 ? END : GX[firstShut] - SLIP_W - 8;
    slip.style.transform = `translateX(${to}px)`;
    slip.classList.toggle('is-out', !waiting && !result.pass);
  };

  const ctl = controller({
    parts,
    rule,
    onChange,
    evaluate(gates) {
      const result = screenGates(gates);
      return {
        fired: !result.pass,
        text: screenSentence(result.failed),
        short: screenShort(result.failed),
        extra: { result, gates },
      };
    },
    render(gates, { extra }) {
      GATES.forEach((g, i) => {
        buttons[i].setAttribute('aria-pressed', String(Boolean(gates[g.key])));
        arms[i].classList.toggle('is-open', Boolean(gates[g.key]));
      });
      place(gates, extra.result);
    },
  });

  const release = () => {
    waiting = false;
    ctl.set(ctl.value, { quiet: true });
  };
  const onClick = (event) => {
    const button = event.target.closest('.inst__gate');
    if (!button) return;
    waiting = false;
    const key = button.dataset.key;
    ctl.set({ ...ctl.value, [key]: !ctl.value[key] });
  };
  group.addEventListener('click', onClick);
  ctl.set({ tradable: true, noMeasure: true, inUniverse: true }, { quiet: true });

  return {
    autoplay() {
      if (waiting) release();
      return Promise.resolve();
    },
    set(gates) {
      waiting = false;
      ctl.set({ ...ctl.value, ...gates });
    },
    destroy() {
      group.removeEventListener('click', onClick);
      ctl.destroy();
      host.replaceChildren();
    },
  };
}
