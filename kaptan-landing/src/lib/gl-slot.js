// The page keeps at most one live WebGL context: a new claim releases the previous holder first
// (browsers cap live contexts and every context pins its textures in GPU memory).

let holder = null;

/**
 * @param {() => void} release  tears the claimant's context down
 * @returns {() => void} give the slot back (no-op once someone else holds it)
 */
export function claimGLSlot(release) {
  if (holder && holder !== release) {
    const previous = holder;
    holder = null;
    previous();
  }
  holder = release;
  return () => {
    if (holder === release) holder = null;
  };
}

/** True while some effect holds the WebGL slot. */
export function isGLSlotTaken() {
  return holder !== null;
}
