import type { Metadata } from "next";
import { CompanyScreen } from "@/components/company/company-screen";

export const metadata: Metadata = { title: "Şirket" };

/** /hisse/[ticker] — one company: what it is, its price, what you hold, its KAP disclosures, KAPtan's decisions. */
export default async function Page({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return <CompanyScreen ticker={decodeURIComponent(ticker).toUpperCase()} />;
}
