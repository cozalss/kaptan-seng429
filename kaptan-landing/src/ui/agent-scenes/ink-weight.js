// The style bridge's line weight: the plates are drawn at the size of the portraits now, and their
// hairlines (set in CSS px by each scene) would read thinner than the portraits' brush contours.
// The runtime weights every stroke a plate sets by a factor that grows with the plate's width,
// without touching the scenes or the shared ink kit: the plate's own 2D context gets a lineWidth
// accessor of its own (one multiply per set, nothing per pixel).

const BASE_WIDTH = 460; // plate width (CSS px) the scenes' line weights were drawn for
const MAX_WEIGHT = 1.4;

/** Stroke weight factor for a plate `width` CSS px wide: 1 up to the drawn size, ≤ 1.4. */
export function inkWeightFor(width) {
  if (!(width > 0)) return 1;
  return Math.min(Math.max(width / BASE_WIDTH, 1), MAX_WEIGHT);
}

/**
 * Makes every `ctx.lineWidth = v` on this context draw `v × weight()`; reading it back gives `v`.
 * @returns {() => void} undo
 */
export function weightLines(ctx, weight) {
  const proto = ctx && Object.getPrototypeOf(ctx);
  const own = proto && Object.getOwnPropertyDescriptor(proto, 'lineWidth');
  if (!own?.get || !own?.set) return () => {};
  Object.defineProperty(ctx, 'lineWidth', {
    configurable: true,
    get() {
      return own.get.call(this) / weight();
    },
    set(value) {
      own.set.call(this, value * weight());
    },
  });
  return () => {
    delete ctx.lineWidth;
  };
}
