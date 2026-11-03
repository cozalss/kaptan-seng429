import type { Metadata } from "next";
import { DisclosuresScreen } from "@/components/disclosures/disclosures-screen";

export const metadata: Metadata = { title: "Okunanlar" };

/** /bildirimler — one session's KAP disclosures and what the desk did with each. */
export default function Page() {
  return <DisclosuresScreen />;
}
