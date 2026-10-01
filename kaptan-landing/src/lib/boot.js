// Small, framework-free helpers for a boot sequence that must never leave the page broken.

/**
 * Runs one boot step in isolation: a throw is logged and swallowed so the next step still runs.
 * @template T
 * @param {string} label
 * @param {() => T} step
 * @returns {T | undefined}
 */
export function attempt(label, step) {
  try {
    return step();
  } catch (error) {
    console.error(`[kaptan] ${label} failed`, error);
    return undefined;
  }
}

/** Trailing-edge debounce; `cancel()` drops a pending call. */
export function debounce(fn, waitMs) {
  let timer = 0;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/**
 * The element a deep link names (`#olaylar` → the section), or null: no hash, an agent detail
 * (`#ajan-…`, opened by the overlay instead) or an id that is not on the page.
 */
export function chapterFromHash(hash, doc = document) {
  if (typeof hash !== 'string' || hash.length < 2 || hash.startsWith('#ajan-')) return null;
  try {
    return doc.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

/** Toggles `inert` (property and attribute) on every element given; nulls are skipped. */
export function setInert(elements, isInert) {
  elements.forEach((element) => {
    if (!element) return;
    element.inert = isInert;
    element.toggleAttribute('inert', isInert);
  });
}

/**
 * Once the intro is over, lets lazy images marked data-lazy-warm load right away (off-screen
 * cards of the pinned track are clipped, so the browser would otherwise fetch them mid-travel).
 */
export function warmLazyImages(root = document) {
  root.querySelectorAll('img[data-lazy-warm][loading="lazy"]').forEach((image) => {
    image.setAttribute('loading', 'eager');
  });
}

/**
 * Gives the main thread back between boot steps so input and paint can run (no long boot task).
 * scheduler.yield() where supported (keeps the continuation's priority), otherwise a macrotask.
 */
export function yieldToMain(scope = globalThis) {
  if (typeof scope.scheduler?.yield === 'function') return scope.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Resolves after the next frame has been painted (rAF, then a macrotask past the paint). */
export function afterNextPaint(scope = globalThis) {
  if (typeof scope.requestAnimationFrame !== 'function') return yieldToMain(scope);
  return new Promise((resolve) => scope.requestAnimationFrame(() => setTimeout(resolve, 0)));
}
