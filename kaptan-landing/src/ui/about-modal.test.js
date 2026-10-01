import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE } from '../config/site.js';

describe('createAboutModal', () => {
  let createAboutModal;
  let courseFacts;
  let mount;
  let scrollTo;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <header class="site-header"></header>
      <main id="main"></main>
      <footer class="site-footer"></footer>
      <div id="overlays"></div>
    `;
    mount = document.getElementById('overlays');
    scrollTo = vi.fn();
    ({ createAboutModal, courseFacts } = await import('./about-modal.js'));
  });

  function mountModal() {
    return createAboutModal({ mount, site: SITE, lockScroll: vi.fn(), unlockScroll: vi.fn(), scrollTo });
  }

  it('renders the title, two paragraphs and the course facts', () => {
    mountModal();
    expect(mount.querySelector('.about-modal__title').textContent).toBe('Proje hakkında');
    expect(mount.querySelectorAll('.about-modal__paragraph')).toHaveLength(2);
    const terms = [...mount.querySelectorAll('.about-modal__facts dt')].map((dt) => dt.textContent);
    expect(terms).toEqual(['Ders', 'Üniversite', 'Öğretim üyesi', 'Dönem']);
    expect(mount.textContent).toContain('SENG 429 · Enterprise Application Development Lab');
    expect(mount.textContent).toContain('Güz 2026 · Pzt 13:20 · MB06');
  });

  it('states the principle and the disclaimer, and makes no performance claims', () => {
    mountModal();
    const text = mount.textContent;
    expect(text).toMatch(/kurallar karar verir, insan onaylar/);
    expect(text).toMatch(/yatırım tavsiyesi değildir/);
    expect(text.toLowerCase()).not.toMatch(/ödül|garanti|en iyi|kazandır/);
  });

  it('courseFacts pairs every label with a value', () => {
    expect(courseFacts(SITE.course).every(([label, value]) => label && value)).toBe(true);
  });

  it('"Ajanları gör" closes the modal then scrolls to #ajanlar', () => {
    const overlay = mountModal();
    overlay.open();
    mount.querySelector('.about-modal__explore').click();
    expect(overlay.isOpen()).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith('#ajanlar');
  });

  it('is named by its visible title and closes from the ✕', () => {
    const overlay = mountModal();
    overlay.open();
    expect(overlay.panel.getAttribute('aria-labelledby')).toBe('about-modal-title');
    mount.querySelector('.overlay__close').click();
    expect(overlay.isOpen()).toBe(false);
  });
});
