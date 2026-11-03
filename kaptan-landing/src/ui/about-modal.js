// The "KAPtan nedir?" modal: what KAPtan is in a short paragraph and a pill
// on to the agents.

import { h } from './dom.js';
import { createOverlay } from './overlay.js';

const TITLE_ID = 'about-modal-title';

const PARAGRAPHS = [
  'Borsa İstanbul şirketleri haberlerini Kamuyu Aydınlatma Platformu’nda (KAP) duyurur; günde yaklaşık 350 bildirim. KAPtan bunları senin için izler. Yapay zekâ okur ve kanıt toplar, yazılı kurallar karar verir, sen onaylarsın. Otomatik işlem yoktur: onayladığın öneriyi kendi bankandan ya da aracı kurumundan girersin.',
];

/**
 * @param {{mount: Element, site: object, lockScroll?: Function, unlockScroll?: Function, scrollTo: Function}} options
 */
export function createAboutModal({ mount, site, lockScroll, unlockScroll, scrollTo }) {
  const overlay = createOverlay({ mount, id: 'about-modal', label: 'KAPtan nedir?', labelledBy: TITLE_ID, variant: 'modal', lockScroll, unlockScroll });

  const closeButton = h(
    'button',
    { type: 'button', class: 'overlay__close', 'aria-label': 'KAPtan nedir penceresini kapat', onClick: () => overlay.close() },
    '✕'
  );
  const logo = h('svg', { class: 'about-modal__logo', 'aria-hidden': 'true' }, h('use', { href: '#kaptan-logo' }));
  const header = h('div', { class: 'about-modal__header' }, logo, closeButton);

  const title = h('h2', { class: 'about-modal__title', id: TITLE_ID }, 'KAPtan nedir?');
  const paragraphs = PARAGRAPHS.map((text) => h('p', { class: 'about-modal__paragraph' }, text));

  const exploreButton = h(
    'button',
    { type: 'button', class: 'pill about-modal__explore' },
    h('span', { class: 'pill__label' }, 'Tayfayı gör'),
    h('span', { class: 'pill__chip', 'aria-hidden': 'true' })
  );
  exploreButton.addEventListener('click', () => {
    overlay.close();
    scrollTo('#ajanlar');
  });

  overlay.panel.appendChild(
    h('div', { class: 'about-modal__content' }, header, title, ...paragraphs, exploreButton)
  );

  return overlay;
}
