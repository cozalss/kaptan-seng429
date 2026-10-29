import type { ReactNode } from "react";
import type { RiskStatus } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct, NBSP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";
import { signTone } from "@/components/story/sign-tone";
import { CARD } from "./kit";

/**
 * The three numbers of Portföy as one row of cards: total value, today, distance from the
 * peak. On a day the −1% rule paused new orders, "Bugün" says so and wears the ochre band.
 */
export function PortfolioHero({ risk }: { risk: RiskStatus | null }) {
  if (!risk) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>
    );
  }
  const paused = risk.kill_switch === "off" && risk.halted_today;
  return (
    <div className="space-y-3">
      <dl aria-label="Özet" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Toplam değer" className="col-span-2 sm:col-span-1">
          <span className="text-brand">
            {fmtInt(Math.round(risk.equity))}
            {NBSP}TL
          </span>
        </Kpi>
        <Kpi label={paused ? "Bugün · yeni emir yok" : "Bugün"} band={paused}>
          <span className={signTone(risk.daily_pnl_pct)}>
            {fmtSignedPct(risk.daily_pnl_pct, 2)}
          </span>
        </Kpi>
        <Kpi label="Zirveden">
          <span className={signTone(Math.min(0, risk.drawdown_pct))}>
            {risk.drawdown_pct < 0 ? fmtPct(risk.drawdown_pct, 1) : "zirvede"}
          </span>
        </Kpi>
      </dl>
      <RegimeLine regime={risk.regime} />
    </div>
  );
}

/** The day's market regime (06 §9), live over SSE desk `regime`: Normal, or Kriz with what it changes. */
export function RegimeLine({ regime }: { regime: RiskStatus["regime"] }) {
  const crisis = regime === "crisis";
  return (
    <p
      data-regime={regime}
      aria-live="polite"
      className={cn(
        "border px-4 py-2.5 text-dense text-ink",
        crisis ? "border-ochre bg-ochre-tint" : "border-rule-soft",
      )}
    >
      <span className="font-semibold">
        Piyasa: {crisis ? "Kriz" : "Normal"}
      </span>
      <span className="text-muted">
        {crisis
          ? " · yeni alımlar yarı tutarla, E3 yok, günde en çok 1 yeni giriş."
          : " · sınırlar olağan."}
      </span>
    </p>
  );
}

function Kpi({
  label,
  band = false,
  className,
  children,
}: {
  label: string;
  band?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        CARD,
        "min-w-0 px-4 py-4 sm:px-5",
        band && "border-ochre bg-ochre-tint",
        className,
      )}
    >
      <dt className="text-dense font-medium text-muted">{label}</dt>
      <dd className="mt-2 text-[26px] leading-8 font-semibold tracking-[-0.01em] whitespace-nowrap tabular-nums sm:text-[28px]">
        {children}
      </dd>
    </div>
  );
}
