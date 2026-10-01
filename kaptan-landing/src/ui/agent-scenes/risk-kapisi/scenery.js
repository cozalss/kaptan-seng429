// Risk Kapısı — the canal and everything fixed to it, inked each frame from a moving camera: the
// far quay's face (dry-brush hatched) with the sixteen rule tags R01–R16 and their iron bollards,
// the gauge arms and the boom the rules swing out, the water, the near quay with the queue's
// mooring posts and lines, and the lock gate — its open railing leaves (the portrait's gangway
// gate), its beam with the "R01–R16" tag, and on the near post the kill switch: a latch box, a
// black lever and — the plate's one north-red mark — its red handle, with the rule on a plaque.
// Nothing here allocates per frame.

import { project } from '../../../lib/ink3d/camera.js';
import { INK } from '../../../lib/ink3d/ink.js';
import { stillLine } from '../../../lib/ink3d/paths.js';
import { MONO, SANS } from '../fonts.js';
import { RULES, RULE_COUNT } from './model.js';
import {
  ARM,
  BARGE,
  BEAM_TAG,
  BOLLARD,
  BOLLARD_X,
  BOOM,
  GATE,
  HARBOUR_POSTS,
  LEVER,
  PLAQUE,
  POST,
  QUAY,
  QUEUE_POSTS,
  TAG,
  deckY,
} from './world.js';

export const SHADE = Object.freeze({
  wall: '#d3d8dd', // the far quay's face, a flat grey-blue wash
  water: '#e3e6e9',
  quayTop: '#f6f4ef',
  iron: INK.sumi,
  ironLit: '#3a4659',
  shadow: 'rgba(43, 66, 97, 0.13)',
});

