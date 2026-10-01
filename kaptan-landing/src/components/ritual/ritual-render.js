import { IMAGE_SETS } from '../../lib/responsive-images.js';
import { buildPicture } from '../../lib/picture.js';

// "Bölüm 4 · Rota": each waypoint's plate is an inked frame inside its caption panel (about 250px
// wide on desktop, the panel's width at mid sizes, the column's width on phones).
export const RITUAL_IMAGE_SIZES = '(min-width: 1200px) 290px, (min-width: 768px) 42vw, 86vw';

/** Start fetching the plates this far before the chapter scrolls in (one viewport). */
export const WARM_MARGIN = '100% 0px 100% 0px';

/** Hides a lazy image until it has loaded (or failed), then lets CSS fade it in. */
export function fadeInOnLoad(image) {
  if (!image) return;
  const done = () => {
    image.classList.remove('is-loading');
    image.classList.add('is-loaded');
  };
  if (image.complete && image.naturalWidth > 0) {
    done();
    return;
  }
  image.classList.add('is-loading');
  image.addEventListener('load', done, { once: true });
  image.addEventListener('error', done, { once: true });
}

/**
 * Native lazy loading waits until a plate is almost on screen, so it arrived empty. Once the
 * chapter is a viewport away, every plate is asked for at once (eager), like the Tayfa portraits.
 * @returns {() => void} stop watching
 */
export function warmRitualImages(root, win = window) {
  const images = () => [...(root?.querySelectorAll('[data-ritual-media] img[loading="lazy"]') ?? [])];
  const warm = () => images().forEach((image) => image.setAttribute('loading', 'eager'));
  if (!root || images().length === 0) return () => {};
  if (!('IntersectionObserver' in win)) {
    warm();
    return () => {};
  }
  const observer = new win.IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      warm();
    },
    { rootMargin: WARM_MARGIN },
  );
  observer.observe(root);
  return () => observer.disconnect();
}

/** Fills every [data-ritual-media="<image set>"] with its responsive picture (idempotent), then warms them. */
export function renderRitualImages(root) {
  if (!root) return;
  root.querySelectorAll('[data-ritual-media]').forEach((media) => {
    const name = media.dataset.ritualMedia;
    if (!Object.hasOwn(IMAGE_SETS, name) || media.querySelector('picture')) return;
    const { picture, image } = buildPicture(name, { sizes: RITUAL_IMAGE_SIZES, className: 'rota-leg__image', width: 900, height: 1200 });
    fadeInOnLoad(image);
    media.prepend(picture);
  });
  warmRitualImages(root);
}
