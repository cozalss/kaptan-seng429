import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SIX_STEPS } from '../data/six-steps.js';

describe('createStepsDrawer', () => {
  let createStepsDrawer;
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
    ({ createStepsDrawer } = await import('./steps-drawer.js'));
  });

  const mountDrawer = () => createStepsDrawer({ mount, lockScroll: vi.fn(), unlockScroll: vi.fn() });

  it('is a drawer named by its title', () => {
    const overlay = mountDrawer();
    expect(document.getElementById('steps-drawer').classList.contains('overlay--drawer')).toBe(true);
    expect(overlay.panel.getAttribute('aria-labelledby')).toBe('steps-drawer-title');
    expect(mount.querySelector('.steps-drawer__title').textContent).toBe('Altı adımda');
    expect(mount.querySelector('.steps-drawer__head').textContent).toContain('Bir bildirimin yolu');
    expect(mount.textContent).not.toMatch(/canlı/i);
  });

  it('draws the six static steps as numbered storyboard panels, captions below', () => {
    mountDrawer();
    const steps = [...mount.querySelectorAll('.steps-drawer__step')];
    expect(steps).toHaveLength(6);
    expect(steps.map((step) => step.querySelector('.steps-drawer__step-title').textContent)).toEqual(SIX_STEPS.map((s) => s.title));
    expect(steps[5].querySelector('.steps-drawer__step-num').textContent).toBe('6');
    steps.forEach((step) => {
      const art = step.querySelector('.steps-drawer__panel svg.storyboard__art');
      expect(art.getAttribute('aria-hidden')).toBe('true');
      expect(art.childElementCount).toBeGreaterThan(2);
      // the caption follows its panel
      expect(step.firstElementChild.classList.contains('steps-drawer__panel')).toBe(true);
    });
  });

  it('has no course date and no form fields', () => {
    mountDrawer();
    expect(mount.textContent).not.toMatch(/final|ocak 2027/i);
    expect(mount.querySelector('input, textarea, select, form')).toBeNull();
  });

  it('ends on the last step, with no button to a page section', () => {
    mountDrawer();
    expect(mount.querySelector('.steps-drawer__go')).toBeNull();
    expect(mount.querySelector('.steps-drawer__steps button')).toBeNull();
  });

  it('closes from the ✕ button', () => {
    const overlay = mountDrawer();
    overlay.open();
    mount.querySelector('.overlay__close').click();
    expect(overlay.isOpen()).toBe(false);
  });
});
