import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { CHART_BOX, COURSE, LEGEND, heading, inkLayerMarkup, smoothPath, waypoints } from './chart-course.js';

describe('heading', () => {
  test('is a compass bearing, clockwise from north with y pointing down', () => {
    expect(heading([0, 0], [0, -10])).toBe(0);
    expect(heading([0, 0], [10, 0])).toBe(90);
    expect(heading([0, 0], [0, 10])).toBe(180);
    expect(heading([0, 0], [-10, 0])).toBe(270);
    expect(heading([0, 0], [10, -10])).toBe(45);
  });
});

describe('smoothPath', () => {
  test('starts at the first point and ends on the last', () => {
    const d = smoothPath(COURSE);
    expect(d.startsWith(`M${COURSE[0][0]} ${COURSE[0][1]}`)).toBe(true);
    const last = COURSE[COURSE.length - 1];
    expect(d.endsWith(`${last[0]} ${last[1]}`)).toBe(true);
    expect(d.match(/C/g)).toHaveLength(COURSE.length - 1);
  });

  test('falls back to straight lines for fewer than three points', () => {
    expect(smoothPath([[0, 0], [10, 5]])).toBe('M0 0 L10 5');
  });
});

describe('waypoints', () => {
  test('lists the inner points in order, each with the heading of the leg that leaves it', () => {
    const marks = waypoints();
    expect(marks).toHaveLength(COURSE.length - 2);
    marks.forEach((mark, i) => {
      expect(mark.label).toMatch(/^\d{3}°$/);
      if (i) expect(mark.at).toBeGreaterThan(marks[i - 1].at);
    });
    expect(marks[0].at).toBeGreaterThan(0);
    expect(marks[marks.length - 1].at).toBeLessThan(1);
  });
});

describe('chart geometry', () => {
  test('keeps the course and the legend inside the chart, clear of each other', () => {
    COURSE.forEach(([x, y]) => {
      expect(x).toBeGreaterThan(70);
      expect(x).toBeLessThan(CHART_BOX[0] - 70);
      expect(y).toBeGreaterThan(70);
      expect(y).toBeLessThan(CHART_BOX[1] - 70);
    });
    const inLegend = ([x, y]) => x > LEGEND.x && x < LEGEND.x + LEGEND.w && y > LEGEND.y && y < LEGEND.y + LEGEND.h;
    expect(COURSE.some(inLegend)).toBe(false);
    // the printed legend stays on the left-hand page (it turns with the leaf)
    expect(LEGEND.x + LEGEND.w).toBeLessThan(CHART_BOX[0] / 2);
  });
});

describe('index.html ink layer', () => {
  test('is the markup chart-course.js writes (the course cannot drift from the raster chart)', () => {
    const html = readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const open = html.indexOf('<svg class="spread__ink"');
    expect(open).toBeGreaterThan(-1);
    const body = html.slice(html.indexOf('>', open) + 1, html.indexOf('</svg>', open));
    const squash = (s) => s.replace(/\s+/g, ' ').trim();
    expect(squash(body)).toBe(squash(inkLayerMarkup()));
  });
});
