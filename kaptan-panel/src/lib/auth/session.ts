import { z } from "zod";
import { Role } from "@/lib/domain/user";

/**
 * Mock session cookie. Read by src/proxy.ts (route guards) and server layouts.
 * Edge-safe: no Node APIs. Not a security boundary — mock mode is a demo with published
 * credentials; in http mode the API enforces roles (FRONTEND-SPEC §9 Ç-16).
 */
export const SESSION_COOKIE = "kaptan_mock_session";
export const SESSION_MAX_AGE_S = 8 * 60 * 60; // mirrors the 8 h refresh-token life (09 §6)

export const SessionPayload = z.object({
  uid: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  role: Role,
  iat: z.number().int().positive(),
});
export type SessionPayload = z.infer<typeof SessionPayload>;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSession(payload: SessionPayload): string {
  return toBase64Url(JSON.stringify(SessionPayload.parse(payload)));
}

/** Returns null for a missing, malformed or expired cookie — never throws. */
export function decodeSession(raw: string | undefined | null, nowMs: number = Date.now()): SessionPayload | null {
  if (!raw) return null;
  try {
    const parsed = SessionPayload.safeParse(JSON.parse(fromBase64Url(raw)));
    if (!parsed.success) return null;
    if (nowMs - parsed.data.iat > SESSION_MAX_AGE_S * 1000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
