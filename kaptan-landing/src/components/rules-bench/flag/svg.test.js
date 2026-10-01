import { describe, expect, it } from 'vitest';
import { pennantSvg } from './svg.js';

describe('pennantSvg', () => {
  it.each(['E1', 'E2', 'E3', 'E4'])('prints %s as a decorative, id-free, hatched SVG', (id) => {
    const svg = pennantSvg(id);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).not.toMatch(/\sid=/);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(svg).not.toMatch(/#b3261e/i); // no north red: colour lives in the hatching
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path').length).toBe(5);
  });

  it('hatches vertically for red and horizontally for blue', () => {
    const hatch = (id) => new DOMParser().parseFromString(pennantSvg(id), 'image/svg+xml').querySelectorAll('path')[1].getAttribute('d');
    expect(hatch('E1')).not.toContain('H'); // red disc: vertical strokes only
    expect(hatch('E2')).toContain('H'); // blue field: level strokes
    expect(hatch('E2')).not.toMatch(/L/);
  });

  it('is stable and cached', () => {
    expect(pennantSvg('E4')).toBe(pennantSvg('E4'));
    expect(pennantSvg('E1')).not.toBe(pennantSvg('E2'));
  });

  it('rejects unknown ids', () => {
    expect(() => pennantSvg('E9')).toThrow(TypeError);
  });
});
