// "İçindekiler": the header's table of contents, set as the contents page of the book — each
// chapter's title in Bodoni, a dotted leader, its chapter label on the right — then an ink button
// on to the demo flow and the meta line.

import { h } from './dom.js';
import { createOverlay } from './overlay.js';
import { DEMO_LABEL } from './demo-drawer.js';

const TITLE_ID = 'menu-drawer-title';

/** The book's chapters in reading order (labels match the running heads). */
export const SECTION_LINKS = Object.freeze(
  [
    { label: 'Bölüm 1', title: 'Fırtına', target: '#hero' },
    { label: 'Bölüm 2', title: 'Tayfa', target: '#ajanlar' },
    { label: 'Bölüm 3', title: 'Seyir Kuralları', target: '#olaylar' },
    { label: 'Ara', title: '350’den 1’e', target: '#pusula', kind: 'interlude' },
    { label: 'Bölüm 4', title: 'Rota', target: '#yolculuk' },
    { label: 'Son', title: 'Kolofon', target: '#kolofon' },
  ].map((entry) => Object.freeze(entry)),
);

/** What a contents line announces: "Bölüm 2 · Tayfa" (the colophon is just "Kolofon"). */
export function entryName({ label, title }) {
  return label === 'Son' ? title : `${label} · ${title}`;
}

function createEntry(entry, onActivate) {
  const link = h(
    'button',
    { type: 'button', class: 'menu-drawer__link', 'aria-label': entryName(entry) },
    h('span', { class: 'menu-drawer__entry-title' }, entry.title),
    h('span', { class: 'menu-drawer__leader', 'aria-hidden': 'true' }),
    h('span', { class: 'menu-drawer__entry-label' }, entry.label),
  );
  link.addEventListener('click', onActivate);
  return h('li', { 'data-kind': entry.kind ?? 'chapter' }, link);
}

/**
 * @param {{mount: Element, site: object, lockScroll?: Function, unlockScroll?: Function, scrollTo: Function, openDemo: Function}} options
 */
export function createMenuDrawer({ mount, site, lockScroll, unlockScroll, scrollTo, openDemo }) {
  const overlay = createOverlay({ mount, id: 'menu-drawer', label: 'İçindekiler', labelledBy: TITLE_ID, variant: 'drawer', lockScroll, unlockScroll });

  const closeButton = h(
    'button',
    { type: 'button', class: 'overlay__close', 'aria-label': 'İçindekileri kapat', onClick: () => overlay.close() },
    '✕'
  );
  const logo = h('svg', { class: 'menu-drawer__logo', 'aria-hidden': 'true' }, h('use', { href: '#kaptan-logo' }));
  const header = h('div', { class: 'menu-drawer__header' }, logo, closeButton);
  const title = h('h2', { class: 'menu-drawer__title', id: TITLE_ID }, 'İçindekiler');

  const entries = SECTION_LINKS.map((entry) =>
    createEntry(entry, () => {
      overlay.close();
      scrollTo(entry.target);
    })
  );
  const nav = h('ol', { class: 'menu-drawer__links', role: 'list' }, ...entries);

  const ctaButton = h(
    'button',
    { type: 'button', class: 'pill menu-drawer__cta' },
    h('span', { class: 'pill__label' }, DEMO_LABEL),
    h('span', { class: 'pill__chip', 'aria-hidden': 'true' }),
  );
  ctaButton.addEventListener('click', () => {
    overlay.close();
    openDemo();
  });

  const footer = h(
    'div',
    { class: 'menu-drawer__footer' },
    ctaButton,
    h('p', { class: 'menu-drawer__meta' }, `${site.name} · © 2026`),
  );

  overlay.panel.appendChild(h('div', { class: 'menu-drawer__content' }, header, title, nav, footer));

  return overlay;
}
