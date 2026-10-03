import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { MockDb, __setMockDb, type Actor } from "@/lib/api/mock/db";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { accountForRole } from "@/lib/auth/accounts";
import type { Role } from "@/lib/domain/user";
import { TooltipProvider } from "@/components/ui/overlay";
import { DeskStateProvider } from "@/components/shell/desk-state";

/** Test harness for S4 screens: a fresh mock desk, a signed-in role, no latency. */
export function userFor(role: Role): SessionUser {
  const a = accountForRole(role);
  return { uid: a.uid, email: a.email, name: a.name, role: a.role };
}

export function renderAs(role: Role | SessionUser, ui: ReactNode, db: MockDb = new MockDb(null)) {
  const user = typeof role === "string" ? userFor(role) : role;
  __setMockDb(db);
  const actor: Actor = { uid: user.uid, name: user.name, role: user.role };
  const api = createMockApi({ getActor: () => actor, db, latencyMs: 0, live: false });
  const utils = render(
    <SessionProvider user={user}>
      <ApiProvider api={api}>
        <DeskStateProvider>
          <TooltipProvider>{ui}</TooltipProvider>
        </DeskStateProvider>
      </ApiProvider>
    </SessionProvider>,
  );
  return { ...utils, db, api };
}

/** jsdom has no matchMedia; report reduced motion so walks finish immediately. */
export function stubReducedMotion(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
}
