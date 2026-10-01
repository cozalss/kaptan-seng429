// Social previews need absolute image URLs. index.html keeps site-relative paths (so dev works
// anywhere); the build rewrites them against SITE.url (see vite.config.js).

const META_IMAGE = /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")([^"]+)(")/g;

/**
 * @param {string} path - site-relative ("/images/x.jpg") or already absolute URL.
 * @param {string} base - the production origin, e.g. SITE.url.
 * @returns {string}
 */
export function toAbsoluteUrl(path, base) {
  return new URL(path, base).href;
}

/** Rewrites og:image / twitter:image contents in an HTML string to absolute URLs. */
export function absolutizeMetaImages(html, base) {
  if (typeof base !== 'string' || !/^https?:\/\//.test(base)) {
    throw new TypeError('absolutizeMetaImages: base must be an absolute http(s) URL');
  }
  return html.replace(META_IMAGE, (_match, open, path, close) => `${open}${toAbsoluteUrl(path, base)}${close}`);
}
