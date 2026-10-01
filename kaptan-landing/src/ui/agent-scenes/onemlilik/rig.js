// Önemlilik — the balance itself, drawn each frame from the camera: the spar it hangs from (the
// portrait's black pole, lashed), the hanger, the beam, the dial with the rules' threshold ruled
// over it and the needle (its tip the plate's one north-red mark, as on the portrait's scale), the
// cords and the two pans. Every buffer is allocated once.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { writeQuadAffine } from '../../../lib/ink3d/quad.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { SANS } from '../fonts.js';
import { THRESHOLD } from './model.js';
import { DIAL_CELL, fontCache } from './sprites.js';
import { BALANCE, THRESHOLD_BAND, beamEnd, needleTip, panCentre } from './world.js';

export const SHADE = Object.freeze({
  pan: '#e7e9ea', // the portrait's pale grey-blue, as a flat wash
  panSide: '#97a4b4',
  paper: INK.sheet,
});

/** Cord anchors round a pan's rim (angle in its plane): at its sides and back, clear of the load. */
const CORDS = Object.freeze([Math.PI * 0.06, Math.PI * 0.94, Math.PI * 1.5]);
const HOOK = 0.16; // world units: the cords gather this far under the beam's end
const SPAR_TIP = -2.7;
const SPAR_END = 12;
const SPAR_HALF = 0.062;
const RED_TIP = 0.24; // fraction of the needle inked north red

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ dial: CanvasImageSource | null }} images
 */
