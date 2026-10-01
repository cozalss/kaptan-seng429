// E2 / E4 · honest switches: these articles have no number, the notice itself is the trigger.
// A real <button aria-pressed> ("Bildirim geldi mi?"); when pressed, the representative notice
// slip is set down on the page and stamped "Öneri adayı". No invented threshold anywhere.

import { checkRule } from '../rules-check.js';
import { controller, plate } from './base.js';
import { artSvg, h, s, stamp } from './dom.js';
import { COPY, SHORT } from './text.js';

const AUTOPLAY_DELAY = 520;

export const DISCLOSURES = {
  E2: {
    title: 'bildirim anahtarı',
    question: 'Bildirim geldi mi?',
    subject: 'Pay alım bildirimi',
    note: 'Sayısal eşik yok: tetikleyici bildirimin kendisi. Büyüklüğünü sonraki adımlar tartar.',
  },
  E4: {
    title: 'açıklama anahtarı',
    question: 'Finansal sonuç açıklandı mı?',
    subject: 'Finansal sonuç',
    note: 'Sayısal eşik yok: tetikleyici açıklamanın kendisi. Büyüklüğünü sonraki adımlar tartar.',
  },
};

function drawSlip(parent, rule, subject) {
  const svg = artSvg(parent, 168, 92);
  s('path', { d: 'M4 89H164', class: 'inst__ink' }, svg);
  s('rect', { x: 18, y: 22, width: 128, height: 62, class: 'inst__ghost' }, svg);
  s('text', { x: 82, y: 57, class: 'inst__axis is-mid inst__ghost-text', text: 'Bildirim yok' }, svg);
  const slip = s('g', { class: 'inst__slip' }, svg);
  s('rect', { x: 21, y: 25, width: 128, height: 62, class: 'inst__slip-shadow' }, slip);
  s('rect', { x: 18, y: 22, width: 128, height: 62, class: 'inst__slip-sheet' }, slip);
  s('text', { x: 26, y: 36, class: 'inst__slip-issuer', text: subject }, slip);
  s('text', { x: 139, y: 36, class: 'inst__slip-code', text: rule }, slip);
  [46, 54, 62].forEach((ly, i) => s('path', { d: `M26 ${ly}H${i === 2 ? 96 : 138}`, class: 'inst__slip-line' }, slip));
  stamp(svg, 66, 60, ['Öneri adayı'], 84);
  return svg;
}

export function disclosureInstrument({ host, rule, reduced, onChange }) {
  const copy = DISCLOSURES[rule];
  // the honest "no number" line is printed in the article text; the plate keeps it for screen readers
  const parts = plate(host, { rule, title: `${rule} · ${copy.title}. ${copy.note}`, short: SHORT[rule] });
  parts.art.classList.add('is-split');
  drawSlip(parts.art, rule, copy.subject);

  // the switch sits beside the slip, so the plate stays one drawing tall
  const button = h('button', { type: 'button', class: 'inst__switch', 'aria-pressed': 'false' }, parts.art);
  h('span', { class: 'inst__switch-q', text: copy.question }, button);
  const face = h('span', { class: 'inst__switch-face', 'aria-hidden': 'true' }, button);
  h('span', { class: 'is-no', text: 'Hayır' }, face);
  h('span', { class: 'is-yes', text: 'Evet' }, face);

  const ctl = controller({
    parts,
    rule,
    onChange,
    evaluate(on) {
      const { fired } = checkRule(rule, { disclosed: on });
      return { fired, text: COPY[rule].state(fired), extra: { margin: null } };
    },
    render(on) {
      button.setAttribute('aria-pressed', String(on));
    },
  });

  let played = false;
  let owned = false;
  let timer = 0;
  const onClick = () => {
    played = true;
    owned = true;
    clearTimeout(timer);
    ctl.set(!ctl.value);
  };
  button.addEventListener('click', onClick);
  ctl.set(false, { quiet: true });

  return {
    autoplay() {
      if (played) return Promise.resolve();
      played = true;
      if (reduced) {
        ctl.set(true);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        timer = setTimeout(() => {
          ctl.set(true);
          resolve();
        }, AUTOPLAY_DELAY);
      });
    },
    set(on) {
      ctl.set(Boolean(on));
    },
    /** Scrubbed autoplay: the disclosure arrives half way through (0..1). Silent. */
    progress(t) {
      if (owned) return;
      played = true;
      clearTimeout(timer);
      const on = t >= 0.5;
      if (on !== ctl.value) ctl.set(on, { quiet: true });
    },
    destroy() {
      clearTimeout(timer);
      button.removeEventListener('click', onClick);
      ctl.destroy();
      host.replaceChildren();
    },
  };
}
