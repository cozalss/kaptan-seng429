import type { Position } from "@/lib/domain";
import { fmtInt, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { holdingProgress, positionReturn } from "./risk-math";

/** "3 gün kaldı" / "bugün çıkılır" / "çıkış günü geçti" — sessions left until the planned exit. */
export function exitLine(p: Pick<Position, "opened_at" | "planned_exit_date">, today: string): string {
  const h = holdingProgress(p, today);
  if (h.overdue) return "çıkış günü geçti";
  if (h.dueToday) return "bugün çıkılır";
  return `${Math.max(1, h.planned - h.elapsed)} gün kaldı`;
}

function signedTry(n: number): string {
  if (n === 0) return "0 TL";
  return `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(Math.round(n)))} TL`;
}

/** What you hold: name, lots, gain/loss in TL and %, and how long until it is sold. */
export function Holdings({ positions, today }: { positions: readonly Position[]; today: string }) {
  if (!positions.length) return <p className="text-[17px] text-ink-soft">Şu an elinde hisse yok.</p>;
  return (
    <ul aria-label="Elindekiler" className="divide-y divide-hairline border-y border-hairline">
      {positions.map((p) => {
        const r = positionReturn(p);
        return (
          <li key={`${p.ticker}-${p.book}-${p.opened_at}`} className="flex items-baseline justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-medium text-ink">{shortName(p.company_name)}</p>
              <p className="mt-0.5 text-[14px] text-muted">
                {fmtInt(p.qty)} lot · {p.book === "personal" ? "hesabında" : "sanal"} · {exitLine(p, today)}
              </p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className={cn("text-[16px] font-medium", p.unrealized_pnl < 0 ? "text-ink-soft" : "text-ink")}>{signedTry(p.unrealized_pnl)}</p>
              <p className="mt-0.5 text-[14px] text-muted">{fmtSignedPct(r)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
