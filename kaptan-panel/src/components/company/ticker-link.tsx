import Link from "next/link";
import type { ReactNode } from "react";
import { href } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** A ticker printed anywhere in the app: it leads to that company's page. */
export function TickerLink({ ticker, className, children }: { ticker: string; className?: string; children?: ReactNode }) {
  return (
    <Link href={href.company(ticker)} className={cn("ticker-link underline-offset-2 hover:underline focus-visible:underline", className)} aria-label={`${ticker} şirket sayfası`}>
      {children ?? ticker}
    </Link>
  );
}
