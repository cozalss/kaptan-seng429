import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ApiProvider } from "@/lib/api/react";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { MockDb } from "@/lib/api/mock/db";
import type { KaptanApi } from "@/lib/api/types";

/** The test double on its own database: a new install (no starting money) or one that has started. */
export function mockApi(opts: { fresh: boolean }): KaptanApi {
  return createMockApi({ db: new MockDb(null, Date.now(), opts.fresh), latencyMs: 0, live: false });
}

export function renderWithApi(ui: ReactElement, api: KaptanApi) {
  return render(<ApiProvider api={api}>{ui}</ApiProvider>);
}
