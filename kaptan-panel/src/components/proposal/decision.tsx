"use client";

import { useEffect, useRef, useState } from "react";
import type { ApprovalCard, ApprovalStatus, OrderTicket } from "@/lib/domain";
import { fmtInt } from "@/lib/format";
import { confidenceSentence, fmtLira } from "@/lib/solo/words";
import { useApiMutation } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { decideGate } from "@/components/approvals/approvals-logic";
import { useDesk } from "@/components/shell/desk-state";
import { answerByLine } from "@/components/story/plain";
import { Button } from "@/components/ui/button";
import { closedFor } from "./decide-logic";
import { OrderSlip } from "./order-slip";
import { InkSeal, useLanded } from "./seal";
import { pressSays } from "./suggestion-object";

/** The note a "Geç" leaves on the proposal (the backend may ask for a reason on a rejection). */
const SKIP_COMMENT = "Neden sayfasından geçildi.";

/** How sure, from the evidence behind the card: the same scale the home's suggestion uses. */
const STRENGTH_SURE: Readonly<Record<ApprovalCard["evidence_summary"]["strength"], number>> = { strong: 0.8, moderate: 0.6, weak: 0.4, insufficient: 0.25 };

const CLOSED: Partial<Record<ApprovalStatus, { title: string; body: string }>> = {
  rejected: { title: "Geçtin.", body: "İşlem yapılmadı. Kararın Geçmiş'e yazıldı." },
  cancelled: { title: "İptal oldu.", body: "Her şey durdurulduğu için bu öneri düştü." },
  expired: { title: "Süresi doldu.", body: "Karar için son saat geçti; öneri kendiliğinden düştü." },
};

/**
 * The decision beside the story. Pressing Onayla seals the sheet at once; if the server refuses,
 * the seal lifts and the reason is said. Once approved, the sheet turns into the order to enter at
 * the bank. `justSigned`: approved here and now, so the order opens once (never on a reload).
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
  const desk = useDesk();
  const outcome = useRef<HTMLParagraphElement>(null);
  const [decidedHere, setDecidedHere] = useState(false);
  const [pressed, setPressed] = useState(false);
  const landed = useLanded(pressed);
  const decide = useApiMutation((api, decision: "approve" | "reject") => api.decideApproval(card.proposal_id, { decision, approved_notional_try: null, comment: decision === "reject" ? SKIP_COMMENT : "" }));

  const run = async (decision: "approve" | "reject") => {
    setPressed(decision === "approve");
    const r = await decide.run(decision);
    if (!r) {
      setPressed(false);
      return;
    }
    setDecidedHere(true);
    onDecided(r);
    void desk.refresh();
  };

  useEffect(() => {
    if (decidedHere && status !== "pending" && status !== "approved") outcome.current?.focus();
  }, [decidedHere, status]);

  const open = status === "pending" || status === "claimed";
  // The sheet stays sealed until the press has landed, even when the server answers sooner.
  const sealing = pressed && (!landed || open);

  if (status === "approved" && !sealing) {
    return (
      <section id="karar" aria-label="Kararın" className="oneri-decide scroll-mt-24">
        {ticket ? (
          <OrderSlip ticket={ticket} laid={justSigned} focusOnMount={justSigned} proposedQty={card.qty} />
        ) : (
          <div className="oneri-paper oneri-slip">
            <InkSeal word="ONAYLADIN" className="oneri-slip-seal" />
            <p className="u-chapter oneri-slip-head">Onayladın. İşlem henüz yapılmadı.</p>
            <p className="oneri-slip-body">KAPtan senin yerine işlem yapmaz. Bankana gireceğin bilgiler hazırlanıyor; birazdan burada olur, Param’da da görürsün.</p>
          </div>
        )}
      </section>
    );
  }

  if (!open && !sealing) {
    return (
      <section id="karar" aria-label="Kararın" className="oneri-decide scroll-mt-24">
        <div className="oneri-outcome">
          <p ref={outcome} tabIndex={-1} className="u-chapter oneri-outcome-head">
            {CLOSED[status]?.title ?? "Bu öneri için artık karar verilemez."}
          </p>
          {CLOSED[status] ? <p className="oneri-outcome-body">{CLOSED[status]?.body}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section id="karar" aria-label="Kararın" className="oneri-decide scroll-mt-24">
      <OpenSheet card={card} status={status} sealing={sealing} pending={decide.pending} error={decide.error} onDecide={(d) => void run(d)} />
    </section>
  );
}

function OpenSheet({
  card,
  status,
  sealing,
  pending,
  error,
  onDecide,
}: {
  card: ApprovalCard;
  status: ApprovalStatus;
  sealing: boolean;
  pending: boolean;
  error: string | null;
  onDecide: (d: "approve" | "reject") => void;
}) {
  const desk = useDesk();
  const nowMs = useNow(30_000);
  const stopped = desk.risk?.kill_switch === "on";
  const halted = desk.risk?.halted_today ?? false;
  const gate = decideGate({ status, killSwitchOn: stopped, haltedToday: halted });
  const closed = closedFor({ stopped, halted });
  const sell = card.side === "sell";
  const by = answerByLine(card.expires_at, nowMs);
  return (
    <div data-state={sealing ? "sealing" : "open"} className={`oneri-paper oneri-decide-sheet${sealing ? " oneri-thud" : ""}`}>
      <p className="oneri-decide-title">{sell ? "Bu satışın tutarı" : "Bu alımın tutarı"}</p>
      <p className="oneri-decide-amount">{fmtLira(card.final_notional_try)}</p>
      <p className="oneri-decide-line">
        {fmtInt(card.qty)} adet, tanesi {sell ? "en az" : "en fazla"} {fmtLira(card.limit_price, true)}
      </p>
      <p className="oneri-decide-line">{confidenceSentence(STRENGTH_SURE[card.evidence_summary.strength])}</p>
      {by ? <p className="oneri-decide-line font-semibold">{by}</p> : null}
      {closed.reason ? <p className="oneri-closed">{closed.reason}</p> : null}
      <div className="oneri-decide-buttons">
        <Button variant="primary" size="lg" className="oneri-object-approve" disabled={!gate.canApprove} aria-disabled={pending || undefined} onClick={() => (pending ? undefined : onDecide("approve"))}>
          Onayla
        </Button>
        <Button variant="outline" size="lg" className="oneri-object-skip" disabled={!gate.canDecide} aria-disabled={pending || undefined} onClick={() => (pending ? undefined : onDecide("reject"))}>
          Geç
        </Button>
      </div>
      <p className="oneri-object-says">{pressSays(sell ? "sat" : "al")}</p>
      {error && !sealing ? (
        <p role="alert" className="oneri-object-error">
          Olmadı. {error}
        </p>
      ) : null}
      {sealing ? <InkSeal word="ONAYLADIN" pressing className="oneri-object-seal" /> : null}
    </div>
  );
}
