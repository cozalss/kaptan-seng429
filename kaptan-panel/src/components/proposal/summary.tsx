import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";
import { fmtInt, fmtPct, fmtPrice, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { decisionMetaLine, type RiskView } from "@/components/story/plain";

/**
 * The proposal at a glance: the order in one line (lot, limit), then four figures (total, hold,
 * stop level, worst case) and, while it is open, the deadline. Everything a signer needs before
 * the two signatures; the reasons live below, behind "Neden bu öneri?".
 */
export function ProposalSummary({
  card,
  status,
  risk,
  riskLoading,
  perTradeCap,
  equity,
  nowMs,
}: {
  card: ApprovalCard;
  status: ApprovalStatus;
  risk: RiskView | null;
  riskLoading: boolean;
  perTradeCap: number | null;
  equity: number | null;
  nowMs: number | null;
}) {
  const [a, b] = card.holding_days;
  const riskHint = riskLoading ? "…" : "Bu öneride yok";
  return (
    <section aria-labelledby="oneri-ozet" className="border border-rule-soft bg-panel">
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <h2 id="oneri-ozet" className="text-dense font-semibold text-muted">
          Öneri
        </h2>
        <p className="mt-1 text-[24px] leading-8 font-semibold tracking-[-0.01em] text-ink tabular-nums sm:text-[28px] sm:leading-9">
          {fmtInt(card.qty)} lot al <span className="font-normal text-muted">·</span> limit {fmtPrice(card.limit_price)}
        </p>
      </div>
      <dl className="grid grid-cols-2 border-t border-hairline sm:grid-cols-4">
        <Figure label="Toplam tutar" value={`≈ ${fmtTry(card.final_notional_try)}`} />
        <Figure label="Tutma süresi" value={a === b ? `${a} gün` : `${a}–${b} gün`} className="border-l border-hairline" />
        <Figure
          label="Zarar durdurma"
          value={risk ? fmtPrice(risk.stopPrice) : riskHint}
          note={risk ? `Fiyat ${fmtPct(-risk.stopPct)} düşerse sat` : undefined}
          className="border-t border-hairline sm:border-t-0 sm:border-l"
        />
        <Figure
          label="En kötü durumda"
          value={risk ? `−${fmtTry(risk.maxLoss)}` : riskHint}
          note={risk && perTradeCap ? `İşlem başı sınır ≈ ${fmtTry(perTradeCap)}` : undefined}
          tone={risk ? "loss" : undefined}
          className="border-t border-l border-hairline sm:border-t-0"
        />
      </dl>
      {status === "pending" ? (
        <p className="border-t border-hairline px-5 py-3 text-dense text-ink tabular-nums sm:px-6">{decisionMetaLine(card, equity, nowMs)}</p>
      ) : null}
    </section>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "loss";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-5 py-4 sm:px-6", className)}>
      <dt className="text-dense text-muted">{label}</dt>
      <dd className={cn("mt-1 text-[20px] leading-7 font-semibold tabular-nums", tone === "loss" ? "text-loss" : "text-ink")}>
        {value}
      </dd>
      {note ? <dd className="mt-0.5 text-dense text-muted tabular-nums">{note}</dd> : null}
    </div>
  );
}
