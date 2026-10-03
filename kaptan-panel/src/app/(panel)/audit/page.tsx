import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditScreen } from "@/components/audit/audit-screen";
import { SkeletonLines } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Denetim kaydı" };

/** /audit — FRONTEND-SPEC §2.7 (S4). Search params drive filters and deep links. */
export default function Page() {
  return (
    <Suspense fallback={<SkeletonLines lines={6} />}>
      <AuditScreen />
    </Suspense>
  );
}
