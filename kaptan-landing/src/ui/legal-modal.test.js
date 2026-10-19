import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('createLegalModal', () => {
  let createLegalModal;
  let LEGAL_SECTIONS;
  let mount;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <header class="site-header"></header>
      <main id="main"></main>
      <footer class="site-footer"></footer>
      <div id="overlays"></div>
    `;
    mount = document.getElementById('overlays');
    ({ createLegalModal, LEGAL_SECTIONS } = await import('./legal-modal.js'));
  });

  it('renders the title and one section per legal point', () => {
    const overlay = createLegalModal({ mount });
    expect(mount.querySelector('.legal-modal__title').textContent).toBe('Yasal uyarı');
    expect(overlay.panel.getAttribute('aria-labelledby')).toBe('legal-modal-title');
    const headings = [...mount.querySelectorAll('.legal-modal__heading')].map((el) => el.textContent);
    expect(headings).toEqual(LEGAL_SECTIONS.map((section) => section.heading));
  });

  it('covers no affiliation, no signals and no personal data, with no course text or disclaimer', () => {
    createLegalModal({ mount });
    const text = mount.textContent;
    expect(text).not.toMatch(/ders projes|öğrenci projes|SENG 429|Enterprise Application|Çankaya|Avenoğlu|Güz 2026|Pzt 13:20|MB06|yatırım tavsiyesi/i);
    expect(text).toMatch(/KAP.*Borsa İstanbul.*SPK/s);
    expect(text).toMatch(/paylaşılmaz/);
    expect(text).toMatch(/kişisel veri toplamaz/);
  });

  it('opens and closes', () => {
    const overlay = createLegalModal({ mount });
    overlay.open();
    expect(overlay.isOpen()).toBe(true);
    mount.querySelector('.overlay__close').click();
    expect(overlay.isOpen()).toBe(false);
  });
});
