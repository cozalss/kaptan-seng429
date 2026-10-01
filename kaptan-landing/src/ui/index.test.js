import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE } from '../config/site.js';

function renderPage() {
  document.body.innerHTML = `
    <header class="site-header">
      <button type="button" data-action="open-about">Proje</button>
      <button type="button" data-action="open-menu" aria-label="Menüyü aç">Menü</button>
      <button type="button" data-action="open-demo">[ DEMO ]</button>
    </header>
    <main id="main">
      <section id="ajanlar"></section>
      <button type="button" data-action="book-now">Eski tetik</button>
      <button type="button" data-action="unknown">Bilinmeyen</button>
    </main>
    <footer class="site-footer">
      <button type="button" data-action="open-legal">Yasal uyarı</button>
    </footer>
    <div id="overlays"></div>
  `;
}

const state = (id) => document.getElementById(id).dataset.state;

describe('initKaptanUI', () => {
  let initKaptanUI;
  let scrollTo;

  beforeEach(async () => {
    vi.resetModules();
    window.history.replaceState(null, '', '/');
    renderPage();
    scrollTo = vi.fn();
    ({ initKaptanUI } = await import('./index.js'));
  });

  const boot = () => initKaptanUI({ site: SITE, lockScroll: vi.fn(), unlockScroll: vi.fn(), scrollTo });

  it('creates every overlay, closed', () => {
    boot();
    ['menu-drawer', 'demo-drawer', 'about-modal', 'legal-modal', 'service-modal'].forEach((id) => expect(state(id)).toBe('closed'));
  });

  it.each([
    ['open-menu', 'menu-drawer'],
    ['open-demo', 'demo-drawer'],
    ['open-about', 'about-modal'],
    ['open-legal', 'legal-modal'],
  ])('[data-action="%s"] opens #%s', (action, id) => {
    boot();
    document.querySelector(`[data-action="${action}"]`).click();
    expect(state(id)).toBe('open');
  });

  it('routes the salon-era booking actions to the demo drawer', () => {
    boot();
    document.querySelector('[data-action="book-now"]').click();
    expect(state('demo-drawer')).toBe('open');
  });

  it('ignores unknown actions', () => {
    boot();
    document.querySelector('[data-action="unknown"]').click();
    expect(document.querySelectorAll('#overlays [data-state="open"]')).toHaveLength(0);
  });

  it('opening the demo drawer closes an already-open menu drawer', () => {
    boot();
    document.querySelector('[data-action="open-menu"]').click();
    document.querySelector('[data-action="open-demo"]').click();
    expect(state('menu-drawer')).toBe('closed');
    expect(state('demo-drawer')).toBe('open');
  });

  it('the menu drawer\'s "Demo akışı" pill hands over to the demo drawer', () => {
    boot();
    document.querySelector('[data-action="open-menu"]').click();
    document.querySelector('.menu-drawer__cta').click();
    expect(state('demo-drawer')).toBe('open');
  });

  it('opens the agent modal for cards added to the DOM after init', () => {
    boot();
    const card = document.createElement('button');
    card.dataset.serviceId = 'uyum';
    const inner = document.createElement('span');
    card.appendChild(inner);
    document.getElementById('ajanlar').appendChild(card);

    inner.click();

    expect(state('service-modal')).toBe('open');
    expect(document.querySelector('.service-modal__name').textContent).toBe('Uyum');
  });

  it('an action inside an open overlay stacks instead of closing its parent', () => {
    boot();
    document.querySelector('[data-action="open-demo"]').click();
    const nested = document.createElement('button');
    nested.dataset.action = 'open-legal';
    document.querySelector('#demo-drawer .overlay__panel').append(nested);
    nested.click();
    expect(state('legal-modal')).toBe('open');
    expect(state('demo-drawer')).toBe('open');
  });

  it('destroy() stops delegating clicks', () => {
    const { destroy } = boot();
    destroy();
    document.querySelector('[data-action="open-demo"]').click();
    expect(state('demo-drawer')).toBe('closed');
  });
});

describe('overlayForAction', () => {
  it('returns null for unknown actions', async () => {
    const { overlayForAction } = await import('./index.js');
    expect(overlayForAction('open-kvkk', {})).toBeNull();
  });
});
