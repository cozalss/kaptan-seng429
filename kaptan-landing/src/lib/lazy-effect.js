// Starts a decorative effect from a lazily imported chunk and hands back a synchronous destroy, so
// gsap.matchMedia can tear it down even while the chunk is still downloading.

/**
 * @template M
 * @param {() => Promise<M>} load         dynamic import
 * @param {(module: M) => (() => void) | { destroy: () => void } | void} start
 * @param {string} label                  for the warning when the effect cannot start
 * @returns {() => void} destroy (idempotent)
 */
export function lazyEffect(load, start, label) {
  let cleanup = null;
  let cancelled = false;
  const run = (handle) => {
    if (typeof handle === 'function') handle();
    else handle?.destroy?.();
  };

  Promise.resolve()
    .then(load)
    .then((module) => {
      if (cancelled) return;
      cleanup = start(module) ?? null;
    })
    .catch((error) => {
      // Decorative only: the static page stays intact.
      console.warn(`[kaptan] effect "${label}" unavailable`, error);
    });

  return () => {
    cancelled = true;
    const handle = cleanup;
    cleanup = null;
    run(handle);
  };
}
