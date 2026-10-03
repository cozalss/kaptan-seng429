import { useState, type ReactNode } from "react";
import { ApiProvider } from "@/lib/api/react";
import { createMockApi } from "@/lib/api/mock/mock-api";
import type { MockDb } from "@/lib/api/mock/db";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";
import { TooltipProvider } from "@/components/ui/overlay";

/** Test-only frame: session + mock API on a given MockDb + desk state (no shell chrome). */
export const USERS: Record<"risk" | "analyst" | "admin" | "auditor", SessionUser> = {
  risk: { uid: "u-risk", email: "risk@kaptan.demo", name: "Zeynep (Risk Officer)", role: "risk_officer" },
  analyst: { uid: "u-analist", email: "analist@kaptan.demo", name: "Mert (Analist)", role: "analyst" },
  admin: { uid: "u-admin", email: "admin@kaptan.demo", name: "Burak (Admin)", role: "admin" },
  auditor: { uid: "u-denetci", email: "denetci@kaptan.demo", name: "Hoca (Auditor)", role: "auditor" },
};

export function Harness({ user, db, children }: { user: SessionUser; db: MockDb; children: ReactNode }) {
  const [api] = useState(() =>
    createMockApi({ getActor: () => ({ uid: user.uid, name: user.name, role: user.role }), db, latencyMs: 0, live: false }),
  );
  return (
    <SessionProvider user={user}>
      <ApiProvider api={api}>
        <DeskStateProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}
