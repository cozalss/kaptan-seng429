import type { Metadata } from "next";
import { TodayScreen } from "@/components/today/today-screen";

export const metadata: Metadata = { title: "Bugün" };

/** /bugun — home after login: today's proposals in one sentence and a few quiet cards. */
export default function Page() {
  return <TodayScreen />;
}
