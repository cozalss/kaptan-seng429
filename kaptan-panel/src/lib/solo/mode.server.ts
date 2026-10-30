import { SINGLE_USER_ENV, singleUserFromHealth } from "./mode";

const HEALTH_TIMEOUT_MS = 1_500;

/**
 * Is this deployment single-user? The env flag decides in mock mode; in http mode the backend
 * says so on GET /api/v1/health (`single_user: true`). A backend that cannot be reached counts
 * as "no" (the four-account sign-in still works and the API decides the role).
 */
export async function isSingleUser(): Promise<boolean> {
  if (SINGLE_USER_ENV) return true;
  if (process.env.NEXT_PUBLIC_API_MODE !== "http") return false;
  const origin = process.env.KAPTAN_API_ORIGIN ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${origin}/api/v1/health`, { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return false;
    return singleUserFromHealth(await res.json());
  } catch {
    return false;
  }
}
