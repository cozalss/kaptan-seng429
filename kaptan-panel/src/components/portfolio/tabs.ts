/** /portfolio tabs, kept in the URL (?sekme=…; "fis" = personal-mode tickets, §9 Ç-7). */
export const PORTFOLIO_TABS = ["pozisyonlar", "emirler", "fis"] as const;
export type PortfolioTab = (typeof PORTFOLIO_TABS)[number];

export function parseTab(v: string | undefined): PortfolioTab {
  return PORTFOLIO_TABS.find((t) => t === v) ?? "pozisyonlar";
}
