import { createHttpApi, httpLogin, httpLogout, httpReachable } from "./http/http-api";
import type { KaptanApi } from "./types";

/**
 * The API client every build gets. Only the test double swaps this module for client.mock.ts
 * (next.config.ts turbopack.resolveAlias with the test flag, vitest alias), so no production
 * bundle can reach the mock's state or data.
 */
export function createClient(): KaptanApi {
  return createHttpApi();
}

export const signIn = httpLogin;
export const signOut = httpLogout;
export const isReachable = httpReachable;
