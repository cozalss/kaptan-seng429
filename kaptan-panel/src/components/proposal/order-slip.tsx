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
import { ENTRY_LABEL, SIDE_LABEL, SIDE_VERB, isMarkable, ticketPhase, validFrom } from "@/components/tickets/ticket-logic";
import { SlipActions } from "./slip-actions";
import "./oneri.css";

/**
 * The emir fişi: what you type into your broker app (Lot · Limit · Seans), how long it is valid,
 * then Girdim, Kopyala and "…" (Dolmadı, İptal). Right after a signature given here the slip
 * rises in once (`laid`); never on mount or reload.
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
      className={cn("relative border border-rule-soft bg-panel", laid && "oneri-slip-lay", className)}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5 sm:px-6">
        <span className="text-[19px] leading-7 font-semibold text-ink">Emir fişi</span>
        <span className="code text-dense text-muted">{t.ticket_no}</span>
      </div>
      <div className="space-y-4 px-5 pt-3 pb-5 sm:px-6">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink">
          <span
            data-side={t.side}
            aria-label={SIDE_LABEL[t.side]}
            className={cn(
              "px-2 py-0.5 text-[14px] leading-5 font-semibold tracking-[0.06em] text-on-dark",
              t.side === "sell" ? "bg-loss" : "bg-gain",
            )}
          >
            {SIDE_VERB[t.side]}
          </span>
          <span className="code text-[22px] leading-none font-semibold">{t.ticker}</span>
          <span className="text-dense text-muted">{titleTr(shortName(t.company_name))}</span>
        </p>
        <dl key={copies} className={cn("grid border border-rule-soft", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-[1fr_1.2fr_2fr]")}>
          <Box label="Lot" value={fmtInt(t.qty)} flash={copies > 0} />
          <Box label="Limit" value={fmtPrice(t.limit_price)} flash={copies > 0} className="border-l border-hairline" />
          <Box
            label="Seans"
            value={t.session_tr}
            flash={copies > 0}
            className={cn("col-span-2 border-t border-hairline", !compact && "sm:col-span-1 sm:border-t-0 sm:border-l")}
            small
          />
        </dl>
        {marked ? <Marked ticket={t} pressed={justMarked} /> : <Validity ticket={t} />}
      </div>
      {marked ? null : <SlipActions ticket={t} onMarked={done} onCopied={() => setCopies((n) => n + 1)} />}
    </div>
  );
}

/** One box on the slip: a small label, the value in tabular figures. */
function Box({ label, value, flash, small = false, className }: { label: string; value: string; flash: boolean; small?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0 px-3 pt-2 pb-2.5", flash && "oneri-copied", className)}>
      <dt className="text-dense text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-ink tabular-nums", small ? "text-[16px] leading-7" : "text-[22px] leading-7 font-semibold")}>{value}</dd>
    </div>
  );
}

/** How long the slip may still be entered: a sentence and a thin bar that runs down over the 30 minutes. */
function Validity({ ticket }: { ticket: OrderTicket }) {
  const now = useNow(1_000);
  if (now === null) return <p className="h-[30px] text-dense text-muted">…</p>;
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
      <p className={cn("text-dense tabular-nums", phase === "valid" ? "text-ink" : "text-muted")} aria-live="off">
        {text}
        {phase === "valid" ? <span className="text-muted"> · {dative(fmtTime(ticket.valid_until))} kadar</span> : null}
      </p>
      <div aria-hidden className="h-1 bg-sunk">
        <div className={cn("h-full origin-left", phase === "valid" ? "bg-brand" : "bg-rule-soft")} style={{ transform: `scaleX(${left})` }} />
      </div>
    </div>
  );
}

function Marked({ ticket, pressed }: { ticket: OrderTicket; pressed: boolean }) {
  const e = ticket.entry;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className={cn(pressed && "animate-fade-in", "inline-block border border-ink px-2.5 py-1 text-dense font-semibold text-ink")}>
        {ENTRY_LABEL[e.status]}
        {e.status === "entered" && e.filled_qty && e.avg_price ? ` · ${fmtInt(e.filled_qty)} lot @ ${fmtPrice(e.avg_price)}` : ""}
      </p>
      {e.status === "entered" ? (
        <Link href={ROUTES.portfoy} className="text-dense font-medium text-ink underline underline-offset-4">
          Portföyünde →
        </Link>
      ) : null}
    </div>
  );
}
