import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata: Metadata = { title: "Ayarlar" };

/** /ayarlar — your limits, how KAPtan works, and sign-out. */
export default function Page() {
  return <SettingsScreen />;
}
