import Link from "next/link";
import type { RiskStatus } from "@/lib/domain";
import { fmtSignedPct, fmtTry } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";

/**
 * The one compact portfolio summary on Bugün: total value, today's move and the way to
 * Portföy. The whole box is the link.
 */
export function PortfolioLine({ risk, className }: { risk: RiskStatus; className?: string }) {
  const total = fmtTry(risk.equity);
  const today = fmtSignedPct(risk.daily_pnl_pct, 2);
  return (
    <Link
      href={ROUTES.portfoy}
      aria-label={`Portföyün: ${total}, bugün ${today}. Portföy’e git`}
      className={cn(
        "group flex flex-wrap items-center gap-x-8 gap-y-2 border-2 border-ink bg-panel px-4 py-4 sm:px-6",
        "transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)] hover:bg-wash-tint",
        className,
      )}
    >
      <span>
        <span className="block text-meta text-ink-soft">Portföy değeri</span>
        <span className="block text-lead font-semibold text-ink tabular-nums">{total}</span>
      </span>
      <span>
        <span className="block text-meta text-ink-soft">Bugün</span>
        <span className={cn("block text-lead font-semibold tabular-nums", signTone(risk.daily_pnl_pct))}>{today}</span>
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5 text-ui font-semibold text-brand">
        Portföy
        <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}
