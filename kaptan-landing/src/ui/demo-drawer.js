// The header's "Demo akışı" drawer: the six steps one disclosure will go through in the final's demo, drawn as
// a 2 × 3 comic storyboard — ink panels with gutters, each caption set below its panel — then the
// final's date. Static copy only: there is nothing to
// fill in, select or send.

import { DEMO_FINAL, DEMO_STEPS } from '../data/demo-flow.js';
import { formatMilestoneDate } from '../data/milestones.js';
import { h } from './dom.js';
import { createOverlay } from './overlay.js';
import { renderStoryboardArt } from './storyboard-art.js';

const TITLE_ID = 'demo-drawer-title';
/** The one name of this drawer everywhere: header button, menu, sticky bar and the drawer's title. */
export const DEMO_LABEL = 'Demo akışı';

function buildHeader(onClose) {
  const closeButton = h('button', { type: 'button', class: 'overlay__close', 'aria-label': 'Demo akışını kapat', onClick: onClose }, '✕');
  const head = h('p', { class: 'demo-drawer__head' }, h('span', null, 'Final sunumunda gösterilecek'), h('span', null, 'Altı kare'));
  const title = h('h2', { class: 'demo-drawer__title', id: TITLE_ID }, DEMO_LABEL);
  return h('div', { class: 'demo-drawer__header' }, h('div', { class: 'demo-drawer__heading' }, head, title), closeButton);
}

/** One storyboard frame: the inked panel (number in its corner) with the caption under it. */
function buildStep(step) {
  const panel = h(
    'div',
    { class: 'demo-drawer__panel' },
    h('span', { class: 'demo-drawer__step-num', 'aria-hidden': 'true' }, String(Number(step.number))),
    renderStoryboardArt(step.art),
  );
  return h(
    'li',
    { class: 'demo-drawer__step' },
    panel,
    h('div', { class: 'demo-drawer__step-body' }, h('h3', { class: 'demo-drawer__step-title' }, step.title), h('p', { class: 'demo-drawer__step-text' }, step.text)),
  );
}

function buildFooter() {
  return h(
    'div',
    { class: 'demo-drawer__footer' },
    h(
      'p',
      { class: 'demo-drawer__final' },
      h('span', { class: 'demo-drawer__final-label' }, DEMO_FINAL.label),
      h('time', { class: 'demo-drawer__final-date', datetime: DEMO_FINAL.date }, formatMilestoneDate(DEMO_FINAL.date)),
    ),
  );
}

/**
 * @param {{mount: Element, lockScroll?: Function, unlockScroll?: Function }} options
 */
export function createDemoDrawer({ mount, lockScroll, unlockScroll }) {
  const overlay = createOverlay({ mount, id: 'demo-drawer', label: DEMO_LABEL, labelledBy: TITLE_ID, variant: 'drawer', lockScroll, unlockScroll });

  const lead = h(
    'p',
    { class: 'demo-drawer__lead' },
    'Final sunumunda tek bir bildirim, sahnede uçtan uca bu altı adımdan geçer. Sanal para; gerçek emir yok.',
  );
  const steps = h('ol', { class: 'demo-drawer__steps', role: 'list' }, ...DEMO_STEPS.map(buildStep));
  const footer = buildFooter();

  overlay.panel.appendChild(h('div', { class: 'demo-drawer__content' }, buildHeader(() => overlay.close()), lead, steps, footer));
  return overlay;
}
