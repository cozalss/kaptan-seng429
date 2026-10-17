"use client";

import { useEffect, useRef, useState } from "react";
import type { ApprovalCard, ApprovalStatus, OrderTicket } from "@/lib/domain";
import { fmtInt, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/components/approvals/approvals-logic";
import { DecisionActions } from "./decision-actions";
import { OrderSlip } from "./order-slip";
import { SignatureLines } from "./signatures";
import "./oneri.css";

const CLOSED: Partial<Record<ApprovalStatus, { title: string; body: string }>> = {
  rejected: { title: "Reddedildi.", body: "Emir yazılmadı. Ret denetim defterine geçti." },
  cancelled: { title: "İptal oldu.", body: "Her şey durdurulduğu için bu öneri düştü." },
  expired: { title: "Süresi doldu.", body: "Karar için son saat geçti; öneri kendiliğinden düştü." },
};

/**
 * The decision box: the two signatures, then Onayla / Reddet. Once decided, the outcome takes
 * the buttons' place (focus moves to it when decided here), and after a signature the emir fişi
 * follows under the box. `justSigned`: signed here and now, so the stamp and the slip animate once.
 */
export function Decision({
  card,
  status,
  ticket,
  justSigned,
  onDecided,
}: {
  card: ApprovalCard;
  status: ApprovalStatus;
  ticket: OrderTicket | null;
  justSigned: boolean;
  onDecided: (c: ApprovalCard) => void;
}) {
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
    <section aria-labelledby="karar" className="space-y-6">
      <div className="border border-rule-soft bg-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-3 sm:px-6">
          <h2 id="karar" tabIndex={-1} className="scroll-mt-24 text-[19px] leading-7 font-semibold text-ink outline-none">
            Karar
          </h2>
          <p className="text-dense text-muted">Emir için iki imza gerekir.</p>
        </div>
        <div className="px-5 sm:px-6">
          <SignatureLines card={card} status={status} justSigned={justSigned} />
        </div>
        <div className="px-5 pt-5 pb-6 sm:px-6">
          <div role="status" aria-live="polite">
            {pending ? null : (
              <div className="space-y-1">
                <h3
                  ref={outcomeRef}
                  tabIndex={-1}
                  className={cn("text-[19px] leading-7 font-semibold text-ink tabular-nums outline-none", status === "rejected" && "text-north")}
                >
                  {status === "approved"
                    ? `İmzalandı${card.decided_at ? ` · ${fmtTime(card.decided_at)}` : ""}`
                    : (CLOSED[status]?.title ?? STATUS_LABEL[status])}
                </h3>
                <p className="text-[16px] leading-6 text-ink-soft">
                  {status === "approved"
                    ? "Emir fişi aşağıda: aracı kurum uygulamana gir, sonra burada işaretle."
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

function Slip({ card, ticket, laid }: { card: ApprovalCard; ticket: OrderTicket | null; laid: boolean }) {
  if (!ticket) return <p className="text-[16px] text-ink-soft">Emir fişi hazırlanıyor…</p>;
  return (
    <div className="space-y-3">
      <OrderSlip ticket={ticket} laid={laid} />
      {ticket.qty !== card.qty ? (
        <p className="text-dense text-muted tabular-nums">
          Öneri {fmtInt(card.qty)} lot idi; fiş hesabının büyüklüğüne göre {fmtInt(ticket.qty)} lot.
        </p>
      ) : null}
    </div>
  );
}
