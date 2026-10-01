import { gsap } from 'gsap';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDetailReveal } from './service-modal-reveal.js';

describe('createDetailReveal', () => {
  let parts;
  let reveal;

  beforeEach(() => {
    document.body.innerHTML = `
      <h2><span id="title">Kanıt</span></h2><p id="label"></p><button id="close"></button>
      <p id="meta"></p><p id="description">Bir satır. İki satır.</p><p id="caption"></p><button id="cta"></button>`;
    const $ = (id) => document.getElementById(id);
    parts = {
      title: $('title'),
      head: [$('label'), $('close')],
      meta: $('meta'),
      description: $('description'),
      caption: $('caption'),
      cta: $('cta'),
    };
    reveal = createDetailReveal(parts);
  });

  it('hides the type; a title that flies in is kept hidden rather than lowered', () => {
    reveal.hide();
    expect(Number(gsap.getProperty(parts.title, 'yPercent'))).toBe(110);
    expect(parts.head[0].style.opacity).toBe('0');
    expect(parts.meta.style.clipPath).toContain('100%');
    expect(parts.caption.style.clipPath).toContain('100%');
    reveal.hide({ titleFlies: true });
    expect(parts.title.style.visibility).toBe('hidden');
    expect(parts.title.style.transform).toBe('');
  });

  it('sets every piece of type in, leaving the description a plain paragraph', () => {
    reveal.hide();
    const tl = gsap.timeline();
    reveal.show(tl, 0.1, { captionAt: 0.2 });
    tl.progress(1);
    gsap.globalTimeline.getChildren(true, true, false).forEach((tween) => tween.progress(1));
    expect(Number(gsap.getProperty(parts.title, 'yPercent'))).toBe(0);
    expect(parts.head[1].style.opacity).toBe('1');
    expect(parts.meta.style.clipPath).toBe('inset(0% 0% 0% 0%)');
    expect(parts.caption.style.clipPath).toContain('-12px');
    expect(parts.description.style.opacity).toBe('1');
    expect(parts.description.textContent).toBe('Bir satır. İki satır.');
    expect(parts.description.querySelector('.service-modal__split-line')).toBeNull();
  });

  it('inks the live plate in after the type and starts it then', () => {
    const scene = document.createElement('div');
    let started = 0;
    const withScene = createDetailReveal({ ...parts, scene, onSceneIn: () => (started += 1) });
    withScene.hide();
    expect(scene.style.clipPath).toContain('100%');
    const tl = gsap.timeline({ paused: true });
    withScene.show(tl, 0.1);
    tl.progress(0.05);
    expect(started).toBe(0);
    tl.progress(1);
    expect(started).toBe(1);
    expect(scene.style.clipPath).toContain('-12px');
    const off = gsap.timeline();
    withScene.takeOff(off, 0);
    off.progress(1);
    expect(scene.style.opacity).toBe('0');
  });

  it('takes the type off for a close, and clears it all', () => {
    const tl = gsap.timeline();
    reveal.takeOff(tl, 0);
    tl.progress(1);
    expect(parts.cta.style.opacity).toBe('0');
    expect(parts.caption.style.opacity).toBe('0');
    reveal.clear();
    expect(parts.cta.getAttribute('style') ?? '').toBe('');
  });
});
