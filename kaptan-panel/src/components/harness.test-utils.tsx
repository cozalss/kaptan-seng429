import { useState, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { ApiProvider } from "@/lib/api/react";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { OWNER_ACTOR } from "@/lib/api/mock/mock-api";
import { SessionProvider } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";

/**
 * Test-only frame for the screens: the session, a mock API on a fresh in-memory desk (also set
 * as the SSE bus and the clock source) and the desk state. Returns the db so tests can drive it.
 */
export function Harness({ db, children }: { db: MockDb; children: ReactNode }) {
  const [api] = useState(() => createMockApi({ getActor: () => OWNER_ACTOR, db, latencyMs: 0, live: false }));
  return (
    <SessionProvider user={{ uid: OWNER_ACTOR.uid, name: OWNER_ACTOR.name }}>
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
