import Link from "next/link";
import type { LimitValue, RiskStatus } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct, fmtTry } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { valueOf } from "@/components/settings/limits-logic";
import { CARD, CardHead } from "@/components/portfolio/kit";
import { SkeletonLines } from "@/components/ui/primitives";

export interface UsageRow {
  key: string;
  label: string;
  /** What it is now, in words ("−%0,4", "3 açık"). */
  now: string;
  /** The line it is measured against ("sınır −%1"). */
  limit: string;
  /** How much of the limit is used, 0…1 (clamped). */
  used: number;
}

/** A share at or past this much of a limit is worth a second look (ochre). */
export const USAGE_WARN = 0.7;

/**
 * Pure. How close the desk is to each stop line: the day's loss against the daily −1% pause,
 * the fall from the peak against the −5% stop, open positions against the cap. A gain uses
 * none of a loss limit.
 */
export function limitUsage(risk: RiskStatus, values: readonly LimitValue[], openPositions: number | null): UsageRow[] {
  const rows: UsageRow[] = [];
  const daily = valueOf(values, "daily_loss_halt_pct");
  if (daily !== null && daily < 0) {
    rows.push({
      key: "daily",
      label: "Günlük zarar",
      now: risk.daily_pnl_pct > 0 ? `${fmtSignedPct(risk.daily_pnl_pct, 2)} (kârda)` : fmtPct(risk.daily_pnl_pct, 2),
      limit: `sınır ${fmtPct(daily, 1)}`,
      used: clamp(Math.max(0, -risk.daily_pnl_pct) / -daily),
    });
  }
  const kill = valueOf(values, "kill_drawdown_pct");
  if (kill !== null && kill < 0) {
    rows.push({
      key: "drawdown",
      label: "Zirveden düşüş",
      now: risk.drawdown_pct < 0 ? fmtPct(risk.drawdown_pct, 2) : "zirvede",
      limit: `sınır ${fmtPct(kill, 1)}`,
      used: clamp(-risk.drawdown_pct / -kill),
    });
  }
  const cap = valueOf(values, "max_concurrent_positions");
  if (cap !== null && cap > 0 && openPositions !== null) {
    rows.push({ key: "positions", label: "Açık pozisyon", now: `${fmtInt(openPositions)} açık`, limit: `en çok ${fmtInt(cap)}`, used: clamp(openPositions / cap) });
  }
  return rows;
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * "Risk sınırları": one meter per stop line (navy while there is room, ochre from 70%, north
 * red at the line), and the per-trade risk as the amount it allows today.
 */
export function LimitsUsage({
  risk,
  values,
  openPositions,
  className,
}: {
  risk: RiskStatus | null;
  values: readonly LimitValue[] | undefined;
  openPositions: number | null;
  className?: string;
}) {
  const perTrade = values ? valueOf(values, "risk_per_trade_pct") : null;
  return (
    <section aria-labelledby="risk-sinirlari" className={cn(CARD, className)}>
      <CardHead
        id="risk-sinirlari"
        title="Risk sınırları"
        note="Sınıra ne kadar yakınız"
        action={
          <Link href={ROUTES.ayarlar} className="text-dense font-semibold text-brand underline decoration-transparent underline-offset-4 hover:decoration-brand">
            Sınırlar →
          </Link>
        }
      />
      {risk && values ? (
        <div className="px-5 pb-5">
          <ul className="space-y-4">
            {limitUsage(risk, values, openPositions).map((r) => (
              <li key={r.key}>
                <p className="flex items-baseline justify-between gap-3 text-dense">
                  <span className="font-semibold text-ink">{r.label}</span>
                  <span className="text-ink-soft tabular-nums">
                    <span className="font-semibold text-ink">{r.now}</span> · {r.limit}
                  </span>
                </p>
                <Meter used={r.used} label={`${r.label}: sınırın %${Math.round(r.used * 100)} kadarı kullanıldı`} />
              </li>
            ))}
          </ul>
          {perTrade !== null ? (
            <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-dense">
              <span className="font-semibold text-ink">İşlem başına risk</span>
              <span className="text-ink-soft tabular-nums">
                <span className="font-semibold text-ink">{fmtPct(perTrade, 2)}</span> · bugün {fmtTry(perTrade * risk.equity)}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <SkeletonLines lines={4} className="px-5 pb-5" />
      )}
    </section>
  );
}

function Meter({ used, label }: { used: number; label: string }) {
  const tone = used >= 1 ? "bg-north" : used >= USAGE_WARN ? "bg-ochre" : "bg-brand";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunk">
      <div className={cn("h-full origin-left rounded-full transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)]", tone)} style={{ transform: `scaleX(${used > 0 ? Math.max(used, 0.02) : 0})` }} />
    </div>
  );
}
