// Okuyucu — where things stand in the diorama (world units, y up, the camera looks down −z). The
// slanted reading desk is in the foreground on the left with the continuous paper on it; the ruled
// form stands on its board to the right; the short stack of filled forms lies on a low tray at the
// board's foot. Pure geometry: the renderer projects it.

import { TAG } from './model.js';
import { FORM_CELL, FORM_SLOTS, PAGE_CELL, TAG_CELL } from './sprites.js';

export const CAMERA = Object.freeze({
  target: Object.freeze([0.6, 1.35, 0.45]),
  yaw: -0.2,
  pitch: 0.1,
  distance: 10,
  spanX: 7.8,
  spanY: 3.55,
  centerX: 0.5,
  centerY: 0.47,
});

/** The reading desk: a board sloped toward the reader, the page lying on it, a lip at its foot. */
export const DESK = (() => {
  const pageHalfW = 0.7;
  return Object.freeze({
    center: Object.freeze([-1.75, 1.22, 1.05]), // the page's centre
    yaw: -0.22,
    slope: 0.84, // radians from the horizontal
    pageHalfW,
    pageHalfH: (pageHalfW * PAGE_CELL.height) / PAGE_CELL.width,
    boardHalfW: pageHalfW + 0.12,
    boardTop: 1.16, // page-space y of the board's top and foot edges (the page is −1 … 1)
    boardFoot: 1.12,
    thickness: 0.07,
    lip: 0.07,
  });
})();

const yawAxes = (yaw) => ({
  right: Object.freeze([Math.cos(yaw), 0, -Math.sin(yaw)]),
  out: Object.freeze([Math.sin(yaw), 0, Math.cos(yaw)]),
});

/** The desk's axes: across the page, down its slope (toward the reader), and its face normal. */
export const DESK_AXES = (() => {
  const { right, out } = yawAxes(DESK.yaw);
  const c = Math.cos(DESK.slope);
  const s = Math.sin(DESK.slope);
  return Object.freeze({
    across: right,
    down: Object.freeze([out[0] * c, -s, out[2] * c]),
    normal: Object.freeze([out[0] * s, c, out[2] * s]),
    out,
  });
})();

/** A point on the desk given in page space (px across, py down the page, −1 … 1) and lifted off it. */
export function deskPoint(px, py, lift, out = [0, 0, 0]) {
  const { across: a, down: d, normal: n } = DESK_AXES;
  const x = px * DESK.pageHalfW;
  const y = py * DESK.pageHalfH;
  for (let i = 0; i < 3; i += 1) out[i] = DESK.center[i] + a[i] * x + d[i] * y + n[i] * lift;
  return out;
}

/** The form on its board: upright, leaning back a touch, turned toward the desk. */
export const FORM = (() => {
  const halfW = 0.76;
  return Object.freeze({
    center: Object.freeze([1.3, 1.64, 0.05]),
    yaw: -0.36,
    lean: 0.06,
    halfW,
    halfH: (halfW * FORM_CELL.height) / FORM_CELL.width,
    board: 0.09, // the board's border round the form
    legSpread: 0.5,
  });
})();

export const FORM_AXES = (() => {
  const { right, out } = yawAxes(FORM.yaw);
  const c = Math.cos(FORM.lean);
  const s = Math.sin(FORM.lean);
  return Object.freeze({
    right,
    up: Object.freeze([-out[0] * s, c, -out[2] * s]),
    normal: Object.freeze([out[0] * c, s, out[2] * c]),
    out,
  });
})();

/** A point on the form in its [-1, 1] space (y down), lifted off it along its normal. */
export function formPoint(fx, fy, lift, out = [0, 0, 0]) {
  const { right: r, up: u, normal: n } = FORM_AXES;
  const x = fx * FORM.halfW;
  const y = -fy * FORM.halfH;
  for (let i = 0; i < 3; i += 1) out[i] = FORM.center[i] + r[i] * x + u[i] * y + n[i] * lift;
  return out;
}

/** The low tray at the board's foot where filled forms are set aside, face up. */
export const TRAY = Object.freeze({
  center: Object.freeze([2.7, 0, 1.3]),
  yaw: FORM.yaw,
  halfW: FORM.halfW + 0.1,
  halfD: FORM.halfH + 0.1,
  height: 0.2,
  sheets: 3, // the short stack under the newest form
  sheet: 0.028, // one sheet's thickness, drawn a little proud
});
export const TRAY_AXES = yawAxes(TRAY.yaw);

/** World centre of sheet k of the stack (0 = bottom); the newest form lies at k = TRAY.sheets. */
export function stackPoint(k, out = [0, 0, 0]) {
  const jog = [0.03, -0.025, 0.018, 0][k % 4];
  out[0] = TRAY.center[0] + TRAY_AXES.right[0] * jog;
  out[1] = TRAY.height + (k + 1) * TRAY.sheet;
  out[2] = TRAY.center[2] + TRAY_AXES.right[2] * jog;
  return out;
}

/** A tag pinned in its field is this big (world half-sizes), a touch narrower than the slot. */
export const TAG_SIZE = (() => {
  const halfW = FORM_SLOTS[0].halfW * FORM.halfW * 0.9;
  return Object.freeze({ halfW, halfH: (halfW * TAG_CELL.height) / TAG_CELL.width });
})();

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const smooth = (t) => t * t * (3 - 2 * t);

