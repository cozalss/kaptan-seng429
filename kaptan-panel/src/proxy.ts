import { NextResponse, type NextRequest } from "next/server";
import { HOME, isPublicPath, SITE_ONLY_PATH } from "@/lib/nav";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { appCsp, newNonce } from "@/lib/security/csp";

/**
 * Route guard and CSP (Next 16 `proxy`, formerly middleware).
 * The public website (no API at build): every path but the landing is the one honest page.
 * A real build: only the presence of the refresh cookie is checked here; the API owns the session.
 * The test double: its session cookie; a signed-in person who opens /login goes home.
 * "/" is the public landing (rewritten to the static /index.html, its CSP in next.config.ts) and its
 * files are excluded by the matcher below, so the landing never needs a session.
 */
const IS_MOCK = process.env.NEXT_PUBLIC_KAPTAN_TEST_DOUBLE === "1";
const SITE_ONLY = process.env.NEXT_PUBLIC_KAPTAN_SITE_ONLY === "1";
const IS_DEV = process.env.NODE_ENV === "development";
/** The API names its refresh cookie `__Host-kaptan_rt`, or `kaptan_rt` on a plain-http host (COOKIE_SECURE=false). */
const REFRESH_COOKIES = ["__Host-kaptan_rt", "kaptan_rt"] as const;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/") return NextResponse.next();

  const csp = appCsp(newNonce(), IS_DEV);
  const headers = new Headers(request.headers);
  // Next reads the nonce from this request header and puts it on its scripts.
  headers.set("Content-Security-Policy", csp);
  const secured = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  if (SITE_ONLY) return secured(NextResponse.rewrite(new URL(SITE_ONLY_PATH, request.url), { request: { headers } }));

  const isPublic = isPublicPath(pathname);
  const signedIn = IS_MOCK ? decodeSession(request.cookies.get(SESSION_COOKIE)?.value) !== null : REFRESH_COOKIES.some((name) => request.cookies.has(name));

  if (!signedIn && !isPublic) return redirectToLogin(request, pathname + search);
  if (signedIn && isPublic && IS_MOCK) return NextResponse.redirect(new URL(HOME, request.url));
  return secured(NextResponse.next({ request: { headers } }));
}

function redirectToLogin(request: NextRequest, next: string) {
  const url = new URL("/login", request.url);
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, the test double's session API, the backend API (/api/v1/* is
  // rewritten to FastAPI, which owns its own auth; redirecting it to /login would break sign-in), and static
  // files (the landing's and the crew portraits).
  matcher: ["/((?!_next/static|_next/image|api/mock|api/v1/|icon.svg|favicon.ico|favicon.svg|index.html|assets/|images/|fonts/|crew/|.*\.(?:png|jpg|jpeg|webp|avif|svg|woff2|txt)$).*)"],
};
