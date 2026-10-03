"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ApprovalCard as Card, ApprovalStatus, Explain } from "@/lib/domain";
import { EVENT_LABEL } from "@/lib/domain";
import { IS_MOCK } from "@/lib/api/config";
import { fmtDateTime, fmtDuration, fmtInt, fmtPct, fmtPrice, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, FixtureBadge, RuleMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HashChip } from "@/components/ui/data";
import { Tooltip } from "@/components/ui/overlay";
import {
  ENTRY_LABEL,
  ESCALATION_LABEL,
  keptShare,
  leakFilter,
  multiplierLabel,
  STATUS_LABEL,
  type DecideGate,
  type DecisionKind,
} from "./approvals-logic";
import { EvidenceColumn, RuleTraceColumn, SkepticColumn } from "./card-sections";
import { DecisionOutcome, GraphRail, latestOrder } from "./outcome";

/**
 * One approval card, laid out so a Risk Officer decides without scrolling at 1440×900
 * (NFR-21, US-28): who/what/deadline → amounts → three evidence columns → the decision.
 * Raised (hard shadow) only while it waits for a human.
 */
export function ApprovalCardView({
  card,
  status,
  nowMs,
  gate,
  explain,
  explainLoading,
  onDecide,
}: {
  card: Card;
  status: ApprovalStatus;
  nowMs: number | null;
  gate: DecideGate;
  explain: Explain | null;
  explainLoading: boolean;
  onDecide: (kind: DecisionKind) => void;
}) {
  const open = status === "pending" || status === "claimed";
  const kill = gate.tone === "kill";
  return (
    <article
      aria-labelledby="onay-karti-baslik"
      className={cn(
        "relative border-[1.5px] bg-panel",
        kill ? "border-north" : "border-ink",
        open && !kill && gate.canDecide && "shadow-ink-lg",
        !open && "bg-panel/80",
      )}
    >
      {kill ? (
        <div role="alert" className="bg-north px-5 py-1.5 text-dense font-medium text-on-dark">
          KILL SWITCH AÇIK — onay, küçültme ve ret kapalı. Bekleyen öneriler iptal edilir.
        </div>
      ) : null}
      <CardHeader card={card} status={status} nowMs={nowMs} />
      <div className="border-y border-hairline bg-paper px-5 py-2.5">
        <GraphRail status={status} order={latestOrder(explain)} />
      </div>
      <Amounts card={card} />
      <div className="grid gap-x-6 gap-y-5 border-t border-hairline px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
        <RuleTraceColumn card={card} />
        <EvidenceColumn card={card} />
        <SkepticColumn card={card} />
      </div>
      {card.degraded ? (
        <p className="border-t border-hairline bg-wash-tint px-5 py-2 text-dense text-wash">Yedek model kullanıldı (degraded): kararı ekstra dikkatle verin.</p>
      ) : null}
      <footer className="border-t-[1.5px] border-ink px-5 py-4">
        {open ? <Actions gate={gate} onDecide={onDecide} /> : <DecisionOutcome card={card} status={status} explain={explain} loading={explainLoading} />}
        <CardMeta card={card} />
      </footer>
    </article>
  );
}

function CardHeader({ card, status, nowMs }: { card: Card; status: ApprovalStatus; nowMs: number | null }) {
  const ev = card.event_type === "EXIT" ? { code: "EXIT", tr: "Çıkış" } : EVENT_LABEL[card.event_type];
  return (
    <header className="flex flex-col items-start gap-x-6 gap-y-3 px-4 pt-4 pb-3 sm:flex-row sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="ink">
            <span className="code">{ev.code}</span>
            <span className="font-normal">{ev.tr}</span>
          </Badge>
          <Badge tone="outline">{card.sub_type_tr}</Badge>
          <Badge tone={card.side === "buy" ? "outline" : "muted"}>{card.side === "buy" ? "AL · yalnızca alım" : "SAT · çıkış"}</Badge>
          {card.level === "escalate" ? (
            <Badge tone="wash-solid" title={card.escalation_reasons.map((r) => ESCALATION_LABEL[r]).join(", ")}>
              Escalate · {card.escalation_reasons.map((r) => ESCALATION_LABEL[r]).join(", ") || "inceleme"}
            </Badge>
          ) : null}
          {card.is_fixture ? <FixtureBadge /> : null}
          {status !== "pending" ? <Badge tone={status === "rejected" ? "north" : status === "approved" ? "ink" : "muted"}>{STATUS_LABEL[status]}</Badge> : null}
        </div>
        <h2 id="onay-karti-baslik" className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="code text-[24px] leading-none font-medium text-ink">{card.ticker}</span>
          <span className="title-display text-[28px] text-ink sm:text-[32px]">{card.company_name}</span>
        </h2>
        <p className="mt-1.5 text-ui text-ink-soft">{card.headline_tr}</p>
      </div>
      <Deadline to={card.expires_at} decidedAt={card.decided_at} nowMs={nowMs} status={status} />
    </header>
  );
}

