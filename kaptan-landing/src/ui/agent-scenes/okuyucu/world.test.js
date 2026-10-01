import { describe, expect, it } from 'vitest';
import { TAG, VALUE_ROWS } from './model.js';
import { FORM_SLOTS } from './sprites.js';
import { DESK, DESK_AXES, FORM, FORM_AXES, TAG_SIZE, TRAY, asidePlacement, deskPoint, flatAxes, formPoint, stackPoint, tagPlacement } from './world.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tag = (over) => ({ stage: TAG.hidden, lift: 0, fly: 0, pin: 0, u: 0, ...over });
const place = (t, field = 0) => {
  const pos = [0, 0, 0];
  const axes = new Float64Array(6);
  tagPlacement(t, field, -0.2, 0.2, VALUE_ROWS[field], pos, axes);
  return { pos, axes: Array.from(axes) };
};

describe('Okuyucu world', () => {
  it('slopes the desk toward the reader with orthonormal axes', () => {
    const { across, down, normal } = DESK_AXES;
    [across, down, normal].forEach((v) => expect(Math.hypot(...v)).toBeCloseTo(1));
    expect(dot(across, down)).toBeCloseTo(0);
    expect(dot(down, normal)).toBeCloseTo(0);
    expect(down[1]).toBeLessThan(0); // down the page is down in the world
    expect(normal[1]).toBeGreaterThan(0); // the page faces up
    const foot = deskPoint(0, 1, 0);
    const head = deskPoint(0, -1, 0);
    expect(head[1]).toBeGreaterThan(foot[1]);
    expect(foot[1]).toBeGreaterThan(0.5); // a desk, not the floor
  });

  it('stands the form upright and fits a tag inside each slot', () => {
    expect(FORM_AXES.up[1]).toBeGreaterThan(0.99);
    expect(formPoint(0, -1, 0)[1]).toBeGreaterThan(formPoint(0, 1, 0)[1]);
    expect(formPoint(0, 1, 0)[1]).toBeGreaterThan(0.3); // its foot clears the floor
    for (const slot of FORM_SLOTS) {
      expect(TAG_SIZE.halfW).toBeLessThan(slot.halfW * FORM.halfW);
      expect(Math.abs(slot.y) + slot.halfH).toBeLessThan(1);
    }
  });

  it('lifts a tag from its phrase on the page and pins it in its slot', () => {
    const start = place(tag({ stage: TAG.lift, lift: 0 })).pos;
    const onPage = deskPoint(0, VALUE_ROWS[0], 0.004);
    start.forEach((v, i) => expect(v).toBeCloseTo(onPage[i]));
    const risen = place(tag({ stage: TAG.lift, lift: 1 })).pos;
    expect(risen[1]).toBeGreaterThan(start[1]);
    const mid = place(tag({ stage: TAG.flight, lift: 1, fly: 0.5 })).pos;
    expect(mid[1]).toBeGreaterThan(Math.max(risen[1], formPoint(FORM_SLOTS[0].x, FORM_SLOTS[0].y, 0)[1]));
    const pinned = place(tag({ stage: TAG.pinned, lift: 1, fly: 1, pin: 1 }));
    const slot = formPoint(FORM_SLOTS[0].x, FORM_SLOTS[0].y, 0.02);
    pinned.pos.forEach((v, i) => expect(v).toBeCloseTo(slot[i]));
    expect(Math.hypot(...pinned.axes.slice(0, 3))).toBeCloseTo(TAG_SIZE.halfW);
    expect(Math.hypot(...pinned.axes.slice(3))).toBeCloseTo(TAG_SIZE.halfH);
    // it ends square in the form's plane
    expect(dot(pinned.axes.slice(0, 3), FORM_AXES.normal)).toBeCloseTo(0);
    expect(dot(pinned.axes.slice(3), FORM_AXES.normal)).toBeCloseTo(0);
  });

  it('starts a tag the size of its phrase, lying on the page', () => {
    const { axes } = place(tag({ stage: TAG.lift, lift: 0 }));
    expect(Math.hypot(...axes.slice(0, 3))).toBeCloseTo(0.2 * DESK.pageHalfW * 1.22);
    expect(dot(axes.slice(0, 3), DESK_AXES.normal)).toBeCloseTo(0);
  });

  it('sets the form aside from its board onto the top of the stack, face up', () => {
    const pos = [0, 0, 0];
    const axes = new Float64Array(6);
    asidePlacement(0, pos, axes);
    FORM.center.forEach((v, i) => expect(pos[i]).toBeCloseTo(v));
    asidePlacement(1, pos, axes);
    stackPoint(TRAY.sheets).forEach((v, i) => expect(pos[i]).toBeCloseTo(v));
    expect(Math.abs(axes[4])).toBeLessThan(1e-9); // lying flat
    const flat = flatAxes(new Float64Array(6));
    Array.from(flat).forEach((v, i) => expect(axes[i]).toBeCloseTo(v));
    expect(stackPoint(1)[1]).toBeGreaterThan(stackPoint(0)[1]);
    expect(stackPoint(0)[1]).toBeGreaterThan(TRAY.height);
  });
});
