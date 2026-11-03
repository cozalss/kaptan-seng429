import { useState, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { ApiProvider } from "@/lib/api/react";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { SessionProvider } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";

/**
 * Test-only frame for the screens: the session, a mock API on a fresh in-memory state (also the
 * SSE bus and the clock source) and the shared live state.
 */
export function Harness({ db, children }: { db: MockDb; children: ReactNode }) {
  const [api] = useState(() => createMockApi({ db, latencyMs: 0, live: false }));
  return (
    <SessionProvider user={MOCK_USER}>
      <ApiProvider api={api}>
        <DeskStateProvider>{children}</DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}

export function renderWithDesk(ui: ReactNode, db: MockDb = new MockDb(null)) {
  __setMockDb(db);
  return { db, ...render(<Harness db={db}>{ui}</Harness>) };
}
