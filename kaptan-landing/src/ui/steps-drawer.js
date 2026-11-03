// The header's "Altı adımda" drawer: the six steps one disclosure goes through, drawn as a 2 × 3
// comic storyboard — ink panels with gutters, each caption set below its panel. Static copy only:
// there is nothing to fill in, select or send.

import { SIX_STEPS } from '../data/six-steps.js';
import { h } from './dom.js';
import { createOverlay } from './overlay.js';
import { renderStoryboardArt } from './storyboard-art.js';

const TITLE_ID = 'steps-drawer-title';
/** The one name of this drawer everywhere: header button, menu, sticky bar and the drawer's title. */
export const STEPS_LABEL = 'Altı adımda';

function buildHeader(onClose) {
  const closeButton = h('button', { type: 'button', class: 'overlay__close', 'aria-label': 'Kapat', onClick: onClose }, '✕');
  const head = h('p', { class: 'steps-drawer__head' }, h('span', null, 'Bir bildirimin yolu'), h('span', null, 'Altı kare'));
  const title = h('h2', { class: 'steps-drawer__title', id: TITLE_ID }, STEPS_LABEL);
  return h('div', { class: 'steps-drawer__header' }, h('div', { class: 'steps-drawer__heading' }, head, title), closeButton);
}

/** One storyboard frame: the inked panel (number in its corner) with the caption under it. */
function buildStep(step) {
  const panel = h(
    'div',
    { class: 'steps-drawer__panel' },
    h('span', { class: 'steps-drawer__step-num', 'aria-hidden': 'true' }, String(Number(step.number))),
    renderStoryboardArt(step.art),
  );
  return h(
    'li',
    { class: 'steps-drawer__step' },
    panel,
    h('div', { class: 'steps-drawer__step-body' }, h('h3', { class: 'steps-drawer__step-title' }, step.title), h('p', { class: 'steps-drawer__step-text' }, step.text)),
  );
}

/**
 * @param {{mount: Element, lockScroll?: Function, unlockScroll?: Function }} options
 */
export function createStepsDrawer({ mount, lockScroll, unlockScroll }) {
  const overlay = createOverlay({ mount, id: 'steps-drawer', label: STEPS_LABEL, labelledBy: TITLE_ID, variant: 'drawer', lockScroll, unlockScroll });

  const lead = h(
    'p',
    { class: 'steps-drawer__lead' },
    'Tek bir bildirim, baştan sona bu altı adımdan geçer. Otomatik işlem yok.',
  );
  const steps = h('ol', { class: 'steps-drawer__steps', role: 'list' }, ...SIX_STEPS.map(buildStep));

  overlay.panel.appendChild(h('div', { class: 'steps-drawer__content' }, buildHeader(() => overlay.close()), lead, steps));
  return overlay;
}
