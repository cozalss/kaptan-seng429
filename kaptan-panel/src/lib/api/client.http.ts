import { createHttpApi } from "./http/http-api";
import type { MockApiOptions } from "./mock/mock-api";
import type { KaptanApi } from "./types";

/**
 * The API client for http mode (see client.mock.ts for how `@/lib/api/client` picks it).
 * Same signature as the mock client; the options are mock-only and ignored here (the backend
 * knows who is signed in from the JWT).
 */
export type ClientOptions = MockApiOptions;

export function createClient(options?: ClientOptions): KaptanApi {
  void options;
  return createHttpApi();
}
