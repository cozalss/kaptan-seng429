import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath, homeFor, PUBLIC_PATHS } from "@/lib/auth/routes";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Route guards (Next 16 `proxy`, formerly middleware).
 * mock: the session cookie carries the role → unauthenticated users go to /login,
 *       roles without access go to /yetkisiz.
 * http: only the presence of the refresh cookie is checked here; roles are enforced by
 *       the API and by <RoleGate> (FRONTEND-SPEC §9 Ç-16).
 */
const IS_HTTP = process.env.NEXT_PUBLIC_API_MODE === "http";
const REFRESH_COOKIE = "__Host-kaptan_rt";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // "/" is the public landing page (rewritten to the static /index.html), open to everyone.
  if (pathname === "/") return NextResponse.next();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (IS_HTTP) {
    const has = request.cookies.has(REFRESH_COOKIE);
    if (!has && !isPublic) return redirectToLogin(request, pathname + search);
    return NextResponse.next();
  }

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (isPublic) return NextResponse.next();
    return redirectToLogin(request, pathname + search);
  }
  if (isPublic) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }
  if (!canAccessPath(session.role, pathname)) {
    const url = new URL("/yetkisiz", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function redirectToLogin(request: NextRequest, next: string) {
  const url = new URL("/login", request.url);
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, the mock session API, and static files (the landing's too).
  matcher: ["/((?!_next/static|_next/image|api/mock|icon.svg|favicon.ico|favicon.svg|index.html|assets/|images/|fonts/|.*\\.(?:png|jpg|svg|woff2|txt)$).*)"],
};
