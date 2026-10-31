import { FULL_PANEL_HOME, SOLO_HOME } from "./mode";

/**
 * Which view the person last used: the personal home ("benim", /benim) or the full desk
 * ("masa", /bugun). Kept in a plain cookie so the route guard and the sign-in can send them
 * back where they were. It only picks the *default* landing: an explicit path (a role route,
 * ?next=) always wins. Edge-safe: no imports beyond mode.ts.
 */
export const VIEW_COOKIE = "kaptan_view";
export type View = "benim" | "masa";

/** A year: the choice is a preference of this browser, not a session. */
const VIEW_MAX_AGE_S = 60 * 60 * 24 * 365;

export function parseView(value: string | null | undefined): View | null {
  return value === "benim" || value === "masa" ? value : null;
}

/** The landing for a remembered view; with none, single-user mode opens /benim and the desk /bugun. */
export function homeFor(view: View | null, singleUser: boolean): string {
  if (view === "benim") return SOLO_HOME;
  if (view === "masa") return FULL_PANEL_HOME;
  return singleUser ? SOLO_HOME : FULL_PANEL_HOME;
}

/** Reads the view from a `document.cookie` string. */
export function viewFromCookieString(cookie: string): View | null {
  const hit = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${VIEW_COOKIE}=`));
  return parseView(hit?.slice(VIEW_COOKIE.length + 1));
}

/** Browser only: the remembered view (null on the server or when none is kept). */
export function readView(): View | null {
  return typeof document === "undefined" ? null : viewFromCookieString(document.cookie);
}

/** Browser only: remember the view the person is on now. */
export function rememberView(view: View): void {
  if (typeof document === "undefined") return;
  document.cookie = `${VIEW_COOKIE}=${view}; Path=/; Max-Age=${VIEW_MAX_AGE_S}; SameSite=Lax`;
}
