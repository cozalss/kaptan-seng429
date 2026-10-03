import type { Metadata } from "next";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";
import { parseTab } from "@/components/portfolio/tabs";

export const metadata: Metadata = { title: "Portföy" };

/** /portfolio and /portfolio?sekme=fis (personal-mode tickets, FRONTEND-SPEC §2.5–2.6). */
export default async function Page({ searchParams }: { searchParams: Promise<{ sekme?: string | string[] }> }) {
  const { sekme } = await searchParams;
  return <PortfolioScreen initialTab={parseTab(Array.isArray(sekme) ? sekme[0] : sekme)} />;
}
