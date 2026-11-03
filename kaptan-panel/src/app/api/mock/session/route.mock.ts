import { NextResponse, type NextRequest } from "next/server";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { passphraseMatches } from "@/lib/auth/passphrase";
import { encodeSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/session";
import { LoginRequest } from "@/lib/domain/user";

/**
 * The test double's session endpoints:
 *   POST   → sign in with the test passphrase → session cookie
 *   DELETE → sign out
 * The `.mock.ts` name keeps this route out of every real build: only the test flag adds that
 * extension to `pageExtensions` (next.config.ts). Real auth goes to FastAPI /api/v1/auth/*.
 */
export async function POST(request: NextRequest) {
  const body = LoginRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ detail: "Parola doğrulanamadı." }, { status: 400 });
  if (!passphraseMatches(body.data.passphrase)) return NextResponse.json({ detail: "Parola doğrulanamadı." }, { status: 401 });
  const res = NextResponse.json({ user: MOCK_USER });
  res.cookies.set(SESSION_COOKIE, encodeSession({ ...MOCK_USER, iat: Date.now() }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
