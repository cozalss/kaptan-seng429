import { useState, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { ApiProvider } from "@/lib/api/react";
import { actorFor, createMockApi } from "@/lib/api/mock/mock-api";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { SessionProvider } from "@/lib/auth/session-context";
import type { Role } from "@/lib/domain/user";
import { DeskStateProvider } from "@/components/shell/desk-state";

/**
 * Test-only frame for the screens: the session (in a role), a mock API on a fresh in-memory
 * desk (also the SSE bus and the clock source) and the desk state. A role switch inside the
 * screen (the picker, "… gözüyle bak →") changes the API's actor too.
 */
export function Harness({ db, role = "risk_officer", children }: { db: MockDb; role?: Role; children: ReactNode }) {
  const [api] = useState(() => {
    const actor = { current: actorFor(role) };
    return createMockApi({
      getActor: () => actor.current,
      onRoleChange: async (r) => {
        actor.current = actorFor(r);
      },
      db,
      latencyMs: 0,
      live: false,
    });
  });
  const first = actorFor(role);
  return (
    <SessionProvider user={first}>
      <ApiProvider api={api}>
        <DeskStateProvider>{children}</DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}

export function renderWithDesk(ui: ReactNode, db: MockDb = new MockDb(null), role: Role = "risk_officer") {
  __setMockDb(db);
  return { db, ...render(<Harness db={db} role={role}>{ui}</Harness>) };
}
