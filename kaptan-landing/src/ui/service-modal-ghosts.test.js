import { gsap } from 'gsap';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createNameGhost,
  createPlateGhost,
  firstPx,
  flipVars,
  homeVars,
  inkOf,
  layoutBox,
  paintInk,
  removeGhost,
  rotationOf,
} from './service-modal-ghosts.js';

const win = { innerWidth: 1440, innerHeight: 900, getComputedStyle: (el) => window.getComputedStyle(el) };

function placed(left, top, width, height, style = '') {
  const el = document.createElement('div');
  el.setAttribute('style', style);
  document.body.append(el);
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('layoutBox', () => {
  it('returns the centre, size and rotation of an element on screen', () => {
    const el = placed(100, 50, 200, 300);
    expect(layoutBox(el, win)).toEqual({ cx: 200, cy: 200, width: 200, height: 300, rotation: 0 });
  });

  it('is null for empty, detached or off-screen elements', () => {
    expect(layoutBox(placed(10, 10, 0, 10), win)).toBeNull();
    expect(layoutBox(placed(10, 950, 10, 10), win)).toBeNull();
    expect(layoutBox(placed(-50, 10, 40, 10), win)).toBeNull();
    expect(layoutBox(document.createElement('div'), win)).toBeNull();
    expect(layoutBox(null, win)).toBeNull();
  });
});

describe('rotationOf', () => {
  it('reads the rotation of a matrix, 0 for none', () => {
    const fake = (transform) => ({ getComputedStyle: () => ({ transform }) });
    expect(rotationOf({}, fake('none'))).toBe(0);
    const rad = (5 * Math.PI) / 180;
    expect(rotationOf({}, fake(`matrix(${Math.cos(rad)}, ${Math.sin(rad)}, 0, 1, 0, 0)`))).toBeCloseTo(5);
  });
});

describe('flipVars / homeVars', () => {
  const home = { cx: 300, cy: 400, width: 600, height: 800, rotation: -1 };
  const target = { cx: 100, cy: 100, width: 150, height: 210, rotation: 0.8 };

  it('maps a home box onto a target by centre, with a free or uniform scale', () => {
    expect(flipVars(home, target)).toEqual({ x: -200, y: -300, scaleX: 0.25, scaleY: 210 / 800, rotation: 0.8 });
    expect(flipVars(home, target, { uniform: 'width' })).toMatchObject({ scaleX: 0.25, scaleY: 0.25 });
    expect(flipVars(home, target, { uniform: 'height' })).toMatchObject({ scaleX: 210 / 800, scaleY: 210 / 800 });
  });

  it('rests a ghost on its home', () => {
    expect(homeVars(home)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: -1 });
    expect(homeVars({})).toMatchObject({ rotation: 0 });
  });
});

describe('firstPx / inkOf', () => {
  it('reads the first px length of a value', () => {
    expect(firstPx('6px 6px 0px')).toBe(6);
    expect(firstPx('1.5px')).toBe(1.5);
    expect(firstPx('none')).toBe(0);
    expect(firstPx(undefined)).toBe(0);
  });

  it("reads an element's border and hard-shadow offset, ignoring the colour", () => {
    const fake = (style) => ({ getComputedStyle: () => style });
    expect(inkOf({}, fake({ borderTopWidth: '1.5px', boxShadow: 'rgb(18, 19, 24) 6px 6px 0px 0px' }))).toEqual({ border: 1.5, shadow: 6 });
    expect(inkOf({}, fake({ borderTopWidth: '0px', boxShadow: 'none' }))).toEqual({ border: 0, shadow: 0 });
  });
});

describe('ghosts', () => {
  const home = { cx: 340, cy: 460, width: 600, height: 800, rotation: 0 };

  it('lays a plate ghost out at its home, hidden from assistive tech', () => {
    const ghost = createPlateGhost({ src: '/a.jpg', objectPosition: '50% 30%', home, ink: { border: 1.5, shadow: 6 } });
    expect(ghost.el.isConnected).toBe(true);
    expect(ghost.el.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.el.style.left).toBe('40px');
    expect(ghost.el.style.top).toBe('60px');
    expect(ghost.img.src).toContain('/a.jpg');
    expect(ghost.img.style.objectPosition).toBe('50% 30%');
    removeGhost(ghost);
    expect(ghost.el.isConnected).toBe(false);
    removeGhost(null);
  });

  it('paints the ink frame at the same screen weight whatever the scale', () => {
    const ghost = createPlateGhost({ src: '/a.jpg', home, ink: { border: 1.5, shadow: 6 } });
    gsap.set(ghost.el, { scaleX: 0.5, scaleY: 0.5 });
    paintInk(ghost);
    expect(ghost.el.querySelector('.service-modal-ghost__ink').style.borderWidth).toMatch(/^3px/);
    gsap.set(ghost.el, { scaleX: 0.5, scaleY: 0.25 });
    paintInk(ghost);
    expect(ghost.el.querySelector('.service-modal-ghost__ink').style.borderWidth).toBe('6px 3px');
    gsap.set(ghost.el, { scaleX: 0.5, scaleY: 0.5 });
    paintInk(ghost);
    expect(ghost.el.style.boxShadow).toContain('12px 12px 0');
    ghost.ink.shadow = 0;
    paintInk(ghost);
    expect(ghost.el.style.boxShadow).toBe('none');
    paintInk(null);
  });

  it('sets a name ghost in the given type, without an ink frame', () => {
    const ghost = createNameGhost({ text: 'Kanıt', home, style: { fontSize: '80px' } });
    expect(ghost.el.textContent).toBe('Kanıt');
    expect(ghost.el.style.fontSize).toBe('80px');
    expect(ghost.ink).toBeNull();
  });
});
