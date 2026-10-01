// Okuyucu — the renderer (Canvas 2D). Per frame: aim the pinhole camera, project the furniture,
// then draw back to front: the sea's horizon and swell, cast shadows, the form's board with the
// form clipped to it (its pinned tags and their pins), the reading desk with the continuous paper
// feeding over it (clipped to the board; ghost boxes where values lifted off, the found phrase's
// underline, the reading rule), the desk's lip, the tray with its short stack, the filled form on
// its way to the stack, and the tags in flight on their dashed courses. The plate's letters
// (a · b · c) sit on top, the paper's grain over all. Every buffer is allocated once.

import { placeKey } from '../keys.js';
import { aimFrame, createFrame, project } from '../../../lib/ink3d/camera.js';
import { drawPaperGrain } from '../../../lib/ink3d/grain.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { writeQuadAffine } from '../../../lib/ink3d/quad.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { DISPLAY } from '../fonts.js';
import { createFurniture } from './furniture.js';
import { CAST, FIELDS, TAG, VALUE_ROWS } from './model.js';
import { FORM_CELL, FORM_SLOTS, PAGE_CELL, TAG_CELL, drawFormSheet, drawPageSheet, drawTagSheet, pageCellY, tagCell } from './sprites.js';
import { CAMERA, DESK, DESK_AXES, FORM, FORM_AXES, TAG_SIZE, TRAY, asidePlacement, deskPoint, flatAxes, stackPoint, tagPlacement } from './world.js';

const TRAIL_STEPS = 16;
const TRAIL_DASH = Object.freeze([5, 4]);
const NO_DASH = Object.freeze([]);
const TAG_W = TAG_SIZE.halfW / FORM.halfW; // a pinned tag's half-size in form space
const TAG_H = TAG_SIZE.halfH / FORM.halfH;
const PIN_R = 0.03; // world units
/** Swell strokes under the horizon: x (plate fraction), length (fraction), depth 0 far → 1 near. */
const SWELL = Object.freeze([
  0.04, 0.07, 0.08, 0.2, 0.05, 0.05, 0.31, 0.09, 0.14, 0.52, 0.06, 0.04, 0.63, 0.1, 0.1, 0.83, 0.05, 0.06,
  0.11, 0.08, 0.3, 0.42, 0.07, 0.26, 0.72, 0.09, 0.34, 0.02, 0.12, 0.55, 0.3, 0.08, 0.62, 0.9, 0.06, 0.45,
]);

/**
 * @param {{ canvas: HTMLCanvasElement }} options
 */
