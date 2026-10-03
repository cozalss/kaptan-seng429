import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accountForRole, authenticateDemo } from "@/lib/auth/accounts";
import { homeFor, safeNext } from "@/lib/auth/routes";
import { decodeSession, encodeSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/session";
import { Role } from "@/lib/domain/user";

/**
 * Mock session endpoints (mock mode only):
 *   POST   → log in with a seeded demo account
 *   PUT    → switch role (role switcher, mock only)
 *   DELETE → log out
 * In http mode these return 404: auth goes to FastAPI /api/v1/auth/*.
 */
const IS_HTTP = process.env.NEXT_PUBLIC_API_MODE === "http";

const LoginBody = z.object({ email: z.string().max(200), password: z.string().max(200), next: z.string().max(500).nullish() });
const SwitchBody = z.object({ role: Role });

function withSession(res: NextResponse, payload: Parameters<typeof encodeSession>[0]) {
  res.cookies.set(SESSION_COOKIE, encodeSession(payload), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

const notFound = () => NextResponse.json({ detail: "Yok" }, { status: 404 });

export async function POST(request: NextRequest) {
  if (IS_HTTP) return notFound();
  const body = LoginBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ detail: "Kimlik doğrulanamadı." }, { status: 400 });
  const account = authenticateDemo(body.data.email, body.data.password);
  if (!account) return NextResponse.json({ detail: "Kimlik doğrulanamadı." }, { status: 401 });
  const redirect = safeNext(body.data.next) ?? homeFor(account.role);
  const res = NextResponse.json({ redirect, user: { uid: account.uid, name: account.name, role: account.role, email: account.email } });
  return withSession(res, { uid: account.uid, email: account.email, name: account.name, role: account.role, iat: Date.now() });
}

export async function PUT(request: NextRequest) {
  if (IS_HTTP) return notFound();
  const current = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!current) return NextResponse.json({ detail: "Oturum yok." }, { status: 401 });
  const body = SwitchBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ detail: "Geçersiz rol." }, { status: 400 });
  const account = accountForRole(body.data.role);
  const res = NextResponse.json({ redirect: homeFor(account.role), user: { uid: account.uid, name: account.name, role: account.role } });
  return withSession(res, { uid: account.uid, email: account.email, name: account.name, role: account.role, iat: Date.now() });
}

export async function DELETE() {
  if (IS_HTTP) return notFound();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