/** The 09:50 deadline (R15) as a large clock; north red only in the last 15 minutes. */
function Deadline({ to, decidedAt, nowMs, status }: { to: string; decidedAt: string | null; nowMs: number | null; status: ApprovalStatus }) {
  const left = nowMs === null ? null : Date.parse(to) - nowMs;
  const open = status === "pending" || status === "claimed";
  const urgent = open && left !== null && left > 0 && left < 15 * 60_000;
  return (
    <div className="shrink-0 sm:text-right">
      <div className="text-meta text-muted">{open ? "Düşmesine" : decidedAt ? "Karar saati" : "Son karar zamanı"}</div>
      <div className={cn("font-display pt-[0.1em] text-[30px] leading-none tabular-nums", urgent ? "text-north" : open ? "text-ink" : "text-muted")}>
        <time dateTime={to}>{!open ? (decidedAt ? fmtTime(decidedAt) : fmtTime(to)) : left === null ? "…" : left <= 0 ? "Süresi doldu" : fmtDuration(left)}</time>
      </div>
      <div className="mt-1 text-meta text-muted">{fmtDateTime(to)} · ertesi seans 09:50 (R15)</div>
    </div>
  );
}

function Amounts({ card }: { card: Card }) {
  const kept = keptShare(card);
  const mult = multiplierLabel(card.size_multiplier);
  const leak = leakFilter(card.rule_trace_summary);
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3.5 min-[480px]:grid-cols-2 sm:px-5 lg:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
      <Cell label="Önerilen">
        <span className="font-display text-[24px] leading-none text-ink-soft tabular-nums">{fmtInt(card.requested_notional_try)}</span>
        <span className="ml-1 text-meta text-muted">TL</span>
      </Cell>
      <Cell label={<>Risk sonrası{mult ? <span className="text-ink"> · şüpheci {mult}</span> : null}</>}>
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <span aria-hidden className="text-ink-soft">→</span>
          <span className="font-display text-[34px] leading-none text-ink tabular-nums">{fmtInt(card.final_notional_try)}</span>
          <span className="text-meta text-muted">TL</span>
          {kept !== null && kept < 1 ? (
            <span className="text-meta text-ink-soft">
              ({fmtPct(kept, 0)} korundu)
            </span>
          ) : null}
        </span>
      </Cell>
      <Cell label="Emir">
        <span className="text-ui text-ink tabular-nums">
          <b className="font-medium">{fmtInt(card.qty)} lot</b> · limit {fmtPrice(card.limit_price)}
        </span>
        <span className="block text-meta text-muted">
          {ENTRY_LABEL[card.entry]} · tutma {card.holding_days[0] === card.holding_days[1] ? card.holding_days[0] : `${card.holding_days[0]}–${card.holding_days[1]}`} gün
        </span>
      </Cell>
      <Cell label="Sızıntı filtresi">
        {leak ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <RuleMark passed={leak.passed} label={<span className="text-ui text-ink">{leak.passed ? "Geçti" : "Takıldı"}</span>} />
            <span className="text-meta text-muted tabular-nums">
              5 g {leak.observed ?? "—"} · eşik {leak.threshold ?? "—"}
            </span>
          </span>
        ) : (
          <span className="text-dense text-muted">Bu olay türünde uygulanmadı</span>
        )}
      </Cell>
    </dl>
  );
}

function Cell({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Actions({ gate, onDecide }: { gate: DecideGate; onDecide: (kind: DecisionKind) => void }) {
  const wrap = (node: ReactNode, enabled: boolean) =>
    enabled || !gate.reason ? (
      node
    ) : (
      <Tooltip content={gate.reason}>
        <span tabIndex={0} className="inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {node}
        </span>
      </Tooltip>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      {wrap(
        <Button size="lg" variant="primary" disabled={!gate.canApprove} aria-disabled={!gate.canApprove} onClick={() => onDecide("approve")}>
          Onayla
        </Button>,
        gate.canApprove,
      )}
      {wrap(
        <Button size="lg" variant="secondary" disabled={!gate.canApprove} aria-disabled={!gate.canApprove} onClick={() => onDecide("shrink")}>
          Küçült
        </Button>,
        gate.canApprove,
      )}
      {wrap(
        <Button size="lg" variant="danger-outline" disabled={!gate.canDecide} aria-disabled={!gate.canDecide} onClick={() => onDecide("reject")}>
          Reddet
        </Button>,
        gate.canDecide,
      )}
      <p className={cn("min-w-[200px] flex-1 text-dense", gate.tone === "kill" ? "text-north" : "text-ink-soft")}>
        {gate.reason ?? "Üç kararda da yorum ve doğrulama kodu zorunlu. Onay otomatik yürütme değildir: graf devam eder, SimBIST'e paper emir yazar."}
      </p>
    </div>
  );
}

function CardMeta({ card }: { card: Card }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-3 text-meta text-muted">
      <HashChip hash={card.prompt_manifest_hash} label="prompt manifest" />
      {IS_MOCK || card.is_fixture ? (
        <span title="Fikstür: KAP bağlantısı tıklanabilir değildir">KAP #{card.disclosure_index} · Temsili</span>
      ) : (
        <a href={card.disclosure_url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-ink">
          KAP #{card.disclosure_index}
        </a>
      )}
      <span className="code">{card.proposal_id}</span>
      <Link href={`/runs/${card.run_id}`} className="ml-auto text-dense font-medium text-ink underline underline-offset-4 hover:text-wash">
        Neden bu işlem? →
      </Link>
    </div>
  );
}
