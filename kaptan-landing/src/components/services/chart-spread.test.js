import { gsap } from 'gsap';
import { describe, expect, test } from 'vitest';
import { inkLayerMarkup } from './chart-course.js';
import { addInk, clearInk, inkParts, markShares } from './chart-spread.js';

function inkSvg() {
  document.body.innerHTML = `<svg data-spread-ink viewBox="0 0 2400 1600">${inkLayerMarkup()}</svg>`;
  return document.querySelector('[data-spread-ink]');
}

/** A straight "path" from (0,0) to (1000,0) that jsdom can measure. */
function straightCourse() {
  return {
    getTotalLength: () => 1000,
    getPointAtLength: (len) => ({ x: len, y: 0 }),
  };
}

function mark(cx, at = 0) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.dataset.at = String(at);
  g.innerHTML = `<circle cx="${cx}" cy="0" r="16"></circle>`;
  return g;
}

describe('inkParts', () => {
  test('finds the course, every mark, the landfall ring and the boat at rest', () => {
    const parts = inkParts(inkSvg());
    expect(parts.course.tagName).toBe('path');
    expect(parts.marks).toHaveLength(6); // departure, four waypoints, landfall
    expect(parts.ring).not.toBeNull();
    expect(parts.boatTransform).toBe('translate(2200 470)');
  });
});

describe('markShares', () => {
  test('measures where the pen passes each mark along the drawn path', () => {
    const shares = markShares(straightCourse(), [mark(250), mark(1000)], 100);
    expect(shares).toEqual([0.25, 1]);
  });

  test('falls back to the straight-leg estimate when the path cannot be measured', () => {
    expect(markShares({ getTotalLength: () => 0 }, [mark(250, 0.3)])).toEqual([0.3]);
    expect(markShares(null, [mark(250, 0.4)])).toEqual([0.4]);
  });
});

describe('addInk / clearInk', () => {
  test('starts un-inked, and clearInk returns the boat to landfall', () => {
    const parts = inkParts(inkSvg());
    const tl = gsap.timeline({ paused: true });
    addInk(tl, parts, { at: 0, duration: 1 });
    expect(tl.duration()).toBeGreaterThanOrEqual(1);
    // the marks and the boat are hidden before the pen reaches them
    expect(parts.marks[1].style.visibility).toBe('hidden');
    expect(parts.boat.style.visibility).toBe('hidden');
    tl.kill();
    clearInk(parts);
    expect(parts.marks[1].style.visibility).toBe('');
    expect(parts.boat.getAttribute('transform')).toBe('translate(2200 470)');
  });
});
