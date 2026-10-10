// The "Yasal uyarı" modal (footer): what this page is and is not — a course project, not investment
// advice, not affiliated with KAP / Borsa İstanbul / SPK, no signals shared, no personal data.

import { h } from './dom.js';
import { createOverlay } from './overlay.js';

const TITLE_ID = 'legal-modal-title';

export const LEGAL_SECTIONS = Object.freeze([
  {
    heading: 'Ders projesi',
    body: 'KAPtan, Çankaya Üniversitesi SENG 429 dersi kapsamında geliştirilen bir öğrenci projesidir. Ticari bir ürün ya da hizmet değildir.',
  },
  {
    heading: 'Yatırım tavsiyesi değildir',
    body: 'Bu sitedeki hiçbir içerik yatırım tavsiyesi, alım-satım önerisi ya da getiri vaadi değildir. Otomatik emir yoktur; beklenti sıfır da olabilir.',
  },
  {
    heading: 'Bağlantı yok',
    body: 'Proje; Kamuyu Aydınlatma Platformu (KAP), Borsa İstanbul ve Sermaye Piyasası Kurulu (SPK) ile bağlantılı değildir, onlar tarafından onaylanmamıştır.',
  },
  {
    heading: 'Sinyal paylaşılmaz',
    body: 'Sistemin ürettiği öneriler, sinyaller ya da pozisyonlar bu sitede veya başka bir kanalda paylaşılmaz.',
  },
  {
    heading: 'Kişisel veri',
    body: 'Bu site form, bülten ya da izleme aracı içermez ve kişisel veri toplamaz.',
  },
].map((section) => Object.freeze(section)));

/**
 * @param {{mount: Element, lockScroll?: Function, unlockScroll?: Function}} options
 */
export function createLegalModal({ mount, lockScroll, unlockScroll }) {
  const overlay = createOverlay({ mount, id: 'legal-modal', label: 'Yasal uyarı', labelledBy: TITLE_ID, variant: 'modal', lockScroll, unlockScroll });

  const closeButton = h(
    'button',
    { type: 'button', class: 'overlay__close', 'aria-label': 'Yasal uyarıyı kapat', onClick: () => overlay.close() },
    '✕'
  );
  const title = h('h2', { class: 'legal-modal__title', id: TITLE_ID }, 'Yasal uyarı');
  const header = h('div', { class: 'legal-modal__header' }, title, closeButton);

  const sections = LEGAL_SECTIONS.map(({ heading, body }) =>
    h('section', { class: 'legal-modal__section' }, h('h3', { class: 'legal-modal__heading' }, heading), h('p', null, body))
  );

  overlay.panel.appendChild(h('div', { class: 'legal-modal__content' }, header, ...sections));

  return overlay;
}
