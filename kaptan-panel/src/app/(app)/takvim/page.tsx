import type { Metadata } from "next";
import { CalendarScreen } from "@/components/agenda/calendar-screen";

export const metadata: Metadata = { title: "Takvim" };

/** /takvim: the dates ahead for what you hold and watch. A detail page of Ana sayfa, not a nav item. */
export default function Page() {
  return <CalendarScreen />;
}
