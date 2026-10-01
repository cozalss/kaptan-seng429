import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_STEPS } from '../data/demo-flow.js';

describe('createDemoDrawer', () => {
  let createDemoDrawer;
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
    ({ createDemoDrawer } = await import('./demo-drawer.js'));
  });

  const mountDrawer = () => createDemoDrawer({ mount, lockScroll: vi.fn(), unlockScroll: vi.fn() });

  it('is a drawer named by its title', () => {
    const overlay = mountDrawer();
    expect(document.getElementById('demo-drawer').classList.contains('overlay--drawer')).toBe(true);
    expect(overlay.panel.getAttribute('aria-labelledby')).toBe('demo-drawer-title');
    expect(mount.querySelector('.demo-drawer__title').textContent).toBe('Demo akışı');
    expect(mount.querySelector('.demo-drawer__head').textContent).toContain('Final sunumunda gösterilecek');
    expect(mount.textContent).not.toMatch(/canlı/i);
  });

  it('draws the six static steps as numbered storyboard panels, captions below', () => {
    mountDrawer();
    const steps = [...mount.querySelectorAll('.demo-drawer__step')];
    expect(steps).toHaveLength(6);
    expect(steps.map((step) => step.querySelector('.demo-drawer__step-title').textContent)).toEqual(DEMO_STEPS.map((s) => s.title));
    expect(steps[5].querySelector('.demo-drawer__step-num').textContent).toBe('6');
    steps.forEach((step) => {
      const art = step.querySelector('.demo-drawer__panel svg.storyboard__art');
      expect(art.getAttribute('aria-hidden')).toBe('true');
      expect(art.childElementCount).toBeGreaterThan(2);
      // the caption follows its panel
      expect(step.firstElementChild.classList.contains('demo-drawer__panel')).toBe(true);
    });
  });

  it('shows the final date and has no form fields', () => {
    mountDrawer();
    expect(mount.querySelector('.demo-drawer__final-date').textContent).toBe('Ocak 2027');
    expect(mount.querySelector('input, textarea, select, form')).toBeNull();
  });

  it('ends on the final date, with no button to a page section', () => {
    mountDrawer();
    expect(mount.querySelector('.demo-drawer__go')).toBeNull();
    expect(mount.querySelector('.demo-drawer__footer button')).toBeNull();
  });

  it('closes from the ✕ button', () => {
    const overlay = mountDrawer();
    overlay.open();
    mount.querySelector('.overlay__close').click();
    expect(overlay.isOpen()).toBe(false);
  });
});