export function createReaderRenderer({ canvas, keys: plateKeys = null }) {
  const doc = canvas.ownerDocument;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  const frame = createFrame();
  const tmp = new Float64Array(4);
  const pos = new Float64Array(3);
  const axes = new Float64Array(6);
  const xf = new Float32Array(7);
  const corner = [0, 0, 0];
  const trailTag = { stage: TAG.flight, lift: 1, fly: 0, pin: 0, u: 0 };
  const size = { width: 1, height: 1, dpr: 1 };
  const furniture = createFurniture(ctx);
  const pageAxes = Object.freeze([
    DESK_AXES.across[0] * DESK.pageHalfW,
    DESK_AXES.across[1] * DESK.pageHalfW,
    DESK_AXES.across[2] * DESK.pageHalfW,
    -DESK_AXES.down[0] * DESK.pageHalfH,
    -DESK_AXES.down[1] * DESK.pageHalfH,
    -DESK_AXES.down[2] * DESK.pageHalfH,
  ]);
  const formAxes = Object.freeze([
    FORM_AXES.right[0] * FORM.halfW,
    FORM_AXES.right[1] * FORM.halfW,
    FORM_AXES.right[2] * FORM.halfW,
    FORM_AXES.up[0] * FORM.halfH,
    FORM_AXES.up[1] * FORM.halfH,
    FORM_AXES.up[2] * FORM.halfH,
  ]);
  const flat = flatAxes(new Float64Array(6));

  const pages = drawPageSheet(doc);
  const spots = pages.spots;
  const images = { pages: null, tags: null, form: null };
  let grain = null;
  const promote = (key, source) => {
    images[key] = source;
    if (typeof createImageBitmap !== 'function') return;
    createImageBitmap(source)
      .then((bitmap) => {
        if (images[key] === source) images[key] = bitmap;
        else bitmap.close?.();
      })
      .catch(() => {}); // the canvas itself keeps working as the source
  };
  promote('pages', pages.canvas);
  promote('tags', drawTagSheet(doc));
  promote('form', drawFormSheet(doc));

  function aim(state) {
    const focal = Math.min(size.height / CAMERA.spanY, size.width / CAMERA.spanX) * CAMERA.distance;
    aimFrame(frame, {
      target: CAMERA.target,
      yaw: CAMERA.yaw + state.camera.yaw,
      pitch: CAMERA.pitch + state.camera.pitch,
      distance: CAMERA.distance,
      focal,
      cx: size.width * CAMERA.centerX,
      cy: size.height * CAMERA.centerY,
    });
  }

  /** Sets the canvas transform of a world quad (centre + half-axes); returns its px per sprite unit. */
  function setQuad(cx, cy, cz, a) {
    writeQuadAffine(frame, cx, cy, cz, a[0], a[1], a[2], a[3], a[4], a[5], tmp, xf, 0);
    const d = size.dpr;
    ctx.setTransform(xf[0] * d, xf[1] * d, xf[2] * d, xf[3] * d, xf[4] * d, xf[5] * d);
    return Math.sqrt(Math.abs(xf[0] * xf[3] - xf[1] * xf[2])) || 1;
  }

  /** How far a quad turns from the eye (0 square on, 1 edge on). */
  function turned(cx, cy, cz, a) {
    const nx = a[1] * a[5] - a[2] * a[4];
    const ny = a[2] * a[3] - a[0] * a[5];
    const nz = a[0] * a[4] - a[1] * a[3];
    const vx = frame.eye[0] - cx;
    const vy = frame.eye[1] - cy;
    const vz = frame.eye[2] - cz;
    return 1 - Math.abs((nx * vx + ny * vy + nz * vz) / ((Math.hypot(nx, ny, nz) || 1) * (Math.hypot(vx, vy, vz) || 1)));
  }

  function shadeQuad(amount, alpha) {
    if (amount <= 0.01) return;
    ctx.globalAlpha = alpha * amount;
    ctx.fillStyle = INK.indigo;
    ctx.fillRect(-1, -1, 2, 2);
  }

  // ---- the paper on the desk -------------------------------------------------------------

  /** One page of the continuous paper at a page-space offset down the slope. */
  function drawPage(page, offset, lifted, state, alpha) {
    if (offset <= -2.3 || offset >= 2.3) return;
    deskPoint(0, offset, 0.003, pos);
    setQuad(pos[0], pos[1], pos[2], pageAxes);
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.pages, 0, pageCellY(page), PAGE_CELL.width, PAGE_CELL.height, -1, -1, 2, 2);
    const px = 1 / Math.max(1e-3, Math.sqrt(Math.abs(xf[0] * xf[3] - xf[1] * xf[2]))); // sprite units per CSS px
    for (let f = 0; f < FIELDS.length; f += 1) {
      const o = (page * FIELDS.length + f) * 2;
      const x0 = spots[o];
      const x1 = spots[o + 1];
      const y = VALUE_ROWS[f];
      const spot = lifted ? null : state.spots[f];
      const ghost = lifted ? 1 : spot.ghost;
      if (ghost > 0) {
        // the phrase has gone: a pale wash and a dashed ruled box where it stood
        ctx.globalAlpha = alpha * ghost;
        ctx.fillStyle = INK.sheet;
        ctx.fillRect(x0 - 0.015, y - 0.06, x1 - x0 + 0.03, 0.11);
        ctx.globalAlpha = alpha * ghost * 0.55;
        ctx.strokeStyle = INK.indigo;
        ctx.lineWidth = px * 0.9;
        ctx.setLineDash(pageDash(px));
        ctx.strokeRect(x0 - 0.015, y - 0.06, x1 - x0 + 0.03, 0.11);
        ctx.setLineDash(NO_DASH);
      }
      if (!spot || spot.underline <= 0) continue;
      const red = spot.red;
      ctx.lineCap = 'round';
      ctx.lineWidth = px * 1.7;
      const yy = y + 0.055;
      const xe = x0 + (x1 - x0) * spot.underline;
      if (red > 0) {
        ctx.globalAlpha = alpha * red;
        ctx.strokeStyle = INK.north;
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(xe, yy);
        ctx.stroke();
      }
      if (red < 1) {
        ctx.globalAlpha = alpha * (1 - red) * 0.8;
        ctx.strokeStyle = INK.indigo;
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(xe, yy);
        ctx.stroke();
      }
    }
    if (!lifted && state.rule.alpha > 0) drawRule(state.rule.y, state.rule.alpha * alpha, px);
  }

  const dashScratch = [0, 0];
  function pageDash(px) {
    dashScratch[0] = 3 * px;
    dashScratch[1] = 2.5 * px;
    return dashScratch;
  }

  /** The reading rule: a straightedge across the page, overhanging it, with end ticks. */
  function drawRule(y, alpha, px) {
    const over = 1.1;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = px * 1.3;
    ctx.beginPath();
    ctx.moveTo(-over, y + 0.12);
    ctx.lineTo(over, y + 0.12);
    ctx.moveTo(-over, y + 0.06);
    ctx.lineTo(-over, y + 0.18);
    ctx.moveTo(over, y + 0.06);
    ctx.lineTo(over, y + 0.18);
    ctx.stroke();
  }

  function drawPaper(state, alpha) {
    const n = CAST.length;
    const base = 2 * (1 - state.feed);
    ctx.save();
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    furniture.clipToDesk();
    drawPage((state.page + n - 1) % n, base - 2, true, state, alpha);
    drawPage(state.page, base, false, state, alpha);
    drawPage((state.page + 1) % n, base + 2, false, BLANK_PAGE, alpha);
    ctx.restore();
  }

  // ---- forms and tags -------------------------------------------------------------------

  /** A form (centre + half-axes) with the tags of `page` pinned in its slots (count = how many). */
  function drawForm(cx, cy, cz, a, page, count, state, alpha, pinning, shade = -1) {
    if (alpha <= 0.002) return;
    const s = setQuad(cx, cy, cz, a);
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.form, 0, 0, FORM_CELL.width, FORM_CELL.height, -1, -1, 2, 2);
    const turn = turned(cx, cy, cz, a);
    for (let f = 0; f < count; f += 1) {
      const slot = FORM_SLOTS[f];
      const press = pinning ? state.tags[f].pin : 1;
      const grow = 1 + 0.08 * (1 - press);
      const { sx, sy } = tagCell(page, f);
      ctx.globalAlpha = alpha;
      ctx.drawImage(images.tags, sx, sy, TAG_CELL.width, TAG_CELL.height, slot.x - TAG_W * grow, slot.y - TAG_H * grow, 2 * TAG_W * grow, 2 * TAG_H * grow);
      // the pin, pressed in at the tag's left end
      const px = slot.x - TAG_W + 0.075;
      const rx = PIN_R / FORM.halfW;
      const ry = PIN_R / FORM.halfH;
      ctx.globalAlpha = alpha * Math.min(1, press * 3);
      ctx.fillStyle = INK.sumi;
      ctx.beginPath();
      ctx.ellipse(px, slot.y, rx * (1 + 0.6 * (1 - press)), ry * (1 + 0.6 * (1 - press)), 0, 0, Math.PI * 2);
      ctx.fill();
      if (pinning && press > 0 && press < 1) drawPinTicks(px, slot.y, rx, ry, press, alpha, s);
    }
    shadeQuad(shade >= 0 ? shade : 0.42 * turn * turn, alpha);
    ctx.globalAlpha = 1;
  }

  /** The comic's impact ticks round a pin as it goes in: short strokes flying out, then gone. */
  function drawPinTicks(x, y, rx, ry, press, alpha, s) {
    ctx.globalAlpha = alpha * (1 - press);
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.1 / s;
    ctx.beginPath();
    const r0 = 2.2 + 1.6 * press;
    for (let i = 0; i < 5; i += 1) {
      const ang = -2.6 + i * 1.05;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      ctx.moveTo(x + c * rx * r0, y + sn * ry * r0);
      ctx.lineTo(x + c * rx * (r0 + 1.6), y + sn * ry * (r0 + 1.6));
    }
    ctx.stroke();
  }

  function pinnedCount(state) {
    let count = 0;
    while (count < FIELDS.length && state.tags[count].stage === TAG.pinned) count += 1;
    return count;
  }

  function drawBoardForm(state, alpha) {
    const form = state.form;
    if (form.onBoard) {
      drawForm(FORM.center[0], FORM.center[1], FORM.center[2], formAxes, form.page, pinnedCount(state), state, alpha, true);
      return;
    }
    if (form.blank > 0) {
      // a blank form is put up: it drops the last hair into the clip as it inks in
      const drop = (1 - form.blank) * 0.06;
      drawForm(FORM.center[0], FORM.center[1] + drop, FORM.center[2], formAxes, form.blankPage, 0, state, alpha * form.blank, false);
    }
  }

  function drawStack(state, alpha) {
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    // the short stack's edges: a few sheets under the newest form
    ctx.strokeStyle = INK.sumi;
    for (let k = 0; k < TRAY.sheets; k += 1) {
      stackPoint(k, pos);
      setQuad(pos[0], pos[1], pos[2], flat);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = INK.sheet;
      ctx.fillRect(-1, -1, 2, 2);
      shadeQuad(0.08 + 0.04 * (TRAY.sheets - k), alpha);
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 1 / Math.max(1e-3, Math.sqrt(Math.abs(xf[0] * xf[3] - xf[1] * xf[2])));
      ctx.strokeRect(-1, -1, 2, 2);
    }
    stackPoint(TRAY.sheets, pos);
    drawForm(pos[0], pos[1], pos[2], flat, state.form.stackTop, FIELDS.length, state, alpha, false, 0.1);
  }

  function drawAside(state, alpha) {
    const form = state.form;
    if (form.onBoard || form.aside >= 1) return;
    asidePlacement(form.aside, pos, axes);
    drawForm(pos[0], pos[1], pos[2], axes, form.page, FIELDS.length, state, alpha, false, 0.3 * form.aside * form.aside);
  }

  function drawFlyingTags(state, alpha) {
    for (let f = 0; f < FIELDS.length; f += 1) {
      const tag = state.tags[f];
      if (tag.stage !== TAG.lift && tag.stage !== TAG.flight) continue;
      const o = (state.page * FIELDS.length + f) * 2;
      drawTrail(tag, f, spots[o], spots[o + 1], alpha);
      tagPlacement(tag, f, spots[o], spots[o + 1], VALUE_ROWS[f], pos, axes);
      setQuad(pos[0], pos[1], pos[2], axes);
      const { sx, sy } = tagCell(state.page, f);
      ctx.globalAlpha = alpha;
      ctx.drawImage(images.tags, sx, sy, TAG_CELL.width, TAG_CELL.height, -1, -1, 2, 2);
      shadeQuad(0.42 * turned(pos[0], pos[1], pos[2], axes) ** 2, alpha);
    }
    ctx.globalAlpha = 1;
  }

  /** The course of a tag in flight: a dashed ink arc behind it, drawn on and let go. */
  function drawTrail(tag, f, x0, x1, alpha) {
    if (tag.stage !== TAG.flight) return;
    const head = tag.fly;
    const tail = Math.max(0, head - 0.6);
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.5 * alpha * Math.min(1, (1 - head) * 6 + 0.2);
    ctx.setLineDash(TRAIL_DASH);
    ctx.beginPath();
    for (let i = 0; i <= TRAIL_STEPS; i += 1) {
      trailTag.fly = tail + ((head - tail) * i) / TRAIL_STEPS;
      tagPlacement(trailTag, f, x0, x1, VALUE_ROWS[f], pos, axes);
      project(frame, pos[0], pos[1], pos[2], tmp);
      if (i === 0) ctx.moveTo(tmp[0], tmp[1]);
      else ctx.lineTo(tmp[0], tmp[1]);
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  // ---- the world behind and the plate's letters -----------------------------------------

  /** The sea's horizon as a ruled hairline across the plate, and a few dry strokes of swell. */
  function drawGround(alpha) {
    const F = frame.forward;
    const far = 600;
    project(frame, frame.eye[0] + F[0] * far, 0, frame.eye[2] + F[2] * far, tmp);
    const hy = tmp[1];
    const w = size.width;
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    stillLine(ctx, -4, hy, w + 4, hy, 5, 0.35, true);
    ctx.stroke();
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'round';
    for (let i = 0; i < SWELL.length; i += 3) {
      const depth = SWELL[i + 2];
      const y = hy + depth * size.height * 0.2;
      ctx.globalAlpha = alpha * (0.1 + 0.16 * depth);
      ctx.lineWidth = 0.8 + depth * 1.4;
      ctx.beginPath();
      const x = SWELL[i] * w;
      stillLine(ctx, x, y, x + SWELL[i + 1] * w * (0.5 + depth), y, i, 0.5, true);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function letter(text, px, py, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(px + dx * 0.25, py + dy * 0.25);
    ctx.lineTo(px + dx * 0.75, py + dy * 0.75);
    ctx.stroke();
    if (!placeKey(plateKeys, text, px + dx, py + dy, ctx.globalAlpha)) ctx.fillText(text, px + dx, py + dy);
  }

  /** a (the text on the desk), b (a field on the form), c (the stack of filled forms). */
  function drawLetters(alpha) {
    const fs = Math.max(13, Math.min(17, furniture.scale * 0.2));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = INK.sumi;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.font = `400 ${fs}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    deskPoint(-1.02, -0.75, 0, corner);
    project(frame, corner[0], corner[1], corner[2], tmp);
    letter('a', tmp[0], tmp[1], -fs * 1.2, -fs * 0.8);
    const slot = FORM_SLOTS[0];
    formPointScreen(slot.x + slot.halfW + 0.02, slot.y);
    letter('b', tmp[0], tmp[1], fs * 1.2, -fs * 0.7);
    stackPoint(0, corner);
    project(frame, corner[0] - FORM.halfW * 0.8, TRAY.height * 0.6, corner[2] + FORM.halfH * 0.6, tmp);
    letter('c', tmp[0], tmp[1], -fs * 1.1, fs * 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function formPointScreen(fx, fy) {
    const { right: r, up: u } = FORM_AXES;
    const x = fx * FORM.halfW;
    const y = -fy * FORM.halfH;
    project(frame, FORM.center[0] + r[0] * x + u[0] * y, FORM.center[1] + r[1] * x + u[1] * y, FORM.center[2] + r[2] * x + u[2] * y, tmp);
  }

  return {
    canvas,
    setSize(width, height, dpr) {
      size.width = Math.max(1, width);
      size.height = Math.max(1, height);
      size.dpr = dpr;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      // the paper's tooth, re-inked only when the plate changes size
      if (!grain || grain.width !== canvas.width || grain.height !== canvas.height) grain = drawPaperGrain(doc, canvas.width, canvas.height);
    },
    /** @param {ReturnType<import('./model.js').createFrameState>} state */
    render(state) {
      const d = size.dpr;
      const intro = state.intro;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      aim(state);
      furniture.project(frame);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawGround(intro);
      furniture.drawShadows(intro);
      furniture.drawBoard(frame, intro);
      drawBoardForm(state, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      furniture.drawClip(intro);
      furniture.drawDesk(frame, intro);
      drawPaper(state, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      furniture.drawLip(intro);
      furniture.drawTray(frame, intro);
      drawStack(state, intro);
      drawAside(state, intro);
      drawFlyingTags(state, intro);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawLetters(intro);
      if (grain) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(grain, 0, 0);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    },
    dispose() {
      grain = null;
      canvas.width = 0;
      canvas.height = 0;
      for (const key of Object.keys(images)) {
        images[key]?.close?.();
        images[key] = null;
      }
    },
  };
}

/** The page after the one in hand: nothing found on it yet. */
const BLANK_PAGE = Object.freeze({
  rule: Object.freeze({ y: 0, alpha: 0 }),
  spots: Object.freeze(FIELDS.map(() => Object.freeze({ underline: 0, red: 0, ghost: 0 }))),
});
