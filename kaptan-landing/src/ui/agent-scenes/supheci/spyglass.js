// Şüpheci — the lookout's spyglass from the portrait: three drawn tubes (black objective, a pale
// middle draw, black eyepiece) seen in perspective, a flat paper highlight along each, the lens face
// in indigo, and the lanyard with its red bead — the plate's one north-red mark, as the portrait
// hangs it. Its sight lines run to the field it shows on the slip. Allocation-free per frame.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { SPYGLASS } from './world.js';

const FILLS = Object.freeze([INK.sumi, '#9aa3ad', INK.sumi]);
const SIGHT_DASH = Object.freeze([3, 4]);
const NO_DASH = Object.freeze([]);

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createSpyglass(ctx) {
  const n = SPYGLASS.sections.length / 2;
  // section ends on screen: x, y, px per unit (n + 1 joints)
  const jx = new Float32Array(n + 1);
  const jy = new Float32Array(n + 1);
  const js = new Float32Array(n + 1);
  const tmp = new Float64Array(4);
  const anchor = new Float32Array(6); // objective centre, its radius, px per unit, the eyepiece end
  let ux = 1;
  let uy = 0;
  let foreshorten = 1;

  /** Projects the tube along `pose` (from world.spyglassPose). */
  function place(frame, pose) {
    let along = 0;
    for (let j = 0; j <= n; j += 1) {
      project(frame, pose[0] + pose[3] * along, pose[1] + pose[4] * along, pose[2] + pose[5] * along, tmp);
      jx[j] = tmp[0];
      jy[j] = tmp[1];
      js[j] = tmp[3];
      if (j < n) along += SPYGLASS.sections[j * 2];
    }
    const dx = jx[n] - jx[0];
    const dy = jy[n] - jy[0];
    const len = Math.hypot(dx, dy) || 1;
    ux = dx / len;
    uy = dy / len;
    // how end-on the tube is seen: its axis against the view ray
    const vx = frame.eye[0] - pose[0];
    const vy = frame.eye[1] - pose[1];
    const vz = frame.eye[2] - pose[2];
    const vl = Math.hypot(vx, vy, vz) || 1;
    foreshorten = Math.max(0.18, Math.abs((pose[3] * vx + pose[4] * vy + pose[5] * vz) / vl));
    anchor[0] = jx[0];
    anchor[1] = jy[0];
    anchor[2] = SPYGLASS.sections[1] * js[0];
    anchor[3] = js[0];
    anchor[4] = jx[n];
    anchor[5] = jy[n];
  }

  function band(j, r0, r1) {
    const nx = -uy;
    const ny = ux;
    ctx.beginPath();
    ctx.moveTo(jx[j] + nx * r0, jy[j] + ny * r0);
    ctx.lineTo(jx[j + 1] + nx * r1, jy[j + 1] + ny * r1);
    ctx.lineTo(jx[j + 1] - nx * r1, jy[j + 1] - ny * r1);
    ctx.lineTo(jx[j] - nx * r0, jy[j] - ny * r0);
    ctx.closePath();
  }

  function cap(x, y, r) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * foreshorten, r, Math.atan2(uy, ux), 0, Math.PI * 2);
  }

  /** The tube, objective first (the eyepiece is nearer the eye and overlaps it). */
  function drawTube(alpha) {
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let j = 0; j < n; j += 1) {
      const r = SPYGLASS.sections[j * 2 + 1];
      const r0 = r * js[j];
      const r1 = r * js[j + 1];
      ctx.fillStyle = FILLS[j];
      band(j, r0, r1);
      ctx.fill();
      ctx.strokeStyle = INK.sumi;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // the joint: a ruled ring where this draw leaves the one before
      cap(jx[j], jy[j], r0);
      ctx.lineWidth = j === 0 ? 1.6 : 1.1;
      if (j === 0) {
        ctx.fillStyle = INK.indigo; // the lens, looking at the slip
        ctx.fill();
      }
      ctx.stroke();
      // a flat paper highlight along its upper side
      const side = ux > 0 ? -1 : 1;
      const hx = -uy * side * 0.42;
      const hy = ux * side * 0.42;
      ctx.strokeStyle = INK.sheet;
      ctx.globalAlpha = alpha * (j === 1 ? 0.75 : 0.55);
      ctx.lineWidth = Math.max(1, r0 * 0.22);
      ctx.beginPath();
      ctx.moveTo(jx[j] + ux * r0 * 0.6 + hx * r0, jy[j] + uy * r0 * 0.6 + hy * r0);
      ctx.lineTo(jx[j + 1] - ux * r1 * 0.5 + hx * r1, jy[j + 1] - uy * r1 * 0.5 + hy * r1);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    // the eyepiece's end, toward the lookout
    const r = SPYGLASS.sections[n * 2 - 1] * js[n];
    cap(jx[n], jy[n], r);
    ctx.fillStyle = INK.sumi;
    ctx.fill();
    ctx.strokeStyle = INK.sumi;
    ctx.stroke();
  }

  /** The lanyard from the eyepiece draw, by the hand, its red bead swinging a little. */
  function drawLanyard(alpha, sway) {
    const s = js[2];
    const x0 = jx[2] + (jx[3] - jx[2]) * 0.25;
    const y0 = jy[2] + (jy[3] - jy[2]) * 0.25 + SPYGLASS.sections[5] * s * 0.6;
    const drop = 0.42 * s;
    const bx = x0 - 0.05 * s + sway * 0.03 * s;
    const by = y0 + drop;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + 0.06 * s, y0 + drop * 0.6, bx, by);
    ctx.stroke();
    // the bead: a short red cylinder bound in ink
    const w = Math.max(2.4, 0.05 * s);
    const h = Math.max(4.5, 0.1 * s);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-0.35 + sway * 0.08);
    ctx.fillStyle = INK.north;
    ctx.fillRect(-w / 2, 0, w, h);
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-w / 2, 0, w, h);
    ctx.restore();
  }

  /** Two faint dashed sight lines from the lens rim to the field on the slip. */
  function drawSight(fx, fy, fr, alpha) {
    if (alpha <= 0.01) return;
    const dx = jx[0] - fx;
    const dy = jy[0] - fy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const r0 = anchor[2] * 0.8;
    ctx.globalAlpha = alpha * 0.45;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.8;
    ctx.setLineDash(SIGHT_DASH);
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(jx[0] + nx * r0 * side, jy[0] + ny * r0 * side);
      ctx.lineTo(fx + nx * fr * side, fy + ny * fr * side);
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  return {
    place,
    drawSight,
    draw(alpha, sway) {
      drawLanyard(alpha, sway);
      drawTube(alpha);
      ctx.globalAlpha = 1;
    },
    /** Screen anchors: objective x, y, radius, px per unit, then the eyepiece end x, y. */
    anchor,
  };
}
