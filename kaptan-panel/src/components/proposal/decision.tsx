"use client";

import { useEffect, useRef, useState } from "react";
import type { ApprovalCard, ApprovalStatus, OrderTicket } from "@/lib/domain";
import { fmtInt, fmtPrice, fmtTime, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDesk } from "@/components/shell/desk-state";
import { STATUS_LABEL } from "@/components/approvals/approvals-logic";
import { decisionMetaLine, holdLine, type RiskView } from "@/components/story/plain";
import { withNums } from "@/components/story/num";
import { DecisionActions } from "./decision-actions";
import { OrderSlip } from "./order-slip";
import { SignatureLines } from "./signatures";
import "./oneri.css";

const CLOSED: Partial<Record<ApprovalStatus, { title: string; body: string }>> = {
  rejected: { title: "Reddedildi.", body: "Emir yazılmadı. Ret denetim defterine geçti." },
  cancelled: { title: "İptal oldu.", body: "Her şey durdurulduğu için bu öneri düştü." },
  expired: { title: "Süresi doldu.", body: "Karar için son saat geçti; öneri kendiliğinden düştü." },
};

/** Keeps a range such as "5–10" on one line. */
const WORD_JOINER = String.fromCharCode(0x2060);

/** The outcome heading sits in an always-mounted status region; focus moves to it after a decision here. */
const OUTCOME_HEADING = "font-display-text text-title text-ink outline-none";

/**
 * The decision sheet, the end of the story: what is proposed (one big line and a small receipt),
 * the two signature lines, then Onayla / Reddet. Once signed, the outcome takes the buttons'
 * place, and the emir fişi is laid on top of the sheet. İmza anı (only when signed here and now,
 * `justSigned`): the umber stamp is pressed onto the second line, then the slip is laid down.
 */
export function Decision({
  card,
  status,
  nowMs,
  ticket,
  risk,
  justSigned,
  onDecided,
}: {
  card: ApprovalCard;
  status: ApprovalStatus;
  nowMs: number | null;
  ticket: OrderTicket | null;
  risk: RiskView | null;
  justSigned: boolean;
  onDecided: (c: ApprovalCard) => void;
}) {
  const desk = useDesk();
  const outcomeRef = useRef<HTMLHeadingElement>(null);
  const [decidedHere, setDecidedHere] = useState(false);

  useEffect(() => {
    if (decidedHere && status !== "pending") outcomeRef.current?.focus();
  }, [decidedHere, status]);

  const decided = (c: ApprovalCard) => {
    setDecidedHere(true);
    onDecided(c);
  };
  const pending = status === "pending";

  return (
    <section aria-label="Karar" className="relative">
      <div className={cn("paper-grain border-[1.5px] border-ink bg-panel px-5 pt-6 pb-7 sm:px-9 sm:pt-8 sm:pb-9", justSigned && "oneri-sheet-give")}>
        <div className="space-y-4">
          <h2 id="karar" tabIndex={-1} className="label scroll-mt-24 outline-none">
            Öneri
          </h2>
          <p className="font-display text-display text-balance text-ink">
            {withNums(`${fmtInt(card.qty)} lot · limit ${fmtPrice(card.limit_price)} · ${holdLine(card).replace("–", `${WORD_JOINER}–${WORD_JOINER}`)}.`)}
          </p>
          <Receipt card={card} risk={risk} />
          {pending ? <p className="text-dense text-muted tabular-nums">{decisionMetaLine(card, desk.risk?.equity ?? null, nowMs)}</p> : null}
        </div>

        <div className="mt-8">
          <SignatureLines card={card} status={status} justSigned={justSigned} />
        </div>

        <div className="mt-8">
          <div role="status" aria-live="polite">
            {pending ? null : (
              <div className="space-y-1.5 border-t border-hairline pt-6">
                <h3 ref={outcomeRef} tabIndex={-1} className={cn(OUTCOME_HEADING, status === "rejected" && "text-north")}>
                  {status === "approved"
                    ? withNums(`İmzalandı${card.decided_at ? ` · ${fmtTime(card.decided_at)}` : ""}`)
                    : (CLOSED[status]?.title ?? STATUS_LABEL[status])}
                </h3>
                <p className="text-ui text-ink-soft">
                  {status === "approved"
                    ? "Emir fişi aşağıda. Aracı kurum uygulamana gir, sonra burada işaretle."
                    : (CLOSED[status]?.body ?? "Bu öneri için artık karar verilemez.")}
                </p>
              </div>
            )}
          </div>
          {pending ? <DecisionActions card={card} status={status} onDecided={decided} /> : null}
        </div>
      </div>

      {status === "approved" ? <Slip card={card} ticket={ticket} laid={justSigned} /> : null}
    </section>
  );
}

/** The emir fişi, laid on top of the sheet's lower edge (a little in from the left, casting the long shadow). */
function Slip({ card, ticket, laid }: { card: ApprovalCard; ticket: OrderTicket | null; laid: boolean }) {
  if (!ticket) return <p className="mt-5 text-body text-ink-soft">Emir fişin hazırlanıyor…</p>;
  return (
    <div className="relative z-10 -mt-3 ml-3 sm:-mt-5 sm:ml-14 sm:mr-[-12px]">
      <OrderSlip ticket={ticket} laid={laid} className="shadow-ink-lg" />
      {ticket.qty !== card.qty ? (
        <p className="mt-4 text-ui text-muted">
          Öneri {fmtInt(card.qty)} lot idi; fiş kendi hesabının büyüklüğüne göre {fmtInt(ticket.qty)} lot.
        </p>
      ) : null}
    </div>
  );
}

function Receipt({ card, risk }: { card: ApprovalCard; risk: RiskView | null }) {
  const rows: ReadonlyArray<readonly [string, string, boolean]> = [
    ["Tutar", `${fmtInt(card.qty)} lot × ${fmtPrice(card.limit_price)} = ${fmtTry(card.final_notional_try)}`, false],
    ...(risk
      ? ([
          ["Zarar sınırı", `${fmtPrice(risk.stopPrice)}’ye inerse`, false],
          ["En kötü durumda", `−${fmtTry(risk.maxLoss)}`, true],
        ] as const)
      : []),
  ];
  return (
    <dl className="max-w-[560px] border-t-[1.5px] border-ink text-ui tabular-nums">
      {rows.map(([label, value, strong]) => (
        <div key={label} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4 border-b border-hairline py-2.5">
          <dt className="text-muted">{label}</dt>
          <dd className={cn("text-right", strong ? "font-medium text-ink" : "text-ink")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