function normalizeInto(axes, o, len) {
  const l = Math.hypot(axes[o], axes[o + 1], axes[o + 2]) || 1;
  axes[o] *= len / l;
  axes[o + 1] *= len / l;
  axes[o + 2] *= len / l;
}

const scratch = { a: [0, 0, 0], b: [0, 0, 0] };

/**
 * Writes a value tag's world centre into `pos` and its two half-axes (right, up) into `axes`.
 * On the page it is the size of its phrase (x0…x1 page space on its row); it lifts, grows to its
 * pinned size on the way, turns from the desk's slope to the form's face and is pinned in its slot.
 */
export function tagPlacement(tag, field, x0, x1, row, pos, axes) {
  const start = deskPoint((x0 + x1) / 2, row, 0.004, scratch.a);
  const startHalfW = ((x1 - x0) / 2) * DESK.pageHalfW * 1.22;
  const slot = FORM_SLOTS[field];
  const end = formPoint(slot.x, slot.y, 0.02, scratch.b);
  const { across, down } = DESK_AXES;
  const { right, up } = FORM_AXES;
  const lift = tag.stage === TAG.hidden ? 0 : tag.lift;
  const fly = tag.stage === TAG.pinned ? 1 : tag.fly;
  // rises off the page, then flies an arc over to the form
  const rise = 0.16 * lift;
  const n = DESK_AXES.normal;
  const sx = start[0] + n[0] * rise;
  const sy = start[1] + n[1] * rise;
  const sz = start[2] + n[2] * rise;
  const cx = (sx + end[0]) / 2;
  const cy = Math.max(sy, end[1]) + 1.05;
  const cz = (sz + end[2]) / 2 + 0.55;
  const s = 1 - fly;
  pos[0] = s * s * sx + 2 * s * fly * cx + fly * fly * end[0];
  pos[1] = s * s * sy + 2 * s * fly * cy + fly * fly * end[1];
  pos[2] = s * s * sz + 2 * s * fly * cz + fly * fly * end[2];
  // the press of the pin pushes it flat into the slot
  if (tag.stage === TAG.pinned && tag.pin < 1) {
    const press = Math.sin(Math.PI * tag.pin) * 0.03;
    const nf = FORM_AXES.normal;
    pos[0] -= nf[0] * press;
    pos[1] -= nf[1] * press;
    pos[2] -= nf[2] * press;
  }
  const turn = smooth(clamp01(fly * 1.15));
  const grow = smooth(clamp01(lift * 0.4 + fly * 0.9));
  const halfW = startHalfW + (TAG_SIZE.halfW - startHalfW) * grow;
  const halfH = (halfW * TAG_CELL.height) / TAG_CELL.width;
  for (let i = 0; i < 3; i += 1) {
    axes[i] = across[i] + (right[i] - across[i]) * turn;
    axes[3 + i] = -down[i] + (up[i] + down[i]) * turn;
  }
  // a flutter in flight: it banks along its course
  const roll = 0.38 * Math.sin(Math.PI * fly) * (tag.stage === TAG.flight ? 1 : 0);
  if (roll !== 0) {
    const c = Math.cos(roll);
    const r = Math.sin(roll);
    for (let i = 0; i < 3; i += 1) {
      const a = axes[i];
      const b = axes[3 + i];
      axes[i] = c * a + r * b;
      axes[3 + i] = -r * a + c * b;
    }
  }
  normalizeInto(axes, 0, halfW);
  normalizeInto(axes, 3, halfH);
  return pos;
}

/**
 * The filled form being set aside: from its board to the top of the stack (aside 0 → 1), lying
 * down face up as it goes. Writes centre and half-axes (right, up) like tagPlacement.
 */
export function asidePlacement(aside, pos, axes) {
  const from = FORM.center;
  const to = stackPoint(TRAY.sheets, scratch.a);
  const cx = (from[0] + to[0]) / 2 + 0.35;
  const cy = Math.max(from[1], to[1]) + 0.55;
  const cz = (from[2] + to[2]) / 2 + 0.25;
  const s = 1 - aside;
  pos[0] = s * s * from[0] + 2 * s * aside * cx + aside * aside * to[0];
  pos[1] = s * s * from[1] + 2 * s * aside * cy + aside * aside * to[1];
  pos[2] = s * s * from[2] + 2 * s * aside * cz + aside * aside * to[2];
  const lie = smooth(clamp01(aside * 1.1));
  const { right, up } = FORM_AXES;
  const back = TRAY_AXES.out;
  for (let i = 0; i < 3; i += 1) {
    axes[i] = right[i] + (TRAY_AXES.right[i] - right[i]) * lie;
    axes[3 + i] = up[i] + (-back[i] - up[i]) * lie;
  }
  normalizeInto(axes, 0, FORM.halfW);
  normalizeInto(axes, 3, FORM.halfH);
  return pos;
}

/** Half-axes of a form lying face up on the tray. */
export function flatAxes(axes) {
  const back = TRAY_AXES.out;
  for (let i = 0; i < 3; i += 1) {
    axes[i] = TRAY_AXES.right[i] * FORM.halfW;
    axes[3 + i] = -back[i] * FORM.halfH;
  }
  return axes;
}
