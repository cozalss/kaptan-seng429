import type { Metadata } from "next";
import { Suspense } from "react";
import { RunsList } from "@/components/run/runs-list";

export const metadata: Metadata = { title: "Çalıştırmalar" };

/** /runs — run list (FRONTEND-SPEC §2.4, §9 Ç-19). Filters live in the URL, hence Suspense. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RunsList />
    </Suspense>
  );
}
