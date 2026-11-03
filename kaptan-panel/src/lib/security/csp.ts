/**
 * The Content-Security-Policy: what the app actually loads, nothing else. Everything is
 * same-origin: Next's scripts and chunks, the self-hosted fonts, the API and its event streams
 * (the /api/v1 rewrite). Styles need 'unsafe-inline': React writes `style` attributes during
 * server rendering and sonner adds a <style>; a nonce there would switch that keyword off.
 */
const COMMON: readonly string[] = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

/** For the app's pages (src/proxy.ts): Next puts this nonce on its own scripts. Dev adds what React's dev build and HMR use. */
export function appCsp(nonce: string, isDev: boolean): string {
  return [`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`, `connect-src 'self'${isDev ? " ws:" : ""}`, ...COMMON].join("; ");
}

/**
 * For the landing: a static file, so it cannot carry a nonce and needs none. Its only scripts are
 * the same-origin bundle and a JSON-LD data block, which CSP does not treat as a script to run.
 */
export const LANDING_CSP: string = ["script-src 'self'", "connect-src 'self'", ...COMMON].join("; ");

/** A fresh nonce per request (works in the proxy's runtime and in tests). */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
