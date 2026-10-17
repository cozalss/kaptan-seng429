import { createMockApi, type MockApiOptions } from "./mock/mock-api";
import type { KaptanApi } from "./types";

/**
 * The API client for mock mode. `@/lib/api/client` resolves here unless
 * NEXT_PUBLIC_API_MODE=http (next.config.ts turbopack.resolveAlias, tsconfig paths, vitest
 * alias), so an http build never ships the in-memory desk and a mock build never ships fetch.
 */
export type ClientOptions = MockApiOptions;

export const createClient = (o: ClientOptions): KaptanApi => createMockApi(o);
