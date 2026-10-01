import { describe, expect, it } from 'vitest';
import { DEMO_STEPS } from '../data/demo-flow.js';
import { ART_VIEWBOX, STORYBOARD_ART, brush, renderStoryboardArt } from './storyboard-art.js';

describe('storyboard art', () => {
  it('has a drawing for every demo step', () => {
    DEMO_STEPS.forEach((step) => expect(STORYBOARD_ART[step.art], step.art).toBeTruthy());
  });

  it('renders real SVG elements in the shared view box, decorative only', () => {
    const svg = renderStoryboardArt('rules');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe(ART_VIEWBOX);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path').namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['R01', 'R02', 'R03', 'R04']);
  });

  it('keeps to ink: no colour is written into any drawing', () => {
    const colours = Object.keys(STORYBOARD_ART).flatMap((name) =>
      [...renderStoryboardArt(name).querySelectorAll('*')].flatMap((el) => [el.getAttribute('fill'), el.getAttribute('stroke')]),
    );
    colours.filter(Boolean).forEach((value) => expect(['currentColor', 'none']).toContain(value));
  });

  it('draws an empty frame for an unknown name', () => {
    expect(renderStoryboardArt('nope').childElementCount).toBe(0);
  });

  it('draws contours as filled brush shapes that swell, taper and repeat exactly', () => {
    const [tag, attrs] = brush([[0, 0], [40, 10], [80, 0]], { w: 4, seed: 3 });
    expect(tag).toBe('path');
    expect(attrs.fill).toBe('currentColor');
    expect(attrs.d.startsWith('M')).toBe(true);
    expect(attrs.d.endsWith('Z')).toBe(true);
    expect(brush([[0, 0], [40, 10], [80, 0]], { w: 4, seed: 3 })[1].d).toBe(attrs.d);
    expect(brush([[0, 0], [40, 10], [80, 0]], { w: 4, seed: 4 })[1].d).not.toBe(attrs.d);
  });

  it('keeps ruled edges straight and paints washes only through the stylesheet class', () => {
    const [, ruled] = brush([[0, 0], [10, 0], [10, 10]], { w: 2, straight: true, taper: [0, 0] });
    // every vertex of a ruled L stays within the stroke's half width of the two segments
    const pts = ruled.d.slice(1, -1).split('L').map((pair) => pair.split(' ').map(Number));
    pts.forEach(([x, y]) => expect(Math.min(Math.abs(y), Math.abs(x - 10))).toBeLessThanOrEqual(1.01));
    Object.keys(STORYBOARD_ART).forEach((name) => {
      const washes = renderStoryboardArt(name).querySelectorAll('.storyboard__wash');
      expect(washes.length, name).toBeGreaterThan(0);
      washes.forEach((el) => expect(el.getAttribute('fill')).toBeNull());
    });
  });
});
