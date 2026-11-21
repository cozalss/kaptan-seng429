import type { Metadata } from "next";
import { HelpScreen } from "@/components/help/help-screen";

export const metadata: Metadata = { title: "Yardım" };

/** /yardim: how KAPtan works, common questions, the glossary and the shortcuts. */
export default function Page() {
  return <HelpScreen />;
}
