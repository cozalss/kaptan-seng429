// A damped angular spring for the compass needle: it swings past its bearing once and settles,
// like a real card floating in liquid. Pure; the stage steps it once per frame.

/** Bearing from `from` to `to` in degrees, 0 = north (up the screen), clockwise positive. */
export function bearing(from, to) {
  return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
}

/** `target` moved by whole turns so it is the shortest way round from `current`. */
export function nearestTurn(current, target) {
  return current + ((((target - current) % 360) + 540) % 360) - 180;
}

/**
 * @param {{ stiffness?: number, damping?: number, angle?: number }} [options]
 *   Underdamped by default (one visible overshoot).
 */
export function createNeedleSpring({ stiffness = 90, damping = 9, angle = 0 } = {}) {
  const state = { angle, velocity: 0, target: angle };
  return {
    get angle() {
      return state.angle;
    },
    get target() {
      return state.target;
    },
    /** Aim at a bearing (degrees); takes the short way round. */
    aim(degrees) {
      state.target = nearestTurn(state.angle, degrees);
    },
    /** Advances `dt` seconds (semi-implicit Euler, sub-stepped so long frames stay stable). */
    step(dt) {
      let left = Math.min(Math.max(dt, 0), 0.1);
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        state.velocity += (stiffness * (state.target - state.angle) - damping * state.velocity) * h;
        state.angle += state.velocity * h;
        left -= h;
      }
      return state.angle;
    },
    /** True once it has come to rest on its target. */
    isSettled(epsilon = 0.05) {
      return Math.abs(state.target - state.angle) < epsilon && Math.abs(state.velocity) < epsilon;
    },
  };
}
