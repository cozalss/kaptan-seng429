"use client";

import { useState } from "react";
import Link from "next/link";
import type { OrderTicket } from "@/lib/domain";
import { useNow } from "@/lib/clock";
import { fmtDuration, fmtInt, fmtPrice, fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { dative, locative, titleTr } from "@/components/story/turkish";
import { shortName } from "@/components/story/plain";
import { ENTRY_LABEL, isMarkable, ticketPhase, validFrom } from "@/components/tickets/ticket-logic";
import { SlipActions } from "./slip-actions";
import "./oneri.css";

/**
 * The emir fişi as a printed paper slip: what you type into your broker app in ruled boxes
 * (Lot · Limit · Seans), the validity clock with a rule that runs down, then a tear-off stub
 * with Girdim, Kopyala and "…" (Dolmadı, İptal). İmza anı: right after a signature given here,
 * the slip is laid on top of the decision sheet (`laid`); never on mount or reload.
 */
export function OrderSlip({
  ticket,
  onMarked,
  compact = false,
  laid = false,
  className,
}: {
  ticket: OrderTicket;
  onMarked?: (t: OrderTicket) => void;
  compact?: boolean;
  laid?: boolean;
  className?: string;
}) {
  const [current, setCurrent] = useState(ticket);
  const [prevProp, setPrevProp] = useState(ticket);
  if (prevProp !== ticket) {
    setPrevProp(ticket);
    // A late echo of the unmarked ticket must never undo a mark made here.
    if (!(isMarkable(ticket) && !isMarkable(current))) setCurrent(ticket);
  }
  const [justMarked, setJustMarked] = useState(false);
  // Bumped on every successful Kopyala: re-keys the boxes so their wash flashes again.
  const [copies, setCopies] = useState(0);
  const t = current;
  const marked = !isMarkable(t);
  const done = (next: OrderTicket) => {
    setCurrent(next);
    setJustMarked(true);
    onMarked?.(next);
  };

  return (
    <div
      data-ticket-slip={t.ticket_no}
      aria-label={`Emir fişi ${t.ticket_no}`}
      role="group"
      className={cn("paper-grain relative border-2 border-ink bg-panel shadow-ink", laid && "oneri-slip-lay", className)}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 sm:px-6">
        <span className="label">Emir fişi</span>
        <span className="code text-meta text-ink-soft">{t.ticket_no}</span>
      </div>
      <div className="space-y-4 px-5 pt-3 pb-5 sm:px-6">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink">
          <span className="bg-ink px-2 py-0.5 text-[14px] leading-5 font-semibold tracking-[0.1em] text-on-dark">AL</span>
          <span className="code text-[28px] leading-none tracking-normal">{t.ticker}</span>
          <span className="text-dense text-muted">{titleTr(shortName(t.company_name))}</span>
        </p>
        <dl key={copies} className={cn("grid border-2 border-ink", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-[1fr_1.2fr_2fr]")}>
          <Box label="Lot" value={fmtInt(t.qty)} flash={copies > 0} />
          <Box label="Limit" value={fmtPrice(t.limit_price)} flash={copies > 0} className="border-l-2 border-rule-ui" />
          <Box
            label="Seans"
            value={t.session_tr}
            flash={copies > 0}
            className={cn("col-span-2 border-t-2 border-rule-ui", !compact && "sm:col-span-1 sm:border-t-0 sm:border-l-2")}
            small
          />
        </dl>
        {marked ? <Marked ticket={t} pressed={justMarked} /> : <Validity ticket={t} />}
      </div>
      {marked ? null : <SlipActions ticket={t} onMarked={done} onCopied={() => setCopies((n) => n + 1)} />}
    </div>
  );
}

/** One ruled box on the slip: a small label, the value in tabular figures. */
function Box({ label, value, flash, small = false, className }: { label: string; value: string; flash: boolean; small?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0 px-3 pt-2 pb-2.5", flash && "oneri-copied", className)}>
      <dt className="text-meta font-medium text-ink-soft">{label}</dt>
      <dd className={cn("mt-0.5 text-ink tabular-nums", small ? "text-ui leading-7" : "text-[22px] leading-7 font-medium tracking-[-0.01em]")}>{value}</dd>
    </div>
  );
}

/** How long the slip may still be entered: a sentence and a rule that runs down over the 30 minutes. */
function Validity({ ticket }: { ticket: OrderTicket }) {
  const now = useNow(1_000);
  if (now === null) return <p className="h-[30px] text-[14px] text-muted">…</p>;
  const phase = ticketPhase(ticket, now);
  const from = Date.parse(validFrom(ticket));
  const until = Date.parse(ticket.valid_until);
  const left = phase === "valid" ? Math.max(0, Math.min(1, (until - now) / Math.max(1, until - from))) : phase === "upcoming" ? 1 : 0;
  const text =
    phase === "upcoming"
      ? `Geçerlilik ${locative(fmtTime(validFrom(ticket)))} başlar`
      : phase === "expired"
        ? "Süresi doldu — artık girme. Ne olduğunu yine de işaretle."
        : `Geçerli · ${fmtDuration(until - now)} kaldı`;
  return (
    <div className="space-y-2">
      <p className={cn("text-[14px] tabular-nums", phase === "valid" ? "text-ink" : "text-muted")} aria-live="off">
        {text}
        {phase === "valid" ? <span className="text-muted"> · {dative(fmtTime(ticket.valid_until))} kadar</span> : null}
      </p>
      <div aria-hidden className="h-[3px] bg-hairline">
        <div className={cn("h-full origin-left", phase === "valid" ? "bg-ink" : "bg-rule-soft")} style={{ transform: `scaleX(${left})` }} />
      </div>
    </div>
  );
}

function Marked({ ticket, pressed }: { ticket: OrderTicket; pressed: boolean }) {
  const e = ticket.entry;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className={cn(pressed && "animate-stamp-in", "inline-block -rotate-2 border-[2.5px] border-ink px-2.5 py-1 text-[14px] font-semibold tracking-[0.06em] text-ink uppercase [--stamp-rot:-2deg]")}>
        {ENTRY_LABEL[e.status]}
        {e.status === "entered" && e.filled_qty && e.avg_price ? ` · ${fmtInt(e.filled_qty)} lot @ ${fmtPrice(e.avg_price)}` : ""}
      </p>
      {e.status === "entered" ? (
        <Link href={ROUTES.portfoy} className="text-[15px] font-medium text-ink underline underline-offset-4">
          Portföyünde →
        </Link>
      ) : null}
    </div>
  );
}
