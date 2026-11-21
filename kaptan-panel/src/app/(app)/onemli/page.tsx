import type { Metadata } from "next";
import { Suspense } from "react";
import { DigestScreen } from "@/components/digest/digest-screen";

export const metadata: Metadata = { title: "Önemli duyurular" };

/** /onemli: the day's important disclosures of every company. A detail page of Ana sayfa and Okunanlar, not a nav item. */
export default function Page() {
  return (
    <Suspense>
      <DigestScreen />
    </Suspense>
  );
}
