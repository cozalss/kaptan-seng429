import { describe, expect, it } from 'vitest';
import { BRIDGE, DOCK_GAP, LABEL_FIT, TAG_STRING, bridgePath, bridgeTip, dockBox, labelPull, ringPoint, tagBox, tagHook } from './layout.js';

const anchors = {
  foot: { x: 700, y: 640 },
  rings: [
    { x: 500, y: 300 },
    { x: 540, y: 450 },
    { x: 580, y: 600 },
  ],
  plate: { x: 800, y: 420, w: 360, h: 500 },
  compass: { x: 1100, y: 400, r: 200 },
};
const safe = { left: 48, top: 300, right: 1392, bottom: 820 };
const box = { width: 1440, height: 900 };
const panel = { width: 300, height: 90 };

describe('ringPoint', () => {
  it('interpolates between the ring anchors and clamps to the ends', () => {
    expect(ringPoint(anchors.rings, 0)).toEqual({ x: 500, y: 300 });
    expect(ringPoint(anchors.rings, 0.5)).toEqual({ x: 520, y: 375 });
    expect(ringPoint(anchors.rings, 2)).toEqual({ x: 580, y: 600 });
    expect(ringPoint(anchors.rings, 9)).toEqual({ x: 580, y: 600 });
    expect(ringPoint(anchors.rings, -1)).toEqual({ x: 500, y: 300 });
    expect(ringPoint([], 1)).toEqual({ x: 0, y: 0 });
    expect(ringPoint([{ x: 3, y: 4 }], 0.5)).toEqual({ x: 3, y: 4 });
  });
});

describe('tagHook', () => {
  it('hangs from the plumb line, then the lifted slip, then under the compass', () => {
    expect(tagHook(anchors, { plate: 0, compass: 0 })).toEqual(anchors.foot);
    const onSlip = tagHook(anchors, { plate: 1, compass: 0 });
    expect(onSlip.y).toBe(anchors.plate.y + anchors.plate.h / 2);
    expect(onSlip.x).toBeGreaterThan(anchors.plate.x);
    expect(onSlip.x).toBeLessThan(anchors.plate.x + anchors.plate.w / 2);
    const underCompass = tagHook(anchors, { plate: 1, compass: 1 });
    expect(underCompass.x).toBe(anchors.compass.x);
    expect(underCompass.y).toBeGreaterThan(anchors.compass.y + anchors.compass.r);
  });
});

describe('tagBox', () => {
  it('centres the tag under its hook, one string length down', () => {
    expect(tagBox({ x: 700, y: 500 }, { width: 200, height: 100 }, safe)).toEqual({ x: 600, y: 500 + TAG_STRING });
  });

  it('keeps the tag on the free paper', () => {
    const low = tagBox({ x: 1400, y: 800 }, { width: 200, height: 100 }, safe);
    expect(low).toEqual({ x: safe.right - 200, y: safe.bottom - 100 });
    expect(tagBox({ x: 0, y: 0 }, { width: 200, height: 100 }, safe)).toEqual({ x: safe.left, y: safe.top });
  });
});

describe('dockBox', () => {
  it('docks act I at the left of the storm', () => {
    const at = dockBox(anchors, { focus: 0, sieve: 0, plate: 0 }, panel, safe, box);
    expect(at.x).toBe(safe.left);
    expect(at.y + panel.height / 2).toBeCloseTo(box.height * 0.62);
  });

  it('docks act II beside the ring the column is passing, left of it', () => {
    const at = dockBox(anchors, { focus: 1, sieve: 1, plate: 0 }, panel, safe, box);
    expect(at.x + panel.width + DOCK_GAP).toBe(anchors.rings[1].x);
    expect(at.y + panel.height / 2).toBe(anchors.rings[1].y);
    const lower = dockBox(anchors, { focus: 2, sieve: 1, plate: 0 }, panel, safe, box);
    expect(lower.y).toBeGreaterThan(at.y);
  });

  it('docks acts III–IV beside the slip', () => {
    const at = dockBox(anchors, { focus: 2, sieve: 1, plate: 1 }, panel, safe, box);
    expect(at.x + panel.width + DOCK_GAP).toBe(anchors.plate.x - anchors.plate.w / 2);
  });

  it('never leaves the free paper (under the title, above the rail, inside the gutters)', () => {
    const tight = { ...anchors, rings: anchors.rings.map(() => ({ x: 60, y: 40 })) };
    const at = dockBox(tight, { focus: 0, sieve: 1, plate: 0 }, panel, safe, box);
    expect(at).toEqual({ x: safe.left, y: safe.top });
    const crowded = dockBox(anchors, { focus: 0, sieve: 0, plate: 0 }, panel, { ...safe, bottom: safe.top + 10 }, box);
    expect(crowded.y).toBe(safe.top);
  });
});

