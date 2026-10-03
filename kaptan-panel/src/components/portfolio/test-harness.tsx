import { useState, type ReactNode } from "react";
import { ApiProvider } from "@/lib/api/react";
import { createMockApi } from "@/lib/api/mock/mock-api";
import type { MockDb } from "@/lib/api/mock/db";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";
import { TooltipProvider } from "@/components/ui/overlay";

/** Test-only frame for the S3 screens: session + mock API on a given MockDb + desk state. */
export const S3_USERS: Record<"risk" | "risk2" | "analyst" | "admin" | "auditor", SessionUser> = {
  risk: { uid: "u-risk", email: "risk@kaptan.demo", name: "Zeynep (Risk Officer)", role: "risk_officer" },
  risk2: { uid: "u-risk2", email: "risk2@kaptan.demo", name: "Elif (Risk Officer)", role: "risk_officer" },
  analyst: { uid: "u-analist", email: "analist@kaptan.demo", name: "Mert (Analist)", role: "analyst" },
  admin: { uid: "u-admin", email: "admin@kaptan.demo", name: "Burak (Admin)", role: "admin" },
  auditor: { uid: "u-denetci", email: "denetci@kaptan.demo", name: "Hoca (Auditor)", role: "auditor" },
};

export function S3Harness({ user, db, children }: { user: SessionUser; db: MockDb; children: ReactNode }) {
  const [api] = useState(() => createMockApi({ getActor: () => ({ uid: user.uid, name: user.name, role: user.role }), db, latencyMs: 0, live: false }));
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

/** jsdom has no layout: give measured chart containers a real width so Recharts renders. */
export function stubLayoutWidth(width = 900): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function rect() {
    return { x: 0, y: 0, top: 0, left: 0, bottom: 300, right: width, width, height: 300, toJSON: () => ({}) } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}
