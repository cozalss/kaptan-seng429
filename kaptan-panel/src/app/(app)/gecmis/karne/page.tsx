import type { Metadata } from "next";
import { KarneScreen } from "@/components/reports/karne-screen";

export const metadata: Metadata = { title: "Karne" };

/** /gecmis/karne: the monthly and yearly report, printable. */
export default function Page() {
  return <KarneScreen />;
}
