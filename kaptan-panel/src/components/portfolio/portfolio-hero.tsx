import type { ReactNode } from "react";
import type { RiskStatus } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";
import { BigSentence } from "@/components/story/ui";

/**
 * The money in one figure: Inter with proportional figures at display size (tabular digits
 * look loose this big), the unit in Bodoni. Under it three short facts on one ruled line,
 * each a small label over a tabular figure: today, distance from the peak, the run so far.
 * On a day the −1% rule paused new orders, "Bugün" sits on the ochre band that means it.
 */
export function PortfolioHero({ risk, change }: { risk: RiskStatus | null; change: { sessions: number; ratio: number } | null }) {
  if (!risk) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-[52px] w-2/3 sm:h-[68px]" />
        <Skeleton className="h-[52px] w-full" />
      </div>
    );
  }
  const paused = risk.kill_switch === "off" && risk.halted_today;
  return (
    <div className="space-y-6">
      <BigSentence focusTarget className="flex flex-wrap items-baseline gap-x-3 sm:text-display-lg">
        <span className="font-sans text-display-lg leading-none font-normal tracking-[-0.04em] [font-variant-numeric:lining-nums_proportional-nums] sm:text-hero">
          {fmtInt(Math.round(risk.equity))}
        </span>{" "}
        <span className="font-display-text text-title leading-none sm:font-display sm:text-display">TL</span>
      </BigSentence>
      <dl className="grid grid-cols-3 border-t border-hairline">
        <Fact label={paused ? "Bugün · yeni emir yok" : "Bugün"} band={paused}>
          {fmtSignedPct(risk.daily_pnl_pct, 2)}
        </Fact>
        <Fact label="Zirveden">{risk.drawdown_pct < 0 ? fmtPct(risk.drawdown_pct, 1) : "zirvede"}</Fact>
        {change ? <Fact label={`${change.sessions} seansta`}>{fmtSignedPct(change.ratio, 1)}</Fact> : null}
      </dl>
    </div>
  );
}

function Fact({ label, band = false, children }: { label: string; band?: boolean; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 border-l border-hairline pt-3 pl-3 first:border-l-0 first:pl-0 sm:pl-5", band && "-mt-px border-t-[3px] border-t-ochre bg-ochre-tint pr-2 pb-2.5 pl-2! first:pl-2!")}>
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="mt-1 text-lead leading-none text-ink tabular-nums sm:text-[24px]">{children}</dd>
    </div>
  );
}
