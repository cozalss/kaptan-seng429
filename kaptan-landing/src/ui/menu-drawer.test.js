import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE } from '../config/site.js';

describe('createMenuDrawer', () => {
  let createMenuDrawer;
  let SECTION_LINKS;
  let mount;
  let scrollTo;
  let openDemo;

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
    openDemo = vi.fn();
    ({ createMenuDrawer, SECTION_LINKS } = await import('./menu-drawer.js'));
  });

  function mountDrawer() {
    return createMenuDrawer({ mount, site: SITE, lockScroll: vi.fn(), unlockScroll: vi.fn(), scrollTo, openDemo });
  }

  it('renders the wordmark, the contents in chapter order and the course meta', () => {
    const overlay = mountDrawer();
    expect(mount.querySelector('.menu-drawer__logo use').getAttribute('href')).toBe('#kaptan-logo');
    expect(overlay.panel.getAttribute('aria-labelledby')).toBe('menu-drawer-title');
    expect(mount.querySelector('.menu-drawer__title').textContent).toBe('İçindekiler');
    const names = Array.from(mount.querySelectorAll('.menu-drawer__link')).map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual([
      'Bölüm 1 · Fırtına',
      'Bölüm 2 · Tayfa',
      'Bölüm 3 · Seyir Kuralları',
      'Ara · 350’den 1’e',
      'Bölüm 4 · Rota',
      'Kolofon',
    ]);
    const first = mount.querySelector('.menu-drawer__link');
    expect(first.querySelector('.menu-drawer__entry-title').textContent).toBe('Fırtına');
    expect(first.querySelector('.menu-drawer__leader').getAttribute('aria-hidden')).toBe('true');
    expect(first.querySelector('.menu-drawer__entry-label').textContent).toBe('Bölüm 1');
    const meta = [...mount.querySelectorAll('.menu-drawer__meta')].map((p) => p.textContent);
    expect(meta).toEqual(['KAPtan · SENG 429 · Çankaya Üniversitesi · © 2026']);
  });

  it('renders a "Altı adımda" pill that closes the menu and opens the demo drawer', () => {
    const overlay = mountDrawer();
    overlay.open();
    const cta = mount.querySelector('.menu-drawer__cta');
    expect(cta.textContent).toBe('Altı adımda');
    cta.click();
    expect(overlay.isOpen()).toBe(false);
    expect(openDemo).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0, '#hero'],
    [1, '#ajanlar'],
    [2, '#olaylar'],
    [3, '#pusula'],
    [4, '#yolculuk'],
    [5, '#kolofon'],
  ])('link %i closes the drawer then scrolls to %s', (index, target) => {
    const overlay = mountDrawer();
    overlay.open();
    mount.querySelectorAll('.menu-drawer__link')[index].click();
    expect(overlay.isOpen()).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith(target);
    expect(SECTION_LINKS[index].target).toBe(target);
  });

  it('marks only the "Ara" interlude as set in (data-kind), never a chapter by position', () => {
    mountDrawer();
    const kinds = Array.from(mount.querySelectorAll('.menu-drawer__links li')).map((li) => li.dataset.kind);
    expect(kinds).toEqual(['chapter', 'chapter', 'chapter', 'interlude', 'chapter', 'chapter']);
    const interlude = mount.querySelector('.menu-drawer__links li[data-kind="interlude"] .menu-drawer__link');
    expect(interlude.getAttribute('aria-label')).toBe('Ara · 350’den 1’e');
  });

  it('closes from the ✕ button', () => {
    const overlay = mountDrawer();
    overlay.open();
    mount.querySelector('.overlay__close').click();
    expect(overlay.isOpen()).toBe(false);
  });
});
