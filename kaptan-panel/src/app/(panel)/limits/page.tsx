import type { Metadata } from "next";
import { LimitsScreen } from "@/components/limits/limits-screen";

export const metadata: Metadata = { title: "Limitler" };

/** /limits — FRONTEND-SPEC §2.8 (S4): versions, diff, four-eyes approval. */
export default function Page() {
  return <LimitsScreen />;
}
