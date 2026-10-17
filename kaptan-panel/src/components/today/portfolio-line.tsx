import Link from "next/link";
import type { RiskStatus } from "@/lib/domain";
import { fmtSignedPct, fmtTry } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The one line about your money at the foot of Bugün, set like a ledger entry: a quiet label,
 * the total in tabular Inter, today's move, and the way to Portföy. The whole line is the link.
 */
export function PortfolioLine({ risk, className }: { risk: RiskStatus; className?: string }) {
  const total = fmtTry(risk.equity);
  const today = fmtSignedPct(risk.daily_pnl_pct, 2);
  return (
    <Link
      href={ROUTES.portfoy}
      aria-label={`Portföyün: ${total}, bugün ${today}. Portföy’e git`}
      className={cn(
        "group flex min-h-11 flex-wrap items-baseline gap-x-4 gap-y-1 text-ui text-ink-soft",
        "transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)] hover:text-ink",
        className,
      )}
    >
      <span className="label text-ink-soft">Portföyün</span>
      <span className="text-lead font-medium text-ink tabular-nums">{total}</span>
      <span className="tabular-nums">bugün {today}</span>
      <span className="ml-auto inline-flex items-center gap-1.5 text-ink">
        <span className="hidden sm:inline">Portföy</span>
        <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}
