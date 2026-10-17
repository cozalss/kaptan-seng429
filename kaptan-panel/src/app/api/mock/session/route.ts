import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { passphraseMatches } from "@/lib/auth/passphrase";
import { decodeSession, encodeSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/session";
import { DEFAULT_ROLE, LoginRequest, memberForRole, Role } from "@/lib/domain/user";
import { HOME, safeNext } from "@/lib/nav";

/**
 * Mock session endpoints (mock mode only):
 *   POST   → sign in with the demo passphrase → session cookie, starting as the chosen account's role
 *            (`role`) or Risk Sorumlusu
 *   PUT    → switch to another team account (the top bar's account menu)
 *   DELETE → sign out
 * In http mode these return 404: auth goes to FastAPI /api/v1/auth/*.
 */
const IS_HTTP = process.env.NEXT_PUBLIC_API_MODE === "http";

const RoleBody = z.object({ role: Role });

const notFound = () => NextResponse.json({ detail: "Yok" }, { status: 404 });

function withSession(res: NextResponse, role: Role): NextResponse {
  const m = memberForRole(role);
  res.cookies.set(SESSION_COOKIE, encodeSession({ uid: m.uid, name: m.name, role, iat: Date.now() }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

export async function POST(request: NextRequest) {
  if (IS_HTTP) return notFound();
  const body = LoginRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ detail: "Parola doğrulanamadı." }, { status: 400 });
  if (!passphraseMatches(body.data.passphrase)) return NextResponse.json({ detail: "Parola doğrulanamadı." }, { status: 401 });
  const redirect = safeNext(body.data.next) ?? HOME;
  const role = body.data.role ?? DEFAULT_ROLE;
  const m = memberForRole(role);
  return withSession(NextResponse.json({ redirect, user: { uid: m.uid, name: m.name, role } }), role);
}

export async function PUT(request: NextRequest) {
  if (IS_HTTP) return notFound();
  if (!decodeSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.json({ detail: "Oturum bulunamadı." }, { status: 401 });
  const body = RoleBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ detail: "Geçersiz rol." }, { status: 400 });
  const m = memberForRole(body.data.role);
  return withSession(NextResponse.json({ user: { uid: m.uid, name: m.name, role: body.data.role } }), body.data.role);
}

export async function DELETE() {
  if (IS_HTTP) return notFound();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
