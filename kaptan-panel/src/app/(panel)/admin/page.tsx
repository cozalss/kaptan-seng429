import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminScreen } from "@/components/admin/admin-screen";
import { SkeletonLines } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Yönetim" };

/** /admin — FRONTEND-SPEC §2.11 (S4). Admin only (proxy + API). */
export default function Page() {
  return (
    <Suspense fallback={<SkeletonLines lines={6} />}>
      <AdminScreen />
    </Suspense>
  );
}
