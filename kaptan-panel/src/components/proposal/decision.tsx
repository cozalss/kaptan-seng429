"use client";

import { useState } from "react";
import type { ApprovalCard, ApprovalStatus, OrderTicket } from "@/lib/domain";
import { useApiMutation } from "@/lib/api/react";
import { fmtInt, fmtPrice, fmtTime } from "@/lib/format";
import { useDesk } from "@/components/shell/desk-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { decideGate, STATUS_LABEL } from "@/components/approvals/approvals-logic";
import { deadlineLine, holdLine } from "@/components/story/plain";
import { OrderSlip } from "./order-slip";

/** Bodoni's comma reads as a full stop at display size; set decimal commas in the UI face. */
function withSansCommas(text: string) {
  return text.split(",").flatMap((part, i) => (i === 0 ? [part] : [<span key={i} className="font-sans">,</span>, part]));
}

const CLOSED: Partial<Record<ApprovalStatus, { title: string; body: string }>> = {
  rejected: { title: "Reddettin.", body: "Emir yazılmadı. Kararın kayda geçti." },
  cancelled: { title: "İptal oldu.", body: "Her şeyi durdurduğun için bu öneri düştü." },
  expired: { title: "Süresi doldu.", body: "Karar için son saat geçti; öneri kendiliğinden düştü." },
};

/**
 * "Öneri" — the one decision on the page. A single Onayla; Reddet is a quiet link with an
 * optional note. Once approved, the emir fişi takes this place.
 */
export function Decision({
  card,
  status,
  nowMs,
  ticket,
  onDecided,
}: {
  card: ApprovalCard;
  status: ApprovalStatus;
  nowMs: number | null;
  ticket: OrderTicket | null;
  onDecided: (c: ApprovalCard) => void;
}) {
  const desk = useDesk();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const decide = useApiMutation((api, decision: "approve" | "reject", comment: string) =>
    api.decideApproval(card.proposal_id, { decision, approved_notional_try: null, comment }),
  );
  const gate = decideGate({ status, killSwitchOn: desk.risk?.kill_switch === "on", haltedToday: desk.risk?.halted_today ?? false });

  const run = async (decision: "approve" | "reject") => {
    const r = await decide.run(decision, decision === "reject" ? note.trim() : "");
    if (!r) return;
    setRejecting(false);
    onDecided(r);
    void desk.refresh();
  };

  if (status === "approved") {
    return (
      <section aria-labelledby="karar" className="space-y-6">
        <p id="karar" className="text-[15px] text-muted">
          Onayladın{card.decided_at ? ` · ${fmtTime(card.decided_at)}` : ""}. Fişi aracı kurum uygulamana gir, sonra burada işaretle.
        </p>
        {ticket ? <OrderSlip ticket={ticket} /> : <p className="text-[17px] text-ink-soft">Emir fişin hazırlanıyor…</p>}
        {ticket && ticket.qty !== card.qty ? (
          <p className="text-[14px] leading-[21px] text-muted">
            Öneri {fmtInt(card.qty)} lot idi; fiş kendi hesabının büyüklüğüne göre {fmtInt(ticket.qty)} lot.
          </p>
        ) : null}
      </section>
    );
  }
  if (status !== "pending") {
    return (
      <section aria-labelledby="karar" className="space-y-2">
        <h2 id="karar" className="font-display text-[30px] leading-tight text-ink">
          {CLOSED[status]?.title ?? STATUS_LABEL[status]}
        </h2>
        <p className="text-[17px] text-ink-soft">{CLOSED[status]?.body ?? "Bu öneri için artık karar verilemez."}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="karar" className="space-y-6">
      <div className="space-y-2">
        <h2 id="karar" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
          Öneri
        </h2>
        <p className="font-display text-[32px] leading-[1.12] text-ink tabular-nums sm:text-[40px]">
          {fmtInt(card.qty)} lot · limit {withSansCommas(fmtPrice(card.limit_price))} · {holdLine(card)}.
        </p>
        <p className="text-[15px] text-muted">{deadlineLine(card.expires_at, nowMs)}</p>
      </div>

      {gate.reason ? (
        <p role="status" className="border-l-[3px] border-ink bg-sunk px-4 py-2.5 text-[15px] text-ink">
          {gate.tone === "kill" ? "Durdurdun; yeni öneri onaylanamaz." : gate.tone === "halt" ? "Bugün yeni emir yok (günlük −%1 sınırı); yalnızca reddedebilirsin." : gate.reason}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Button variant="primary" size="lg" className="h-14 w-full px-10 text-[17px] sm:w-auto" disabled={!gate.canApprove || decide.pending} onClick={() => void run("approve")}>
          {decide.pending && !rejecting ? "Onaylanıyor…" : "Onayla"}
        </Button>
        <button
          type="button"
          disabled={!gate.canDecide || decide.pending}
          onClick={() => {
            decide.reset();
            setRejecting(true);
          }}
          className="self-center text-[15px] text-ink-soft underline decoration-rule-soft underline-offset-4 hover:text-ink hover:decoration-ink disabled:opacity-45 sm:self-auto"
        >
          Reddet
        </button>
      </div>
      {decide.error && !rejecting ? (
        <p role="alert" className="text-[15px] text-north">
          {decide.error}
        </p>
      ) : null}

      <Dialog open={rejecting} onOpenChange={(o) => (!decide.pending ? setRejecting(o) : undefined)}>
        <DialogContent title="Bu öneriyi reddet" description="Emir yazılmaz; kararın kayda geçer." size="sm">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run("reject");
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-[14px] text-ink-soft">Kısa not (isteğe bağlı)</span>
              <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {decide.error ? (
              <p role="alert" className="text-[14px] text-north">
                {decide.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Vazgeç
              </Button>
              <Button type="submit" variant="secondary" disabled={decide.pending}>
                {decide.pending ? "Kaydediliyor…" : "Reddet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
