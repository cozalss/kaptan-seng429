// Okuyucu — the furniture of the diorama, inked each frame from world points laid out once: the
// sloped reading desk of the portrait (a slate board with its grain, a lip at its foot, four legs),
// the board the form is clipped to (on an easel's legs) and the low tray the filled forms are set
// aside on. Flat washes, hand-ruled edges, dry-brush hatching on turned faces; no gradients.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { facesEye, polyPath, stillLine, stillOutline } from '../../../lib/ink3d/paths.js';
import { DESK, DESK_AXES, FORM, FORM_AXES, TRAY, TRAY_AXES, deskPoint, formPoint } from './world.js';

const SHADE = Object.freeze({
  deskTop: '#a3adba', // the portrait's slate table, as a flat wash
  deskEdge: '#5b6b80',
  lip: INK.indigo,
  board: '#a4b0be',
  boardEdge: '#9aa5b3',
  trayTop: '#dde2e8',
  trayFront: '#a4b0be',
  traySide: '#b9c1ca',
  shadow: 'rgba(43, 66, 97, 0.15)',
  sheetEdge: 'rgba(18, 19, 24, 0.55)',
});
const LIGHT = Object.freeze([0.62, -1, -0.42]); // sun from the upper left, behind the viewer
/** Grain strokes on the desk's board: board-space y (page units) and length fraction. */
const GRAIN = Object.freeze([-1.08, 0.5, -1.04, 0.3, 1.06, 0.62, 1.09, 0.4]);

function layout() {
  const points = [];
  const add = (p) => {
    points.push(p[0], p[1], p[2]);
    return points.length / 3 - 1;
  };
  const tmp = [0, 0, 0];
  const bx = DESK.boardHalfW / DESK.pageHalfW;
  const deskAt = (px, py, lift) => add(deskPoint(px, py, lift, tmp));
  // desk board: top face (TL, TR, FR, FL), its underside, the lip along the foot
  const top = [deskAt(-bx, -DESK.boardTop, 0), deskAt(bx, -DESK.boardTop, 0), deskAt(bx, DESK.boardFoot, 0), deskAt(-bx, DESK.boardFoot, 0)];
  const under = [deskAt(-bx, -DESK.boardTop, -DESK.thickness), deskAt(bx, -DESK.boardTop, -DESK.thickness), deskAt(bx, DESK.boardFoot, -DESK.thickness), deskAt(-bx, DESK.boardFoot, -DESK.thickness)];
  const lip = [deskAt(-bx, DESK.boardFoot, 0), deskAt(bx, DESK.boardFoot, 0), deskAt(bx, DESK.boardFoot - 0.04, DESK.lip), deskAt(-bx, DESK.boardFoot - 0.04, DESK.lip)];
  const grain = [];
  for (let g = 0; g < GRAIN.length; g += 2) grain.push(deskAt(-bx + 0.08, GRAIN[g], 0.002), deskAt(-bx + 0.08 + 2 * bx * GRAIN[g + 1], GRAIN[g], 0.002));
  // legs: straight down from the underside's corners (front pair) and splayed back (rear pair)
  const legs = [];
  for (let k = 0; k < 4; k += 1) {
    const c = under[k];
    const x = points[c * 3];
    const z = points[c * 3 + 2];
    const back = k < 2 ? 0.12 : 0;
    legs.push(c, add([x - DESK_AXES.out[0] * back, 0, z - DESK_AXES.out[2] * back]));
  }
  const crossbar = [add(lerpY(points, legs[5], legs[4], 0.3)), add(lerpY(points, legs[7], legs[6], 0.3))];
  const deskShadow = top.map((i) => add(onGround(points, i)));
  // the form's board, a clip at its head, its easel legs
  const fb = FORM.board;
  const ex = 1 + fb / FORM.halfW;
  const ey = 1 + fb / FORM.halfH;
  const formAt = (fx, fy, lift) => add(formPoint(fx, fy, lift, tmp));
  const board = [formAt(-ex, -ey, -0.03), formAt(ex, -ey, -0.03), formAt(ex, ey, -0.03), formAt(-ex, ey, -0.03)];
  const boardBack = [formAt(-ex, -ey, -0.08), formAt(ex, -ey, -0.08), formAt(ex, ey, -0.08), formAt(-ex, ey, -0.08)];
  const clip = [formAt(-0.22, -ey - 0.01, 0.012), formAt(0.22, -ey - 0.01, 0.012), formAt(0.22, -ey + 0.085, 0.012), formAt(-0.22, -ey + 0.085, 0.012)];
  const r = FORM_AXES.right;
  const o = FORM_AXES.out;
  const formLegs = [];
  for (const side of [-1, 1]) {
    const at = formAt(side * 0.62, ey * 0.6, -0.08);
    const x = points[at * 3] + r[0] * side * FORM.legSpread * 0.4;
    const z = points[at * 3 + 2] + r[2] * side * FORM.legSpread * 0.4;
    formLegs.push(at, add([x + o[0] * 0.08, 0, z + o[2] * 0.08]));
  }
  const rear = formAt(0, -0.5, -0.08);
  formLegs.push(rear, add([FORM.center[0] - o[0] * 0.95, 0, FORM.center[2] - o[2] * 0.95]));
  const boardShadow = [board[2], board[3], formLegs[1], formLegs[3]].map((i) => add(onGround(points, i)));
  // the tray: a low box, corners index = side(0 left,1 right) + 2·(0 front, 1 back) + 4·(0 floor, 1 top)
  const tray = [];
  for (let level = 0; level < 2; level += 1) {
    for (let d = 0; d < 2; d += 1) {
      for (let s = 0; s < 2; s += 1) {
        const ux = (s ? 1 : -1) * TRAY.halfW;
        const uz = (d ? -1 : 1) * TRAY.halfD;
        tray.push(add([TRAY.center[0] + TRAY_AXES.right[0] * ux + TRAY_AXES.out[0] * uz, level * TRAY.height, TRAY.center[2] + TRAY_AXES.right[2] * ux + TRAY_AXES.out[2] * uz]));
      }
    }
  }
  const t = (s, d, l) => tray[s + 2 * d + 4 * l];
  const trayFaces = {
    top: [t(0, 0, 1), t(1, 0, 1), t(1, 1, 1), t(0, 1, 1)],
    front: [t(0, 0, 0), t(1, 0, 0), t(1, 0, 1), t(0, 0, 1)],
    left: [t(0, 1, 0), t(0, 0, 0), t(0, 0, 1), t(0, 1, 1)],
    right: [t(1, 0, 0), t(1, 1, 0), t(1, 1, 1), t(1, 0, 1)],
  };
  const trayShadow = [t(0, 0, 1), t(1, 0, 1), t(1, 1, 1), t(0, 1, 1)].map((i) => add(onGround(points, i)));
  return {
    points: new Float64Array(points),
    top,
    under,
    lip,
    grain,
    legs,
    crossbar,
    deskShadow,
    board,
    boardBack,
    clip,
    formLegs,
    boardShadow,
    trayFaces,
    trayShadow,
  };
}

