// Paper in the ink scenes is drawn as affine-mapped sprites: a flat quad in the world is projected
// through the pinhole camera by its centre and two half-axis vectors, and the three projected points
// give the canvas transform (a, b, c, d, x, y) that maps the sprite's [-1, 1]² square onto it.
// Perspective within one small quad is ignored — at the size of a slip it cannot be seen.

import { project } from './camera.js';

/**
 * Screen affine of a world quad given by its centre and two half-axis vectors (x → a, y ↓ → -b):
 * writes a, b, c, d, x, y, depth at out[o…o+6] (CSS px). Allocation-free.
 */
export function writeQuadAffine(frame, cx, cy, cz, ax, ay, az, bx, by, bz, tmp, out, o) {
  project(frame, cx, cy, cz, tmp);
  const px = tmp[0];
  const py = tmp[1];
  out[o + 4] = px;
  out[o + 5] = py;
  out[o + 6] = tmp[2];
  project(frame, cx + ax, cy + ay, cz + az, tmp);
  out[o] = tmp[0] - px;
  out[o + 1] = tmp[1] - py;
  project(frame, cx + bx, cy + by, cz + bz, tmp);
  out[o + 2] = px - tmp[0];
  out[o + 3] = py - tmp[1];
  return out;
}

/** Screen transform of one card: centre + the two half-axis vectors (CSS px). */
export function writeCardTransform(frame, cx, cy, cz, yaw, tilt, roll, halfW, halfH, tmp, out, o) {
  const { right: R, up: U, forward: F } = frame;
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  // unrolled local axes (face the camera, then yaw / tilt toward its forward axis)
  const xx = cyw * R[0] + syw * F[0];
  const xy = cyw * R[1] + syw * F[1];
  const xz = cyw * R[2] + syw * F[2];
  const yx = ct * U[0] + st * F[0];
  const yy = ct * U[1] + st * F[1];
  const yz = ct * U[2] + st * F[2];
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const ax = (cr * xx + sr * yx) * halfW;
  const ay = (cr * xy + sr * yy) * halfW;
  const az = (cr * xz + sr * yz) * halfW;
  const bx = (-sr * xx + cr * yx) * halfH;
  const by = (-sr * xy + cr * yy) * halfH;
  const bz = (-sr * xz + cr * yz) * halfH;
  writeQuadAffine(frame, cx, cy, cz, ax, ay, az, bx, by, bz, tmp, out, o);
}
