import type { ReactNode } from "react";
import type { RiskStatus } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";
import { BigSentence } from "@/components/story/ui";
import { signTone } from "@/components/story/sign-tone";

/**
 * The money in one figure, the screen's focal figure in indigo ink: Inter with proportional figures at display size (tabular digits
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
        <span className="font-sans text-display-lg leading-none font-medium tracking-[-0.04em] text-brand [font-variant-numeric:lining-nums_proportional-nums] sm:text-hero">
          {fmtInt(Math.round(risk.equity))}
        </span>{" "}
        <span className="font-display-text text-title leading-none sm:font-display sm:text-display">TL</span>
      </BigSentence>
      <dl className="grid grid-cols-3 border-t-2 border-ink">
        <Fact label={paused ? "Bugün · yeni emir yok" : "Bugün"} band={paused} tone={signTone(risk.daily_pnl_pct)}>
          {fmtSignedPct(risk.daily_pnl_pct, 2)}
        </Fact>
        <Fact label="Zirveden" tone={signTone(Math.min(0, risk.drawdown_pct))}>{risk.drawdown_pct < 0 ? fmtPct(risk.drawdown_pct, 1) : "zirvede"}</Fact>
        {change ? <Fact label={`${change.sessions} seansta`} tone={signTone(change.ratio)}>{fmtSignedPct(change.ratio, 1)}</Fact> : null}
      </dl>
    </div>
  );
}

function Fact({ label, band = false, tone = "text-ink", children }: { label: string; band?: boolean; tone?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 border-l-2 border-hairline pt-3 pl-3 first:border-l-0 first:pl-0 sm:pl-5", band && "-mt-[2px] border-t-[4px] border-t-ochre bg-ochre-tint pr-2 pb-2.5 pl-2! first:pl-2!")}>
      <dt className="text-meta font-medium text-ink-soft">{label}</dt>
      <dd className={cn("mt-1 text-lead leading-none font-medium tabular-nums sm:text-[24px]", tone)}>{children}</dd>
    </div>
  );
}
