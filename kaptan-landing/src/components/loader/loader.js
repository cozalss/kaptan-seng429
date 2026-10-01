import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

gsap.registerPlugin(DrawSVGPlugin);

// The loader is seen now that the hero shader compiles off the main thread (sea-renderer.js):
// it plays one short, fixed performance — the ring draws itself, the needle swings and settles
// north — and never holds the page longer than MAX_WAIT_MS.
export const MAX_WAIT_MS = 700;
export const MIN_SHOW_MS = 600;
export const FONT_WAIT_MS = 300;
// The hero headline face (Bodoni display roman): the only font the first frame depends on.
const HERO_FONTS = ['400 1em "Bodoni Moda Display"'];
const READY_MESSAGE = 'Sayfa hazır';
const DRAW_EASE = { duration: 0.5, ease: 'power2.out' };
// The compass needle swings from side to side while the page loads, each swing smaller, and settles
// on north once everything is in.
export const NEEDLE_SWING_DEG = 38;
const NEEDLE_PIVOT = '30 32';
const NEEDLE_SWING = { duration: 0.55, ease: 'sine.inOut' };
const NEEDLE_SETTLE = { duration: 0.9, ease: 'elastic.out(1, 0.35)' };

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Settles once the image is loaded and decoded (or failed): the first frame never shows a half-painted hero. */
export function whenImageSettles(image) {
  const loaded = image.complete
    ? Promise.resolve()
    : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
  return loaded.then(() => (typeof image.decode === 'function' ? image.decode().catch(() => {}) : undefined));
}

/**
 * Settles once the hero headline font is loaded, or after `timeoutMs` (font-display: swap covers
 * a late font). Never waits on every font of the page like document.fonts.ready does.
 */
export function whenHeroFontSettles(fonts = document.fonts, timeoutMs = FONT_WAIT_MS) {
  if (typeof fonts?.load !== 'function') return Promise.resolve();
  const loads = Promise.all(HERO_FONTS.map((font) => fonts.load(font))).catch(() => {});
  return Promise.race([loads, delay(timeoutMs)]).then(() => undefined);
}

/** Draws the compass ring of the loader wordmark in step with loading progress. */
function createRingDrawer(ring, animate) {
  if (!ring) return () => {};
  gsap.set(ring, { drawSVG: '0% 0%' });
  return (ratio) =>
    gsap.to(ring, {
      drawSVG: `0% ${(ratio * 100).toFixed(1)}%`,
      ...DRAW_EASE,
      duration: animate ? DRAW_EASE.duration : 0,
      overwrite: true,
    });
}

/**
 * Needle angle (degrees, 0 = north) for a loading `ratio` at update number `step`: alternating
 * sides with an amplitude that shrinks as loading progresses; exactly north once done.
 */
export function needleAngle(ratio, step) {
  const r = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  if (r >= 1) return 0;
  const side = step % 2 === 0 ? 1 : -1;
  return side * NEEDLE_SWING_DEG * (1 - r);
}

/** Swings the compass needle of the loader mark toward north in step with loading progress. */
function createNeedleSwinger(needle, animate) {
  if (!needle) return () => {};
  let step = 0;
  return (ratio) => {
    const rotation = needleAngle(ratio, step);
    step += 1;
    const ease = rotation === 0 ? NEEDLE_SETTLE : NEEDLE_SWING;
    // svgOrigin: the dial's centre in viewBox units (GSAP ignores CSS transform-origin on SVG).
    return gsap.to(needle, { rotation, svgOrigin: NEEDLE_PIVOT, ...ease, duration: animate ? ease.duration : 0, overwrite: true });
  };
}

/** Needle swings of the loader performance: [angle°, seconds]; the last one settles on north. */
export const NEEDLE_PERFORMANCE = Object.freeze([
  [NEEDLE_SWING_DEG, 0.13],
  [-NEEDLE_SWING_DEG * 0.55, 0.15],
  [NEEDLE_SWING_DEG * 0.25, 0.12],
  [0, 0.2],
]);

/**
 * The loader's fixed performance (MIN_SHOW_MS long): the ring draws itself from north round the
 * dial while the needle swings, each swing smaller, and settles on north as the ring closes.
 */
function playPerformance(ring, needle) {
  const tl = gsap.timeline();
  if (ring) tl.fromTo(ring, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: MIN_SHOW_MS / 1000, ease: 'power2.inOut' }, 0);
  if (needle) {
    let at = 0;
    NEEDLE_PERFORMANCE.forEach(([rotation, duration], index) => {
      const last = index === NEEDLE_PERFORMANCE.length - 1;
      tl.to(needle, { rotation, svgOrigin: NEEDLE_PIVOT, duration, ease: last ? 'back.out(2.2)' : 'sine.inOut' }, at);
      at += duration;
    });
  }
  return tl;
}

/** Critical images: the ones marked data-loader-critical (the hero), never below-the-fold media. */
export function criticalImages(root = document) {
  return [...root.querySelectorAll('img[data-loader-critical]')];
}

/**
 * Shows loading progress for the critical images and the hero headline font (bar, count, the compass ring
 * drawing itself and its needle settling on north). Resolves once everything settled and (animated)
 * the MIN_SHOW_MS performance has played, or after MAX_WAIT_MS so a slow asset never blocks
 * the page. The visible count is aria-hidden; `status` (a live region outside the loader) is
 * announced once, "Sayfa hazır", when loading ends. Hiding the loader is left to the intro.
 */
export function runLoader({ root, images, status = null, animate = true }) {
  const bar = root.querySelector('[data-loader-bar]');
  const count = root.querySelector('[data-loader-count]');
  const ring = root.querySelector('[data-loader-ring]');
  const needle = root.querySelector('[data-loader-needle]');
  // Animated: the fixed performance draws the dial. Otherwise the dial simply follows progress.
  const show = animate ? playPerformance(ring, needle) : null;
  const drawRing = show ? () => {} : createRingDrawer(ring, false);
  const swingNeedle = show ? () => {} : createNeedleSwinger(needle, false);
  const tasks = [...images.map(whenImageSettles), whenHeroFontSettles()];
  const total = tasks.length;
  let done = 0;

  const update = () => {
    if (count) count.textContent = `${done}/${total}`;
    if (bar) bar.style.transform = `scaleX(${done / total})`;
    drawRing(done / total);
    swingNeedle(done / total);
  };
  update();

  const tracked = tasks.map((task) =>
    task.then(() => {
      done += 1;
      update();
    }),
  );
  const timeout = delay(MAX_WAIT_MS);
  const shown = show ? delay(MIN_SHOW_MS) : Promise.resolve();
  return Promise.race([Promise.all([...tracked, shown]), timeout]).then(() => {
    show?.progress(1);
    if (status) status.textContent = READY_MESSAGE;
  });
}

/** Quick exit (repeat visits, reduced motion, failures): a short CSS fade. */
export function hideLoader(root) {
  if (!root) return;
  root.classList.add('is-done');
  root.setAttribute('aria-hidden', 'true');
}
