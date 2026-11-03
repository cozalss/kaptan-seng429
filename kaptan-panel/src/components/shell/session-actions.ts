"use client";

import { signOut } from "@/lib/api/client";

/** Sign out. Returns the next path. */
export async function logout(): Promise<string> {
  try {
    await signOut();
  } catch {
    // Even if the call fails, send the user to /login; the cookie expires on its own.
  }
  return "/login";
}
