import type { Metadata } from "next";
import { WeeklyScreen } from "@/components/weekly/weekly-screen";

export const metadata: Metadata = { title: "Haftalık özet" };

/** /gecmis/hafta: one week of your money and of what KAPtan did, in plain words. */
export default function Page() {
  return <WeeklyScreen />;
}
