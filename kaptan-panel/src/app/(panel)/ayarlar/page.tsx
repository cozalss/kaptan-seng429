import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata: Metadata = { title: "Ayarlar" };

/** /ayarlar — demo controls, the fixed limits in one line, and sign-out. */
export default function Page() {
  return <SettingsScreen />;
}
