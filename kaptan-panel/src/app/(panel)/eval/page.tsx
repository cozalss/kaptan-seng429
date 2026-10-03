import type { Metadata } from "next";
import { EvalScreen } from "@/components/eval/eval-screen";

export const metadata: Metadata = { title: "Değerlendirme" };

/** /eval — four evaluation layers, sample values clearly labelled (FRONTEND-SPEC §2.9). */
export default function Page() {
  return <EvalScreen />;
}