export function createRig(ctx, images) {
  const tmp = new Float64Array(4);
  const p = new Float64Array(3);
  const q = new Float64Array(3);
  const xf = new Float32Array(7);
  const sans = fontCache(500, SANS);
  // screen points of this frame: beam ends, gathers, pan centres, needle, pivot
  const scr = {
    pivot: new Float64Array(4),
    end: [new Float64Array(4), new Float64Array(4)],
    gather: [new Float64Array(4), new Float64Array(4)],
    pan: [new Float64Array(4), new Float64Array(4)],
    // the pan rim's two projected half-axes (x and z), per side: ax, ay, bx, by
    rim: [new Float64Array(4), new Float64Array(4)],
    tip: new Float64Array(4),
  };

  const side = (i) => (i === 0 ? -1 : 1);

  function projectInto(out, x, y, z, frame) {
    project(frame, x, y, z, tmp);
    out[0] = tmp[0];
    out[1] = tmp[1];
    out[2] = tmp[2];
    out[3] = tmp[3];
  }

  /** Projects this frame's landmarks (call once per frame, before drawing). */
  function place(frame, theta) {
    const [px, py, pz] = BALANCE.pivot;
    projectInto(scr.pivot, px, py, pz + BALANCE.dialZ, frame);
    for (let i = 0; i < 2; i += 1) {
      beamEnd(side(i), theta, p);
      projectInto(scr.end[i], p[0], p[1], p[2], frame);
      projectInto(scr.gather[i], p[0], p[1] - HOOK, p[2], frame);
      panCentre(side(i), theta, q);
      projectInto(scr.pan[i], q[0], q[1], q[2], frame);
      const c = scr.pan[i];
      const r = scr.rim[i];
      project(frame, q[0] + BALANCE.panR, q[1], q[2], tmp);
      r[0] = tmp[0] - c[0];
      r[1] = tmp[1] - c[1];
      project(frame, q[0], q[1], q[2] + BALANCE.panR, tmp);
      r[2] = tmp[0] - c[0];
      r[3] = tmp[1] - c[1];
    }
    needleTip(theta, p);
    projectInto(scr.tip, p[0], p[1], p[2], frame);
  }

  /** The spar across the top (tapered to a point on the left, as the portrait's pole) and its lashing. */
  function drawSpar(frame, alpha) {
    const y = BALANCE.spar;
    const z = BALANCE.pivot[2] - 0.05;
    project(frame, SPAR_TIP, y, z, tmp);
    const tx = tmp[0];
    const ty = tmp[1];
    project(frame, SPAR_TIP + 0.55, y + SPAR_HALF, z, tmp);
    const ax = tmp[0];
    const ay = tmp[1];
    project(frame, SPAR_END, y + SPAR_HALF, z, tmp);
    const bx = tmp[0];
    const by = tmp[1];
    project(frame, SPAR_END, y - SPAR_HALF, z, tmp);
    const cx = tmp[0];
    const cy = tmp[1];
    project(frame, SPAR_TIP + 0.55, y - SPAR_HALF, z, tmp);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.closePath();
    ctx.fill();
    // a dry highlight along its upper edge
    ctx.strokeStyle = INK.sheet;
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    stillLine(ctx, ax + 6, ay + 1.6, bx, by + 2.2, 512, 0.5, true);
    ctx.stroke();
    // the lashing where the hanger hooks on: three pale turns
    const [px] = BALANCE.pivot;
    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let k = -1; k <= 1; k += 1) {
      project(frame, px + k * 0.07 - 0.03, y + SPAR_HALF * 1.25, z + 0.02, tmp);
      const x0 = tmp[0];
      const y0 = tmp[1];
      project(frame, px + k * 0.07 + 0.03, y - SPAR_HALF * 1.25, z + 0.02, tmp);
      ctx.moveTo(x0, y0);
      ctx.lineTo(tmp[0], tmp[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** From the spar down to the dial's crown: a rod, a ring, the crown's eye. */
  function drawHanger(frame, alpha) {
    const [px, py, pz] = BALANCE.pivot;
    const top = py + BALANCE.dialR;
    const z = pz + BALANCE.dialZ * 0.5;
    project(frame, px, BALANCE.spar - SPAR_HALF, z, tmp);
    const sx = tmp[0];
    const sy = tmp[1];
    project(frame, px, (BALANCE.spar + top) / 2, z, tmp);
    const rx = tmp[0];
    const ry = tmp[1];
    const s = tmp[3];
    project(frame, px, top + 0.05, z, tmp);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.3, s * 0.026);
    const ring = Math.max(3, s * 0.085);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(rx, ry - ring);
    ctx.moveTo(rx, ry + ring);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath();
    ctx.arc(rx, ry, ring, 0, Math.PI * 2);
    ctx.stroke();
    // the crown's eye on top of the dial
    ctx.beginPath();
    ctx.arc(tmp[0], tmp[1] - ring * 0.4, ring * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The beam: a bar thickest at the pivot, a knuckle at each end and the hook below it. */
  function drawBeam(alpha) {
    const [l, r] = scr.end;
    const c = scr.pivot;
    const s = c[3];
    const dx = r[0] - l[0];
    const dy = r[1] - l[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const mid = s * 0.06;
    const end = s * 0.028;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.moveTo(l[0] + nx * end, l[1] + ny * end);
    ctx.lineTo(c[0] + nx * mid, c[1] + ny * mid);
    ctx.lineTo(r[0] + nx * end, r[1] + ny * end);
    ctx.lineTo(r[0] - nx * end, r[1] - ny * end);
    ctx.lineTo(c[0] - nx * mid * 1.6, c[1] - ny * mid * 1.6);
    ctx.lineTo(l[0] - nx * end, l[1] - ny * end);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i += 1) {
      const e = scr.end[i];
      const g = scr.gather[i];
      ctx.beginPath();
      ctx.arc(e[0], e[1], Math.max(2.2, s * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, s * 0.022);
      ctx.beginPath();
      ctx.moveTo(e[0], e[1]);
      ctx.lineTo(g[0], g[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Cords from a pan's gather to its rim anchors: back ones (front = false) or the front one. */
  function drawCords(alpha, front) {
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    for (let i = 0; i < 2; i += 1) {
      const g = scr.gather[i];
      const c = scr.pan[i];
      const r = scr.rim[i];
      for (let k = 0; k < CORDS.length; k += 1) {
        const a = CORDS[k];
        if ((Math.sin(a) > 0) !== front) continue;
        const x = c[0] + r[0] * Math.cos(a) + r[2] * Math.sin(a);
        const y = c[1] + r[1] * Math.cos(a) + r[3] * Math.sin(a);
        ctx.moveTo(g[0], g[1]);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The two pans: a shallow bowl (its front half) under a pale rim. */
  function drawPans(alpha, dpr) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    for (let i = 0; i < 2; i += 1) {
      const c = scr.pan[i];
      const r = scr.rim[i];
      const depth = BALANCE.panDepth * c[3];
      ctx.beginPath();
      ctx.setTransform(r[0] * dpr, r[1] * dpr, r[2] * dpr, r[3] * dpr, c[0] * dpr, c[1] * dpr);
      ctx.moveTo(1, 0);
      ctx.arc(0, 0, 1, 0, Math.PI, false);
      ctx.setTransform(r[0] * 0.62 * dpr, r[1] * 0.62 * dpr, r[2] * 0.62 * dpr, r[3] * 0.62 * dpr, c[0] * dpr, (c[1] + depth) * dpr);
      ctx.arc(0, 0, 1, Math.PI, 0, true);
      ctx.closePath();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = SHADE.panSide;
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.setTransform(r[0] * dpr, r[1] * dpr, r[2] * dpr, r[3] * dpr, c[0] * dpr, c[1] * dpr);
      ctx.moveTo(1, 0);
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = SHADE.pan;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The dial: its face (sprite), the rules' threshold ruled straight across the outer band and
   * the bezel with "eşik" beside it, "Temsili" in the lower half, then the needle and its hub.
   */
  function drawDial(frame, alpha, dpr) {
    if (!images.dial) return;
    const [px, py, pz] = BALANCE.pivot;
    const R = BALANCE.dialR;
    writeQuadAffine(frame, px, py, pz + BALANCE.dialZ, R, 0, 0, 0, R, 0, tmp, xf, 0);
    const k = (DIAL_CELL.size / 2 / DIAL_CELL.radius) * dpr;
    ctx.setTransform(xf[0] * k, xf[1] * k, xf[2] * k, xf[3] * k, xf[4] * dpr, xf[5] * dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(images.dial, -1, -1, 2, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = scr.pivot[3];
    drawThreshold(frame, alpha, s);
    // "Temsili" on the face's lower half, as the portrait prints its "%"
    const small = Math.max(8, Math.min(11, s * 0.13));
    ctx.font = sans(small);
    ctx.fillStyle = INK.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    project(frame, px, py - R * 0.42, pz + BALANCE.dialZ, tmp);
    ctx.fillText('Temsili', tmp[0], tmp[1], R * s * 1.1);
    drawNeedle(alpha, s);
  }

  /** The threshold: a ruled double line (no wobble — not this agent's hand) and its word. */
  function drawThreshold(frame, alpha, s) {
    const [px, py, pz] = BALANCE.pivot;
    const R = BALANCE.dialR;
    const sin = Math.sin(THRESHOLD);
    const cos = Math.cos(THRESHOLD);
    const z = pz + BALANCE.dialZ;
    project(frame, px + sin * R * THRESHOLD_BAND.from, py + cos * R * THRESHOLD_BAND.from, z, tmp);
    const x0 = tmp[0];
    const y0 = tmp[1];
    project(frame, px + sin * R * 1.1, py + cos * R * 1.1, z, tmp);
    const x1 = tmp[0];
    const y1 = tmp[1];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ox = (-(y1 - y0) / len) * 1.3;
    const oy = ((x1 - x0) / len) * 1.3;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + ox, y0 + oy);
    ctx.lineTo(x1 + ox, y1 + oy);
    ctx.moveTo(x0 - ox, y0 - oy);
    ctx.lineTo(x1 - ox, y1 - oy);
    // the ruler's end stops
    ctx.moveTo(x0 + ox * 2.2, y0 + oy * 2.2);
    ctx.lineTo(x0 - ox * 2.2, y0 - oy * 2.2);
    ctx.stroke();
    const size = Math.max(8, Math.min(11, s * 0.13));
    ctx.font = sans(size);
    ctx.fillStyle = INK.indigo;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    project(frame, px + Math.sin(THRESHOLD + 0.12) * R * 1.2, py + Math.cos(THRESHOLD + 0.12) * R * 1.2, z, tmp);
    ctx.fillText('eşik', tmp[0], tmp[1]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawNeedle(alpha, s) {
    const c = scr.pivot;
    const t = scr.tip;
    const dx = t[0] - c[0];
    const dy = t[1] - c[1];
    const w = Math.max(1.4, s * 0.026);
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(c[0] - dx * 0.26, c[1] - dy * 0.26);
    ctx.lineTo(c[0] + dx * (1 - RED_TIP), c[1] + dy * (1 - RED_TIP));
    ctx.stroke();
    ctx.strokeStyle = INK.north;
    ctx.lineWidth = w * 0.9;
    ctx.beginPath();
    ctx.moveTo(c[0] + dx * (1 - RED_TIP), c[1] + dy * (1 - RED_TIP));
    ctx.lineTo(t[0], t[1]);
    ctx.stroke();
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.arc(c[0], c[1], Math.max(2.4, s * 0.055), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK.sheet;
    ctx.beginPath();
    ctx.arc(c[0], c[1], Math.max(0.9, s * 0.018), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Soft ground shadows under the pans (they hang; the light is from the upper left). */
  function drawShadows(frame, alpha, theta) {
    ctx.fillStyle = INK.indigo;
    for (let i = 0; i < 2; i += 1) {
      panCentre(side(i), theta, p);
      project(frame, p[0] + 0.5, 0, p[2] - 0.3, tmp);
      const r = BALANCE.panR * tmp[3];
      ctx.globalAlpha = alpha * 0.045;
      ctx.beginPath();
      ctx.ellipse(tmp[0], tmp[1], r, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { scr, place, drawSpar, drawHanger, drawBeam, drawCords, drawPans, drawDial, drawShadows };
}
