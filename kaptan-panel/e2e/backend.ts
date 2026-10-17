import { request } from "@playwright/test";

/**
 * The http-mode suite (`npm run e2e:api`, E2E_API=1) talks to the FastAPI backend. Mock-mode
 * specs keep their in-tab mock; these helpers are no-ops there.
 */
export const IS_API = process.env.E2E_API === "1";

const API_ORIGIN = process.env.KAPTAN_API_ORIGIN ?? "http://127.0.0.1:8000";
const PASSPHRASE = process.env.E2E_PASSPHRASE ?? "kaptan2026";

/**
 * POST /demo/reset as the Yönetici, straight to the backend (not through the page, so the
 * page's own session cookie is untouched). The mock suite starts each test on a fresh day by
 * clearing localStorage; this is the backend's equivalent.
 */
export async function resetBackendDemo(): Promise<void> {
  if (!IS_API) return;
  const ctx = await request.newContext({ baseURL: `${API_ORIGIN}/api/v1/` });
  try {
    const login = await ctx.post("auth/login", { data: { passphrase: PASSPHRASE, role: "admin" } });
    if (!login.ok()) throw new Error(`demo reset: login ${login.status()} ${await login.text()}`);
    const { access_token: token } = (await login.json()) as { access_token: string };
    const reset = await ctx.post("demo/reset", { headers: { Authorization: `Bearer ${token}` } });
    if (reset.status() !== 204) throw new Error(`demo reset: ${reset.status()} ${await reset.text()}`);
    await ctx.post("auth/logout");
  } finally {
    await ctx.dispose();
  }
}
