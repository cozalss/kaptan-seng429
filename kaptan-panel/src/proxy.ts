import { NextResponse, type NextRequest } from "next/server";
import { HOME, PUBLIC_PATHS } from "@/lib/nav";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Route guard (Next 16 `proxy`, formerly middleware). Personal mode: one user, no roles —
 * the only question is "signed in or not".
 * mock: the session cookie → signed-out users go to /login?next=…; a signed-in user who opens
 *       /login goes to the panel home (/bugun).
 * http: only the presence of the refresh cookie is checked here; the API owns the session.
 * "/" is the public landing (rewritten to the static /index.html) and its files are excluded
 * by the matcher below, so the landing never needs a session.
 */
const IS_HTTP = process.env.NEXT_PUBLIC_API_MODE === "http";
const REFRESH_COOKIE = "__Host-kaptan_rt";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/") return NextResponse.next();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const signedIn = IS_HTTP ? request.cookies.has(REFRESH_COOKIE) : decodeSession(request.cookies.get(SESSION_COOKIE)?.value) !== null;

  if (!signedIn) return isPublic ? NextResponse.next() : redirectToLogin(request, pathname + search);
  if (isPublic && !IS_HTTP) return NextResponse.redirect(new URL(HOME, request.url));
  return NextResponse.next();
}

function redirectToLogin(request: NextRequest, next: string) {
  const url = new URL("/login", request.url);
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, the mock session API, and static files (the landing's and the crew portraits).
  matcher: ["/((?!_next/static|_next/image|api/mock|icon.svg|favicon.ico|favicon.svg|index.html|assets/|images/|fonts/|crew/|.*\.(?:png|jpg|jpeg|webp|avif|svg|woff2|txt)$).*)"],
};
