import "./mock/register";
import { createMockApi } from "./mock/mock-api";
import { ApiError, type KaptanApi } from "./types";

/**
 * The test double of client.ts: the in-browser mock API and the mock session route. Reached only
 * through the test flag's alias (next.config.ts, vitest.config.mts).
 */
export const createClient = (): KaptanApi => createMockApi();

export async function signIn(passphrase: string): Promise<void> {
  const res = await fetch("/api/mock/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase }) });
  if (res.status === 401) throw new ApiError(401, "login", "Parola doğrulanamadı.");
  if (!res.ok) throw new ApiError(res.status, "login", "Giriş şu an yapılamıyor. Biraz sonra yeniden dene.");
}

export async function signOut(): Promise<void> {
  await fetch("/api/mock/session", { method: "DELETE" });
}

export const isReachable = async (): Promise<boolean> => true;
