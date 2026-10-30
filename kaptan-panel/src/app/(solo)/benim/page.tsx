import type { Metadata } from "next";
import { SoloHome } from "@/components/solo/solo-home";

export const metadata: Metadata = { title: "Benim KAPtan'ım" };

/** /benim — the single-user home: money, where it sits, what to do now. */
export default function BenimPage() {
  return <SoloHome />;
}