/** Ripples on the canal: x, z (world), length — fixed, like the portrait's strokes of rain. */
const RIPPLES = Object.freeze([
  -8.2, 0.75, 0.6, -6.6, -0.62, 0.9, -4.9, 0.66, 0.5, -3.6, -0.25, 0.7, -2.1, 0.78, 0.8, -0.9, -0.7, 0.6,
  0.4, 0.7, 0.55, 1.7, -0.35, 0.8, 2.8, 0.82, 0.6, 4.1, 0.6, 0.7, 5.4, 0.85, 0.5, 6.6, 0.1, 0.8, 7.8, 0.72,
  0.6, -7.4, 0.05, 0.5, 8.6, -0.6, 0.7,
]);
/** Rain: a few long slanted hairlines in the sky (plate fractions x, y, length), as in the portrait. */
const RAIN = Object.freeze([0.06, 0.08, 0.1, 0.19, 0.02, 0.07, 0.33, 0.12, 0.09, 0.47, 0.04, 0.06, 0.61, 0.1, 0.1, 0.74, 0.03, 0.08, 0.88, 0.09, 0.07, 0.95, 0.2, 0.06]);
const RAIL = Object.freeze({ z: -2.25, height: 0.62, step: 0.95, from: -10.5, to: 10.5 });
const BOOM_DASH = Object.freeze([4, 4]);
const JOINT = 0.9; // the near quay's coping stones (world units)
const NO_DASH = Object.freeze([]);
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
/** A tag narrower than this (CSS px) is not lettered: 8 px mono "R01" would not fit. */
const TAG_MIN_PX = 14;

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function createScenery(ctx) {
  const tmp = new Float64Array(4);
  const q = new Float32Array(16); // a projected polygon's xy pairs
  const lp = new Float64Array(6); // lever and knob, screen
  const lettered = new Uint8Array(RULE_COUNT);
  let frame = null;
  let scale = 1; // px per world unit at the canal's middle
  let width = 1;

  /** Projects a world point; returns its screen x and leaves y/scale in tmp. */
  const P = (x, y, z) => project(frame, x, y, z, tmp);

  function quad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
    P(x0, y0, z0);
    q[0] = tmp[0];
    q[1] = tmp[1];
    P(x1, y1, z1);
    q[2] = tmp[0];
    q[3] = tmp[1];
    P(x2, y2, z2);
    q[4] = tmp[0];
    q[5] = tmp[1];
    P(x3, y3, z3);
    q[6] = tmp[0];
    q[7] = tmp[1];
    ctx.beginPath();
    ctx.moveTo(q[0], q[1]);
    ctx.lineTo(q[2], q[3]);
    ctx.lineTo(q[4], q[5]);
    ctx.lineTo(q[6], q[7]);
    ctx.closePath();
  }

  /** A hand-ruled world segment added to the current path. */
  function seg(x0, y0, z0, x1, y1, z1, seed, wobble = 0.45) {
    P(x0, y0, z0);
    const ax = tmp[0];
    const ay = tmp[1];
    P(x1, y1, z1);
    stillLine(ctx, ax, ay, tmp[0], tmp[1], seed, wobble, true);
  }

  /** Dry-brush hatching over the last quad (q), clipped to it. */
  function hatchQuad(seed, alpha, gapPx) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q[0], q[1]);
    ctx.lineTo(q[2], q[3]);
    ctx.lineTo(q[4], q[5]);
    ctx.lineTo(q[6], q[7]);
    ctx.closePath();
    ctx.clip();
    const minX = Math.max(Math.min(q[0], q[6]), -20);
    const maxX = Math.min(Math.max(q[2], q[4]), width + 20);
    const minY = Math.min(q[5], q[7]);
    const maxY = Math.max(q[1], q[3]);
    const h = maxY - minY;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    let k = 0;
    for (let x = minX - h; x < maxX; x += gapPx) {
      const lift = 0.15 * ((k * 0.618) % 1);
      stillLine(ctx, x, maxY + 1, x + h * 0.7, minY + h * lift, seed + k, 0.4, true);
      k += 1;
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The sky's rain, the iron railing behind the far quay and the far quay's face. */
  function drawFar(alpha) {
    ctx.globalAlpha = alpha * 0.32;
    ctx.strokeStyle = INK.indigo;
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    P(0, RAIL.height + QUAY.top, RAIL.z);
    const skyBottom = tmp[1] - 6;
    ctx.beginPath();
    for (let i = 0; i < RAIN.length; i += 3) {
      const x = RAIN[i] * width;
      const y = RAIN[i + 1] * skyBottom;
      const len = RAIN[i + 2] * skyBottom * 1.6;
      if (y + len * 0.95 > skyBottom) continue;
      stillLine(ctx, x, y, x - len * 0.18, y + len, i, 0.3, true);
    }
    ctx.stroke();
    // the railing along the far quay: posts and two rails, light (it is the portrait's backdrop)
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const top = QUAY.top + RAIL.height;
    seg(RAIL.from, top, RAIL.z, RAIL.to, top, RAIL.z, 3, 0.35);
    seg(RAIL.from, QUAY.top + RAIL.height * 0.5, RAIL.z, RAIL.to, QUAY.top + RAIL.height * 0.5, RAIL.z, 5, 0.35);
    for (let x = RAIL.from, i = 0; x <= RAIL.to; x += RAIL.step, i += 1) seg(x, QUAY.top, RAIL.z, x, top + 0.04, RAIL.z, 20 + i, 0.25);
    ctx.stroke();
    // the far quay's face: a flat wash, hatched, its top edge ruled heavy
    ctx.globalAlpha = alpha;
    quad(QUAY.from, 0, QUAY.back, QUAY.to, 0, QUAY.back, QUAY.to, QUAY.top, QUAY.back, QUAY.from, QUAY.top, QUAY.back);
    ctx.fillStyle = SHADE.wall;
    ctx.fill();
    hatchQuad(400, alpha * 0.24, Math.max(5, scale * 0.12));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    seg(QUAY.from, QUAY.top, QUAY.back, QUAY.to, QUAY.top, QUAY.back, 11, 0.5);
    ctx.stroke();
  }

  /** The canal's water: a pale wash and fixed ripples. */
  function drawWater(alpha) {
    ctx.globalAlpha = alpha;
    quad(QUAY.from, 0, QUAY.back, QUAY.to, 0, QUAY.back, QUAY.to, 0, QUAY.front, QUAY.from, 0, QUAY.front);
    ctx.fillStyle = SHADE.water;
    ctx.fill();
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    seg(QUAY.from, 0, QUAY.back, QUAY.to, 0, QUAY.back, 13, 0.4);
    ctx.stroke();
    ctx.strokeStyle = INK.indigo;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha * 0.32;
    ctx.beginPath();
    for (let i = 0; i < RIPPLES.length; i += 3) seg(RIPPLES[i], 0, RIPPLES[i + 1], RIPPLES[i] + RIPPLES[i + 2], 0, RIPPLES[i + 1], 50 + i, 0.5);
    ctx.stroke();
  }

  /**
   * The rule tags on the far quay's face, printed square to the eye (they stay legible however the
   * wall turns): ticked as a bow passes, inked solid while the rule acts. A tag too small to letter
   * gets one ruled stroke, as the book prints body copy at that size. Returns how many were lettered.
   */
  function drawTags(rules, alpha) {
    let count = 0;
    ctx.lineWidth = 1;
    for (let i = 0; i < RULE_COUNT; i += 1) {
      const rule = rules[i];
      P(BOLLARD_X[i], TAG.y, TAG.z);
      const cx = tmp[0];
      const cy = tmp[1];
      const w = TAG.halfW * 2 * tmp[3];
      const h = TAG.halfH * 2 * tmp[3];
      const x0 = cx - w / 2;
      const y0 = cy - h / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rule.mark > 0 ? INK.indigo : INK.sheet;
      if (rule.mark > 0 && rule.mark < 1) {
        ctx.fillStyle = INK.sheet;
        ctx.fillRect(x0, y0, w, h);
        ctx.globalAlpha = alpha * rule.mark;
        ctx.fillStyle = INK.indigo;
      }
      ctx.fillRect(x0, y0, w, h);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.sumi;
      ctx.strokeRect(x0, y0, w, h);
      const ink = rule.mark > 0.5 ? INK.sheet : INK.sumi;
      lettered[i] = w >= TAG_MIN_PX ? 1 : 0;
      if (lettered[i]) {
        count += 1;
        ctx.font = `500 ${Math.min(11, Math.max(8, h * 0.78))}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ink;
        ctx.fillText(RULES[i], cx, cy + 0.5, w * 0.94);
      } else {
        ctx.strokeStyle = ink;
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.28, cy);
        ctx.lineTo(cx + w * 0.28, cy);
        ctx.stroke();
      }
      if (rule.check > 0) {
        // the tick: a short indigo rule under the tag as the bow passes its bollard
        ctx.globalAlpha = alpha * rule.check;
        ctx.strokeStyle = INK.indigo;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x0 + 1, y0 + h + 2.5);
        ctx.lineTo(x0 + w - 1, y0 + h + 2.5);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return count;
  }

  /** One iron post: a cylinder with a flared cap, lit from the upper left. */
  function post(x, y, z, radius, h, cap) {
    P(x, y, z);
    const bx = tmp[0];
    const by = tmp[1];
    const r = radius * tmp[3];
    P(x, y + h, z);
    const tx = tmp[0];
    const ty = tmp[1];
    const ry = r * 0.42;
    ctx.fillStyle = SHADE.iron;
    ctx.beginPath();
    ctx.moveTo(bx - r, by);
    ctx.lineTo(tx - r, ty);
    ctx.lineTo(tx + r, ty);
    ctx.lineTo(bx + r, by);
    ctx.ellipse(bx, by, r, ry, 0, 0, Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(tx, ty, r * cap, ry * cap, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SHADE.ironLit;
    ctx.beginPath();
    ctx.ellipse(tx, ty - ry * 0.25, r * cap * 0.72, ry * cap * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // a lit sliver down the left of the barrel
    ctx.strokeStyle = INK.sheet;
    ctx.globalAlpha *= 0.4;
    ctx.lineWidth = Math.max(0.8, r * 0.28);
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.45, by - 1);
    ctx.lineTo(tx - r * 0.45, ty + ry);
    ctx.stroke();
    ctx.globalAlpha /= 0.4;
  }

  function drawBollards(alpha) {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < RULE_COUNT; i += 1) post(BOLLARD_X[i], QUAY.top, BOLLARD.z, BOLLARD.radius, BOLLARD.height, 1.3);
    for (let i = 0; i < HARBOUR_POSTS.length; i += 1) {
      const p = HARBOUR_POSTS[i];
      ctx.globalAlpha = alpha;
      post(p[0], p[1], p[2], POST.radius, POST.height, 1.25);
    }
    ctx.globalAlpha = 1;
  }

  /** Small labels over the bollards whose tags are too small to letter (R01, R16, an acting rule). */
  function drawRuleLabels(rules, alpha) {
    ctx.font = `500 8px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK.sumi;
    for (let i = 0; i < RULE_COUNT; i += 1) {
      if (lettered[i]) continue;
      const acting = rules[i].mark;
      const a = i === 0 || i === RULE_COUNT - 1 ? 1 : acting;
      if (a <= 0.01) continue;
      P(BOLLARD_X[i], QUAY.top + BOLLARD.height + 0.12, BOLLARD.z);
      ctx.globalAlpha = alpha * a;
      ctx.fillText(RULES[i], tmp[0], tmp[1] - 2);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /** The rules' gauge arms (swung across at their limit) and the boom (swung down to stop a barge). */
  function drawArms(rules, alpha) {
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'round';
    const baseY = QUAY.top + BOLLARD.height;
    for (let i = 0; i < RULE_COUNT; i += 1) {
      const rule = rules[i];
      const x = BOLLARD_X[i];
      if (rule.arm > 0.001) {
        // a height gauge: a mast, an arm swung out over the lane and, at its end, a bar along the
        // canal at the rule's limit — what stands above it is sheared off
        const y = deckY(rule.armSize) + rule.armSize * BARGE.cargoHeight + 0.01;
        const a = (Math.PI / 2) * rule.arm;
        const dx = -Math.cos(a);
        const dz = Math.sin(a);
        const ex = x + dx * ARM.reach;
        const ez = BOLLARD.z + dz * ARM.reach;
        const half = ARM.bar * rule.arm;
        ctx.globalAlpha = alpha * Math.min(1, rule.arm * 2.5);
        ctx.lineWidth = Math.max(2, scale * 0.034);
        ctx.beginPath();
        seg(x, baseY, BOLLARD.z, x, y + 0.06, BOLLARD.z, 600 + i, 0.25);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.6, scale * 0.026);
        ctx.beginPath();
        seg(x, y + 0.06, BOLLARD.z, ex, y + 0.06, ez, 620 + i, 0.3);
        ctx.stroke();
        ctx.lineWidth = Math.max(2.2, scale * 0.04);
        ctx.beginPath();
        seg(ex - dz * half, y, ez + dx * half, ex + dz * half, y, ez - dx * half, 640 + i, 0.2);
        seg(ex, y + 0.06, ez, ex, y, ez, 650 + i, 0.1);
        ctx.stroke();
      }
      if (rule.boom > 0.001) {
        const a = (Math.PI / 2) * rule.boom;
        const ey = BOOM.y + Math.cos(a) * BOOM.reach;
        const ez = BOLLARD.z + Math.sin(a) * BOOM.reach;
        ctx.globalAlpha = alpha;
        P(x, BOOM.y, BOLLARD.z);
        const hx = tmp[0];
        const hy = tmp[1];
        P(x, ey, ez);
        ctx.lineWidth = Math.max(3, scale * 0.065);
        ctx.strokeStyle = INK.sumi;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tmp[0], tmp[1]);
        ctx.stroke();
        // a barrier's stripes, ruled in paper along the boom
        ctx.lineWidth = Math.max(1.4, scale * 0.03);
        ctx.strokeStyle = INK.sheet;
        ctx.setLineDash(BOOM_DASH);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tmp[0], tmp[1]);
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
        ctx.strokeStyle = INK.sumi;
      }
    }
    ctx.globalAlpha = 1;
  }

  /** A gate leaf standing open along a quay face: a railing panel of vertical bars. */
  function leaf(z, seed, alpha) {
    const x0 = GATE.x + 0.06;
    const x1 = x0 + GATE.leafLength;
    const y0 = 0.02;
    const y1 = GATE.leafHeight;
    ctx.globalAlpha = alpha * 0.18;
    quad(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    ctx.fillStyle = INK.indigo;
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = Math.max(1.3, scale * 0.022);
    ctx.beginPath();
    seg(x0, y1, z, x1, y1, z, seed, 0.3);
    seg(x0, y1 * 0.42, z, x1, y1 * 0.42, z, seed + 1, 0.3);
    seg(x1, y0, z, x1, y1, z, seed + 2, 0.3);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.9, scale * 0.012);
    ctx.beginPath();
    for (let b = 1; b < GATE.bars; b += 1) {
      const x = x0 + (GATE.leafLength * b) / GATE.bars;
      seg(x, y0, z, x, y1, z, seed + 5 + b, 0.2);
    }
    ctx.stroke();
  }

  function gatePost(z, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineCap = 'butt';
    P(GATE.x, z > 0 ? QUAY.top : 0, z);
    const bx = tmp[0];
    const by = tmp[1];
    P(GATE.x, GATE.height, z);
    ctx.lineWidth = Math.max(3, tmp[3] * 0.085);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tmp[0], tmp[1]);
    ctx.stroke();
    // a finial
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.arc(tmp[0], tmp[1] - tmp[3] * 0.06, Math.max(2, tmp[3] * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
  }

  /** The far half of the gate (drawn before the barges): its post and open leaf. */
  function drawGateBack(alpha) {
    leaf(QUAY.back + 0.06, 700, alpha);
    gatePost(GATE.backZ, alpha);
    ctx.globalAlpha = 1;
  }

  /** The near quay (it hides the barges' waterlines), its edge and the queue's mooring posts. */
  function drawNearQuay(alpha) {
    ctx.globalAlpha = alpha;
    quad(QUAY.from, QUAY.top, QUAY.front, QUAY.to, QUAY.top, QUAY.front, QUAY.to, QUAY.top, QUAY.front + QUAY.frontDepth, QUAY.from, QUAY.top, QUAY.front + QUAY.frontDepth);
    ctx.fillStyle = SHADE.quayTop;
    ctx.fill();
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    seg(QUAY.from, QUAY.top, QUAY.front, QUAY.to, QUAY.top, QUAY.front, 17, 0.5);
    ctx.stroke();
    // the coping: a second, lighter rule a hand's width back, its stones jointed
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    seg(QUAY.from, QUAY.top, QUAY.front + 0.22, QUAY.to, QUAY.top, QUAY.front + 0.22, 19, 0.5);
    for (let x = -7.5, k = 0; x < 8; x += JOINT, k += 1) seg(x, QUAY.top, QUAY.front, x - 0.02, QUAY.top, QUAY.front + 0.22, 900 + k, 0.1);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < QUEUE_POSTS.length; i += 1) {
      const p = QUEUE_POSTS[i];
      post(p[0], p[1], p[2], POST.radius, POST.height, 1.25);
    }
    ctx.globalAlpha = 1;
  }

  /** A coiled line lying on the near quay (world x, z). */
  function coil(x, z, alpha) {
    P(x, QUAY.top, z);
    const r = 0.11 * tmp[3];
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = Math.max(1, scale * 0.016);
    ctx.beginPath();
    ctx.ellipse(tmp[0], tmp[1], r, r * 0.38, 0, 0, Math.PI * 2);
    ctx.moveTo(tmp[0] + r * 0.62, tmp[1]);
    ctx.ellipse(tmp[0], tmp[1], r * 0.62, r * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** A mooring line from a post's head to `end` (world), sagging more as it slackens (tied 1 → 0). */
  function rope(px, py, pz, ex, ey, ez, tied, alpha) {
    P(px, py, pz);
    const ax = tmp[0];
    const ay = tmp[1];
    P(ex, ey, ez);
    const bx = tmp[0];
    const by = tmp[1];
    const sag = (0.04 + 0.1 * (1 - tied)) * tmp[3];
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = Math.max(1, scale * 0.016);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
    ctx.stroke();
  }

  /** The gate's near half, its beam and tag, and the kill switch (drawn over the barges). */
  function drawGateFront(lever, alpha, lettering) {
    gatePost(GATE.frontZ, alpha);
    // the beam across the canal and the railing band under it
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK.sumi;
    const low = GATE.height - GATE.transom;
    ctx.lineWidth = Math.max(2.6, scale * 0.07);
    ctx.beginPath();
    seg(GATE.x, GATE.height, GATE.backZ - 0.12, GATE.x, GATE.height, GATE.frontZ + 0.12, 730, 0.3);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.6, scale * 0.035);
    ctx.beginPath();
    seg(GATE.x, low, GATE.backZ, GATE.x, low, GATE.frontZ, 733, 0.3);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.9, scale * 0.014);
    ctx.beginPath();
    for (let b = 1; b < GATE.bars; b += 1) {
      const z = GATE.backZ + ((GATE.frontZ - GATE.backZ) * b) / GATE.bars;
      seg(GATE.x, low, z, GATE.x, GATE.height, z, 740 + b, 0.15);
    }
    ctx.stroke();
    drawBeamTag(alpha, lettering);
    drawPlaque(alpha, lettering);
    drawLever(lever, alpha);
    ctx.globalAlpha = 1;
  }

  /** A paper card square to the eye, centred on a world point: writes its screen box into q. */
  function card(x, y, z, halfW, halfH) {
    P(x, y, z);
    const w = halfW * 2 * tmp[3];
    const h = halfH * 2 * tmp[3];
    q[0] = tmp[0] - w / 2;
    q[1] = tmp[1] - h / 2;
    q[2] = w;
    q[3] = h;
    ctx.fillStyle = INK.sheet;
    ctx.fillRect(q[0], q[1], w, h);
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = 1.1;
    ctx.strokeRect(q[0], q[1], w, h);
  }

  /** "R01–R16" on a paper tag hung from the beam, as on the portrait's gate. */
  function drawBeamTag(alpha, lettering) {
    const t = BEAM_TAG;
    P(t.x, GATE.height, t.z);
    const hx = tmp[0];
    const hy = tmp[1];
    ctx.globalAlpha = alpha;
    card(t.x, t.y, t.z, t.halfW, t.halfH);
    const [x0, y0, w, h] = [q[0], q[1], q[2], q[3]];
    const cx = x0 + w / 2;
    // its string, and the hole it hangs by
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(cx, y0 + h * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, y0 + h * 0.2, Math.max(1, h * 0.07), 0, Math.PI * 2);
    ctx.stroke();
    const size = Math.min(13, h * 0.46);
    if (lettering && size >= 8 && w > 38) {
      ctx.font = `500 ${size}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK.sumi;
      ctx.fillText('R01–R16', cx, y0 + h * 0.64, w * 0.9);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.3, y0 + h * 0.64);
      ctx.lineTo(cx + w * 0.3, y0 + h * 0.64);
      ctx.stroke();
    }
  }

  /** The sign at the gate's foot: what the switch does, printed (ruled strokes when too small). */
  function drawPlaque(alpha, lettering) {
    const [x, y, z] = PLAQUE.centre;
    ctx.globalAlpha = alpha;
    // it stands on one short iron post
    ctx.strokeStyle = INK.sumi;
    ctx.lineWidth = Math.max(1.8, scale * 0.03);
    ctx.beginPath();
    seg(x, QUAY.top, z, x, y, z, 760, 0.15);
    ctx.stroke();
    card(x, y, z, PLAQUE.halfW, PLAQUE.halfH);
    const [x0, y0, w, h] = [q[0], q[1], q[2], q[3]];
    const left = x0 + w * 0.09;
    const big = Math.min(13, Math.max(9, h * 0.32));
    if (lettering && h >= 24 && w > 66) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK.sumi;
      ctx.font = `500 ${big}px ${SANS}`;
      ctx.fillText('Kill switch', left, y0 + h * 0.46, w * 0.84);
      ctx.fillStyle = INK.muted;
      ctx.font = `400 ${Math.max(8, big * 0.82)}px ${SANS}`;
      ctx.fillText('zirveden −%5', left, y0 + h * 0.8, w * 0.84);
    } else {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y0 + h * 0.38);
      ctx.lineTo(left + w * 0.62, y0 + h * 0.38);
      ctx.moveTo(left, y0 + h * 0.7);
      ctx.lineTo(left + w * 0.44, y0 + h * 0.7);
      ctx.stroke();
    }
  }

  /** The latch box, the lever (thrown 0 → 1) and its red handle. */
  function drawLever(lever, alpha) {
    const [px, py, pz] = LEVER.pivot;
    const a = LEVER.rest + (LEVER.thrown - LEVER.rest) * lever;
    P(px, py, pz);
    lp[0] = tmp[0];
    lp[1] = tmp[1];
    const s = tmp[3];
    P(px + Math.cos(a) * LEVER.length, py + Math.sin(a) * LEVER.length, pz);
    lp[2] = tmp[0];
    lp[3] = tmp[1];
    ctx.globalAlpha = alpha;
    // the latch box
    const b = 0.11 * s;
    ctx.fillStyle = INK.sumi;
    ctx.fillRect(lp[0] - b, lp[1] - b, b * 2, b * 2);
    ctx.strokeStyle = INK.sheet;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeRect(lp[0] - b * 0.6, lp[1] - b * 0.6, b * 1.2, b * 1.2);
    // the throw's arc, ruled faintly: where the lever goes
    ctx.globalAlpha = alpha * (0.22 + 0.3 * Math.sin(Math.PI * clamp01(lever)));
    ctx.strokeStyle = INK.sumi;
    ctx.setLineDash(BOOM_DASH);
    ctx.beginPath();
    ctx.arc(lp[0], lp[1], LEVER.length * s * 0.82, -LEVER.thrown, -LEVER.rest, false);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2.4, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(lp[0], lp[1]);
    ctx.lineTo(lp[2], lp[3]);
    ctx.stroke();
    ctx.fillStyle = INK.north;
    ctx.beginPath();
    ctx.arc(lp[2], lp[3], Math.max(2.6, LEVER.knob * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK.sumi;
    ctx.beginPath();
    ctx.arc(lp[0], lp[1], Math.max(1.5, s * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    /** Aims the scenery at this frame's camera (`w`: the plate's CSS width). */
    begin(nextFrame, w) {
      frame = nextFrame;
      width = w;
      P(0, 0, 0);
      scale = tmp[3];
    },
    get scale() {
      return scale;
    },
    drawFar,
    drawWater,
    drawTags,
    drawBollards,
    drawRuleLabels,
    drawArms,
    drawGateBack,
    drawNearQuay,
    drawGateFront,
    rope,
    coil,
    /** Screen point of the lever's pivot (for the plate's letter c). */
    leverPoint(out) {
      out[0] = lp[0];
      out[1] = lp[1];
      return out;
    },
  };
}