function lerpY(points, a, b, f) {
  return [0, 1, 2].map((k) => points[a * 3 + k] + (points[b * 3 + k] - points[a * 3 + k]) * f);
}

/** A world point cast along the light onto the ground (y = 0). */
function onGround(points, i) {
  const h = points[i * 3 + 1] / -LIGHT[1];
  return [points[i * 3] + LIGHT[0] * h, 0, points[i * 3 + 2] + LIGHT[2] * h];
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createFurniture(ctx) {
  const geo = layout();
  const count = geo.points.length / 3;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const tmp = new Float64Array(4);
  const p = geo.points;
  const up = [0, 1, 0];
  const deskSideL = [-DESK_AXES.across[0], 0, -DESK_AXES.across[2]];
  const deskSideR = DESK_AXES.across;
  const trayNormals = { front: TRAY_AXES.out, left: [-TRAY_AXES.right[0], 0, -TRAY_AXES.right[2]], right: TRAY_AXES.right };
  let scale = 1;

  function projectAll(frame) {
    for (let i = 0; i < count; i += 1) {
      project(frame, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], tmp);
      xs[i] = tmp[0];
      ys[i] = tmp[1];
    }
    project(frame, DESK.center[0], DESK.center[1], DESK.center[2], tmp);
    scale = tmp[3];
  }

  const at = (i, k) => p[i * 3 + k];

  function poly(idx, fill, seed, width, wobble = 0.45) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.fill();
    if (!width) return;
    ctx.beginPath();
    stillOutline(ctx, xs, ys, idx, seed, wobble);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function hatch(idx, seed, alpha) {
    ctx.save();
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.clip();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < idx.length; k += 1) {
      const i = idx[k];
      if (xs[i] < minX) minX = xs[i];
      if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i];
      if (ys[i] > maxY) maxY = ys[i];
    }
    const h = maxY - minY;
    const gap = Math.max(3.2, scale * 0.07);
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    let k = 0;
    for (let x = minX - h; x < maxX; x += gap) {
      const lift = 0.1 + 0.25 * ((k * 0.618) % 1);
      stillLine(ctx, x, maxY - h * lift * 0.2, x + h * 0.55, minY + h * lift, seed + k, 0.4, true);
      k += 1;
    }
    ctx.stroke();
    ctx.restore();
  }

  function shadow(idx, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = SHADE.shadow;
    ctx.beginPath();
    polyPath(ctx, xs, ys, idx);
    ctx.fill();
  }

  function segments(list, seed, wobble) {
    for (let k = 0; k < list.length; k += 2) {
      const a = list[k];
      const b = list[k + 1];
      stillLine(ctx, xs[a], ys[a], xs[b], ys[b], seed + k, wobble, true);
    }
  }

  return {
    geo,
    xs,
    ys,
    get scale() {
      return scale;
    },
    project: projectAll,
    drawShadows(alpha) {
      shadow(geo.deskShadow, alpha);
      shadow(geo.boardShadow, alpha * 0.8);
      shadow(geo.trayShadow, alpha);
    },
    /** The desk's legs and board (under the page); the lip is drawn over the page's foot. */
    drawDesk(frame, alpha) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      segments(geo.legs, 80, 0.5);
      segments(geo.crossbar, 88, 0.4);
      ctx.stroke();
      // the board's edges: the foot (toward the reader) and whichever side turns to the eye
      const [t0, t1, t2, t3] = geo.top;
      const [u0, u1, u2, u3] = geo.under;
      poly([t3, t2, u2, u3], SHADE.deskEdge, 31, 1.3);
      if (facesEye(frame, deskSideL, at(t0, 0), at(t0, 1), at(t0, 2))) poly([t0, t3, u3, u0], SHADE.deskEdge, 33, 1.3);
      if (facesEye(frame, deskSideR, at(t1, 0), at(t1, 1), at(t1, 2))) poly([t1, t2, u2, u1], SHADE.deskEdge, 35, 1.3);
      poly(geo.top, SHADE.deskTop, 37, 1.8, 0.5);
      // grain, as in the portrait's table
      ctx.strokeStyle = INK.indigo;
      ctx.globalAlpha = alpha * 0.45;
      ctx.lineWidth = 1;
      ctx.beginPath();
      segments(geo.grain, 140, 0.6);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    },
    /** The lip at the desk's foot, laid over the page's lower edge. */
    drawLip(alpha) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      poly(geo.lip, SHADE.lip, 51, 1.2);
    },
    /** Desk-board clip (the page is seen only on the board). */
    clipToDesk() {
      ctx.beginPath();
      polyPath(ctx, xs, ys, geo.top);
      ctx.clip();
    },
    /** The form's board on its easel. */
    drawBoard(frame, alpha) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      segments(geo.formLegs, 90, 0.5);
      ctx.stroke();
      const [b0, b1, b2, b3] = geo.board;
      const [k0, k1, k2, k3] = geo.boardBack;
      const side = FORM_AXES.right;
      if (facesEye(frame, side, at(b1, 0), at(b1, 1), at(b1, 2))) poly([b1, k1, k2, b2], SHADE.boardEdge, 61, 1.2);
      else poly([b0, k0, k3, b3], SHADE.boardEdge, 63, 1.2);
      poly([b3, b2, k2, k3], SHADE.boardEdge, 65, 1.2);
      if (facesEye(frame, up, at(b0, 0), at(b0, 1), at(b0, 2))) poly([b0, b1, k1, k0], SHADE.boardEdge, 67, 1.2);
      poly(geo.board, SHADE.board, 69, 1.8, 0.5);
    },
    /** The clip that holds the form at its head (over the form). */
    drawClip(alpha) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      poly(geo.clip, INK.sumi, 71, 1);
    },
    /** The tray with its face and turned side. */
    drawTray(frame, alpha) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      const f = geo.trayFaces;
      for (const name of ['left', 'right']) {
        const n = trayNormals[name];
        const i = f[name][0];
        if (!facesEye(frame, n, at(i, 0), at(i, 1), at(i, 2))) continue;
        poly(f[name], SHADE.traySide, name === 'left' ? 73 : 75, 1.4);
        hatch(f[name], 320, 0.22);
      }
      poly(f.front, SHADE.trayFront, 77, 1.6);
      if (facesEye(frame, up, at(f.top[0], 0), at(f.top[0], 1), at(f.top[0], 2))) poly(f.top, SHADE.trayTop, 79, 1.4);
    },
  };
}
