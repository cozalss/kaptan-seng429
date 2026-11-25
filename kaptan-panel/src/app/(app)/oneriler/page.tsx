import type { Metadata } from "next";
import { Suspense } from "react";
import { SuggestedScreen } from "@/components/home/suggested-screen";

export const metadata: Metadata = { title: "Öneriye düşenler" };

/** /oneriler: every suggestion with what happened to it, filtered by status. A detail page of Ana sayfa, not a nav item. */
export default function Page() {
  return (
    <Suspense>
      <SuggestedScreen />
    </Suspense>
  );
}
