import type { Metadata } from "next";
import { AuditScreen } from "@/components/audit/audit-screen";

export const metadata: Metadata = { title: "Denetim" };

/** /denetim — the audit ledger: a plain timeline and "Defteri doğrula". */
export default function Page() {
  return <AuditScreen />;
}
