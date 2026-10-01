// The page turn that closes Bölüm 2: the chart spread's left-hand leaf starts closed, lying over
// the right-hand page with its back (the chapter plate) up, and turns over the gutter onto the
// left, opening the double page. Scrubbed by the pinned timeline through `state.progress`.
// Pure maths in `leafFrame` (unit tested); the DOM side only writes one transform and two shades.

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

// How dark a face gets when it stands edge-on to the light (0 = no shade).
const MAX_SHADE = 0.42;

/**
 * The leaf for a turn `progress` (0 closed, 1 open): its rotation about the gutter (180° lying on
 * the right page → 0° flat on the left; it passes 90°, standing up towards the reader) and how
 * much each face is shaded (a page in shadow as it stands up, clean when it lies flat).
 */
export function leafFrame(progress) {
  const p = clamp01(progress);
  const angle = 180 * (1 - p);
  // 0 flat, 1 standing (rounded: sin 180° is 1e-16, not 0)
  const lift = Math.round(Math.sin((angle * Math.PI) / 180) * 1e6) / 1e6;
  return {
    angle,
    front: angle < 90 ? MAX_SHADE * lift : 0,
    back: angle > 90 ? MAX_SHADE * lift : 0,
    // the page underneath darkens a little at the gutter while the leaf is up
    cast: 0.5 * MAX_SHADE * lift,
  };
}

/**
 * @param {{ leaf: HTMLElement, book: HTMLElement }} options
 * @returns {{ state: { progress: number }, apply: () => void, destroy: () => void }}
 */
export function createPageTurn({ leaf, book }) {
  const state = { progress: 0 };
  const apply = () => {
    const frame = leafFrame(state.progress);
    leaf.style.transform = `rotateY(${frame.angle.toFixed(2)}deg)`;
    book.style.setProperty('--shade-front', frame.front.toFixed(3));
    book.style.setProperty('--shade-back', frame.back.toFixed(3));
    book.style.setProperty('--shade-cast', frame.cast.toFixed(3));
    book.classList.toggle('is-closed', state.progress <= 0);
  };
  apply();
  return {
    state,
    apply,
    destroy() {
      leaf.style.removeProperty('transform');
      ['--shade-front', '--shade-back', '--shade-cast'].forEach((name) => book.style.removeProperty(name));
      book.classList.remove('is-closed');
    },
  };
}
