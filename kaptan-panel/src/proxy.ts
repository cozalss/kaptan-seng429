import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/nav";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { SINGLE_USER_ENV } from "@/lib/solo/mode";
import { homeFor, parseView, VIEW_COOKIE } from "@/lib/solo/view-pref";

/**
 * Route guard (Next 16 `proxy`, formerly middleware). Personal mode: one user, no roles —
 * the only question is "signed in or not".
 * mock: the session cookie → signed-out users go to /login?next=…; a signed-in user who opens
 *       /login or a role door (/login/<rol>) goes to the view they used last (the `kaptan_view`
 *       cookie: /benim or /bugun), else /bugun, or /benim in single-user mode. /benim itself is open
 *       to every signed-in team member; explicit paths are never rerouted by the remembered view.
 * http: only the presence of the refresh cookie is checked here; the API owns the session.
 * "/" is the public landing (rewritten to the static /index.html) and its files are excluded
 * by the matcher below, so the landing never needs a session.
 */
const IS_HTTP = process.env.NEXT_PUBLIC_API_MODE === "http";
/** The API names its refresh cookie `__Host-kaptan_rt`, or `kaptan_rt` on a plain-http host (COOKIE_SECURE=false). */
const REFRESH_COOKIES = ["__Host-kaptan_rt", "kaptan_rt"] as const;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/") return NextResponse.next();
  const isPublic = isPublicPath(pathname);
  const signedIn = IS_HTTP ? REFRESH_COOKIES.some((name) => request.cookies.has(name)) : decodeSession(request.cookies.get(SESSION_COOKIE)?.value) !== null;

  if (!signedIn) return isPublic ? NextResponse.next() : redirectToLogin(request, pathname + search);
  if (isPublic && !IS_HTTP) {
    const view = parseView(request.cookies.get(VIEW_COOKIE)?.value);
    return NextResponse.redirect(new URL(homeFor(view, SINGLE_USER_ENV), request.url));
  }
  return NextResponse.next();
}

function redirectToLogin(request: NextRequest, next: string) {
  const url = new URL("/login", request.url);
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, the mock session API, the backend API (http mode: /api/v1/* is
  // rewritten to FastAPI, which owns its own auth; redirecting it to /login would break sign-in), and static
  // files (the landing's and the crew portraits).
  matcher: ["/((?!_next/static|_next/image|api/mock|api/v1/|icon.svg|favicon.ico|favicon.svg|index.html|assets/|images/|fonts/|crew/|.*\.(?:png|jpg|jpeg|webp|avif|svg|woff2|txt)$).*)"],
};
