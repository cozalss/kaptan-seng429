// A small pinhole camera for the ink scene: world points (y up) → canvas pixels. The frame is kept
// on an object and rewritten in place (the renderer projects ~1 000 points a frame, no garbage).

/**
 * @returns {{ right: number[], up: number[], forward: number[], eye: number[], focal: number, cx: number, cy: number }}
 */
export function createFrame() {
  return { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1], eye: [0, 0, 10], focal: 800, cx: 0, cy: 0 };
}

/**
 * Orbit camera around `target`: yaw about the vertical axis, pitch looking down (radians).
 * `focal` is in pixels (the scale of one world unit at distance 1); cx, cy are the image centre.
 * @param {ReturnType<typeof createFrame>} frame
 */
export function aimFrame(frame, { target, yaw, pitch, distance, focal, cx, cy }) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const sy = Math.sin(yaw);
  const cyw = Math.cos(yaw);
  // Eye on a sphere around the target; forward points from the eye to the target.
  frame.eye[0] = target[0] + sy * cp * distance;
  frame.eye[1] = target[1] + sp * distance;
  frame.eye[2] = target[2] + cyw * cp * distance;
  frame.forward[0] = -sy * cp;
  frame.forward[1] = -sp;
  frame.forward[2] = -cyw * cp;
  frame.right[0] = cyw;
  frame.right[1] = 0;
  frame.right[2] = -sy;
  // up = right × forward
  frame.up[0] = frame.right[1] * frame.forward[2] - frame.right[2] * frame.forward[1];
  frame.up[1] = frame.right[2] * frame.forward[0] - frame.right[0] * frame.forward[2];
  frame.up[2] = frame.right[0] * frame.forward[1] - frame.right[1] * frame.forward[0];
  frame.focal = focal;
  frame.cx = cx;
  frame.cy = cy;
  return frame;
}

/**
 * Projects a world point into `out` = [x px, y px, depth, pixels per world unit at that depth].
 * Points behind the eye get depth ≤ 0 (callers skip them).
 */
export function project(frame, x, y, z, out) {
  const dx = x - frame.eye[0];
  const dy = y - frame.eye[1];
  const dz = z - frame.eye[2];
  const depth = dx * frame.forward[0] + dy * frame.forward[1] + dz * frame.forward[2];
  const s = depth > 1e-4 ? frame.focal / depth : 0;
  out[0] = frame.cx + (dx * frame.right[0] + dy * frame.right[1] + dz * frame.right[2]) * s;
  out[1] = frame.cy - (dx * frame.up[0] + dy * frame.up[1] + dz * frame.up[2]) * s;
  out[2] = depth;
  out[3] = s;
  return out;
}
