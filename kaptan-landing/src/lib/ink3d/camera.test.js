import { describe, expect, it } from 'vitest';
import { aimFrame, createFrame, project } from './camera.js';

const aim = (overrides = {}) =>
  aimFrame(createFrame(), { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10, focal: 500, cx: 400, cy: 300, ...overrides });

describe('camera', () => {
  it('projects the target to the image centre at the eye distance', () => {
    const out = project(aim(), 0, 0, 0, [0, 0, 0, 0]);
    expect(out[0]).toBeCloseTo(400);
    expect(out[1]).toBeCloseTo(300);
    expect(out[2]).toBeCloseTo(10);
    expect(out[3]).toBeCloseTo(50);
  });

  it('keeps y up and x right on screen, with perspective', () => {
    const frame = aim();
    const up = project(frame, 0, 1, 0, [0, 0, 0, 0]);
    const right = project(frame, 1, 0, 0, [0, 0, 0, 0]);
    const near = project(frame, 1, 0, 5, [0, 0, 0, 0]);
    expect(up[1]).toBeLessThan(300);
    expect(right[0]).toBeGreaterThan(400);
    expect(near[0] - 400).toBeGreaterThan(right[0] - 400);
  });

  it('builds an orthonormal basis for any yaw and pitch', () => {
    const { right, up, forward } = aim({ yaw: 0.7, pitch: 0.3 });
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    [right, up, forward].forEach((v) => expect(Math.hypot(...v)).toBeCloseTo(1));
    expect(dot(right, up)).toBeCloseTo(0);
    expect(dot(right, forward)).toBeCloseTo(0);
    expect(dot(up, forward)).toBeCloseTo(0);
    expect(up[1]).toBeGreaterThan(0);
  });

  it('marks points behind the eye with depth ≤ 0', () => {
    expect(project(aim(), 0, 0, 20, [0, 0, 0, 0])[2]).toBeLessThanOrEqual(0);
  });
});
