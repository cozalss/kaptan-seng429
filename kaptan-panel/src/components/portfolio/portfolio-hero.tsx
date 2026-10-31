import type { ReactNode } from "react";
import type { RiskStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Figure } from "@/components/ui/figure";
import { Skeleton } from "@/components/ui/primitives";
import { signTone } from "@/components/story/sign-tone";
import { CARD } from "./kit";

/** Zirveden −%5: everything stops there (R01). The meter under "Zirveden" fills toward it. */
const STOP_AT = 0.05;

/**
 * The three numbers of Portföy as one row of cards: total value (ink, the fact), today (signed,
 * green or claret) and the distance from the peak as a figure in ink with a meter toward the −5%
 * stop. On a day the −1% rule paused new orders, "Bugün" says so and wears the ochre band. The
 * market regime sits in the page header (RegimeLine).
 */
export function PortfolioHero({ risk }: { risk: RiskStatus | null }) {
  if (!risk) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  const paused = risk.kill_switch === "off" && risk.halted_today;
  const used = Math.min(1, Math.abs(Math.min(0, risk.drawdown_pct)) / STOP_AT);
  return (
    <div>
      <dl aria-label="Özet" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Toplam değer" className="col-span-2 sm:col-span-1">
          <Figure value={risk.equity} kind="try" className="text-ink" />
        </Kpi>
        <Kpi label={paused ? "Bugün · yeni emir yok" : "Bugün"} band={paused}>
          <Figure value={risk.daily_pnl_pct} kind="signedPct" digits={2} className={signTone(risk.daily_pnl_pct)} />
        </Kpi>
        <Kpi
          label="Zirveden"
          foot={
            <>
              <span aria-hidden className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-sunk">
                <span className={cn("block h-full rounded-full", used >= 0.8 ? "bg-north" : "bg-brand")} style={{ width: `${Math.max(used * 100, used > 0 ? 3 : 0)}%` }} />
              </span>
              <span className="mt-1 block text-meta text-muted tabular-nums">{risk.drawdown_pct < 0 ? "sınır −%5: her şey durur" : "zirvede · sınır −%5"}</span>
            </>
          }
        >
          <span className="text-ink">{risk.drawdown_pct < 0 ? <Figure value={risk.drawdown_pct} kind="pct" digits={1} /> : "−%0"}</span>
        </Kpi>
      </dl>
    </div>
  );
}

/**
 * The day's market regime (06 §9), live over SSE desk `regime`, as a status pill in the page
 * header: "Piyasa: Normal" with a green dot, or "Piyasa: Kriz" in ochre with what it changes.
 */
export function RegimeLine({ regime }: { regime: RiskStatus["regime"] }) {
  const crisis = regime === "crisis";
  return (
    <p
      data-regime={regime}
      aria-live="polite"
      title={crisis ? "Yeni alımlar yarı tutarla, E3 yok, günde en çok 1 yeni giriş." : "Sınırlar olağan."}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-dense text-ink",
        crisis ? "border-ochre bg-ochre-tint" : "border-line bg-panel",
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", crisis ? "bg-ochre" : "bg-gain")} />
      <span className="font-semibold">Piyasa: {crisis ? "Kriz" : "Normal"}</span>
      <span className="truncate text-muted">{crisis ? "· yeni alımlar yarı tutarla, E3 yok" : "· sınırlar olağan"}</span>
    </p>
  );
}

function Kpi({
  label,
  band = false,
  className,
  foot,
  children,
}: {
  label: string;
  band?: boolean;
  className?: string;
  foot?: ReactNode;
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
      {foot ? <dd>{foot}</dd> : null}
    </div>
  );
}
