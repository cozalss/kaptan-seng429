import type { ApprovalCard } from "@/lib/domain";
import { STRENGTH_LABEL } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, RuleMark, SeverityBadge } from "@/components/ui/badge";
import { LlmNote } from "@/components/ui/primitives";
import { multiplierLabel, traceTally } from "./approvals-logic";

/**
 * The three columns an officer reads before deciding (US-28 "tek bakışta"): the rule trace
 * (✓/✗), the evidence summary (n, median CAR 5/20 d, hit rate, strength) and the skeptic +
 * compliance notes. Dense, ruled, no ornament.
 */
function ColumnHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline gap-2 border-b border-ink pb-1">
      <h3 className="text-dense font-medium text-ink">{title}</h3>
      {aside ? <span className="ml-auto text-meta text-muted">{aside}</span> : null}
    </div>
  );
}

export function RuleTraceColumn({ card }: { card: ApprovalCard }) {
  const t = traceTally(card.rule_trace_summary);
  return (
    <section aria-label="Kural izi özeti" className="min-w-0">
      <ColumnHead
        title="Kural izi"
        aside={
          <span className={cn("tabular-nums", t.passed === t.total ? "text-ink" : "text-ink-soft")}>
            {t.passed}/{t.total} geçti
          </span>
        }
      />
      {t.total === 0 ? (
        <p className="text-dense text-muted">Kural izi yok.</p>
      ) : (
        <ul className="space-y-1">
          {card.rule_trace_summary.map((r) => (
            <li key={r.rule} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3" title={r.detail_tr}>
              <RuleMark passed={r.passed} label={<span className="code text-ink-soft">{r.rule}</span>} />
              <span className="min-w-0 truncate text-right text-meta whitespace-nowrap text-muted tabular-nums" title={[r.observed, r.threshold].filter(Boolean).join(" · ")}>
                {r.observed ? <span className="text-ink">{r.observed}</span> : null}
                {r.threshold ? <> · {r.threshold}</> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EvidenceColumn({ card }: { card: ApprovalCard }) {
  const e = card.evidence_summary;
  const weak = e.strength === "weak" || e.strength === "insufficient";
  return (
    <section aria-label="Kanıt özeti" className="min-w-0">
      <ColumnHead
        title="Kanıt"
        aside={
          <Badge tone={weak ? "outline" : "ink"} title="Güç: n ≥ 15 güçlü, 8–14 orta, 5–7 zayıf">
            {STRENGTH_LABEL[e.strength]}
          </Badge>
        }
      />
      <div className="flex items-end gap-4">
        <div>
          <div className="text-meta text-muted">Benzer olay</div>
          <div className="font-display pt-[0.12em] text-[30px] leading-none tabular-nums">{fmtInt(e.n)}</div>
        </div>
        <HitBar rate={e.hit_rate_5d} />
      </div>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-dense">
        <dt className="text-ink-soft">Medyan anormal getiri · 5 g</dt>
        <dd className="font-medium tabular-nums">{fmtSignedPct(e.median_car_5d)}</dd>
        <dt className="text-ink-soft">Medyan anormal getiri · 20 g</dt>
        <dd className="font-medium tabular-nums">{fmtSignedPct(e.median_car_20d)}</dd>
      </dl>
      <p className="mt-1.5 text-meta text-muted">Geçmiş benzer olaylar; gelecek getiri vaadi değildir.</p>
    </section>
  );
}

/** Hit rate as a ruled 10-cell scale: legible at a glance, exact on hover. */
function HitBar({ rate }: { rate: number }) {
  const filled = Math.round(rate * 10);
  return (
    <div className="min-w-0 flex-1 pb-0.5">
      <div className="flex items-baseline justify-between text-meta text-muted">
        <span>İsabet · 5 g</span>
        <span className="font-medium text-ink tabular-nums">{fmtPct(rate, 0)}</span>
      </div>
      <div className="mt-1 grid h-2.5 grid-cols-10 gap-px border border-ink bg-panel" role="img" aria-label={`İsabet oranı ${fmtPct(rate, 0)}`}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={i < filled ? "bg-ink" : "bg-sunk"} />
        ))}
      </div>
    </div>
  );
}

export function SkepticColumn({ card }: { card: ApprovalCard }) {
  const mult = multiplierLabel(card.size_multiplier);
  return (
    <section aria-label="Şüpheci ve uyum" className="min-w-0">
      <ColumnHead title="Şüpheci" aside={mult ? <span className="font-medium text-ink">boyut {mult}</span> : "küçültme yok"} />
      {card.skeptic_flags.length ? (
        <ul className="mb-1.5 space-y-1">
          {card.skeptic_flags.map((f) => (
            <li key={`${f.code}-${f.detail_tr}`} className="flex items-start gap-2 text-dense">
              <SeverityBadge severity={f.severity} />
              <span className="code mt-px text-muted">{f.code}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="line-clamp-3 text-dense text-ink" title={card.skeptic_note_tr}>
        {card.skeptic_note_tr}
      </p>
      <div className="mt-2 border-t border-hairline pt-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-meta text-muted">Uyum</span>
          <span className="min-w-0 truncate text-dense text-ink" title={card.compliance_summary_tr}>
            {card.compliance_summary_tr}
          </span>
        </div>
        <LlmNote className="mt-0.5" />
      </div>
    </section>
  );
}
