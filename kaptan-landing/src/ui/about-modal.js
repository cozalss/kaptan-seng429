// The "Proje hakkında" modal: what KAPtan is in two short paragraphs, the course facts, and a pill
// on to the agents.

import { h } from './dom.js';
import { createOverlay } from './overlay.js';

const TITLE_ID = 'about-modal-title';

const PARAGRAPHS = [
  'KAPtan, Borsa İstanbul şirketlerinin Kamuyu Aydınlatma Platformu’nda (KAP) yayımladığı bildirimleri — günde yaklaşık 350 — izleyen çok ajanlı bir yapay zekâ projesidir. Yapay zekâ okur ve kanıt toplar, deterministik kurallar karar verir, insan onaylar. Otomatik emir yoktur.',
  'Dört kişilik bir ekibin ders projesidir. Site ve proje yatırım tavsiyesi değildir.',
];

/** Course facts as `dl` rows: [label, value]. */
export function courseFacts(course) {
  return [
    ['Ders', `${course.code} · ${course.title}`],
    ['Üniversite', course.university],
    ['Öğretim üyesi', course.instructor],
    ['Dönem', `${course.term} · ${course.schedule} · ${course.room}`],
  ];
}

/**
 * @param {{mount: Element, site: object, lockScroll?: Function, unlockScroll?: Function, scrollTo: Function}} options
 */
export function createAboutModal({ mount, site, lockScroll, unlockScroll, scrollTo }) {
  const overlay = createOverlay({ mount, id: 'about-modal', label: 'Proje hakkında', labelledBy: TITLE_ID, variant: 'modal', lockScroll, unlockScroll });

  const closeButton = h(
    'button',
    { type: 'button', class: 'overlay__close', 'aria-label': 'Proje hakkında panelini kapat', onClick: () => overlay.close() },
    '✕'
  );
  const logo = h('svg', { class: 'about-modal__logo', 'aria-hidden': 'true' }, h('use', { href: '#kaptan-logo' }));
  const header = h('div', { class: 'about-modal__header' }, logo, closeButton);

  const title = h('h2', { class: 'about-modal__title', id: TITLE_ID }, 'Proje hakkında');
  const paragraphs = PARAGRAPHS.map((text) => h('p', { class: 'about-modal__paragraph' }, text));
  const facts = h(
    'dl',
    { class: 'about-modal__facts' },
    ...courseFacts(site.course).flatMap(([label, value]) => [h('dt', null, label), h('dd', null, value)]),
  );

  const exploreButton = h(
    'button',
    { type: 'button', class: 'pill about-modal__explore' },
    h('span', { class: 'pill__label' }, 'Ajanları gör'),
    h('span', { class: 'pill__chip', 'aria-hidden': 'true' })
  );
  exploreButton.addEventListener('click', () => {
    overlay.close();
    scrollTo('#ajanlar');
  });

  overlay.panel.appendChild(
    h('div', { class: 'about-modal__content' }, header, title, ...paragraphs, facts, exploreButton)
  );

  return overlay;
}