describe('bridge (compass → Rota course)', () => {
  const base = { rimY: 620, height: 900 };

  it('stays on the rim until the needle has locked, then glides to the eye line by the end of the pin', () => {
    expect(bridgeTip({ ...base, progress: 0.5, exit: 0 })).toBe(620);
    expect(bridgeTip({ ...base, progress: BRIDGE.from, exit: 0 })).toBe(620);
    const mid = bridgeTip({ ...base, progress: (BRIDGE.from + 1) / 2, exit: 0 });
    expect(mid).toBeGreaterThan(620);
    expect(mid).toBeLessThan(BRIDGE.eye * 900);
    expect(bridgeTip({ ...base, progress: 1, exit: 0 })).toBeCloseTo(BRIDGE.eye * 900);
  });

  it('keeps the pen on the eye line while the stage leaves, and stops at the foot', () => {
    expect(bridgeTip({ ...base, progress: 1, exit: 0.1 })).toBeCloseTo(BRIDGE.eye * 900 + 90);
    // the foot is reached when the foot itself is on the eye line (Rota's course takes over there)
    expect(bridgeTip({ ...base, progress: 1, exit: 1 - BRIDGE.eye })).toBeCloseTo(900);
    expect(bridgeTip({ ...base, progress: 1, exit: 0.9 })).toBe(900);
  });

  it('never starts above the rim when the compass sits low', () => {
    expect(bridgeTip({ rimY: 800, height: 900, progress: 1, exit: 0 })).toBe(800);
  });

  it('cuts the straight leg at the pen and draws nothing before it leaves the rim', () => {
    const start = { x: 1043, y: 620 };
    const end = { x: 1043, y: 900 };
    expect(bridgePath(start, end, 620)).toBe('');
    expect(bridgePath(start, end, 760)).toBe('M1043 620 L1043 760');
    expect(bridgePath(start, end, 2000)).toBe('M1043 620 L1043 900');
    expect(bridgePath(start, { x: 1143, y: 900 }, 760)).toBe('M1043 620 L1093 760');
    expect(bridgePath(start, { x: 1043, y: 600 }, 760)).toBe('');
  });
});

describe('bridge past the hanging tag', () => {
  it('inks on past a floor during the pin, then waits for the eye line on the exit (no jump)', () => {
    const base = { rimY: 560, height: 900, floor: 820 };
    expect(bridgeTip({ ...base, progress: 1, exit: 0 })).toBe(820);
    // continuous at the release, and the pen waits until the eye line passes it
    expect(bridgeTip({ ...base, progress: 1, exit: 0.001 })).toBe(820);
    expect(bridgeTip({ ...base, progress: 1, exit: 0.05 })).toBe(820);
    expect(bridgeTip({ ...base, progress: 1, exit: 0.2 })).toBeCloseTo(BRIDGE.eye * 900 + 180);
    expect(bridgeTip({ ...base, progress: 1, exit: 0.5 })).toBe(900);
    expect(bridgeTip({ ...base, floor: 2000, progress: 1, exit: 0 })).toBe(900);
  });
});

describe('labelPull', () => {
  it('leaves a label alone while it fits inside the stage', () => {
    expect(labelPull(279, 110, 430)).toBe(0);
  });

  it('pulls a label that would run off the right edge back onto the page', () => {
    // 360px phone: "Sınıflandır" from x 257, 110 wide → right edge 367
    expect(labelPull(257, 110, 360)).toBe(257 + 110 - (360 - LABEL_FIT.edge));
  });

  it('never shortens the leader by more than its limit', () => {
    expect(labelPull(300, 110, 360)).toBe(LABEL_FIT.maxPull);
  });

  it('is zero when nothing is measured yet', () => {
    expect(labelPull(257, 0, 360)).toBe(0);
    expect(labelPull(NaN, 110, 360)).toBe(0);
    expect(labelPull(257, 110, 0)).toBe(0);
  });
});
