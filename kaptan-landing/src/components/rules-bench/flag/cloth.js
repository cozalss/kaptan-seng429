// A pennant's cloth: Jakobsen-style position Verlet with constraint relaxation ("Advanced Character
// Physics", 2001), in 3D so a gust can ripple the cloth toward and away from the reader; the page sees
// it face-on, so a ripple shows as hatch lines crowding where the cloth turns away. Pure, no DOM.
// The whole hoist column is pinned to the halyard (a flag's heading is roped). Typed arrays are
// allocated once in createCloth and mutated in place every step: a per-frame physics state, on purpose.

import { noise1 } from '../../../lib/ink3d/ink.js';
import { restY } from './pennants.js';

const DAMP = { gust: 0.97, calm: 0.93 }; // air drag: lively in a gust, settling fast after it
const ITERATIONS = 6;
export const GRAVITY = 600; // CSS px / s²
const WIND = 2.8 * GRAVITY; // steady breeze: holds the pennant out, drooping ~12°
const FLUTTER = 5200;
const FURL_WIDTH = 0.22; // a furled pennant keeps this share of its length
const SHEAR = 0.04; // weak shear stiffness: cloth holds its weave but can hang and sag
const OBLIQUE = 0.14; // how much depth shows as a vertical shift (a hint of a three-quarter view)

/**
 * @param {{ cols: number, rows: number, length: number, hoist: number, seed?: number }} options
 *   cols × rows cells (≤ 20 × 12), length and hoist in CSS px.
 */
export function createCloth({ cols, rows, length, hoist, seed = 0 }) {
  const w = cols + 1;
  const n = w * (rows + 1);
  const pairs = [];
  const stiff = [];
  const link = (a, b, k = 1) => {
    pairs.push(a, b);
    stiff.push(k);
  };
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      const i = r * w + c;
      if (c < cols) link(i, i + 1);
      if (r < rows) link(i, i + w);
      if (c < cols && r < rows) {
        link(i, i + w + 1, SHEAR);
        link(i + 1, i + w, SHEAR);
      }
    }
  }
  const count = pairs.length / 2;
  const rx = new Float32Array(n);
  const ry = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const u = (i % w) / cols;
    rx[i] = u * length;
    ry[i] = restY(u, Math.floor(i / w) / rows) * hoist;
  }
  const cloth = {
    cols, rows, w, n, length, hoist, seed,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
    sx: new Float32Array(n), sy: new Float32Array(n), // projected, for drawing
    rx, ry,
    ca: Uint16Array.from(pairs.filter((_, k) => k % 2 === 0)),
    cb: Uint16Array.from(pairs.filter((_, k) => k % 2 === 1)),
    cl: new Float32Array(count),
    ck: Float32Array.from(stiff),
    count,
    shape: [-1, -1], // furl, hoistScale the rest lengths were computed for
    time: 0,
  };
  return cloth;
}

// Rest lengths of the current shape: a furled cloth is short, a bundled hoist is squeezed.
function reshape(cloth, furl, hoistScale) {
  if (cloth.shape[0] === furl && cloth.shape[1] === hoistScale) return;
  cloth.shape[0] = furl;
  cloth.shape[1] = hoistScale;
  const m = 1 - (1 - FURL_WIDTH) * furl;
  const { ca, cb, cl, rx, ry } = cloth;
  for (let k = 0; k < cloth.count; k += 1) {
    cl[k] = Math.hypot((rx[cb[k]] - rx[ca[k]]) * m, (ry[cb[k]] - ry[ca[k]]) * hoistScale);
  }
}

/** Puts the cloth at rest in its current shape, hoist top at (ox, oy). */
export function placeCloth(cloth, ox, oy, furl = 0, hoistScale = 1) {
  reshape(cloth, furl, hoistScale);
  const m = 1 - (1 - FURL_WIDTH) * furl;
  for (let i = 0; i < cloth.n; i += 1) {
    cloth.x[i] = cloth.px[i] = ox + cloth.rx[i] * m;
    cloth.y[i] = cloth.py[i] = oy + cloth.ry[i] * hoistScale;
    cloth.z[i] = cloth.pz[i] = 0;
  }
  project(cloth);
}

function project(cloth) {
  for (let i = 0; i < cloth.n; i += 1) {
    cloth.sx[i] = cloth.x[i];
    cloth.sy[i] = cloth.y[i] + cloth.z[i] * OBLIQUE;
  }
}

