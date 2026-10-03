"use client";

import { API_MODE } from "@/lib/api/config";

/** Sign out (mock: clear the cookie; http: revoke the refresh family). Returns the next path. */
export async function logout(): Promise<string> {
  try {
    if (API_MODE === "mock") await fetch("/api/mock/session", { method: "DELETE" });
    else await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // Even if the call fails, send the user to /login; the cookie expires on its own.
  }
  return "/login";
}
