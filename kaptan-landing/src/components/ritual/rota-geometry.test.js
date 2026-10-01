import { describe, expect, test } from 'vitest';
import {
  BOAT_SCALE,
  FACING_DEADBAND,
  MAX_TILT,
  SWELL,
  boatBox,
  boatPose,
  boatScale,
  coursePath,
  depthLookup,
  overlaps,
  panelHits,
  reachedIndex,
  swellRide,
  wakeLevel,
} from './rota-geometry.js';

describe('coursePath bows', () => {
  test('per-leg bows pick each side; 0 runs the leg straight', () => {
    const points = [
      { x: 100, y: 0 },
      { x: 80, y: 200 },
      { x: 120, y: 400 },
    ];
    const d = coursePath(points, { sway: 30, bows: [0, 1] });
    expect(d).toContain('C 100 100 80 100 80 200');
    expect(d).toContain('C 110 300 150 300 120 400');
  });
});

describe('boatScale', () => {
  test('grows from far to near and clamps', () => {
    expect(boatScale(0)).toBe(BOAT_SCALE.far);
    expect(boatScale(1)).toBe(BOAT_SCALE.near);
    expect(boatScale(2)).toBe(BOAT_SCALE.near);
    expect(boatScale(Number.NaN)).toBe(BOAT_SCALE.far);
    expect(boatScale(0.5)).toBeGreaterThan(boatScale(0.25));
  });
});

describe('depthLookup', () => {
  const lookup = depthLookup([
    { at: 0, y: -100 },
    { at: 0.5, y: 100 },
    { at: 0.6, y: 90 }, // the course lifts a little: the first arrival at a depth wins
    { at: 1, y: 300 },
  ]);

  test('maps a depth to the share of the course where the boat first reaches it', () => {
    expect(lookup(-100)).toBe(0);
    expect(lookup(0)).toBeCloseTo(0.25, 6);
    expect(lookup(200)).toBeCloseTo(0.75, 6);
    expect(lookup(999)).toBe(1);
    expect(lookup(-999)).toBe(0);
    expect(lookup(Number.NaN)).toBe(0);
  });

  test('an empty or broken sample list gives 0', () => {
    expect(depthLookup([])(50)).toBe(0);
    expect(depthLookup(null)(50)).toBe(0);
    expect(depthLookup([{ at: Number.NaN, y: 1 }])(5)).toBe(0);
  });
});

describe('boatBox, overlaps and panelHits', () => {
  test('the hull sits on the point, the mast above it', () => {
    expect(boatBox({ x: 100, y: 200 }, { width: 100, height: 50 })).toEqual({ left: 50, right: 150, top: 154, bottom: 204 });
  });

  test('an overlap needs more than the slack on both axes', () => {
    const a = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(overlaps(a, { left: 90, top: 90, right: 200, bottom: 200 })).toBe(true);
    expect(overlaps(a, { left: 99, top: 0, right: 200, bottom: 100 }, 2)).toBe(false);
    expect(overlaps(a, { left: 200, top: 0, right: 300, bottom: 100 })).toBe(false);
  });

  test('counts the samples where the boat would sit under a panel', () => {
    const panel = { left: 0, top: 0, right: 100, bottom: 100 };
    const points = [
      { x: 50, y: 50 },
      { x: 400, y: 50 },
      { x: 60, y: 90 },
    ];
    expect(panelHits(points, [panel], () => ({ width: 40, height: 30 }))).toBe(2);
    expect(panelHits(points, [], () => ({ width: 40, height: 30 }))).toBe(0);
  });
});

const WAYPOINTS = [
  { x: 100, y: 0 },
  { x: 80, y: 200 },
  { x: 120, y: 400 },
];