function integrate(cloth, dt, env) {
  const { x, y, z, px, py, pz, w, cols, rows, seed } = cloth;
  const t = cloth.time;
  const calm = 1 - env.furl * env.furl; // a half-unrolled pennant already takes the wind
  const dt2 = dt * dt;
  const gust = env.gust * calm;
  const surge = 1 + gust * 0.7 * (noise1(t * 1.7 + seed * 5.3) - 0.35);
  const ax = WIND * env.wind * calm * surge;
  const damp = DAMP.calm + (DAMP.gust - DAMP.calm) * Math.min(1, gust * 2);
  for (let i = 0; i < cloth.n; i += 1) {
    const c = i % w;
    if (c === 0) continue;
    const u = c / cols;
    const v = Math.floor(i / w) / rows;
    const az = gust * FLUTTER * (0.2 + u) * Math.sin(u * 8.5 - t * 8.2 + v * 2.1 + seed * 1.7);
    const vx = (x[i] - px[i]) * damp;
    const vy = (y[i] - py[i]) * damp;
    const vz = (z[i] - pz[i]) * damp;
    px[i] = x[i];
    py[i] = y[i];
    pz[i] = z[i];
    x[i] += vx + ax * dt2;
    y[i] += vy + (GRAVITY - gust * 0.25 * GRAVITY * (noise1(t * 2.3 + u * 3) - 0.5)) * dt2;
    z[i] += vz + az * dt2;
  }
}

function relax(cloth) {
  const { x, y, z, ca, cb, cl, ck, w } = cloth;
  // a rolled pennant is stiff: it keeps its bundle shape instead of trailing below the hoist
  const furl = cloth.shape[0];
  for (let k = 0; k < cloth.count; k += 1) {
    const a = ca[k];
    const b = cb[k];
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    const dz = z[b] - z[a];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const pinA = a % w === 0;
    const pinB = b % w === 0;
    if (pinA && pinB) continue;
    const f = ((d - cl[k]) / d) * (pinA || pinB ? 1 : 0.5) * (ck[k] + (1 - ck[k]) * furl);
    if (!pinA) {
      x[a] += dx * f;
      y[a] += dy * f;
      z[a] += dz * f;
    }
    if (!pinB) {
      x[b] -= dx * f;
      y[b] -= dy * f;
      z[b] -= dz * f;
    }
  }
}

function pin(cloth, ox, oy, hoistScale) {
  for (let r = 0; r <= cloth.rows; r += 1) {
    const i = r * cloth.w;
    cloth.x[i] = cloth.px[i] = ox;
    cloth.y[i] = cloth.py[i] = oy + cloth.ry[i] * hoistScale;
    cloth.z[i] = cloth.pz[i] = 0;
  }
}

function poke(cloth, p) {
  const r2 = p.r * p.r;
  const speed = Math.min(900, Math.hypot(p.vx, p.vy));
  for (let i = 0; i < cloth.n; i += 1) {
    if (i % cloth.w === 0) continue;
    const dx = cloth.x[i] - p.x;
    const dy = cloth.y[i] - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const k = (1 - Math.sqrt(d2) / p.r) * speed * 0.0045;
    cloth.z[i] += k * 2;
    cloth.x[i] += Math.sign(p.vx) * k * 0.5;
  }
}

/**
 * One fixed step. env: { ox, oy (hoist top pin), furl 0..1, hoistScale, wind 0..1, gust 0..1,
 * poke?: { x, y, vx, vy, r } }. Returns how far the liveliest node moved this step (px).
 */
export function stepCloth(cloth, dt, env) {
  cloth.time += dt;
  reshape(cloth, env.furl, env.hoistScale);
  integrate(cloth, dt, env);
  if (env.poke) poke(cloth, env.poke);
  for (let k = 0; k < ITERATIONS; k += 1) {
    pin(cloth, env.ox, env.oy, env.hoistScale);
    relax(cloth);
  }
  pin(cloth, env.ox, env.oy, env.hoistScale);
  let motion = 0;
  for (let i = 0; i < cloth.n; i += 1) {
    const m = Math.abs(cloth.x[i] - cloth.px[i]) + Math.abs(cloth.y[i] - cloth.py[i]) + Math.abs(cloth.z[i] - cloth.pz[i]);
    if (m > motion) motion = m;
  }
  project(cloth);
  return motion;
}
