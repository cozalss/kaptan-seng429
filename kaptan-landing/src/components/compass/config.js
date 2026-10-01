// Viewport-dependent settings of the ink scene ("350'den 1'e") and the scroll progress read from
// layout. Pure: every browser value is passed in.

export const MAX_DPR = 1.5;
export const MAX_DPR_COMPACT = 2;
export const COMPACT_MAX_WIDTH = 767;
/** Slips in the funnel, the approved one included (the counter always reads 350: these are temsili). */
export const CARD_COUNT = Object.freeze({ wide: 300, compact: 140 });

/**
 * @param {{ width: number, dpr?: number }} viewport
 * @returns {{ compact: boolean, dpr: number, cards: number }}
 */
export function sceneSettings({ width, dpr = 1 }) {
  const compact = width <= COMPACT_MAX_WIDTH;
  const cap = compact ? MAX_DPR_COMPACT : MAX_DPR;
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    compact,
    dpr: Math.min(safeDpr, cap),
    cards: compact ? CARD_COUNT.compact : CARD_COUNT.wide,
  };
}

/**
 * Progress through a sticky section: 0 when its top meets the viewport top, 1 when its bottom
 * meets the viewport bottom (the stage is released).
 * @param {{ top: number, height: number }} rect   the section's bounding rect
 * @param {number} viewportHeight
 */
export function stickyProgress({ top, height }, viewportHeight) {
  const travel = height - viewportHeight;
  if (!(travel > 0)) return top <= 0 ? 1 : 0;
  return Math.min(Math.max(-top / travel, 0), 1);
}

/** Whether a 2D canvas can be had at all (jsdom and very old engines cannot). */
export function hasCanvas2D(doc = globalThis.document) {
  try {
    return Boolean(doc?.createElement('canvas').getContext?.('2d'));
  } catch {
    return false;
  }
}
