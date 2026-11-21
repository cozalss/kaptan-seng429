import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareScreen } from "@/components/company/compare-screen";

export const metadata: Metadata = { title: "Karşılaştır" };

/** /karsilastir?a=&b= — two companies side by side (a detail route, not a nav item). */
export default function Page() {
  return (
    <Suspense>
      <CompareScreen />
    </Suspense>
  );
}
