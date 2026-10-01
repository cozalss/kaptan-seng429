// One source of truth for the generated image variants: the build scripts write exactly these
// files and the page asks for exactly these files.

export const GENERATED_DIR = '/images/generated';

/** Output formats, best first. The last one is the universal <img> fallback. */
export const IMAGE_FORMATS = Object.freeze([
  Object.freeze({ ext: 'avif', type: 'image/avif' }),
  Object.freeze({ ext: 'webp', type: 'image/webp' }),
  Object.freeze({ ext: 'jpg', type: 'image/jpeg' }),
]);

/** Agent cards: 3:4, clamp(160px, 14.6vw, 290px) wide (52vw on phones). */
const AGENT_WIDTHS = Object.freeze([400, 600, 800]);

/**
 * Journey step windows: ≈ 62vh wide pinned (×1.18 zoom-in), so 2× screens need 1600w at 1080p and
 * 2000w at 1440p; 600/900 cover the stacked tablet/phone layout (45vw / 72vw).
 */
const JOURNEY_WIDTHS = Object.freeze([600, 900, 1200, 1600, 2000]);

const numbered = (prefix, count, widths) =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [`${prefix}-${index + 1}`, widths]));

/**
 * Variants per generated image set (all written by scripts/build-kaptan-visuals.mjs; agents are
 * 1200px originals, journey steps 2000px).
 */
export const IMAGE_SETS = Object.freeze({
  harita: Object.freeze([1280, 1920]),
  ...numbered('ajan', 8, AGENT_WIDTHS),
  ...numbered('yolculuk', 4, JOURNEY_WIDTHS),
});

const NAME_PATTERN = /^[a-z0-9-]+$/;

/** "/images/ajan-1.jpg" → "ajan-1"; null when the path is not a known image set. */
export function imageNameFromPath(path) {
  if (typeof path !== 'string') return null;
  const match = /\/images\/([a-z0-9-]+)\.(?:jpe?g|png)$/i.exec(path);
  const name = match?.[1];
  return name && Object.hasOwn(IMAGE_SETS, name) ? name : null;
}

/** Public URL of one generated variant. */
export function variantPath(name, width, ext) {
  if (!NAME_PATTERN.test(name)) throw new TypeError(`variantPath: invalid image name "${name}"`);
  if (!Number.isInteger(width) || width <= 0) throw new TypeError('variantPath: width must be a positive integer');
  return `${GENERATED_DIR}/${name}-${width}.${ext}`;
}

function widthsFor(name) {
  const widths = IMAGE_SETS[name];
  if (!widths) throw new RangeError(`Unknown image set "${name}"`);
  return widths;
}

/** "…-400.avif 400w, …-600.avif 600w, …" for one format. */
export function buildSrcset(name, ext) {
  return widthsFor(name)
    .map((width) => `${variantPath(name, width, ext)} ${width}w`)
    .join(', ');
}

/**
 * Everything a <picture> needs: modern <source>s plus the JPEG <img> fallback
 * (`src` is the middle width, a sane default for browsers without srcset).
 * @returns {{sources: {type: string, srcset: string}[], img: {src: string, srcset: string}}}
 */
export function pictureSet(name) {
  const widths = widthsFor(name);
  const [fallback] = IMAGE_FORMATS.slice(-1);
  const middle = widths[Math.floor((widths.length - 1) / 2)];
  return {
    sources: IMAGE_FORMATS.slice(0, -1).map(({ ext, type }) => ({ type, srcset: buildSrcset(name, ext) })),
    img: { src: variantPath(name, middle, fallback.ext), srcset: buildSrcset(name, fallback.ext) },
  };
}
