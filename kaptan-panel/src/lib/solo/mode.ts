/**
 * Single-user mode ("Benim KAPtan'ım"): one person does everything, signs in with one
 * password and lands on one simple home instead of the four-role desk.
 *  - mock: on when NEXT_PUBLIC_SINGLE_USER=true (build-time);
 *  - http: on when the env says so or GET /api/v1/health answers `single_user: true`
 *    (see mode.server.ts).
 * No imports on purpose: the route guard (proxy.ts) reads this on the edge.
 */
export const SINGLE_USER_ENV = process.env.NEXT_PUBLIC_SINGLE_USER === "true";

/** The simple home. */
export const SOLO_HOME = "/benim";

/** The full desk ("Gelişmiş görünüm"). */
export const FULL_PANEL_HOME = "/bugun";

/** Reads `single_user` from a /health body; anything else is "no". */
export function singleUserFromHealth(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { single_user?: unknown }).single_user === true;
}
