import { pictureSet } from './responsive-images.js';

/**
 * Builds a decorative <picture> (AVIF/WebP sources + JPEG fallback) for one generated image set.
 * @param {string} name   image set, e.g. "yolculuk-3"
 * @param {{ sizes: string, className?: string, lazy?: boolean, width?: number, height?: number }} options
 * @returns {{ picture: HTMLPictureElement, image: HTMLImageElement }}
 */
export function buildPicture(name, { sizes, className = '', lazy = true, width, height }) {
  const { sources, img } = pictureSet(name);
  const picture = document.createElement('picture');
  sources.forEach(({ type, srcset }) => {
    const source = document.createElement('source');
    Object.assign(source, { type, srcset, sizes });
    picture.append(source);
  });
  const image = document.createElement('img');
  Object.assign(image, { alt: '', src: img.src, srcset: img.srcset, sizes });
  if (className) image.className = className;
  if (width && height) Object.assign(image, { width, height });
  image.decoding = 'async';
  if (lazy) image.setAttribute('loading', 'lazy');
  picture.append(image);
  return { picture, image };
}
