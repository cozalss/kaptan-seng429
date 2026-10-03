"use client";

import { API_MODE } from "@/lib/api/config";
import { canAccessPath, homeFor } from "@/lib/auth/routes";
import type { Role } from "@/lib/domain/user";

/** Log out (mock: clear the cookie; http: revoke the refresh family). Returns the next path. */
export async function logout(): Promise<string> {
  try {
    if (API_MODE === "mock") await fetch("/api/mock/session", { method: "DELETE" });
    else await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // Even if the call fails, send the user to /login; the cookie expires on its own.
  }
  return "/login";
}

/** Mock-only role switch. Stays on the current page when the new role may see it. */
export async function switchRole(role: Role, currentPath: string): Promise<{ ok: boolean; next: string }> {
  const res = await fetch("/api/mock/session", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) return { ok: false, next: currentPath };
  return { ok: true, next: canAccessPath(role, currentPath) ? currentPath : homeFor(role) };
}