describe('coursePath', () => {
  test('starts at the first point, draws one cubic per leg and ends on the last point', () => {
    const d = coursePath(WAYPOINTS, { sway: 30 });
    expect(d.startsWith('M 100 0 ')).toBe(true);
    expect(d.match(/C /g)).toHaveLength(2);
    expect(d.endsWith(' 120 400')).toBe(true);
    expect(d).not.toMatch(/NaN|undefined/);
  });

  test('keeps vertical tangents at waypoints and bows alternate legs to opposite sides', () => {
    const d = coursePath(WAYPOINTS, { sway: 30, tension: 0.5 });
    // leg 0 bows right (+30), leg 1 bows left (−30); control points sit straight above/below the ends
    expect(d).toContain('C 130 100 110 100 80 200');
    expect(d).toContain('C 50 300 90 300 120 400');
  });

  test('a prefix of the points is a prefix of the same course', () => {
    const full = coursePath(WAYPOINTS, { sway: 12 });
    const firstLeg = coursePath(WAYPOINTS.slice(0, 2), { sway: 12 });
    expect(full.startsWith(firstLeg)).toBe(true);
  });

  test('rejects fewer than two points or invalid coordinates', () => {
    expect(() => coursePath([{ x: 0, y: 0 }])).toThrow(RangeError);
    expect(() => coursePath([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }])).toThrow(RangeError);
    expect(() => coursePath(null)).toThrow(RangeError);
  });
});

describe('boatPose', () => {
  test('faces right and dips its bow when the course runs down and to the right', () => {
    const pose = boatPose(60, -1);
    expect(pose.facing).toBe(1);
    expect(pose.tilt).toBeGreaterThan(0);
    expect(pose.tilt).toBeLessThanOrEqual(MAX_TILT);
  });

  test('turns round (and dips the other way) when the course runs down and to the left', () => {
    const pose = boatPose(125, 1);
    expect(pose.facing).toBe(-1);
    expect(pose.tilt).toBeLessThan(0);
  });

  test('keeps the previous facing while the course runs almost straight down', () => {
    const nearlyDown = 90 - (Math.asin(FACING_DEADBAND / 2) * 180) / Math.PI;
    expect(boatPose(nearlyDown, -1).facing).toBe(-1);
    expect(boatPose(90, 1)).toEqual({ tilt: MAX_TILT, facing: 1 });
  });

  test('sits level on horizontal travel and survives invalid angles', () => {
    expect(boatPose(0).tilt).toBe(0);
    expect(boatPose(Number.NaN, -1)).toEqual({ tilt: 0, facing: -1 });
  });
});

describe('reachedIndex', () => {
  const shares = [0, 0.3, 0.6, 0.9];

  test('counts the waypoints already passed', () => {
    expect(reachedIndex(0, shares)).toBe(0);
    expect(reachedIndex(0.45, shares)).toBe(1);
    expect(reachedIndex(1, shares)).toBe(3);
  });

  test('is -1 before the first waypoint and tolerant of bad input', () => {
    expect(reachedIndex(0.1, [0.2, 0.5])).toBe(-1);
    expect(reachedIndex(Number.NaN, [0.2])).toBe(-1);
  });
});

describe('swellRide', () => {
  test('bobs and rolls once per swell wavelength, scaled by the swell', () => {
    expect(swellRide(0)).toEqual({ bob: 0, roll: -SWELL.roll });
    expect(swellRide(SWELL.wavelength / 4).bob).toBe(-SWELL.bob);
    expect(swellRide(SWELL.wavelength)).toEqual(swellRide(0));
    expect(Math.abs(swellRide(SWELL.wavelength / 4, 0.5).bob)).toBeCloseTo(SWELL.bob / 2, 6);
  });

  test('lies flat in a calm or with bad input', () => {
    expect(swellRide(123, 0)).toEqual({ bob: 0, roll: 0 });
    expect(swellRide(Number.NaN, Number.NaN)).toEqual({ bob: 0, roll: 0 });
  });
});

describe('wakeLevel', () => {
  test('rises with speed, eases toward it and fades to nothing at rest', () => {
    const fast = wakeLevel(0, 40);
    expect(fast).toBeCloseTo(0.3, 6);
    expect(wakeLevel(fast, 40)).toBeGreaterThan(fast);
    let level = 1;
    for (let i = 0; i < 30; i += 1) level = wakeLevel(level, 0);
    expect(level).toBeLessThan(0.01);
    expect(wakeLevel(Number.NaN, Number.NaN)).toBe(0);
  });
});

describe('eye line shared with the Pusula bridge', () => {
  test('inks the compass leg on the same eye line as the course', async () => {
    const { EYE } = await import('./rota-geometry.js');
    const { BRIDGE } = await import('../compass/layout.js');
    expect(BRIDGE.eye * 100).toBeCloseTo(EYE.start);
  });
});
