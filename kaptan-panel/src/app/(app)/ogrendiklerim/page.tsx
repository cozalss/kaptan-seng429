import type { Metadata } from "next";
import { LearningScreen } from "@/components/learning/learning-screen";

export const metadata: Metadata = { title: "Ne öğrendim" };

/** /ogrendiklerim: what KAPtan learned this week and the rule changes it made. A detail page of Ana sayfa, not a nav item. */
export default function Page() {
  return <LearningScreen />;
}
