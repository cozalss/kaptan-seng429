"use client";

import Link from "next/link";
import type { ApprovalCard, ApprovalStatus, Explain, Order } from "@/lib/domain";
import { accountName } from "@/lib/auth/accounts";
import { fmtInt, fmtTime, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HashChip } from "@/components/ui/data";
import { SkeletonLines } from "@/components/ui/primitives";
import { executionStage, lotsFor, STATUS_LABEL, type ExecTone } from "./approvals-logic";

/**
 * The LangGraph moment made visible: the run stopped at `interrupt()` and waits for a human;
 * the decision resumes it into a SimBIST paper order, a fill and an audit entry.
 */
type Mark = "done" | "now" | "fail" | "idle" | "skip";

function markOf(tone: ExecTone): Mark {
  if (tone === "done") return "done";
  if (tone === "failed") return "fail";
  if (tone === "idle") return "idle";
  return "now";
}

export function GraphRail({ status, order }: { status: ApprovalStatus; order: Order | undefined }) {
  const decidedMark: Mark = status === "approved" ? "done" : status === "pending" || status === "claimed" ? "now" : "fail";
  const exec = executionStage(order);
  const approved = status === "approved";
  const orderMark: Mark = !approved ? "skip" : order ? (order.status === "rejected" ? "fail" : "done") : "now";
  const fillMark: Mark = !approved ? "skip" : order ? markOf(exec.tone) : "idle";
  const decisionSub =
    status === "pending" || status === "claimed" ? "interrupt() · bekliyor" : status === "approved" ? "resume" : status === "rejected" ? "ret · NO_TRADE" : STATUS_LABEL[status];
  const steps: Array<{ label: string; sub: string; mark: Mark }> = [
    { label: "Risk kapısı", sub: "R01–R16", mark: "done" },
    { label: "Onay talebi", sub: "R15", mark: "done" },
    { label: "İnsan kararı", sub: decisionSub, mark: decidedMark },
    { label: "SimBIST emri", sub: approved ? (order ? (order.tif === "opg" ? "açılış · OPG" : "gün içi limit") : "yazılıyor…") : "—", mark: orderMark },
    { label: "Dolum", sub: approved ? exec.label : "—", mark: fillMark },
  ];
  return (
    <ol aria-label="Graf adımları" className="flex items-stretch overflow-x-auto">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-[118px] flex-1 items-center gap-2" aria-current={s.mark === "now" ? "step" : undefined}>
          <StepMark mark={s.mark} />
          <span className="min-w-0 leading-tight">
            <span className={cn("block text-dense", s.mark === "skip" || s.mark === "idle" ? "text-muted" : "font-medium text-ink")}>{s.label}</span>
            <span className={cn("block truncate text-meta", s.mark === "fail" && s.label !== "İnsan kararı" ? "text-north" : "text-muted")}>{s.sub}</span>
          </span>
          {i < steps.length - 1 ? <span aria-hidden className={cn("mx-1 h-px min-w-3 flex-1", s.mark === "done" ? "bg-ink" : "bg-rule-soft")} /> : null}
        </li>
      ))}
    </ol>
  );
}

function StepMark({ mark }: { mark: Mark }) {
  const label = { done: "tamam", now: "şimdi", fail: "durdu", idle: "sırada", skip: "atlandı" }[mark];
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "grid size-5 shrink-0 place-items-center border-[1.5px] text-[11px] leading-none",
        mark === "done" && "border-ink bg-ink text-on-dark",
        mark === "now" && "border-ink bg-panel",
        mark === "fail" && "border-ink-soft bg-sunk text-ink-soft",
        (mark === "idle" || mark === "skip") && "border-rule-soft bg-panel text-muted",
      )}
    >
      {mark === "done" ? "✓" : mark === "now" ? <span className="size-2 animate-pulse-dot bg-ink" /> : mark === "fail" ? "✗" : ""}
    </span>
  );
}

