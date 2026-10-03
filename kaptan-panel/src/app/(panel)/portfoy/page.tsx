import type { Metadata } from "next";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";

export const metadata: Metadata = { title: "Portföy" };

/** /portfoy — your money, what you hold, waiting fişler, and Durdur. */
export default function Page() {
  return <PortfolioScreen />;
}
