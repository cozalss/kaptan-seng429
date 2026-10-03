import type { Metadata } from "next";
import { Suspense } from "react";
import { ApprovalsScreen } from "@/components/approvals/approvals-screen";

export const metadata: Metadata = { title: "Onay kuyruğu" };

/** /approvals — Onay kuyruğu (FRONTEND-SPEC §2.3). Owner: S2. `?oneri=<proposal_id>` preselects a card. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ApprovalsScreen />
    </Suspense>
  );
}
