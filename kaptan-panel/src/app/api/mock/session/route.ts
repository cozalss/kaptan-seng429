import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { passphraseMatches } from "@/lib/auth/passphrase";
import { encodeSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/session";
import { OWNER } from "@/lib/domain/user";
import { HOME, safeNext } from "@/lib/nav";

/**
 * Mock session endpoints (mock mode only):
 *   POST   → sign in with the demo passphrase → session cookie for "Sen"
 *   DELETE → sign out
 * In http mode these return 404: auth goes to FastAPI /api/v1/auth/*.
 */
const IS_HTTP = process.env.NEXT_PUBLIC_API_MODE === "http";

const LoginBody = z.object({ passphrase: z.string().max(200), next: z.string().max(500).nullish() });

const notFound = () => NextResponse.json({ detail: "Yok" }, { status: 404 });

export async function POST(request: NextRequest) {
  if (IS_HTTP) return notFound();
  const body = LoginBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ detail: "Parola doğrulanamadı." }, { status: 400 });
  if (!passphraseMatches(body.data.passphrase)) return NextResponse.json({ detail: "Parola doğrulanamadı." }, { status: 401 });
  const redirect = safeNext(body.data.next) ?? HOME;
  const res = NextResponse.json({ redirect, user: { uid: OWNER.uid, name: OWNER.name } });
  res.cookies.set(SESSION_COOKIE, encodeSession({ uid: OWNER.uid, name: OWNER.name, iat: Date.now() }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

export async function DELETE() {
  if (IS_HTTP) return notFound();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
