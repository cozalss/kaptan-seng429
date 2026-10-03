import type { Metadata } from "next";
import { InboxScreen } from "@/components/inbox/inbox-screen";

export const metadata: Metadata = { title: "Canlı akış" };

/** /inbox — Canlı akış (FRONTEND-SPEC §2.2). Owner: S2. */
export default function Page() {
  return <InboxScreen />;
}