/** Decided card: the stamp, who/when/why, the paper execution and the audit entry. */
export function DecisionOutcome({ card, status, explain, loading }: { card: ApprovalCard; status: ApprovalStatus; explain: Explain | null; loading: boolean }) {
  const order = latestOrder(explain);
  const exec = executionStage(order);
  const audit = explain?.audit_positions.filter((a) => a.action === "approval.decided").at(-1) ?? null;
  const shrunk = card.approved_notional_try !== null && status === "approved";
  return (
    <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
      <Stamp status={status} />
      <div className="min-w-0 space-y-3">
        <p className="text-ui text-ink">
          {card.decided_by ? <b className="font-medium">{accountName(card.decided_by)}</b> : "Sistem"}
          {card.decided_at ? <span className="text-ink-soft"> · {fmtTime(card.decided_at)}</span> : null}
          {shrunk && card.approved_notional_try ? (
            <span className="text-ink-soft">
              {" "}
              · küçültülerek: <b className="font-medium text-ink tabular-nums">{fmtTry(card.approved_notional_try)}</b> ({fmtInt(lotsFor(card.approved_notional_try, card.limit_price))} lot)
            </span>
          ) : null}
        </p>
        {card.decision_comment ? (
          <blockquote className="border-l-[3px] border-ink bg-sunk px-3 py-2 text-dense text-ink">“{card.decision_comment}”</blockquote>
        ) : status === "expired" ? (
          <p className="text-dense text-ink-soft">{"09:50'ye kadar karar verilmedi; öneri kendiliğinden düştü (R15). Emir yazılmadı."}</p>
        ) : status === "cancelled" ? (
          <p className="text-dense text-ink-soft">Kill switch açıldığı için bekleyen öneri iptal edildi. Emir yazılmadı.</p>
        ) : null}

        {status === "approved" ? (
          <div className={cn("border-[1.5px] px-3 py-2", exec.tone === "failed" ? "border-ink-soft bg-sunk" : "border-ink bg-panel")} role="status" aria-live="polite">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-meta text-muted">Paper yürütme</span>
              <span className={cn("text-ui font-medium", exec.tone === "failed" ? "text-ink-soft" : "text-ink")}>{exec.label}</span>
            </div>
            <p className="mt-0.5 text-dense text-ink-soft">{exec.detail}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-dense">
          {loading && !explain ? <SkeletonLines lines={1} className="w-40" /> : null}
          {audit ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-meta text-muted">Audit</span>
              <span className="font-medium tabular-nums">#{fmtInt(audit.chain_pos)}</span>
              <span className="code text-ink-soft">{audit.action}</span>
              <HashChip hash={audit.hash} label="hash" />
            </span>
          ) : explain && !loading ? (
            <span className="text-meta text-muted">Audit kaydı zincirde (önceki seans).</span>
          ) : null}
          {explain?.ticket ? (
            <Link href="/portfolio?sekme=fis" className="font-medium underline underline-offset-4 hover:text-wash">
              Emir fişi <span className="code">{explain.ticket.ticket_no}</span> · kişisel mod
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The paper (SimBIST) order of the card; a personal-mode ticket order is shown separately. */
export function latestOrder(explain: Explain | null): Order | undefined {
  if (!explain) return undefined;
  const paper = explain.orders.filter((o) => o.broker === "simbist");
  return [...(paper.length ? paper : explain.orders)].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

function Stamp({ status }: { status: ApprovalStatus }) {
  const text = status === "approved" ? "Onaylandı" : status === "rejected" ? "Reddedildi" : status === "expired" ? "Süresi doldu" : status === "cancelled" ? "İptal" : "İnceleniyor";
  return (
    <div
      className={cn(
        "animate-stamp-in self-start border-[2.5px] px-4 pt-2 pb-1.5 [--stamp-rot:-2.5deg] [transform:rotate(var(--stamp-rot))]",
        status === "approved" && "border-ink text-ink",
        status === "rejected" && "border-north text-north",
        (status === "expired" || status === "cancelled" || status === "claimed") && "border-rule-soft text-muted",
      )}
    >
      <span className="title-display block text-[30px]">{text}</span>
    </div>
  );
}
