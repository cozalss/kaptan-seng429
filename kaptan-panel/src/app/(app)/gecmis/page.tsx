import type { Metadata } from "next";
import { AuditScreen } from "@/components/audit/audit-screen";

export const metadata: Metadata = { title: "Geçmiş" };

/** /gecmis — everything that happened: a plain timeline and "Kayıtlar sağlam mı?". */
export default function Page() {
  return <AuditScreen />;
}
