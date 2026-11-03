"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OrderTicket } from "@/lib/domain";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { fmtLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { Term } from "@/components/story/term";
import { titleTr } from "@/components/story/turkish";
import { AFTER_APPROVAL, ENTRY_LABEL, isMarkable, SIDE_LABEL, SIDE_VERB, ticketPhase, validFrom, validityWords, whenWords } from "@/components/tickets/ticket-logic";
import { InkSeal } from "./seal";
import { SlipActions } from "./slip-actions";
import "./oneri.css";
import "./oneri-slip.css";
import "@/components/ufuk/ufuk.css";

/** Once marked, the heading says what is now true. */
const MARKED_SAYS: Readonly<Record<OrderTicket["entry"]["status"], string>> = {
  entered: "Girdin. Param’a yazıldı.",
  unfilled: "Gerçekleşmedi. Bu işlem kapandı.",
  canceled: "Girmedin. Bu işlem kapandı.",
  awaiting: "",
  expired: "",
};

/**
 * What an approval has become: the plain truth that nothing has happened yet, what to type into the
 * bank's app (how many, at most what price, in total), a copy button, how long it stays valid, and
 * Girdim / Giremedim. `laid`: approved here and now, so it opens under the seal (never on a reload).
 */
export function OrderSlip({
  ticket,
  onMarked,
  laid = false,
  focusOnMount = false,
  proposedQty = null,
  className,
}: {
  ticket: OrderTicket;
  onMarked?: (t: OrderTicket) => void;
  laid?: boolean;
  focusOnMount?: boolean;
  /** The amount on the suggestion that was approved: the order is sized for the account and may differ. */
  proposedQty?: number | null;
  className?: string;
}) {
  const [current, setCurrent] = useState(ticket);
  const [prevProp, setPrevProp] = useState(ticket);
  if (prevProp !== ticket) {
    setPrevProp(ticket);
    // A late echo of the unmarked ticket must never undo a mark made here.
    if (!(isMarkable(ticket) && !isMarkable(current))) setCurrent(ticket);
  }
  // Bumped on every successful Kopyala: re-keys the boxes so their wash flashes again.
  const [copies, setCopies] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) heading.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  const t = current;
  const marked = !isMarkable(t);
  const done = (next: OrderTicket) => {
    setCurrent(next);
    onMarked?.(next);
  };

  return (
    <div
      data-ticket-slip={t.ticket_no}
      aria-label={`Bankana gireceğin işlem ${t.ticket_no}`}
      role="group"
      data-side={t.side}
      className={cn("oneri-paper oneri-slip", laid && "oneri-reveal", className)}
    >
      <InkSeal word="ONAYLADIN" className="oneri-slip-seal" />
      <h3 ref={heading} tabIndex={-1} className="u-chapter oneri-slip-head">
        {marked ? (MARKED_SAYS[t.entry.status] ?? AFTER_APPROVAL.heading) : AFTER_APPROVAL.heading}
      </h3>
      {marked ? null : <BankWords />}
      <div className="oneri-slip-what">
        <p className="oneri-slip-verb">
          <span aria-label={SIDE_LABEL[t.side]} className="oneri-slip-verb-word">
            {SIDE_VERB[t.side]}
          </span>{" "}
          <span className="oneri-slip-company">{titleTr(shortName(t.company_name))}</span> <span className="oneri-slip-symbol">{t.ticker}</span>
        </p>
        {marked ? null : (
          <dl key={copies} className="oneri-slip-boxes">
            <Box label="Adet" value={fmtInt(t.qty)} flash={copies > 0} />
            <Box label={t.side === "sell" ? "Tanesi en az" : "Tanesi en fazla"} value={fmtLira(t.limit_price, true)} flash={copies > 0} />
            <Box label="Toplam yaklaşık" value={fmtLira(t.est_notional_try)} flash={copies > 0} />
          </dl>
        )}
        {!marked && proposedQty !== null && proposedQty !== t.qty ? (
          <p className="oneri-slip-note">
            Öneride {fmtInt(proposedQty)} adet yazıyordu. Bu bilgiler {fmtLira(t.account_equity_try)}’lik hesabına göre hesaplandı, bu yüzden {fmtInt(t.qty)} adet.
          </p>
        ) : null}
      </div>
      {marked ? <Marked ticket={t} /> : <Validity ticket={t} />}
      {marked ? null : <SlipActions ticket={t} onMarked={done} onCopied={() => setCopies((n) => n + 1)} />}
    </div>
  );
}

/** The sentence that keeps anyone from believing the order is done. */
/** The instruction, with its one unavoidable word explained where it stands. */
function BankWords() {
  const [before, after] = AFTER_APPROVAL.body.split("aracı kurumunun");
  return (
    <div className="oneri-slip-body">
      <p>
        {before}
        <Term word="aracı kurum">aracı kurumunun</Term>
        {after}
      </p>
    </div>
  );
}

function Box({ label, value, flash }: { label: string; value: string; flash: boolean }) {
  return (
    <div className={cn("oneri-slip-box", flash && "oneri-copied")}>
      <dt className="u-caption">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** How long the slip may still be entered: one instruction and a thin line that runs down. */
function Validity({ ticket }: { ticket: OrderTicket }) {
  const now = useNow(1_000);
  const when = whenWords(ticket);
  if (now === null) return <p className="oneri-slip-valid">…</p>;
  const phase = ticketPhase(ticket, now);
  const from = Date.parse(validFrom(ticket));
  const until = Date.parse(ticket.valid_until);
  const left = phase === "valid" ? Math.max(0, Math.min(1, (until - now) / Math.max(1, until - from))) : phase === "upcoming" ? 1 : 0;
  return (
    <div className="oneri-slip-valid" data-phase={phase}>
      <p aria-live="off">
        <strong>{validityWords(ticket, now)}</strong>
        {when ? <span> {when}.</span> : null}
      </p>
      <div aria-hidden className="oneri-slip-clock">
        <div style={{ transform: `scaleX(${left})` }} />
      </div>
    </div>
  );
}

function Marked({ ticket }: { ticket: OrderTicket }) {
  const e = ticket.entry;
  return (
    <div className="oneri-slip-marked">
      <p>
        {ENTRY_LABEL[e.status]}
        {e.status === "entered" && e.filled_qty && e.avg_price ? ` · ${fmtInt(e.filled_qty)} adet, tanesi ${fmtLira(e.avg_price, true)}` : ""}
      </p>
      {e.status === "entered" ? (
        <Link href={ROUTES.portfoy} className="oneri-slip-link">
          Param’da gör →
        </Link>
      ) : null}
    </div>
  );
}
