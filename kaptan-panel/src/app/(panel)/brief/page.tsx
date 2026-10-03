import type { Metadata } from "next";
import { BriefScreen } from "@/components/brief/brief-screen";
import { parseBriefDate } from "@/components/brief/brief-math";

export const metadata: Metadata = { title: "Sabah özeti" };

/** /brief and /brief?tarih=YYYY-MM-DD — the 08:45 morning brief (FRONTEND-SPEC §2.10). */
export default async function Page({ searchParams }: { searchParams: Promise<{ tarih?: string | string[] }> }) {
  const { tarih } = await searchParams;
  return <BriefScreen date={parseBriefDate(Array.isArray(tarih) ? tarih[0] : tarih)} />;
}
