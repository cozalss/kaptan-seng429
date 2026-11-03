import type { Metadata } from "next";
import { SoloHome } from "@/components/solo/solo-home";

export const metadata: Metadata = { title: "Ana sayfa" };

/** /benim — the home: money, where it sits, what to do now. */
export default function BenimPage() {
  return <SoloHome />;
}
