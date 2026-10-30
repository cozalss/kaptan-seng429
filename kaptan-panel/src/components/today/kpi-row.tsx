import type { ReactNode } from "react";
import Link from "next/link";
import type { RiskStatus } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct, fmtTry, NBSP } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";
import { Figure } from "@/components/ui/figure";
import { Skeleton } from "@/components/ui/primitives";
import { Sparkline } from "@/components/ui/sparkline";

export interface KpiInput {
  risk: RiskStatus | null;
  /** Cash from /me/overview; undefined while loading, null when it could not be read. */
  cash: number | null | undefined;
  /** Open positions; undefined while loading, null when they could not be read. */
  positions: number | null | undefined;
  maxPositions: number | null;
  pending: number;
  /** "yarın 09:50", the soonest deadline among the open proposals. */
  soonest: string | null;
  /** The value line's closes (oldest first), drawn as a sparkline in the value tile. */
  trend?: readonly number[];
}

/** Today's move in TL, from the equity and the day's return (equity = start × (1 + r)). */
export function dailyTry(equity: number, dailyPct: number): number {
  return equity - equity / (1 + dailyPct);
}

function signedTry(n: number): string {
  const r = Math.round(n);
  if (r === 0) return `0${NBSP}TL`;
  return `${r > 0 ? "+" : "−"}${fmtInt(Math.abs(r))}${NBSP}TL`;
}

/**
 * The six numbers the desk opens with, as one row of tiles: value, today, cash, open
 * positions, proposals waiting for a signature and whether the desk is running. The value tile
 * is the way to Portföy.
 */
export function KpiRow({ risk, cash, positions, maxPositions, pending, soonest, trend = [] }: KpiInput) {
  const grid = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[1.35fr_1.1fr_1.2fr_1fr_1fr_1.15fr] xl:gap-4";
  if (!risk) {
    return (
      <div className={grid} role="status" aria-label="Özet yükleniyor">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[112px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  const total = fmtTry(risk.equity);
  const today = fmtSignedPct(risk.daily_pnl_pct, 2);
  const stopped = risk.kill_switch === "on";
  const paused = !stopped && risk.halted_today;

  return (
    <section aria-label="Masanın özeti" className={grid}>
      <Link
        href={ROUTES.portfoy}
        aria-label={`Portföyün: ${total}, bugün ${today}. Portföy’e git`}
        className="group relative col-span-2 block overflow-hidden rounded-xl border border-navy bg-navy p-4 text-on-navy shadow-card transition-[background-color,translate] duration-[var(--dur-quick)] hover:bg-navy-raised focus-visible:outline-offset-2 active:translate-y-px md:col-span-1 xl:p-5"
      >
        <Sparkline values={trend} className="pointer-events-none absolute right-0 bottom-0 h-11 w-[48%] text-[#7d9bd6] opacity-90 [mask-image:linear-gradient(to_right,transparent,black_45%)]" />
        <p className="flex items-center justify-between text-dense font-medium text-on-navy-soft">
          Portföy değeri
          <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:translate-x-0.5">
            →
          </span>
        </p>
        <p className="relative mt-2 text-[24px] leading-8 font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums xl:text-[26px]">
          <Figure value={risk.equity} kind="try" />
        </p>
        <p className="relative mt-1 text-meta text-on-navy-soft tabular-nums">{risk.drawdown_pct < 0 ? `zirveden ${fmtPct(risk.drawdown_pct, 1)}` : "zirvede"}</p>
      </Link>

      <Tile label="Bugünkü getiri" note={signedTry(dailyTry(risk.equity, risk.daily_pnl_pct))} noteTone={signTone(risk.daily_pnl_pct)}>
        <Figure value={risk.daily_pnl_pct} kind="signedPct" digits={2} className={signTone(risk.daily_pnl_pct)} />
      </Tile>

      <Tile label="Nakit" note={cash === null ? "okunamadı" : cash === undefined ? null : `portföyün ${fmtPct(cash / risk.equity, 0)}’i`}>
        {cash === undefined ? <Skeleton className="mt-1 h-7 w-28" /> : cash === null ? "—" : <Figure value={cash} kind="try" />}
      </Tile>

      <Tile label="Açık pozisyon" note={maxPositions !== null ? `en çok ${fmtInt(maxPositions)}` : null}>
        {positions === undefined ? <Skeleton className="mt-1 h-7 w-12" /> : positions === null ? "—" : <Figure value={positions} kind="int" />}
      </Tile>

      <Tile label="Bekleyen onay" note={stopped ? "durdurulunca düştü" : soonest ? `son: ${soonest}` : "sıra boş"}>
        <Figure value={pending} kind="int" />
      </Tile>

      <Tile
        label="Risk durumu"
        note={stopped ? "yeniden başlatma iki imzayla" : paused ? `gün içi ${fmtPct(risk.daily_pnl_pct, 1)}; sınır −%1` : `piyasa ${risk.regime === "crisis" ? "kriz" : "normal"}`}
        accent={stopped ? "north" : paused ? "ochre" : "gain"}
        className="col-span-2 md:col-span-1"
      >
        <span className={cn("inline-flex items-center gap-2", stopped ? "text-north" : "text-ink")}>
          <span aria-hidden className={cn("size-2.5 rounded-full", stopped ? "bg-north" : paused ? "bg-ochre" : "bg-gain")} />
          {stopped ? "Durduruldu" : paused ? "Yeni emir yok" : "Çalışıyor"}
        </span>
      </Tile>
    </section>
  );
}

function Tile({
  label,
  note,
  noteTone,
  accent,
  className,
  children,
}: {
  className?: string;
  label: string;
  note?: ReactNode;
  noteTone?: string;
  accent?: "north" | "ochre" | "gain";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-xl border border-line bg-panel p-4 shadow-card transition-[border-color,box-shadow] duration-[var(--dur-quick)] hover:border-line-strong xl:p-5",
        accent && "before:absolute before:inset-y-0 before:left-0 before:w-1",
        accent === "north" && "border-north/50 bg-north-tint before:bg-north",
        accent === "ochre" && "border-ochre bg-ochre-tint before:bg-ochre",
        accent === "gain" && "before:bg-gain",
        className,
      )}
    >
      <p className="text-dense font-medium text-muted">{label}</p>
      <p className="mt-2 text-[22px] leading-8 font-semibold tracking-[-0.02em] whitespace-nowrap text-ink tabular-nums xl:text-[24px]">{children}</p>
      {note ? <p className={cn("mt-1 truncate text-meta tabular-nums", noteTone ?? "text-muted")}>{note}</p> : null}
    </div>
  );
}
